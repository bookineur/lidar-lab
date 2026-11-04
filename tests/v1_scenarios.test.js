"use strict";
// Tests automatisés de la V1 (index.html + lidar_core.js) sur des scans LD06 SYNTHÉTIQUES.
// Lancer depuis la racine du projet :  node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../lidar_core.js");
const { loadApp } = require("./harness");
const SC = require("./scenarios");

const APP = "index.html";
const OLD = "anciennes_versions/index_v1.0_e37950a.html";

test("1. salle aux murs fixes : tous les scans recalés, murs conservés dans la carte", async () => {
  const r = await SC.scenario1(APP);
  for (const st of r.steps) {
    assert.ok(st.registered, `scan ${st.k} non intégré : ${st.message}`);
    assert.ok(st.pos < 0.05 && st.ang < 2, `scan ${st.k} erreur ${st.pos.toFixed(3)} m / ${st.ang.toFixed(1)}°`);
  }
  r.walls.forEach((w, k) => assert.ok(w.carte / w.brut >= 0.95, `scan ${k} : ${w.carte}/${w.brut} points de mur gardés`));
  assert.ok(r.coverage >= 0.9, `couverture des murs dans grid_map.csv ${r.coverage}`);
});

test("2. personne mobile : retours isolés masqués dans les scans suivants", async () => {
  const r = await SC.scenario2(APP);
  for (const st of r.steps) assert.ok(st.registered && st.pos < 0.05 && st.ang < 2, `scan ${st.k} : ${st.message}`);
  // scan initial gardé intact (limite connue : la personne qui s'y trouve reste)
  assert.equal(r.persons[0].personneCarte, r.persons[0].personneBrut);
  for (const p of r.persons.slice(1)) {
    assert.ok(p.personneBrut >= 8, "la personne doit être vue");
    assert.equal(p.personneCarte, 0, `${p.scan} : ${p.personneCarte} retours de personne restants`);
    assert.ok(p.mursCarte / p.mursBrut >= 0.93, `${p.scan} : murs ${p.mursCarte}/${p.mursBrut}`);
  }
});

test("3. zone nouvelle : masquée après une seule vue, confirmée et intégrée par le scan suivant", async () => {
  const r = await SC.scenario3(APP);
  assert.ok(r.afterFirstView.registered2, "le scan qui découvre l'alcôve doit être recalé");
  assert.ok(r.afterFirstView.pose2.pos < 0.05 && r.afterFirstView.pose2.ang < 2);
  assert.ok(r.afterFirstView.scan2.brut >= 10, "l'alcôve doit être vue");
  assert.equal(r.afterFirstView.scan2.carte, 0, "vue une seule fois : masquée");
  assert.equal(r.afterFirstView.cellulesAlcove, 0, "pas encore dans la grid map");
  // …mais déjà disponible comme référence pour recaler le scan suivant (sinon il ne pourrait pas la confirmer)
  assert.ok(r.afterFirstView.cellulesAlcoveReference >= 5, `référence : ${r.afterFirstView.cellulesAlcoveReference}`);
  assert.ok(r.afterConfirm.registered3, "le scan de confirmation doit être recalé");
  assert.ok(r.afterConfirm.pose3.pos < 0.05 && r.afterConfirm.pose3.ang < 2);
  assert.ok(r.afterConfirm.scan2.carte / r.afterConfirm.scan2.brut >= 0.6, `alcôve confirmée ${JSON.stringify(r.afterConfirm.scan2)}`);
  assert.ok(r.afterConfirm.cellulesAlcove >= 5, `alcôve dans grid_map.csv : ${r.afterConfirm.cellulesAlcove} cellules`);
});

test("4. passage vers une zone sans mur commun : continuité, refus sûr, intégration manuelle", async () => {
  const r = await SC.scenario4(APP);
  for (const st of r.steps) assert.ok(st.registered && st.pos < 0.08 && st.ang < 2, `scan ${st.k} : ${st.message}`);
  // la salle B, d'abord vue par la porte, finit confirmée
  assert.ok(r.roomB[0].carte / r.roomB[0].brut >= 0.5, JSON.stringify(r.roomB));
  // salle C isolée : le recalage automatique doit REFUSER (aucune information commune)
  assert.equal(r.autoC.registered, false, r.autoC.message);
  assert.match(r.autoC.message, /Intégrer à la pose saisie/);
  // poursuite : pose saisie à la main, puis le scan suivant se recale sur la salle C
  assert.ok(r.manual.registered4 && r.manual.registered5, r.manual.message5);
  assert.ok(r.manual.pose5.pos < 0.06 && r.manual.pose5.ang < 2, JSON.stringify(r.manual.pose5));
  assert.ok(r.manual.murCcarte / r.manual.murCbrut >= 0.6);
});

test("4b. salle parfaitement symétrique : la pose ambiguë est refusée, jamais acceptée au hasard", async () => {
  const h = loadApp(APP),
    walls = SC.S.rect(0, 0, 6, 4),
    files = SC.makeScans("symetrique", [[2, 2, 0], [4, 2, 0]], walls, () => []);
  await h.loadFiles(files);
  h.app.anchorScanAt(0);
  await h.app.locateOnAccumulatedMap(1);
  const s = h.app.scans[1],
    exp = SC.S.relativePose(files[0].truth, files[1].truth),
    right = Math.hypot(s.pose[0] - exp[0], s.pose[1] - exp[1]) < 0.1;
  assert.ok(!s.mapRegistered || right, "pose fausse acceptée : " + h.$("sequenceStatus").textContent);
});

test("5. filtres portée min/max et intensité selon les seuils", async () => {
  const r = await SC.scenario5(APP),
    st = Object.fromEntries(r.steps.map((s) => [s.name, s]));
  const parsed = st["après lecture (0,05 < r < 15 m)"],
    def = st["défauts min 0,05 / max 12 / I 0"];
  assert.equal(parsed.trop_proche_parse, 0);
  assert.equal(parsed.lointain_15, 0);
  assert.equal(parsed.lointain_12_15, 4);
  assert.equal(def.lointain_12_15, 0, "au-delà de 12 m retiré par défaut");
  assert.equal(def.chassis, 6, "0,08–0,12 m gardé avec min 0,05");
  assert.equal(st["min 0,15 m"].chassis, 0);
  assert.ok(st["min 0,15 / max 4 m"].total < st["min 0,15 m"].total);
  const lowI = st["min 0,15 / max 12 / I ≥ 20"];
  assert.ok(def.armoire_noire >= 5);
  assert.equal(lowI.armoire_noire, 0);
  assert.equal(st["retour aux défauts"].total, def.total, "les filtres sont réversibles");
});

test("6. données brutes et export brut jamais modifiés par les filtres", async () => {
  const r = await SC.scenario6(APP);
  for (const c of r.checks) {
    assert.ok(c.csvIdentique && c.exportBrutIdentique && c.pointsBrutsIdentiques && c.ptsToujoursBruts, JSON.stringify(c));
    assert.ok(c.nbFiltre < c.nbBrut);
  }
});

test("7. CSV sans intensité : le seuil d'intensité ne supprime pas tous les points", async () => {
  const r = await SC.scenario7(APP);
  for (const row of r.rows.filter((x) => x.format !== "LD06 avec intensité")) assert.equal(row.apresFiltre, row.brut, JSON.stringify(row));
  const ld = r.rows.find((x) => x.seuil === 50 && x.format === "LD06 avec intensité");
  assert.ok(ld.apresFiltre > 0 && ld.apresFiltre <= ld.brut);
  assert.match(r.status, /sans colonne d’intensité/);
});

test("8. désactiver le filtre temporel restitue les points masqués", async () => {
  const r = await SC.scenario8(APP);
  assert.ok(r.registered.every(Boolean));
  assert.ok(r.off.total > r.on.total);
  assert.ok(r.off.egalPorteeIntensite);
  r.on.personnes.slice(1).forEach((n) => assert.equal(n, 0));
  r.off.personnes.slice(1).forEach((n) => assert.ok(n >= 8));
  assert.deepEqual(r.again, r.on);
});

test("9a. lecture des CSV identique à la V1.0 pour tous les formats", () => {
  const oldApp = loadApp(OLD).app,
    pts = SC.S.simulateScan({ pose: [1.5, 2, 0], walls: SC.ROOM, seed: 3, n: 60 });
  const texts = {
    ld06: SC.S.toCsv(pts, "ld06_mm"),
    metres: SC.S.toCsv(pts, "m_sans_intensite"),
    maptool: SC.S.toCsv(pts, "maptool"),
    robotcontrol: "angle_deg,distance_m,intensity\n" + pts.map((p) => `${p.angle},${p.distance.toFixed(4)},${p.intensity}`).join("\n"),
    printScanCSV: "N,Angle,Distance,Intensity,x,y\n" + pts.map((p, i) => `${i},${p.angle},${Math.round(p.distance * 1000)},${p.intensity},0,0`).join("\n"),
    fusionne: "scan,point,x_m,y_m,intensity\n" + pts.map((p, i) => `a,${i},${p.distance.toFixed(3)},${(p.angle / 100).toFixed(3)},${p.intensity}`).join("\n"),
    pointVirgule: "angle_deg;distance_m;intensity\n" + pts.map((p) => `${String(p.angle).replace(".", ",")};${p.distance.toFixed(4).replace(".", ",")};${p.intensity}`).join("\n"),
    sansEntete: pts.map((p) => `${p.angle},${Math.round(p.distance * 1000)},${p.intensity}`).join("\n"),
    poseEnCommentaire: "# robot position: x=1.5 m, y=2 m, theta=10 deg\n" + SC.S.toCsv(pts),
  };
  for (const [k, t] of Object.entries(texts)) {
    const a = oldApp.parseCsv(t, k + ".csv"),
      b = core.parseCsv(t, k + ".csv");
    assert.deepEqual(JSON.parse(JSON.stringify(b.pts)), JSON.parse(JSON.stringify(a.pts)), k);
    assert.deepEqual(JSON.parse(JSON.stringify([b.pose, b.frame, b.name])), JSON.parse(JSON.stringify([a.pose, a.frame, a.name])), k);
  }
  assert.equal(core.parseCsv(texts.metres, "m").hasIntensity, false);
  assert.equal(core.parseCsv(texts.maptool, "m").hasIntensity, false);
  assert.equal(core.parseCsv(texts.ld06, "m").hasIntensity, true);
  // séparateur « ; » sans colonne d'intensité : la V1.0 levait une exception
  assert.throws(() => oldApp.parseCsv("10;1500\n20;1600\n", "x.csv"));
  assert.equal(core.parseCsv("10;1500\n20;1600\n", "x.csv").pts.length, 2);
});

test("9b. grid map, export MapTool, fusion et poses identiques à la V1.0", async () => {
  const files = SC.makeScans("regression", SC.ROOM_POSES, SC.ROOM),
    poses = SC.ROOM_POSES.map((p) => SC.S.relativePose(SC.ROOM_POSES[0], p));
  const a = await SC.fixedMap(OLD, files, poses),
    b = await SC.fixedMap(APP, files, poses);
  assert.ok(a.grid && a.grid.length > 1000);
  assert.equal(b.grid, a.grid, "grid_map.csv");
  assert.equal(b.maptool, a.maptool, "grid_map_map_tool.csv");
  assert.equal(b.merged, a.merged, "scans_fusionnes.csv");
  assert.equal(b.poses, a.poses, "poses.json");
  assert.ok(b.fills > 100, "la grid map est dessinée");
  // ré-import de l'export : affichage de la grid importée et export identique (aller-retour)
  await b.h.loadGridFile("grid_map.csv", b.grid);
  assert.ok(b.h.app.importedGrid && b.h.app.importedGrid.originKnown);
  const fills = b.h.ctx.fills;
  b.h.app.draw();
  assert.ok(b.h.ctx.fills > fills, "grid importée dessinée");
  b.h.click("expGrid");
  assert.equal(b.h.lastDownload("grid_map.csv"), b.grid);
  const mt = core.parseGridCsv(b.maptool, "grid_map_map_tool.csv");
  assert.equal(mt.width, b.h.app.importedGrid.width);
});

test("9c. localisation sur grid map importée : même pose que la V1.0 pour un scan sans perturbation", async () => {
  const files = SC.makeScans("reloc", SC.ROOM_POSES, SC.ROOM),
    poses = SC.ROOM_POSES.map((p) => SC.S.relativePose(SC.ROOM_POSES[0], p)),
    ref = await SC.fixedMap(APP, files.slice(0, 3), poses);
  const extra = SC.makeScans("reloc_cible", [[3.0, 2.5, 50]], SC.ROOM)[0],
    expected = SC.S.relativePose(SC.ROOM_POSES[0], extra.truth),
    results = [];
  for (const f of [OLD, APP]) {
    const h = loadApp(f);
    await h.loadGridFile("grid_map.csv", ref.grid);
    await h.loadFiles([extra]);
    await h.app.locateOnGrid(0);
    results.push({ pose: h.app.scans[0].pose, ok: h.app.scans[0].mapRegistered });
  }
  for (const r of results) {
    assert.ok(r.ok);
    assert.ok(Math.hypot(r.pose[0] - expected[0], r.pose[1] - expected[1]) < 0.05 && SC.angleErr(r.pose[2], expected[2]) < 2, JSON.stringify(r));
  }
});

test("9d. export de la grid map indépendant de la taille du canvas", async () => {
  const files = SC.makeScans("canvas", SC.ROOM_POSES.slice(0, 2), SC.ROOM),
    h = loadApp(APP);
  await h.loadFiles(files);
  h.app.anchorScanAt(0);
  h.$("plot").getBoundingClientRect = () => ({ width: 0, height: 0 }); // fenêtre réduite / onglet caché
  h.click("expGrid");
  assert.ok((h.lastDownload("grid_map.csv") || "").split("\n").length > 10);
});
