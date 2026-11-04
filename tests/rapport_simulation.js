"use strict";
// Produit tests/resultats_simulation.md : chaque scénario sur la V1.0 (archive) et sur la V1 actuelle.
// SIMULATION logicielle : scans LD06 synthétiques, ce ne sont pas des mesures réelles du robot.
// Lancer :  node tests/rapport_simulation.js
const fs = require("fs");
const path = require("path");
const SC = require("./scenarios");

const VERSIONS = [
  ["V1.0 (e37950a)", "anciennes_versions/index_v1.0_e37950a.html"],
  ["V1 actuelle", "index.html"],
];
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : "—");
const cm = (v) => (Number.isFinite(v) ? (v * 100).toFixed(1) + " cm" : "—");
const out = [];
const md = (...l) => out.push(...l);
const table = (head, rows) => {
  md("| " + head.join(" | ") + " |", "|" + head.map(() => "---").join("|") + "|");
  for (const r of rows) md("| " + r.join(" | ") + " |");
  md("");
};
const countsTable = (counts) => table(["scan", "intégré", "brut", "après portée/intensité", "après filtre temporel"], counts.map((c) => [c.scan, c.registered ? "oui" : "non", c.brut, c.porteeIntensite, c.filtreTemporel]));
const stepsTable = (steps) =>
  table(
    ["scan", "intégré", "pose attendue", "pose obtenue", "erreur"],
    steps.map((s) => [s.k, s.registered ? "oui" : "**non**", s.expected.map(f3).join(", "), s.registered ? s.got.map(f3).join(", ") : "—", s.registered ? `${cm(s.pos)} / ${s.ang.toFixed(1)}°` : s.message.slice(0, 110)])
  );

(async () => {
  md("# Résultats des simulations V1 (scans LD06 synthétiques)", "", "> Données **simulées** par lancer de rayons (bruit 8 mm, graine fixe) — pas des mesures du robot.", `> Généré par \`node tests/rapport_simulation.js\` le ${new Date().toISOString().slice(0, 10)}.`, "");
  for (const [label, file] of VERSIONS) {
    md(`## ${label} — \`${file}\``, "");
    const r1 = await SC.scenario1(file);
    md("### 1. Salle aux murs fixes (4 scans)", "");
    stepsTable(r1.steps);
    countsTable(r1.counts);
    md(`Points de mur gardés dans la carte : ${r1.walls.map((w) => `${w.carte}/${w.brut}`).join(", ")} · murs couverts dans grid_map.csv : ${Number.isFinite(r1.coverage) ? (r1.coverage * 100).toFixed(0) + " %" : "—"}`, "");

    const r2 = await SC.scenario2(file);
    md("### 2. Personne mobile (une position différente par scan)", "");
    stepsTable(r2.steps);
    table(["scan", "intégré", "personne brut", "personne après portée/intensité", "personne dans la carte", "murs brut → carte"], r2.persons.map((p) => [p.scan, p.registered ? "oui" : "non", p.personneBrut, p.personneApresPortee, p.personneCarte, `${p.mursBrut} → ${p.mursCarte}`]));

    const r3 = await SC.scenario3(file);
    md("### 3. Zone nouvelle (alcôve cachée par une cloison)", "");
    table(
      ["étape", "scan intégré", "erreur de pose", "alcôve scan 2 (brut → carte)", "alcôve scan 3 (brut → carte)", "cellules occupées alcôve"],
      [
        ["après le 1er scan qui la voit", r3.afterFirstView.registered2 ? "oui" : "**non**", r3.afterFirstView.registered2 ? `${cm(r3.afterFirstView.pose2.pos)} / ${r3.afterFirstView.pose2.ang.toFixed(1)}°` : "—", `${r3.afterFirstView.scan2.brut} → ${r3.afterFirstView.scan2.carte}`, "—", r3.afterFirstView.cellulesAlcove],
        ["après le scan de confirmation", r3.afterConfirm.registered3 ? "oui" : "**non**", r3.afterConfirm.registered3 ? `${cm(r3.afterConfirm.pose3.pos)} / ${r3.afterConfirm.pose3.ang.toFixed(1)}°` : "—", `${r3.afterConfirm.scan2.brut} → ${r3.afterConfirm.scan2.carte}`, `${r3.afterConfirm.scan3.brut} → ${r3.afterConfirm.scan3.carte}`, r3.afterConfirm.cellulesAlcove],
      ]
    );

    const r4 = await SC.scenario4(file);
    md("### 4. Salle A → porte → salle B, puis salle C sans mur commun", "");
    stepsTable(r4.steps);
    md(`Points de la salle B (brut → carte) dans les scans 1–3 : ${r4.roomB.map((b) => `${b.brut} → ${b.carte}`).join(", ")}`, "");
    md(`Salle C, recalage automatique : ${r4.autoC.registered ? "intégré" : "refusé"} — « ${r4.autoC.message.slice(0, 200)} »`, "");
    if (r4.manual)
      md(`Salle C, pose saisie puis « Intégrer à la pose saisie » : scan 4 ${r4.manual.registered4 ? "intégré" : "non"}; scan 5 recalé automatiquement : ${r4.manual.registered5 ? "oui" : "non"} (erreur ${cm(r4.manual.pose5.pos)} / ${r4.manual.pose5.ang.toFixed(1)}°); murs du scan 4 confirmés : ${r4.manual.murCcarte}/${r4.manual.murCbrut}.`, "");
    else md("Salle C : aucune fonction pour intégrer un scan à une pose saisie → le relevé ne peut pas continuer.", "");

    const r5 = await SC.scenario5(file);
    md("### 5. Points trop proches, au-delà de 12 m, faible intensité", "");
    table(["étape", "total", "< 0,05 m", "châssis 0,08–0,12 m", "12,5 m", "15,5 m", "armoire noire (I≈8)"], r5.steps.map((s) => [s.name, s.total, s.trop_proche_parse, s.chassis, s.lointain_12_15, s.lointain_15, s.armoire_noire]));

    const r6 = await SC.scenario6(file);
    md("### 6. Données brutes et export brut après filtres (min 0,5 m, max 3 m, I ≥ 150) et recalage", "");
    table(["scan", "CSV brut identique", "export brut identique", "points bruts identiques", "brut", "après filtres"], r6.checks.map((c) => [c.scan, c.csvIdentique ? "oui" : "NON", c.exportBrutIdentique ? "oui" : "NON", c.pointsBrutsIdentiques && c.ptsToujoursBruts ? "oui" : "NON", c.nbBrut, c.nbFiltre]));

    const r7 = await SC.scenario7(file);
    md("### 7. CSV sans intensité", "");
    table(["seuil intensité", "format", "brut", "après filtre"], r7.rows.map((r) => [r.seuil, r.format, r.brut, r.apresFiltre]));
    md(`Message affiché : « ${r7.status} »`, "");

    const r8 = await SC.scenario8(file);
    md("### 8. Filtre temporel activé / désactivé", "");
    table(["état", "points dans la carte", "retours de personne par scan"], [["activé", r8.on.total, r8.on.personnes.join(" / ")], ["désactivé", r8.off.total, r8.off.personnes.join(" / ")], ["réactivé", r8.again.total, r8.again.personnes.join(" / ")]]);
  }
  const files = SC.makeScans("regression", SC.ROOM_POSES, SC.ROOM),
    poses = SC.ROOM_POSES.map((p) => SC.S.relativePose(SC.ROOM_POSES[0], p)),
    a = await SC.fixedMap(VERSIONS[0][1], files, poses),
    b = await SC.fixedMap(VERSIONS[1][1], files, poses);
  md("## 9. Non-régression (mêmes scans, mêmes poses)", "");
  table(["export", "V1.0", "V1 actuelle", "identique"], [
    ["grid_map.csv (lignes)", a.grid.split("\n").length, b.grid.split("\n").length, a.grid === b.grid ? "oui" : "NON"],
    ["grid_map_map_tool.csv", a.maptool.length + " car.", b.maptool.length + " car.", a.maptool === b.maptool ? "oui" : "NON"],
    ["scans_fusionnes.csv", a.merged.split("\n").length - 1 + " pts", b.merged.split("\n").length - 1 + " pts", a.merged === b.merged ? "oui" : "NON"],
    ["poses.json", "", "", a.poses === b.poses ? "oui" : "NON"],
  ]);
  const target = path.join(__dirname, "resultats_simulation.md");
  fs.writeFileSync(target, out.join("\n"));
  console.log(out.join("\n"));
  console.error("Écrit : " + target);
})();
