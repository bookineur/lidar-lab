"use strict";
// Bouton « Localiser et construire la carte » : assemblage automatique de scans enregistrés.
// Les scans sont SIMULÉS (lancer de rayons, graine fixe) sauf le dernier test, qui lit la vraie séance
// du robot du 04/11 si le dossier TP-cartographie est présent (sinon il est ignoré).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const LC = require("../lidar_core.js");
const S = require("./synthetic_ld06.js");
const { loadApp } = require("./harness.js");

// salle 6 x 4 m avec une armoire (rompt la symétrie) et une table
const ROOM = [...S.rect(0, 0, 6, 4), ...S.rect(4.8, 3.3, 5.8, 3.9, "armoire"), ...S.rect(2.4, 1.6, 3.4, 2.2, "table")];
// trajet du robot : petits déplacements, comme pendant un relevé
const PATH = [[1, 1, 0], [1.3, 1.1, 8], [1.7, 1.0, 15], [2.1, 0.9, 25], [2.6, 1.0, 40], [3.0, 0.8, 55], [3.6, 1.0, 70], [4.0, 1.4, 85]];
const scanName = (k) => `scan_${String(k + 1).padStart(2, "0")}_10h${String(10 + k).padStart(2, "0")}m00.csv`;
const scanOf = (pose, k, walls = ROOM, name = scanName(k)) => LC.parseCsv(S.toCsv(S.simulateScan({ pose, walls, seed: 10 + k })), name);
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

function checkAgainstTruth(results, truthByName, tolXY, tolDeg) {
  const ref = truthByName[results.find((r) => r.statut === "origine").nom];
  for (const r of results.filter((x) => x.pose)) {
    const t = S.relativePose(ref, truthByName[r.nom]);
    assert.ok(Math.hypot(r.pose[0] - t[0], r.pose[1] - t[1]) < tolXY, `${r.nom} : position ${r.pose} au lieu de ${t}`);
    assert.ok(angDiff(r.pose[2], t[2]) < tolDeg, `${r.nom} : angle ${r.pose[2]} au lieu de ${t[2]}`);
  }
}

test("A1. relevé simulé : tous les scans placés, poses justes à 5 cm / 1,5° près", () => {
  const scans = PATH.map((p, k) => scanOf(p, k));
  const b = LC.assembleSession(scans);
  assert.strictEqual(b.places, PATH.length);
  assert.strictEqual(b.resultats[0].statut, "origine");
  assert.deepStrictEqual(b.resultats[0].pose, [0, 0, 0]);
  checkAgainstTruth(b.resultats, Object.fromEntries(PATH.map((p, k) => [scanName(k), p])), 0.05, 1.5);
});

test("A2. ordre de capture : des fichiers chargés dans le désordre sont triés par l'heure du nom", () => {
  const scans = PATH.map((p, k) => scanOf(p, k));
  const shuffled = [scans[3], scans[0], scans[6], scans[1], scans[7], scans[2], scans[5], scans[4]];
  const b = LC.assembleSession(shuffled);
  assert.deepStrictEqual(b.ordre, PATH.map((_, k) => scanName(k)));
  assert.strictEqual(b.resultats.find((r) => r.statut === "origine").nom, scanName(0));
  assert.strictEqual(b.places, PATH.length);
});

test("A3. scans mal formés ou inutilisables : signalés « invalide », jamais placés", () => {
  const good = PATH.slice(0, 3).map((p, k) => scanOf(p, k));
  const garbage = LC.parseCsv("ceci,n'est,pas\nun,scan,lidar\n", "scan_90_11h00m00.csv");
  const world = LC.parseCsv("x_m,y_m\n1,2\n3,4\n", "scan_91_11h00m01.csv");
  const tooFew = LC.parseCsv("angle_deg,distance_mm,intensity\n0,1000,200\n90,1500,200\n", "scan_92_11h00m02.csv");
  const b = LC.assembleSession([...good, garbage, world, tooFew]);
  const by = Object.fromEntries(b.resultats.map((r) => [r.nom, r]));
  for (const n of ["scan_90_11h00m00.csv", "scan_91_11h00m01.csv", "scan_92_11h00m02.csv"]) {
    assert.strictEqual(by[n].statut, "invalide", n);
    assert.strictEqual(by[n].pose, null, n);
    assert.ok(by[n].raison.length > 0, n);
  }
  assert.match(by["scan_91_11h00m01.csv"].raison, /repère carte/);
  assert.match(by["scan_92_11h00m02.csv"].raison, /pas assez de points/);
  assert.strictEqual(b.places, 3);
});

test("A4. doublon : le même fichier chargé deux fois n'est pris qu'une fois", () => {
  const scans = PATH.slice(0, 3).map((p, k) => scanOf(p, k));
  const copy = LC.parseCsv(S.toCsv(S.simulateScan({ pose: PATH[1], walls: ROOM, seed: 11 })), "scan_02_10h11m00 - Copie.csv");
  const b = LC.assembleSession([...scans, copy]);
  const d = b.resultats.find((r) => r.nom.includes("Copie"));
  assert.strictEqual(d.statut, "doublon");
  assert.match(d.raison, /scan_02_10h11m00\.csv/);
  assert.strictEqual(b.places, 3);
});

test("A5. aucun mur commun (graine 13) : le scan est refusé, raison donnée, jamais intégré de force", () => {
  const scans = PATH.slice(0, 3).map((p, k) => scanOf(p, k));
  const other = [...S.rect(30, 30, 33, 32), S.seg(31, 30.5, 31, 31.5)]; // une autre pièce, sans mur commun
  const lost = scanOf([31.5, 31, 0], 3, other);
  const b = LC.assembleSession([...scans, lost]);
  const r = b.resultats.find((x) => x.nom === scanName(3));
  assert.strictEqual(r.statut, "refusé");
  assert.strictEqual(r.pose, null);
  assert.match(r.raison, /murs communs|ambigu|trop pauvre/);
  assert.ok(r.essais >= 1);
  assert.strictEqual(b.places, 3);
});

// LIMITE CONNUE (documentée, non corrigée à l'étape 1) : le critère d'acceptation de locateScanOnGrid
// (recouvrement >= 35 % et écart relatif >= 8 %, le même que l'Auto-SLAM) accepte parfois une pose FAUSSE
// quand la géométrie est simple : un petit rectangle d'une autre pièce « tient » dans la salle.
test("A5b. aucun mur commun, autres graines : ne doit jamais être placé", { todo: "faux positif du critère recouvrement/ambiguïté (graine 99 placée à tort)" }, () => {
  const scans = PATH.slice(0, 3).map((p, k) => scanOf(p, k));
  const other = [...S.rect(30, 30, 33, 32), S.seg(31, 30.5, 31, 31.5)];
  for (const seed of [99, 7, 42]) {
    const lost = LC.parseCsv(S.toCsv(S.simulateScan({ pose: [31.5, 31, 0], walls: other, seed })), scanName(3));
    const r = LC.assembleSession([...scans, lost]).resultats[3];
    assert.notStrictEqual(r.statut, "placé", "graine " + seed);
  }
});

// LIMITE CONNUE : sur 30 tirages de bruit dans cette salle, le critère d'origine (Auto-SLAM, recherche globale
// seule) accepte une pose fausse dans 21 cas ; la graine locale de l'assemblage n'en ajoute aucun (mesure du 07/11).
test("A6. salle parfaitement symétrique (configuration du test 4b) : aucune pose fausse acceptée", { todo: "faux positif préexistant du critère d'ambiguïté : 21 tirages sur 30 acceptent une pose fausse" }, () => {
  const sym = S.rect(0, 0, 6, 4);
  const truth = [[2, 2, 0], [4, 2, 0]];
  const b = LC.assembleSession(truth.map((p, k) => scanOf(p, k, sym)));
  const r = b.resultats[1],
    exp = S.relativePose(truth[0], truth[1]);
  const right = r.pose && Math.hypot(r.pose[0] - exp[0], r.pose[1] - exp[1]) < 0.1;
  assert.ok(r.statut === "refusé" || right, "pose fausse acceptée : " + JSON.stringify(r));
  if (r.statut === "refusé") assert.match(r.raison, /ambigu|murs communs/);
});

test("A6b. symétrie centrale parfaite (scan 2 retourné de 180°) : doit être refusé", { todo: "faux positif : écart relatif 29 % entre deux poses physiquement équivalentes (coûts très faibles)" }, () => {
  const sym = S.rect(0, 0, 6, 4);
  const b = LC.assembleSession([scanOf([1.5, 2, 0], 0, sym), scanOf([4.5, 2, 180], 1, sym)]);
  assert.strictEqual(b.resultats[1].statut, "refusé");
});

test("A7. scan refusé puis réessayé : placé dès qu'un scan intermédiaire agrandit la carte", () => {
  // Scénario de test (recouvrement minimal 70 % passé en option) : C, capturé avant B, ne recouvre pas
  // assez la carte du seul scan A ; B est placé, puis C est réessayé automatiquement et placé.
  const A = scanOf(PATH[0], 0, ROOM, "scan_A_10h00m00.csv"),
    C = scanOf(PATH[7], 7, ROOM, "scan_C_10h01m00.csv"),
    B = scanOf(PATH[3], 3, ROOM, "scan_B_10h02m00.csv");
  const b = LC.assembleSession([A, C, B], { minOverlap: 0.7 });
  const rc = b.resultats[1];
  assert.strictEqual(b.resultats[2].statut, "placé");
  assert.strictEqual(rc.statut, "placé", JSON.stringify(rc));
  assert.ok(rc.essais >= 2, "C doit avoir été réessayé");
  checkAgainstTruth(b.resultats, { "scan_A_10h00m00.csv": PATH[0], "scan_C_10h01m00.csv": PATH[7], "scan_B_10h02m00.csv": PATH[3] }, 0.06, 1.5);
});

test("A7b. salle en L : un scan du bras étroit ne doit pas être placé dans la première zone", { todo: "faux positif : bras de 2 m confondu avec la bande de 2 m de départ (recouvrement 68 %, écart 28 %)" }, () => {
  const L = [S.seg(0, 0, 8, 0), S.seg(8, 0, 8, 6), S.seg(8, 6, 6, 6), S.seg(6, 6, 6, 2), S.seg(6, 2, 0, 2), S.seg(0, 2, 0, 0), ...S.rect(7.2, 4.6, 7.8, 5.2, "poteau"), ...S.rect(2.5, 0.0, 3.0, 0.4, "meuble")];
  const truth = { "scan_01_09h00m00.csv": [1, 1, 0], "scan_02_09h00m10.csv": [7, 5.2, 90], "scan_03_09h00m20.csv": [7, 1, 45] };
  const b = LC.assembleSession(Object.entries(truth).map(([n, p], k) => scanOf(p, k, L, n)));
  const ref = truth["scan_01_09h00m00.csv"];
  for (const r of b.resultats.filter((x) => x.pose)) {
    const t = S.relativePose(ref, truth[r.nom]);
    assert.ok(Math.hypot(r.pose[0] - t[0], r.pose[1] - t[1]) < 0.1, r.nom + " placé à une pose fausse");
  }
});

test("A8. les scans fournis ne sont jamais modifiés par l'assemblage (données brutes intactes)", () => {
  const scans = PATH.slice(0, 4).map((p, k) => scanOf(p, k));
  const before = JSON.stringify(scans.map((s) => ({ pose: s.pose, raw: s.rawPts, reg: s.mapRegistered })));
  LC.assembleSession(scans);
  assert.strictEqual(JSON.stringify(scans.map((s) => ({ pose: s.pose, raw: s.rawPts, reg: s.mapRegistered }))), before);
});

test("A9. interface : le bouton place les scans, remplit le tableau et exporte le bilan CSV", async () => {
  const h = loadApp("index.html");
  await h.loadFiles(PATH.map((p, k) => ({ name: scanName(k), text: S.toCsv(S.simulateScan({ pose: p, walls: ROOM, seed: 10 + k })) })));
  await h.click("buildMap");
  const scans = h.app.scans;
  assert.ok(scans.every((s) => s.mapRegistered), "tous les scans doivent être intégrés");
  assert.deepStrictEqual([...scans[0].pose], [0, 0, 0]);
  assert.ok(scans[0].isAnchor);
  assert.match(h.$("buildMapStatus").textContent, /8 scan\(s\) placé\(s\) sur 8/);
  assert.match(h.$("buildMapTable").innerHTML, /origine/);
  assert.strictEqual(h.$("buildMapExport").disabled, false);
  await h.click("buildMapExport");
  const csv = h.lastDownload("bilan_assemblage.csv");
  assert.ok(csv && csv.split("\n").length === 9, "en-tête + 8 lignes");
  assert.match(csv.split("\n")[0], /^scan,statut,methode,x_m,y_m,theta_deg/);
  // la grid map exportable contient bien des murs
  const g = h.app.getGridExportData();
  assert.ok(g && g.rows.flat().filter((v) => v === 1).length > 50, "la grid map doit contenir des murs");
});

test("A10. interface : un scan inutilisable est signalé, masqué et laissé hors carte", async () => {
  const h = loadApp("index.html");
  await h.loadFiles([
    ...PATH.slice(0, 3).map((p, k) => ({ name: scanName(k), text: S.toCsv(S.simulateScan({ pose: p, walls: ROOM, seed: 10 + k })) })),
    { name: "scan_04_10h13m00.csv", text: ["angle_deg,distance_mm,intensity", "0,1000,200", "90,1500,200", "180,900,200"].join("\n") },
  ]);
  await h.click("buildMap");
  const bad = h.app.scans.find((s) => s.name === "scan_04_10h13m00.csv");
  assert.strictEqual(bad.mapRegistered, false);
  assert.strictEqual(bad.visible, false);
  assert.match(h.$("buildMapStatus").textContent, /3 scan\(s\) placé\(s\) sur 4 .* invalides 1/);
  assert.match(h.$("buildMapTable").innerHTML, /pas assez de points/);
});

test("A10b. interface : un scan d'une autre pièce (sans mur commun) doit rester hors carte", { todo: "faux positif du critère (voir A5b) : le scan est placé à tort" }, async () => {
  const h = loadApp("index.html");
  const other = [...S.rect(30, 30, 33, 32), S.seg(31, 30.5, 31, 31.5)];
  await h.loadFiles([
    ...PATH.slice(0, 3).map((p, k) => ({ name: scanName(k), text: S.toCsv(S.simulateScan({ pose: p, walls: ROOM, seed: 10 + k })) })),
    { name: scanName(3), text: S.toCsv(S.simulateScan({ pose: [31.5, 31, 0], walls: other, seed: 99 })) },
  ]);
  await h.click("buildMap");
  assert.strictEqual(h.app.scans.find((s) => s.name === scanName(3)).mapRegistered, false);
});

const REAL = "C:/Users/HP/TP-cartographie/data/robot_wifi/seance_2026-11-04_17h42m59";
test("A11. vraie séance du 04/11 (40 scans LD06) : chaque scan reçoit un statut et une raison", { skip: !fs.existsSync(REAL) && "données réelles absentes" }, () => {
  // Pas de vérité terrain : ce test vérifie le fonctionnement, pas la précision.
  // Les écarts avec l'Auto-SLAM sont mesurés et documentés à part (README).
  const ref = JSON.parse(fs.readFileSync(path.join(REAL, "reference_autoslam_2026-11-04.json"), "utf8"));
  const scans = ref.scans.map((s) => LC.parseCsv(fs.readFileSync(path.join(REAL, s.nom), "utf8"), s.nom));
  const b = LC.assembleSession(scans);
  assert.strictEqual(b.resultats.length, 40);
  assert.strictEqual(b.resultats.find((r) => r.statut === "origine").nom, "scan_01_19h20m09.csv");
  for (const r of b.resultats) {
    assert.ok(["origine", "placé", "refusé"].includes(r.statut), r.nom);
    if (r.statut === "refusé") assert.ok(r.raison && !r.pose, r.nom);
  }
});

test("A12. cohérence avec l'espace libre : nulle à la bonne pose, forte à la fausse pose du bras de L", () => {
  const L = [S.seg(0, 0, 8, 0), S.seg(8, 0, 8, 6), S.seg(8, 6, 6, 6), S.seg(6, 6, 6, 2), S.seg(6, 2, 0, 2), S.seg(0, 2, 0, 0), ...S.rect(7.2, 4.6, 7.8, 5.2, "poteau"), ...S.rect(2.5, 0.0, 3.0, 0.4, "meuble")];
  const f = LC.ASSEMBLY_DEFAULTS.filter,
    res = LC.ASSEMBLY_DEFAULTS.resolution;
  const refs = [[1, 1, 0], [7, 1, 45]].map((p, k) => {
    const s = scanOf(p, k, L);
    s.pose = S.relativePose([1, 1, 0], p);
    return s;
  });
  const cells = LC.computeGridCells(refs, (s) => LC.filterScanPoints(s, f), res);
  const q = LC.filterScanPoints(scanOf([7, 5.2, 90], 2, L), f);
  const good = LC.freeSpaceConsistency(q, S.relativePose([1, 1, 0], [7, 5.2, 90]), cells, res);
  const wrong = LC.freeSpaceConsistency(q, [0, 0, 0], cells, res); // bras du L superposé à la zone de départ
  assert.ok(good.freeHit < 0.05 && good.wallCross < 0.05, JSON.stringify(good));
  assert.ok(wrong.freeHit > 0.15 || wrong.wallCross > 0.15, JSON.stringify(wrong));
});

test("A13. sans freeSpaceCheck, locateScanOnGrid ne calcule aucun indicateur de cohérence (comportement inchangé)", () => {
  const scans = PATH.slice(0, 2).map((p, k) => scanOf(p, k));
  scans[0].pose = [0, 0, 0];
  const f = LC.ASSEMBLY_DEFAULTS.filter;
  const g = LC.cellsToGrid(LC.computeGridCells([scans[0]], (s) => LC.filterScanPoints(s, f), 0.05), 0.05);
  const r = LC.locateScanOnGrid(LC.filterScanPoints(scans[1], f), g, { minOverlap: 0.35 });
  assert.strictEqual(r.freeHit, undefined);
  assert.strictEqual(r.incoherent, undefined);
  assert.strictEqual(LC.ASSEMBLY_DEFAULTS.freeSpace, null, "désactivé par défaut tant qu'aucun seuil n'est validé");
});
