"use strict";

// Génère un nouveau corpus synthétique de trajectoire continue.
// Aucun fichier du dépôt ou scan de robot existant n'est modifié.
const fs = require("node:fs");
const path = require("node:path");
const S = require("../tests/synthetic_ld06.js");

const outDir = path.resolve(process.argv[2] || path.join(__dirname, "corpus_trajectoire_continue_v1"));
if (fs.existsSync(outDir)) throw new Error(`Refus d'écraser un dossier existant : ${outDir}`);

const walls = [
  ...S.rect(0, 0, 9, 7, "mur_exterieur"),
  S.seg(4.5, 0, 4.5, 2.3, "cloison"),
  S.seg(4.5, 3.5, 4.5, 7, "cloison"),
  // Corridor en U dans la seconde zone : entrée ouverte au sud, deux murs parallèles.
  S.seg(6.2, 1.0, 6.2, 5.3, "corridor_parallele"),
  S.seg(8.4, 1.0, 8.4, 5.3, "corridor_parallele"),
  S.seg(6.2, 5.3, 8.4, 5.3, "corridor_parallele"),
  ...S.rect(2.8, 4.6, 3.5, 5.2, "table"),
  ...S.rect(5.1, 4.6, 5.5, 5.0, "armoire"),
  ...S.rect(1.0, 5.7, 1.3, 6.0, "poteau"),
];

// Waypoints ordonnés. Les rotations sont explicites et le parcours traverse la porte,
// puis longe et parcourt le corridor. Le robot reste dans les zones libres.
const waypoints = [
  { pose: [1.2, 1.2, 0], phase: "depart" },
  { pose: [2.1, 1.2, 0], phase: "petit_deplacement" },
  { pose: [2.1, 1.2, 90], phase: "rotation_sur_place" },
  { pose: [2.1, 2.8, 90], phase: "approche_porte" },
  { pose: [3.6, 2.8, 0], phase: "traversee_porte" },
  { pose: [5.2, 2.8, 0], phase: "zone_ouverte" },
  { pose: [5.2, 2.8, -90], phase: "rotation_sur_place" },
  { pose: [5.2, 1.4, -90], phase: "approche_corridor" },
  { pose: [5.5, 0.6, -45], phase: "contournement_entree" },
  { pose: [7.4, 0.6, 0], phase: "entree_corridor" },
  { pose: [7.4, 3.9, 90], phase: "corridor_parallele" },
  { pose: [7.4, 3.9, 180], phase: "rotation_sur_place" },
  { pose: [6.8, 3.9, 180], phase: "retour_corridor" },
  { pose: [5.8, 3.9, 180], phase: "sortie_corridor" },
];

const wrap = (deg) => ((deg + 540) % 360) - 180;
const steps = [];
let current = waypoints[0];
steps.push({ pose: [...current.pose], phase: current.phase });
for (let w = 1; w < waypoints.length; w++) {
  const target = waypoints[w], from = current.pose, to = target.pose;
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const turn = wrap(to[2] - from[2]);
  const n = Math.max(1, Math.ceil(dist / 0.15), Math.ceil(Math.abs(turn) / 10));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    steps.push({
      pose: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, wrap(from[2] + turn * t)],
      phase: target.phase,
    });
  }
  current = target;
}

fs.mkdirSync(outDir, { recursive: false });
const scansDir = path.join(outDir, "scans");
fs.mkdirSync(scansDir);
const scans = [];
for (let i = 0; i < steps.length; i++) {
  const id = String(i + 1).padStart(3, "0");
  const name = `scan_${id}.csv`;
  const { pose, phase } = steps[i];
  const points = S.simulateScan({ pose, walls, n: 450, noise: 0.008, seed: 1711000 + i });
  fs.writeFileSync(path.join(scansDir, name), S.toCsv(points, "ld06_mm"), "utf8");
  scans.push({
    name,
    index: i + 1,
    phase,
    truth: { x_m: +pose[0].toFixed(6), y_m: +pose[1].toFixed(6), theta_deg: +pose[2].toFixed(6) },
    seed: 1711000 + i,
    point_count_generated: points.length,
  });
}

const truth = {
  format: "poses globales [x_m, y_m, theta_deg], repère monde synthétique",
  angle_convention: "degrés, trigonométrique, 0° = axe +X",
  sensor_model: "lancer de rayons 2D LD06 simulé; 450 rayons/tour; bruit gaussien de distance sigma=8 mm",
  scans: Object.fromEntries(scans.map((s) => [s.name, [s.truth.x_m, s.truth.y_m, s.truth.theta_deg]])),
};
fs.writeFileSync(path.join(outDir, "verite.json"), JSON.stringify(truth, null, 2) + "\n", "utf8");
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({
  type: "simulation_deterministe_pas_mesures_robot",
  generated_utc: new Date().toISOString(),
  generator: "generer_corpus.js",
  environment: "salle 9x7 m, porte dans une cloison, corridor en U à murs parallèles et obstacles statiques",
  constraints: { max_translation_per_step_m: 0.15, max_rotation_per_step_deg: 10, scans: scans.length },
  waypoints,
  scans,
}, null, 2) + "\n", "utf8");
const readme = [
  "# Corpus synthétique — trajectoire continue", "",
  `Ce dossier contient ${scans.length} scans générés par simulation logicielle, pas des mesures du robot.`, "",
  `- Ordre : manifest.json, champ scans (scan 001 à ${String(scans.length).padStart(3, "0")}).`,
  "- Scans LD06 : scans/*.csv, angles en degrés, distances en mm, intensité synthétique.",
  "- Vérité terrain : verite.json, poses globales [x_m, y_m, theta_deg]. Pour comparer au repère de la première pose, appliquer T_0^-1 T_i.",
  "- Mouvement entre deux captures consécutives : <= 0,15 m et <= 10°. Rotations sur place incluses.",
  "- Scène : salle avec cloison et porte, corridor en U à murs parallèles et obstacles statiques.",
  "- Bruit simulé : sigma 8 mm; graine déterministe par scan.", "",
  "La vérité terrain est séparée des CSV pour éviter que l'algorithme de localisation puisse la lire comme une donnée capteur.", "",
].join("\n");
fs.writeFileSync(path.join(outDir, "README.md"), readme, "utf8");

const maxTranslation = Math.max(...steps.slice(1).map((s, i) => Math.hypot(s.pose[0] - steps[i].pose[0], s.pose[1] - steps[i].pose[1])));
const maxTurn = Math.max(...steps.slice(1).map((s, i) => Math.abs(wrap(s.pose[2] - steps[i].pose[2]))));
console.log(JSON.stringify({ outDir, scans: scans.length, maxTranslation_m: maxTranslation, maxTurn_deg: maxTurn, csvFiles: scans.length }, null, 2));
