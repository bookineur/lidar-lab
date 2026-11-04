"use strict";
// Scénarios de SIMULATION logicielle (scans LD06 synthétiques, jamais des mesures réelles du robot).
// Chaque fonction pilote la vraie application (index.html chargé par harness.js) et renvoie des mesures.
const { loadApp } = require("./harness");
const S = require("./synthetic_ld06");

// ---------- géométries inventées ----------
const ROOM = [...S.rect(0, 0, 6, 4), ...S.rect(4.8, 3.3, 5.8, 3.9, "armoire")];
const PILLAR = { x: 2.0, y: 1.0, r: 0.12, label: "pilier" };
const ROOM_POSES = [
  [1.5, 2.0, 0],
  [2.5, 2.2, 15],
  [3.5, 1.8, -10],
  [4.2, 2.0, 30],
];
// salle 0..8 x 0..4, cloison x=6 (y 0..3) cachant une alcôve x>6, y<3
const ALCOVE_WORLD = [...S.rect(0, 0, 8, 4), S.seg(6, 0, 6, 3, "cloison"), S.seg(6.0, 3.0, 6.1, 3.0, "cloison")];
const ALCOVE_POSES = [
  [1.5, 2, 0],
  [3, 2, 0],
  [5, 3.5, 0],
  [5.5, 3.6, -20],
];
// salle A (0..5 x 0..4) — porte (x=5, y 1.6..2.4) — salle B (5..11 x 0..5), puis salle C isolée (18..23 x 0..3.5)
const TWO_ROOMS = [
  S.seg(0, 0, 5, 0), S.seg(5, 0, 5, 1.6), S.seg(5, 2.4, 5, 4), S.seg(5, 4, 0, 4), S.seg(0, 4, 0, 0), S.seg(4, 3, 4.3, 3.5),
  S.seg(5, 0, 11, 0), S.seg(11, 0, 11, 5), S.seg(11, 5, 5, 5), S.seg(5, 5, 5, 4), ...S.rect(8, 3.5, 9, 4.2),
  ...S.rect(18, 0, 23, 3.5, "salle_C"), ...S.rect(22.2, 2.7, 23, 3.5, "salle_C"), S.seg(18, 1.0, 18.6, 1.0, "salle_C"),
];
const TWO_ROOM_POSES = [
  [2, 2, 0],
  [4.6, 2, 0],
  [6.5, 2.0, 0],
  [9, 1.5, 90],
  [19.5, 1.8, 0], // salle C : aucun mur commun avec A ou B
  [21.0, 1.5, 40],
];

const angleErr = (a, b) => Math.abs(((((a - b + 180) % 360) + 360) % 360) - 180);

/** Génère les scans, garde pour chaque point parsé son étiquette et son impact « vrai » dans le monde. */
function makeScans(prefix, poses, walls, circlesFor, opts = {}) {
  return poses.map((pose, k) => {
    const pts = S.simulateScan({ pose, walls, circles: circlesFor ? circlesFor(k) : [PILLAR], seed: 100 + k, extras: opts.extrasFor && opts.extrasFor(k) });
    const kept = S.parsedLabels(pts).map((p) => {
      const a = ((pose[2] + p.angle) * Math.PI) / 180;
      return { label: p.label, wx: pose[0] + p.distance * Math.cos(a), wy: pose[1] + p.distance * Math.sin(a) };
    });
    return { name: `SIM_${prefix}_${k}.csv`, text: S.toCsv(pts, (opts.formatFor && opts.formatFor(k)) || "ld06_mm"), truth: pose, labels: kept };
  });
}

function counter(scan, labels) {
  const index = new Map(scan.rawPts.map((p, i) => [p, i]));
  return (arr, pred = () => true) => arr.filter((p) => pred(labels[index.get(p)])).length;
}

function poseErrors(app, files, k) {
  const exp = S.relativePose(files[0].truth, files[k].truth),
    p = app.scans[k].pose;
  return { pos: Math.hypot(p[0] - exp[0], p[1] - exp[1]), ang: angleErr(p[2], exp[2]), expected: exp, got: [...p] };
}

/** Comptes avant/après chaque filtre pour chaque scan. */
function filterCounts(h, files) {
  return h.app.scans.map((s, k) => ({
    scan: s.name,
    registered: s.mapRegistered,
    brut: s.rawPts.length,
    porteeIntensite: h.app.filteredScanPoints(s).length,
    filtreTemporel: h.app.filteredMapPoints(s).length,
  }));
}

async function locateSequence(h, files) {
  h.app.anchorScanAt(0);
  const steps = [];
  for (let k = 1; k < files.length; k++) {
    await h.app.locateOnAccumulatedMap(k);
    steps.push({ k, registered: h.app.scans[k].mapRegistered, ...poseErrors(h.app, files, k), message: h.$("sequenceStatus").textContent });
  }
  return steps;
}

/** Part des cellules de murs vrais (échantillonnés) qui sont occupées dans grid_map.csv exportée. */
function wallCoverage(h, files, sampleWalls) {
  h.click("expGrid");
  const csv = h.lastDownload("grid_map.csv"),
    g = h.app.parseGridCsv(csv, "grid_map.csv"),
    t0 = files[0].truth;
  let ok = 0;
  for (const [wx, wy] of sampleWalls) {
    const [x, y] = S.relativePose(t0, [wx, wy, 0]),
      col = Math.floor((x - g.origin[0]) / g.resolution),
      row = g.height - 1 - Math.floor((y - g.origin[1]) / g.resolution);
    let hit = false;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((g.rows[row + dr] || [])[col + dc] === 1) hit = true;
    if (hit) ok++;
  }
  return { csv, grid: g, coverage: ok / sampleWalls.length };
}
/** Nombre de cellules occupées de grid_map.csv dont le centre (repère monde vrai) vérifie pred(x, y). */
function occupiedCellsWhere(h, files, pred) {
  h.click("expGrid");
  const g = h.app.parseGridCsv(h.lastDownload("grid_map.csv"), "grid_map.csv"),
    t0 = (files[0].truth[2] * Math.PI) / 180;
  let n = 0;
  g.rows.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v !== 1) return;
      const x = g.origin[0] + (c + 0.5) * g.resolution,
        y = g.origin[1] + (g.height - 1 - r + 0.5) * g.resolution;
      if (pred(files[0].truth[0] + Math.cos(t0) * x - Math.sin(t0) * y, files[0].truth[1] + Math.sin(t0) * x + Math.cos(t0) * y)) n++;
    })
  );
  return n;
}
function sampleSegments(segs, step = 0.1) {
  const out = [];
  for (const s of segs) {
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    for (let t = 0; t <= L; t += step) out.push([s.a[0] + ((s.b[0] - s.a[0]) * t) / L, s.a[1] + ((s.b[1] - s.a[1]) * t) / L]);
  }
  return out;
}

// ---------- scénarios ----------

async function scenario1(htmlFile) {
  const h = loadApp(htmlFile),
    files = makeScans("salle", ROOM_POSES, ROOM);
  await h.loadFiles(files);
  const steps = await locateSequence(h, files);
  const counts = filterCounts(h, files),
    walls = h.app.scans.map((s, k) => {
      const c = counter(s, files[k].labels);
      return { brut: c(s.rawPts, (l) => l.label !== "pilier"), carte: c(h.app.filteredMapPoints(s), (l) => l.label !== "pilier") };
    });
  // murs visibles depuis l'intérieur (hors faces cachées de l'armoire)
  const cov = h.app.scans.every((s) => s.mapRegistered) ? wallCoverage(h, files, sampleSegments(S.rect(0, 0, 6, 4))) : { coverage: NaN };
  return { h, files, steps, counts, walls, coverage: cov.coverage };
}

const PERSONS = [
  [4.6, 0.8],
  [3.0, 3.2],
  [1.0, 1.0],
  [1.2, 3.2],
];
async function scenario2(htmlFile) {
  const h = loadApp(htmlFile),
    files = makeScans("personne", ROOM_POSES, ROOM, (k) => [PILLAR, { x: PERSONS[k][0], y: PERSONS[k][1], r: 0.18, label: "personne", intensity: 120 }]);
  await h.loadFiles(files);
  const steps = await locateSequence(h, files);
  const persons = h.app.scans.map((s, k) => {
    const c = counter(s, files[k].labels),
      isP = (l) => l.label === "personne",
      isW = (l) => l.label !== "personne";
    return {
      scan: s.name,
      registered: s.mapRegistered,
      personneBrut: c(s.rawPts, isP),
      personneApresPortee: c(h.app.filteredScanPoints(s), isP),
      personneCarte: c(h.app.filteredMapPoints(s), isP),
      mursBrut: c(s.rawPts, isW),
      mursCarte: c(h.app.filteredMapPoints(s), isW),
    };
  });
  return { h, files, steps, persons, counts: filterCounts(h, files) };
}

async function scenario3(htmlFile) {
  const h = loadApp(htmlFile),
    files = makeScans("alcove", ALCOVE_POSES, ALCOVE_WORLD, () => []),
    inAlcove = (l) => l.wx > 6.05 && l.wy < 2.95;
  await h.loadFiles(files);
  h.app.anchorScanAt(0);
  await h.app.locateOnAccumulatedMap(1);
  await h.app.locateOnAccumulatedMap(2);
  const alc = (k) => {
    const s = h.app.scans[k],
      c = counter(s, files[k].labels);
    return { brut: c(s.rawPts, inAlcove), carte: c(h.app.filteredMapPoints(s), inAlcove) };
  };
  const alcoveCells = () => occupiedCellsWhere(h, files, (x, y) => x > 6.1 && y < 2.9);
  // carte de référence utilisée pour recaler le scan 3 (avant son recalage)
  const refGrid = h.app.accumulatedGridFor(3);
  let refAlcove = 0;
  if (refGrid)
    refGrid.rows.forEach((row, r) =>
      row.forEach((v, c) => {
        const x = refGrid.origin[0] + (c + 0.5) * refGrid.resolution + files[0].truth[0],
          y = refGrid.origin[1] + (refGrid.height - 1 - r + 0.5) * refGrid.resolution + files[0].truth[1];
        if (v === 1 && x > 6.1 && y < 2.9) refAlcove++;
      })
    );
  const afterFirstView = { registered2: h.app.scans[2].mapRegistered, pose2: poseErrors(h.app, files, 2), scan2: alc(2), cellulesAlcove: alcoveCells(), cellulesAlcoveReference: refAlcove };
  await h.app.locateOnAccumulatedMap(3);
  const afterConfirm = { registered3: h.app.scans[3].mapRegistered, pose3: poseErrors(h.app, files, 3), scan2: alc(2), scan3: alc(3), cellulesAlcove: alcoveCells() };
  return {
    h,
    files,
    afterFirstView,
    afterConfirm,
    messages: [2, 3].map((k) => h.app.scans[k].name + " : " + (h.app.scans[k].mapRegistered ? "intégré" : "refusé")),
    counts: filterCounts(h, files),
  };
}

async function scenario4(htmlFile) {
  const h = loadApp(htmlFile),
    files = makeScans("deux_salles", TWO_ROOM_POSES, TWO_ROOMS, () => []);
  await h.loadFiles(files);
  h.app.anchorScanAt(0);
  const steps = [];
  for (let k = 1; k <= 3; k++) {
    await h.app.locateOnAccumulatedMap(k);
    steps.push({ k, registered: h.app.scans[k].mapRegistered, ...poseErrors(h.app, files, k), message: h.$("sequenceStatus").textContent });
  }
  const roomB = h.app.scans.slice(1, 4).map((s, i) => {
    const c = counter(s, files[i + 1].labels),
      inB = (l) => l.wx > 5.1;
    return { brut: c(s.rawPts, inB), carte: c(h.app.filteredMapPoints(s), inB) };
  });
  // salle C : aucun mur commun
  await h.app.locateOnAccumulatedMap(4);
  const autoC = { registered: h.app.scans[4].mapRegistered, visible: h.app.scans[4].visible, message: h.$("sequenceStatus").textContent };
  let manual = null;
  if (typeof h.app.integrateAtCurrentPose === "function") {
    // pose « mesurée au mètre » (ici la vraie pose relative, arrondie au cm et au degré)
    const exp = S.relativePose(files[0].truth, files[4].truth).map((v, i) => (i < 2 ? Math.round(v * 100) / 100 : Math.round(v)));
    h.app.select(4);
    h.set("x", exp[0]);
    h.set("y", exp[1]);
    h.set("theta", exp[2]);
    h.app.integrateAtCurrentPose(4);
    await h.app.locateOnAccumulatedMap(5);
    const c4 = counter(h.app.scans[4], files[4].labels);
    manual = {
      registered4: h.app.scans[4].mapRegistered,
      registered5: h.app.scans[5].mapRegistered,
      pose5: poseErrors(h.app, files, 5),
      message5: h.$("sequenceStatus").textContent,
      murCbrut: h.app.scans[4].rawPts.length,
      murCcarte: c4(h.app.filteredMapPoints(h.app.scans[4])),
    };
  }
  return { h, files, steps, roomB, autoC, manual, counts: filterCounts(h, files) };
}

async function scenario5(htmlFile) {
  const h = loadApp(htmlFile);
  const extras = [
    ...[0, 1, 2, 3, 4].map((i) => ({ angle: 100.1 + i, distance: 0.03, intensity: 200, label: "trop_proche_parse" })),
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ angle: 200.1 + i, distance: 0.08 + 0.008 * i, intensity: 40, label: "chassis" })),
    ...[0, 1, 2, 3].map((i) => ({ angle: 45.1 + i, distance: 12.5, intensity: 30, label: "lointain_12_15" })),
    ...[0, 1, 2].map((i) => ({ angle: 60.1 + i, distance: 15.5, intensity: 20, label: "lointain_15" })),
  ];
  // face avant de l'armoire noire mate : intensité faible
  const walls = [...S.rect(0, 0, 6, 4), S.seg(4.8, 3.3, 5.8, 3.3), S.seg(5.8, 3.3, 5.8, 3.9), S.seg(4.8, 3.9, 4.8, 3.3)].map((s, i) =>
    i === 4 ? { ...s, label: "armoire_noire", intensity: 8 } : s
  );
  const pts = S.simulateScan({ pose: ROOM_POSES[0], walls, circles: [PILLAR], seed: 7, extras }),
    text = S.toCsv(pts),
    csvLines = text.split("\n").filter((l) => /^\d/.test(l)).length,
    labels = S.parsedLabels(pts).map((p) => ({ label: p.label }));
  await h.loadFiles([{ name: "SIM_filtres.csv", text }]);
  const s = h.app.scans[0],
    c = counter(s, labels),
    by = (arr) => Object.fromEntries(["trop_proche_parse", "chassis", "lointain_12_15", "lointain_15", "armoire_noire"].map((L) => [L, c(arr, (l) => l.label === L)]));
  const steps = [];
  const record = (name) => steps.push({ name, total: h.app.filteredScanPoints(s).length, ...by(h.app.filteredScanPoints(s)) });
  steps.push({ name: "lignes CSV", total: csvLines, ...Object.fromEntries(Object.keys(by([])).map((L) => [L, pts.filter((p) => p.label === L).length])) });
  steps.push({ name: "après lecture (0,05 < r < 15 m)", total: s.rawPts.length, ...by(s.rawPts) });
  record("défauts min 0,05 / max 12 / I 0");
  h.set("cleanMinRange", 0.15);
  record("min 0,15 m");
  h.set("cleanMaxRange", 4);
  record("min 0,15 / max 4 m");
  h.set("cleanMaxRange", 12);
  h.set("cleanMinIntensity", 20);
  record("min 0,15 / max 12 / I ≥ 20");
  h.set("cleanMinRange", 0.05);
  h.set("cleanMinIntensity", 0);
  record("retour aux défauts");
  return { h, steps, text, status: h.$("cleanStatus").textContent };
}

async function scenario6(htmlFile) {
  // données brutes vs filtres : on applique tous les filtres et une localisation, puis on compare
  const h = loadApp(htmlFile),
    files = makeScans("brut", ROOM_POSES.slice(0, 3), ROOM, (k) => [PILLAR, { x: PERSONS[k][0], y: PERSONS[k][1], r: 0.18, label: "personne", intensity: 120 }]);
  await h.loadFiles(files);
  const snap = h.app.scans.map((s) => ({ csv: s.rawCsv, pts: JSON.stringify(s.rawPts), n: s.pts.length, same: s.pts === s.rawPts }));
  h.app.anchorScanAt(0);
  await h.app.locateOnAccumulatedMap(1);
  await h.app.locateOnAccumulatedMap(2);
  h.set("cleanMinRange", 0.5);
  h.set("cleanMaxRange", 3);
  h.set("cleanMinIntensity", 150);
  const filtered = h.app.scans.map((s) => h.app.filteredMapPoints(s).length);
  h.click("expGrid");
  h.click("merge");
  const checks = h.app.scans.map((s, k) => {
    h.app.select(k);
    h.click("saveRaw");
    return {
      scan: s.name,
      csvIdentique: s.rawCsv === files[k].text && s.rawCsv === snap[k].csv,
      exportBrutIdentique: h.lastDownload(s.name) === files[k].text,
      pointsBrutsIdentiques: JSON.stringify(s.rawPts) === snap[k].pts,
      nbBrut: s.rawPts.length,
      nbFiltre: filtered[k],
      ptsToujoursBruts: s.pts === s.rawPts && s.pts.length === snap[k].n,
    };
  });
  return { h, checks };
}

async function scenario7(htmlFile) {
  const h = loadApp(htmlFile),
    files = makeScans("sans_intensite", ROOM_POSES.slice(0, 3), ROOM, null, { formatFor: (k) => ["m_sans_intensite", "maptool", "ld06_mm"][k] });
  await h.loadFiles(files);
  const rows = [];
  for (const minI of [0, 50]) {
    h.set("cleanMinIntensity", minI);
    h.app.draw();
    h.app.scans.forEach((s, k) =>
      rows.push({ seuil: minI, scan: s.name, format: ["angle_deg,distance_m", "MapTool", "LD06 avec intensité"][k], brut: s.rawPts.length, apresFiltre: h.app.filteredScanPoints(s).length })
    );
  }
  return { h, rows, status: h.$("cleanStatus").textContent };
}

async function scenario8(htmlFile) {
  const r = await scenario2(htmlFile),
    h = r.h;
  const personsOf = () =>
    h.app.scans.map((s, k) => counter(s, r.files[k].labels)(h.app.filteredMapPoints(s), (l) => l.label === "personne"));
  const total = () => h.app.scans.reduce((n, s) => n + h.app.filteredMapPoints(s).length, 0);
  const on = { personnes: personsOf(), total: total() };
  h.set("dynamicFilter", false);
  const off = { personnes: personsOf(), total: total(), egalPorteeIntensite: h.app.scans.every((s) => h.app.filteredMapPoints(s).length === h.app.filteredScanPoints(s).length) };
  h.set("dynamicFilter", true);
  const again = { personnes: personsOf(), total: total() };
  return { h, on, off, again, registered: h.app.scans.map((s) => s.mapRegistered) };
}

/** Données identiques chargées dans deux versions, poses fixées à la main : compare les exports. */
async function fixedMap(htmlFile, files, poses) {
  const h = loadApp(htmlFile);
  await h.loadFiles(files);
  h.app.anchorScanAt(0);
  h.app.scans.forEach((s, k) => {
    s.pose = [...poses[k]];
    s.mapRegistered = true;
    s.visible = true;
  });
  h.app.draw();
  h.click("expGrid");
  h.click("expGridMapTool");
  h.click("merge");
  h.click("savePoses");
  return {
    h,
    grid: h.lastDownload("grid_map.csv"),
    maptool: h.lastDownload("grid_map_map_tool.csv"),
    merged: h.lastDownload("scans_fusionnes.csv"),
    poses: h.lastDownload("poses.json"),
    fills: h.ctx.fills,
  };
}

module.exports = {
  S,
  ROOM,
  ROOM_POSES,
  PILLAR,
  makeScans,
  fixedMap,
  scenario1,
  scenario2,
  scenario3,
  scenario4,
  scenario5,
  scenario6,
  scenario7,
  scenario8,
  angleErr,
};
