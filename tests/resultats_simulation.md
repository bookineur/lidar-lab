# Résultats des simulations V1 (scans LD06 synthétiques)

> Données **simulées** par lancer de rayons (bruit 8 mm, graine fixe) — pas des mesures du robot.
> Généré par `node tests/rapport_simulation.js` le 2026-11-04.

## V1.0 (e37950a) — `anciennes_versions/index_v1.0_e37950a.html`

### 1. Salle aux murs fixes (4 scans)

| scan | intégré | pose attendue | pose obtenue | erreur |
|---|---|---|---|---|
| 1 | oui | 1.000, 0.200, 15.000 | 0.990, 0.215, 15.500 | 1.8 cm / 0.5° |
| 2 | oui | 2.000, -0.200, -10.000 | 1.990, -0.185, -9.500 | 1.8 cm / 0.5° |
| 3 | oui | 2.700, 0.000, 30.000 | 2.690, 0.015, 30.000 | 1.8 cm / 0.0° |

| scan | intégré | brut | après portée/intensité | après filtre temporel |
|---|---|---|---|---|
| SIM_salle_0.csv | oui | 450 | 450 | 450 |
| SIM_salle_1.csv | oui | 450 | 450 | 450 |
| SIM_salle_2.csv | oui | 450 | 450 | 450 |
| SIM_salle_3.csv | oui | 450 | 450 | 450 |

Points de mur gardés dans la carte : 435/435, 436/436, 440/440, 443/443 · murs couverts dans grid_map.csv : 93 %

### 2. Personne mobile (une position différente par scan)

| scan | intégré | pose attendue | pose obtenue | erreur |
|---|---|---|---|---|
| 1 | **non** | 1.000, 0.200, 15.000 | — | Scan non intégré: les points ne correspondent pas assez à la carte (écart 22.4 cm). Prends un scan intermédiai |
| 2 | oui | 2.000, -0.200, -10.000 | 2.015, -0.185, -9.000 | 2.1 cm / 1.0° |
| 3 | oui | 2.700, 0.000, 30.000 | 2.715, 0.015, 30.000 | 2.1 cm / 0.0° |

| scan | intégré | personne brut | personne après portée/intensité | personne dans la carte | murs brut → carte |
|---|---|---|---|---|---|
| SIM_personne_0.csv | oui | 8 | 8 | 8 | 442 → 442 |
| SIM_personne_1.csv | non | 24 | 24 | 24 | 426 → 426 |
| SIM_personne_2.csv | oui | 10 | 10 | 0 | 440 → 440 |
| SIM_personne_3.csv | oui | 8 | 8 | 0 | 442 → 442 |

### 3. Zone nouvelle (alcôve cachée par une cloison)

| étape | scan intégré | erreur de pose | alcôve scan 2 (brut → carte) | alcôve scan 3 (brut → carte) | cellules occupées alcôve |
|---|---|---|---|---|---|
| après le 1er scan qui la voit | oui | 2.1 cm / 0.5° | 17 → 0 | — | 0 |
| après le scan de confirmation | **non** | — | 17 → 0 | 38 → 38 | 0 |

### 4. Salle A → porte → salle B, puis salle C sans mur commun

| scan | intégré | pose attendue | pose obtenue | erreur |
|---|---|---|---|---|
| 1 | **non** | 2.600, 0.000, 0.000 | — | Scan non intégré: les points ne correspondent pas assez à la carte (écart 48.4 cm). Prends un scan intermédiai |
| 2 | **non** | 4.500, 0.000, 0.000 | — | Scan non intégré: plusieurs poses différentes ont des scores proches (écart 65.5 cm, écart de score 0.1%). Pre |
| 3 | **non** | 7.000, -0.500, 90.000 | — | Scan non intégré: plusieurs poses différentes ont des scores proches (écart 64.0 cm, écart de score 6.0%). Pre |

Points de la salle B (brut → carte) dans les scans 1–3 : 113 → 113, 300 → 300, 372 → 372

Salle C, recalage automatique : intégré — « Position estimée du robot : X -0.535 m, Y 0.040 m, angle 0.0° · écart RMS 20.6 cm · qualité Moyenne »

Salle C : aucune fonction pour intégrer un scan à une pose saisie → le relevé ne peut pas continuer.

### 5. Points trop proches, au-delà de 12 m, faible intensité

| étape | total | < 0,05 m | châssis 0,08–0,12 m | 12,5 m | 15,5 m | armoire noire (I≈8) |
|---|---|---|---|---|---|---|
| lignes CSV | 468 | 5 | 6 | 4 | 3 | 5 |
| après lecture (0,05 < r < 15 m) | 460 | 0 | 6 | 4 | 0 | 5 |
| défauts min 0,05 / max 12 / I 0 | 456 | 0 | 6 | 0 | 0 | 5 |
| min 0,15 m | 450 | 0 | 0 | 0 | 0 | 5 |
| min 0,15 / max 4 m | 389 | 0 | 0 | 0 | 0 | 3 |
| min 0,15 / max 12 / I ≥ 20 | 445 | 0 | 0 | 0 | 0 | 0 |
| retour aux défauts | 456 | 0 | 6 | 0 | 0 | 5 |

### 6. Données brutes et export brut après filtres (min 0,5 m, max 3 m, I ≥ 150) et recalage

| scan | CSV brut identique | export brut identique | points bruts identiques | brut | après filtres |
|---|---|---|---|---|---|
| SIM_brut_0.csv | oui | oui | oui | 450 | 345 |
| SIM_brut_1.csv | oui | oui | oui | 450 | 319 |
| SIM_brut_2.csv | oui | oui | oui | 450 | 149 |

### 7. CSV sans intensité

| seuil intensité | format | brut | après filtre |
|---|---|---|---|
| 0 | angle_deg,distance_m | 450 | 450 |
| 0 | MapTool | 450 | 450 |
| 0 | LD06 avec intensité | 450 | 450 |
| 50 | angle_deg,distance_m | 450 | 0 |
| 50 | MapTool | 450 | 0 |
| 50 | LD06 avec intensité | 450 | 450 |

Message affiché : « 1350 points visibles · 450 après portée/intensité · 0 retours isolés masqués dans les scans suivants. »

### 8. Filtre temporel activé / désactivé

| état | points dans la carte | retours de personne par scan |
|---|---|---|
| activé | 1782 | 8 / 24 / 0 / 0 |
| désactivé | 1800 | 8 / 24 / 10 / 8 |
| réactivé | 1782 | 8 / 24 / 0 / 0 |

## V1 actuelle — `index.html`

### 1. Salle aux murs fixes (4 scans)

| scan | intégré | pose attendue | pose obtenue | erreur |
|---|---|---|---|---|
| 1 | oui | 1.000, 0.200, 15.000 | 0.990, 0.215, 15.500 | 1.8 cm / 0.5° |
| 2 | oui | 2.000, -0.200, -10.000 | 1.990, -0.185, -9.500 | 1.8 cm / 0.5° |
| 3 | oui | 2.700, 0.000, 30.000 | 2.690, 0.015, 30.000 | 1.8 cm / 0.0° |

| scan | intégré | brut | après portée/intensité | après filtre temporel |
|---|---|---|---|---|
| SIM_salle_0.csv | oui | 450 | 450 | 450 |
| SIM_salle_1.csv | oui | 450 | 450 | 450 |
| SIM_salle_2.csv | oui | 450 | 450 | 450 |
| SIM_salle_3.csv | oui | 450 | 450 | 450 |

Points de mur gardés dans la carte : 435/435, 436/436, 440/440, 443/443 · murs couverts dans grid_map.csv : 93 %

### 2. Personne mobile (une position différente par scan)

| scan | intégré | pose attendue | pose obtenue | erreur |
|---|---|---|---|---|
| 1 | oui | 1.000, 0.200, 15.000 | 0.990, 0.215, 14.500 | 1.8 cm / 0.5° |
| 2 | oui | 2.000, -0.200, -10.000 | 1.990, -0.185, -10.000 | 1.8 cm / 0.0° |
| 3 | oui | 2.700, 0.000, 30.000 | 2.690, 0.015, 30.000 | 1.8 cm / 0.0° |

| scan | intégré | personne brut | personne après portée/intensité | personne dans la carte | murs brut → carte |
|---|---|---|---|---|---|
| SIM_personne_0.csv | oui | 8 | 8 | 8 | 442 → 442 |
| SIM_personne_1.csv | oui | 24 | 24 | 0 | 426 → 426 |
| SIM_personne_2.csv | oui | 10 | 10 | 0 | 440 → 440 |
| SIM_personne_3.csv | oui | 8 | 8 | 0 | 442 → 442 |

### 3. Zone nouvelle (alcôve cachée par une cloison)

| étape | scan intégré | erreur de pose | alcôve scan 2 (brut → carte) | alcôve scan 3 (brut → carte) | cellules occupées alcôve |
|---|---|---|---|---|---|
| après le 1er scan qui la voit | oui | 1.4 cm / 0.0° | 17 → 0 | — | 0 |
| après le scan de confirmation | oui | 3.6 cm / 0.0° | 17 → 17 | 38 → 22 | 18 |

### 4. Salle A → porte → salle B, puis salle C sans mur commun

| scan | intégré | pose attendue | pose obtenue | erreur |
|---|---|---|---|---|
| 1 | oui | 2.600, 0.000, 0.000 | 2.590, -0.010, -0.500 | 1.4 cm / 0.5° |
| 2 | oui | 4.500, 0.000, 0.000 | 4.490, -0.010, -1.000 | 1.4 cm / 1.0° |
| 3 | oui | 7.000, -0.500, 90.000 | 6.965, -0.560, 89.000 | 6.9 cm / 1.0° |

Points de la salle B (brut → carte) dans les scans 1–3 : 113 → 112, 300 → 299, 372 → 339

Salle C, recalage automatique : refusé — « Scan non intégré: plusieurs poses différentes ont des scores proches (recouvrement 67 %, minimum 35 %, écart de score 1.0%). Prends un scan intermédiaire qui voit des murs déjà cartographiés, ou place »

Salle C, pose saisie puis « Intégrer à la pose saisie » : scan 4 intégré; scan 5 recalé automatiquement : oui (erreur 3.6 cm / 0.0°); murs du scan 4 confirmés : 450/450.

### 5. Points trop proches, au-delà de 12 m, faible intensité

| étape | total | < 0,05 m | châssis 0,08–0,12 m | 12,5 m | 15,5 m | armoire noire (I≈8) |
|---|---|---|---|---|---|---|
| lignes CSV | 468 | 5 | 6 | 4 | 3 | 5 |
| après lecture (0,05 < r < 15 m) | 460 | 0 | 6 | 4 | 0 | 5 |
| défauts min 0,05 / max 12 / I 0 | 456 | 0 | 6 | 0 | 0 | 5 |
| min 0,15 m | 450 | 0 | 0 | 0 | 0 | 5 |
| min 0,15 / max 4 m | 389 | 0 | 0 | 0 | 0 | 3 |
| min 0,15 / max 12 / I ≥ 20 | 445 | 0 | 0 | 0 | 0 | 0 |
| retour aux défauts | 456 | 0 | 6 | 0 | 0 | 5 |

### 6. Données brutes et export brut après filtres (min 0,5 m, max 3 m, I ≥ 150) et recalage

| scan | CSV brut identique | export brut identique | points bruts identiques | brut | après filtres |
|---|---|---|---|---|---|
| SIM_brut_0.csv | oui | oui | oui | 450 | 345 |
| SIM_brut_1.csv | oui | oui | oui | 450 | 319 |
| SIM_brut_2.csv | oui | oui | oui | 450 | 236 |

### 7. CSV sans intensité

| seuil intensité | format | brut | après filtre |
|---|---|---|---|
| 0 | angle_deg,distance_m | 450 | 450 |
| 0 | MapTool | 450 | 450 |
| 0 | LD06 avec intensité | 450 | 450 |
| 50 | angle_deg,distance_m | 450 | 450 |
| 50 | MapTool | 450 | 450 |
| 50 | LD06 avec intensité | 450 | 450 |

Message affiché : « 1350 points visibles · 1350 après portée/intensité · 0 retours isolés masqués dans les scans suivants. 2 scan(s) sans colonne d’intensité : seuil d’intensité ignoré pour ce(s) scan(s). »

### 8. Filtre temporel activé / désactivé

| état | points dans la carte | retours de personne par scan |
|---|---|---|
| activé | 1758 | 8 / 0 / 0 / 0 |
| désactivé | 1800 | 8 / 24 / 10 / 8 |
| réactivé | 1758 | 8 / 0 / 0 / 0 |

## 9. Non-régression (mêmes scans, mêmes poses)

| export | V1.0 | V1 actuelle | identique |
|---|---|---|---|
| grid_map.csv (lignes) | 83 | 83 | oui |
| grid_map_map_tool.csv | 20158 car. | 20158 car. | oui |
| scans_fusionnes.csv | 1800 pts | 1800 pts | oui |
| poses.json |  |  | oui |
