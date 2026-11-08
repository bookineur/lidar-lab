"use strict";
// Corpus de FAUX POSITIFS de la localisation sur carte cumulée (scans LD06 SIMULÉS, graines fixes).
// But : choisir les seuils du test de cohérence avec l'espace libre SANS les ajuster aux résultats finaux.
//   node tests/corpus_faux_positifs.js calibrer   -> graines 1..100 : mesure, puis choix des seuils par la règle
//   node tests/corpus_faux_positifs.js evaluer    -> graines 101..200 : évaluation avec les seuils de lidar_core.js
// Règle de choix ANNONCÉE AVANT la mesure : parmi les couples (maxFreeHit, maxWallCross) de la grille, garder ceux
// qui donnent 0 faux positif sur le corpus de réglage, puis celui qui accepte le plus de bonnes poses ; à égalité,
// le couple le moins strict (somme des deux seuils la plus grande).
const path = require("path");
const LC = require("../lidar_core.js");
const S = require("./synthetic_ld06.js");

const ROOM = [...S.rect(0, 0, 6, 4), ...S.rect(4.8, 3.3, 5.8, 3.9, "armoire"), ...S.rect(2.4, 1.6, 3.4, 2.2, "table")];
const SYM = S.rect(0, 0, 6, 4);
const OTHER = [...S.rect(30, 30, 33, 32), S.seg(31, 30.5, 31, 31.5)];
const LROOM = [S.seg(0, 0, 8, 0), S.seg(8, 0, 8, 6), S.seg(8, 6, 6, 6), S.seg(6, 6, 6, 2), S.seg(6, 2, 0, 2), S.seg(0, 2, 0, 0), ...S.rect(7.2, 4.6, 7.8, 5.2, "poteau"), ...S.rect(2.5, 0.0, 3.0, 0.4, "meuble")];
const TWO = [S.seg(0, 0, 9, 0), S.seg(9, 0, 9, 3), S.seg(9, 3, 5, 3), S.seg(5, 3, 5, 4), S.seg(5, 4, 0, 4), S.seg(0, 4, 0, 0), S.seg(5, 0, 5, 1.2), S.seg(5, 2.2, 5, 3), ...S.rect(2.4, 1.6, 3.4, 2.2, "table"), ...S.rect(7.6, 0.3, 8.6, 0.8, "armoire")];

// Scénarios : scans de référence (poses vraies) + scan à localiser. « doitRefuser » : aucune correspondance réelle.
const SCENARIOS = {
  salle_meublee: (j) => ({ walls: ROOM, refs: [[1, 1, 0], [1.4, 1.1, 10]], query: [2 + j(0.3), 1 + j(0.2), 25 + j(15)] }),
  salle_symetrique: (j) => ({ walls: SYM, refs: [[2, 2, 0]], query: [4 + j(0.2), 2 + j(0.2), j(10)] }),
  symetrie_centrale: (j) => ({ walls: SYM, refs: [[1.5, 2, 0]], query: [4.5 + j(0.2), 2 + j(0.2), 180 + j(10)] }),
  autre_piece: (j) => ({ walls: ROOM, refs: [[1, 1, 0], [1.4, 1.1, 10], [2, 1, 25]], query: [31.5 + j(0.3), 31 + j(0.2), j(30)], queryWalls: OTHER, doitRefuser: true }),
  salle_L_bras: (j) => ({ walls: LROOM, refs: [[1, 1, 0], [7, 1, 45]], query: [7 + j(0.2), 5.2 + j(0.2), 90 + j(15)] }),
  deux_pieces: (j) => ({ walls: TWO, refs: [[1.5, 2, 0], [5.3, 1.7, 20]], query: [8.2 + j(0.2), 2.0 + j(0.2), 180 + j(15)] }),
};

const GRID = [0.02, 0.05, 0.1, 0.15, 0.2, 0.3, Infinity];
const TOL_XY = 0.1,
  TOL_DEG = 2;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/** Un cas : construit la carte des références comme l'assemblage, puis localise la requête ; renvoie les
    candidats affinés AVEC leurs mesures de cohérence (aucun filtrage), et la pose relative vraie. */
function runCase(name, seed) {
  const rng = S.mulberry32(seed * 7919 + name.length * 104729);
  const j = (a) => (2 * rng() - 1) * a;
  const sc = SCENARIOS[name](j);
  const f = LC.ASSEMBLY_DEFAULTS.filter,
    res = LC.ASSEMBLY_DEFAULTS.resolution;
  const ref0 = sc.refs[0];
  const refs = sc.refs.map((p, k) => {
    const s = LC.parseCsv(S.toCsv(S.simulateScan({ pose: p, walls: sc.walls, seed: seed * 10 + k })), "r" + k);
    s.pose = S.relativePose(ref0, p);
    return s;
  });
  const q = LC.parseCsv(S.toCsv(S.simulateScan({ pose: sc.query, walls: sc.queryWalls || sc.walls, seed: seed * 10 + 9 })), "q");
  const truth = S.relativePose(ref0, sc.query);
  const cells = LC.computeGridCells(refs, (s) => LC.filterScanPoints(s, f), res),
    g = LC.cellsToGrid(cells, res),
    pts = LC.filterScanPoints(q, f),
    prev = refs[refs.length - 1].pose;
  const loc = LC.locateScanOnGrid(pts, g, { minOverlap: LC.ASSEMBLY_DEFAULTS.minOverlap, around: { pose: prev, xy: LC.ASSEMBLY_DEFAULTS.localXY, deg: LC.ASSEMBLY_DEFAULTS.localDeg } });
  const r = LC.locateScanOnGrid(pts, g, { minOverlap: LC.ASSEMBLY_DEFAULTS.minOverlap, seeds: loc.pose ? [loc.pose] : [], freeSpaceCheck: { cells, res, maxFreeHit: Infinity, maxWallCross: Infinity }, debug: true });
  return { name, seed, doitRefuser: !!sc.doitRefuser, truth, cands: r.candidates || [] };
}

/** Rejoue la décision de locateScanOnGrid (même fonction chooseCandidate) pour un couple de seuils. */
function outcome(c, maxFreeHit, maxWallCross) {
  if (!c.cands.length) return "refus";
  const ch = LC.chooseCandidate(c.cands, { minOverlap: LC.ASSEMBLY_DEFAULTS.minOverlap, maxFreeHit, maxWallCross });
  if (!ch.ok) return "refus";
  if (c.doitRefuser) return "faux_positif";
  const deg = (ch.best.a * 180) / Math.PI;
  const good = Math.hypot(ch.best.x - c.truth[0], ch.best.y - c.truth[1]) < TOL_XY && angDiff(deg, c.truth[2]) < TOL_DEG;
  return good ? "bonne_pose" : "faux_positif";
}

function tally(cases, a, b) {
  const t = { bonne_pose: 0, faux_positif: 0, refus: 0, parScenario: {} };
  for (const c of cases) {
    const o = outcome(c, a, b);
    t[o]++;
    const p = (t.parScenario[c.name] = t.parScenario[c.name] || { bonne_pose: 0, faux_positif: 0, refus: 0 });
    p[o]++;
  }
  return t;
}

function collect(seeds) {
  const cases = [];
  for (const name of Object.keys(SCENARIOS)) for (const seed of seeds) cases.push(runCase(name, seed));
  return cases;
}

const fmt = (v) => (v === Infinity ? "∞" : String(v));
function table(t) {
  return Object.entries(t.parScenario).map(([k, v]) => `| ${k} | ${v.bonne_pose} | ${v.faux_positif} | ${v.refus} |`).join("\n");
}

if (require.main === module) {
  const mode = process.argv[2] || "calibrer";
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  if (mode === "calibrer") {
    const t0 = Date.now();
    const cases = collect(range(1, 100));
    const sans = tally(cases, Infinity, Infinity);
    const rows = [];
    for (const a of GRID) for (const b of GRID) rows.push({ a, b, ...tally(cases, a, b) });
    const zero = rows.filter((r) => r.faux_positif === 0);
    zero.sort((p, q) => q.bonne_pose - p.bonne_pose || (q.a === Infinity ? 1e9 : q.a) + (q.b === Infinity ? 1e9 : q.b) - ((p.a === Infinity ? 1e9 : p.a) + (p.b === Infinity ? 1e9 : p.b)));
    const pick = zero[0] || null;
    const out = {
      corpus: "réglage, graines 1..100",
      cas: cases.length,
      duree_s: (Date.now() - t0) / 1000,
      sans_test: { bonne_pose: sans.bonne_pose, faux_positif: sans.faux_positif, refus: sans.refus, parScenario: sans.parScenario },
      grille: rows.map((r) => ({ maxFreeHit: fmt(r.a), maxWallCross: fmt(r.b), bonne_pose: r.bonne_pose, faux_positif: r.faux_positif, refus: r.refus })),
      choix: pick ? { maxFreeHit: pick.a, maxWallCross: pick.b, bonne_pose: pick.bonne_pose, faux_positif: 0, refus: pick.refus, parScenario: pick.parScenario } : null,
    };
    console.log(JSON.stringify(out, null, 1));
  } else if (mode === "evaluer") {
    const fs0 = LC.ASSEMBLY_DEFAULTS.freeSpace;
    if (!fs0) throw new Error("aucun seuil dans LC.ASSEMBLY_DEFAULTS.freeSpace : lancer d'abord la calibration");
    const t0 = Date.now();
    const cases = collect(range(101, 200));
    const avec = tally(cases, fs0.maxFreeHit, fs0.maxWallCross),
      sans = tally(cases, Infinity, Infinity);
    console.log(JSON.stringify({ corpus: "évaluation, graines 101..200", cas: cases.length, duree_s: (Date.now() - t0) / 1000, seuils: fs0, avec, sans }, null, 1));
  }
}

module.exports = { SCENARIOS, GRID, runCase, outcome, tally, collect, table };
