# PHASE 1.8 — VALIDATION EXPÉRIMENTALE DE LA LOCALISATION

**Date :** 8 novembre 2026  
**Algorithme évalué :** commit c62a2544b717e9e536e74ecfdd099146f4b2e47a (Étape 4, refus de contradiction activé), sans modification durant cette validation.  
**Données modifiées :** aucune. Seul ce rapport de résultats est créé.  
**Conclusion courte :** bon résultat sur la trajectoire synthétique nominale; taux de refus élevé dans les cas de géométrie dégénérée. Ces expériences ne suffisent pas à déclarer la localisation fiable pour le robot ou la fusion automatique.

## 1. Méthodologie et critères enregistrés avant toute correction

- Corpus principal : validation_phase_1_7/corpus_trajectoire_continue_v1, 130 CSV synthétiques, ordre du manifeste, vérité indépendante dans verite.json. Même parseur CSV et même fonction de production LidarCore.assembleSession que le bouton.
- Toutes les options proviennent des valeurs par défaut du commit ci-dessus : grille 5 cm, overlap minimal 35 %, ambiguïté évaluée aussi sur l'overlap, veto contradiction à 14,2 %. Aucun Auto-SLAM n'est utilisé comme référence.
- Le premier scan ancre le repère à [0,0,0] par définition; ses erreurs ne sont pas incluses dans les métriques de performance. Les 129 scans suivants sont les estimations évaluées.
- La vérité globale est transformée dans le repère du premier scan par T0⁻¹ Ti. La pose estimée est comparée à cette pose. eXY = sqrt((xest−xgt)² +(yest−ygt)²); eθ = wrap180(θest−θgt). Le P95 utilise le rang le plus proche ceil(0,95 n).
- Tolérance de classification préenregistrée pour cette campagne : une pose acceptée est correcte si eXY ≤ 0,10 m et |eθ| ≤ 2°. Elle reprend le seuil d'évaluation déjà employé dans le corpus synthétique antérieur; elle ne prétend pas être une tolérance certifiée pour le robot réel.
- Les refus sur des cas dont la pose est théoriquement connue sont rapportés séparément : ce sont des non-acceptations; elles ne deviennent des faux négatifs que si le cas est considéré observable pour le besoin. Les symétries parfaites sont des cas intrinsèquement ambigus et leur refus est sûr.

## 2. Résultat de l'exécution sur les 130 scans

L'algorithme de localisation a été exécuté deux fois en entier avec assembleSession, pas seulement simulé/généré. Chaque exécution a chargé les 130 CSV par l'ordre du manifeste. La signature des 130 bilans (noms, statuts, poses, overlap, gap, RMS, raisons) est identique; SHA-256 : 56d52601c051279b9b4460307aa423b2f6e6c5145e2f2b8a818e470d5950e9ae.

| Mesure | Résultat |
|---|---:|
| Scans d'entrée | 130 |
| Scan origine | 1 (ancré, non évalué) |
| Poses mobiles évaluées | 129 |
| Acceptées / refusées | 129 / 0 |
| Correctement acceptées (≤10 cm et ≤2°) | 129 / 129 (100.0%) |
| Fausses acceptations | 0 / 129 |
| Taux d'acceptation mobile | 100.0% |
| Taux de fausse acceptation parmi les acceptées | 0.0% |
| Non-acceptées sur poses vraies connues | 0 |

### Erreurs sur les 129 poses mobiles acceptées

| Erreur | Moyenne | Médiane | P95 | Maximum | Biais signé |
|---|---:|---:|---:|---:|---:|
| Position eXY | 3.76 cm | 3.73 cm | 4.95 cm | 5.00 cm | Δx -2.63 cm; Δy -2.63 cm |
| Orientation | 0.058° | 0.000° | 0.346° | 0.500° | signé -0.012° |

Écart de déplacement relatif consécutif (RPE), 129 transitions évaluables : eXY moyenne 1.05 cm, médiane 1.01 cm, P95 2.12 cm, max 3.09 cm; erreur angulaire absolue moyenne 0.083°, P95 0.500°.

### Histogramme de l'erreur de position

~~~text
0–1 cm   |  0
1–2 cm   |  0
2–3 cm   | ████████████████████████ 24
3–4 cm   | ███████████████████████████████████████████████████ 51
4–5 cm   | ██████████████████████████████████████████████████████ 54
≥5 cm    |  0
~~~

### Résultats par phase du trajet

| Phase | Scans | Poses mobiles acceptées | Correctes | Refusées | Erreur XY max parmi acceptées |
|---|---:|---:|---:|---:|---:|
| depart | 1 | 0 | 0 | 0 | 0.0 cm |
| petit_deplacement | 7 | 7 | 7 | 0 | 4.0 cm |
| rotation_sur_place | 27 | 27 | 27 | 0 | 4.9 cm |
| approche_porte | 11 | 11 | 11 | 0 | 4.6 cm |
| traversee_porte | 10 | 10 | 10 | 0 | 4.9 cm |
| zone_ouverte | 11 | 11 | 11 | 0 | 4.4 cm |
| approche_corridor | 10 | 10 | 10 | 0 | 5.0 cm |
| contournement_entree | 6 | 6 | 6 | 0 | 4.6 cm |
| entree_corridor | 13 | 13 | 13 | 0 | 4.8 cm |
| corridor_parallele | 22 | 22 | 22 | 0 | 4.9 cm |
| retour_corridor | 5 | 5 | 5 | 0 | 4.6 cm |
| sortie_corridor | 7 | 7 | 7 | 0 | 4.5 cm |

### Détail scan par scan

Les poses vraies et estimées sont relatives au scan 001. Δx/Δy et eXY sont en centimètres; eθ est en degrés.

| # | Scan | Décision | Pose vraie [x,y,θ] | Pose estimée [x,y,θ] | Δx cm | Δy cm | eXY cm | eθ ° | Overlap | RMS inlier cm |
|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|
| 001 | scan_001.csv | origine | [0.000, 0.000, 0.000] | [0.000, 0.000, 0.000] | 0.0 | 0.0 | 0.0 | 0.00 | — | — |
| 002 | scan_002.csv | placé | [0.129, 0.000, 0.000] | [0.105, -0.020, 0.000] | -2.4 | -2.0 | 3.1 | 0.00 | 99.6% | 3.58 |
| 003 | scan_003.csv | placé | [0.257, 0.000, 0.000] | [0.235, -0.015, 0.000] | -2.2 | -1.5 | 2.7 | 0.00 | 100.0% | 2.38 |
| 004 | scan_004.csv | placé | [0.386, 0.000, 0.000] | [0.375, -0.025, 0.000] | -1.1 | -2.5 | 2.7 | 0.00 | 99.6% | 2.06 |
| 005 | scan_005.csv | placé | [0.514, 0.000, 0.000] | [0.480, -0.020, 0.000] | -3.4 | -2.0 | 4.0 | 0.00 | 100.0% | 1.45 |
| 006 | scan_006.csv | placé | [0.643, 0.000, 0.000] | [0.630, -0.020, 0.000] | -1.3 | -2.0 | 2.4 | 0.00 | 99.6% | 0.82 |
| 007 | scan_007.csv | placé | [0.771, 0.000, 0.000] | [0.745, -0.030, 0.000] | -2.6 | -3.0 | 4.0 | 0.00 | 100.0% | 1.45 |
| 008 | scan_008.csv | placé | [0.900, 0.000, 0.000] | [0.875, -0.025, 0.000] | -2.5 | -2.5 | 3.5 | 0.00 | 99.6% | 1.38 |
| 009 | scan_009.csv | placé | [0.900, 0.000, 10.000] | [0.875, -0.025, 10.000] | -2.5 | -2.5 | 3.5 | 0.00 | 99.6% | 1.20 |
| 010 | scan_010.csv | placé | [0.900, 0.000, 20.000] | [0.875, -0.025, 20.000] | -2.5 | -2.5 | 3.5 | 0.00 | 100.0% | 0.88 |
| 011 | scan_011.csv | placé | [0.900, 0.000, 30.000] | [0.875, -0.025, 30.000] | -2.5 | -2.5 | 3.5 | 0.00 | 100.0% | 0.67 |
| 012 | scan_012.csv | placé | [0.900, 0.000, 40.000] | [0.875, -0.025, 40.000] | -2.5 | -2.5 | 3.5 | 0.00 | 100.0% | 0.47 |
| 013 | scan_013.csv | placé | [0.900, 0.000, 50.000] | [0.875, -0.025, 50.000] | -2.5 | -2.5 | 3.5 | 0.00 | 100.0% | 0.47 |
| 014 | scan_014.csv | placé | [0.900, 0.000, 60.000] | [0.875, -0.025, 60.000] | -2.5 | -2.5 | 3.5 | 0.00 | 100.0% | 0.33 |
| 015 | scan_015.csv | placé | [0.900, 0.000, 70.000] | [0.875, -0.025, 70.000] | -2.5 | -2.5 | 3.5 | 0.00 | 100.0% | 0.47 |
| 016 | scan_016.csv | placé | [0.900, 0.000, 80.000] | [0.875, -0.025, 80.000] | -2.5 | -2.5 | 3.5 | 0.00 | 100.0% | 0.58 |
| 017 | scan_017.csv | placé | [0.900, 0.000, 90.000] | [0.865, -0.010, 90.000] | -3.5 | -1.0 | 3.6 | 0.00 | 100.0% | 1.05 |
| 018 | scan_018.csv | placé | [0.900, 0.145, 90.000] | [0.865, 0.115, 90.000] | -3.5 | -3.0 | 4.6 | 0.00 | 100.0% | 0.94 |
| 019 | scan_019.csv | placé | [0.900, 0.291, 90.000] | [0.865, 0.265, 90.000] | -3.5 | -2.6 | 4.4 | 0.00 | 100.0% | 0.47 |
| 020 | scan_020.csv | placé | [0.900, 0.436, 90.000] | [0.880, 0.405, 90.000] | -2.0 | -3.1 | 3.7 | 0.00 | 100.0% | 0.67 |
| 021 | scan_021.csv | placé | [0.900, 0.582, 90.000] | [0.865, 0.565, 90.000] | -3.5 | -1.7 | 3.9 | 0.00 | 100.0% | 1.15 |
| 022 | scan_022.csv | placé | [0.900, 0.727, 90.000] | [0.865, 0.715, 90.000] | -3.5 | -1.2 | 3.7 | 0.00 | 100.0% | 0.94 |
| 023 | scan_023.csv | placé | [0.900, 0.873, 90.000] | [0.880, 0.855, 90.000] | -2.0 | -1.8 | 2.7 | 0.00 | 100.0% | 0.67 |
| 024 | scan_024.csv | placé | [0.900, 1.018, 90.000] | [0.870, 0.995, 90.000] | -3.0 | -2.3 | 3.8 | 0.00 | 99.6% | 0.75 |
| 025 | scan_025.csv | placé | [0.900, 1.164, 90.000] | [0.865, 1.140, 90.000] | -3.5 | -2.4 | 4.2 | 0.00 | 100.0% | 0.94 |
| 026 | scan_026.csv | placé | [0.900, 1.309, 90.000] | [0.880, 1.280, 90.000] | -2.0 | -2.9 | 3.5 | 0.00 | 100.0% | 0.75 |
| 027 | scan_027.csv | placé | [0.900, 1.455, 90.000] | [0.880, 1.430, 90.000] | -2.0 | -2.5 | 3.2 | 0.00 | 100.0% | 0.94 |
| 028 | scan_028.csv | placé | [0.900, 1.600, 90.000] | [0.865, 1.590, 90.000] | -3.5 | -1.0 | 3.6 | 0.00 | 100.0% | 1.11 |
| 029 | scan_029.csv | placé | [1.050, 1.600, 81.000] | [1.020, 1.570, 81.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.75 |
| 030 | scan_030.csv | placé | [1.200, 1.600, 72.000] | [1.175, 1.575, 72.000] | -2.5 | -2.5 | 3.5 | 0.00 | 100.0% | 0.75 |
| 031 | scan_031.csv | placé | [1.350, 1.600, 63.000] | [1.330, 1.580, 63.000] | -2.0 | -2.0 | 2.8 | 0.00 | 100.0% | 0.67 |
| 032 | scan_032.csv | placé | [1.500, 1.600, 54.000] | [1.465, 1.565, 54.000] | -3.5 | -3.5 | 4.9 | 0.00 | 100.0% | 0.75 |
| 033 | scan_033.csv | placé | [1.650, 1.600, 45.000] | [1.630, 1.580, 45.000] | -2.0 | -2.0 | 2.8 | 0.00 | 100.0% | 0.67 |
| 034 | scan_034.csv | placé | [1.800, 1.600, 36.000] | [1.770, 1.570, 36.000] | -3.0 | -3.0 | 4.2 | 0.00 | 99.6% | 0.88 |
| 035 | scan_035.csv | placé | [1.950, 1.600, 27.000] | [1.925, 1.575, 27.000] | -2.5 | -2.5 | 3.5 | 0.00 | 100.0% | 0.82 |
| 036 | scan_036.csv | placé | [2.100, 1.600, 18.000] | [2.080, 1.580, 18.000] | -2.0 | -2.0 | 2.8 | 0.00 | 99.1% | 0.58 |
| 037 | scan_037.csv | placé | [2.250, 1.600, 9.000] | [2.235, 1.585, 9.000] | -1.5 | -1.5 | 2.1 | 0.00 | 100.0% | 1.00 |
| 038 | scan_038.csv | placé | [2.400, 1.600, 0.000] | [2.375, 1.575, 0.000] | -2.5 | -2.5 | 3.5 | 0.00 | 99.1% | 0.67 |
| 039 | scan_039.csv | placé | [2.545, 1.600, 0.000] | [2.525, 1.575, 0.000] | -2.0 | -2.5 | 3.2 | 0.00 | 99.6% | 0.75 |
| 040 | scan_040.csv | placé | [2.691, 1.600, 0.000] | [2.665, 1.565, 0.000] | -2.6 | -3.5 | 4.4 | 0.00 | 98.7% | 1.01 |
| 041 | scan_041.csv | placé | [2.836, 1.600, 0.000] | [2.830, 1.580, 0.000] | -0.6 | -2.0 | 2.1 | 0.00 | 98.2% | 1.99 |
| 042 | scan_042.csv | placé | [2.982, 1.600, 0.000] | [2.960, 1.585, 0.000] | -2.2 | -1.5 | 2.6 | 0.00 | 96.4% | 1.22 |
| 043 | scan_043.csv | placé | [3.127, 1.600, 0.000] | [3.115, 1.565, 0.000] | -1.2 | -3.5 | 3.7 | 0.00 | 95.1% | 1.32 |
| 044 | scan_044.csv | placé | [3.273, 1.600, 0.000] | [3.245, 1.570, 0.000] | -2.8 | -3.0 | 4.1 | 0.00 | 94.2% | 1.28 |
| 045 | scan_045.csv | placé | [3.418, 1.600, 0.000] | [3.395, 1.570, 0.000] | -2.3 | -3.0 | 3.8 | 0.00 | 100.0% | 1.25 |
| 046 | scan_046.csv | placé | [3.564, 1.600, 0.000] | [3.545, 1.570, 0.000] | -1.9 | -3.0 | 3.5 | 0.00 | 99.6% | 0.75 |
| 047 | scan_047.csv | placé | [3.709, 1.600, 0.000] | [3.690, 1.565, 0.000] | -1.9 | -3.5 | 4.0 | 0.00 | 99.6% | 0.67 |
| 048 | scan_048.csv | placé | [3.855, 1.600, 0.000] | [3.830, 1.580, 0.000] | -2.5 | -2.0 | 3.2 | 0.00 | 99.6% | 0.67 |
| 049 | scan_049.csv | placé | [4.000, 1.600, 0.000] | [3.970, 1.570, 0.000] | -3.0 | -3.0 | 4.2 | 0.00 | 99.6% | 0.94 |
| 050 | scan_050.csv | placé | [4.000, 1.600, -10.000] | [3.965, 1.565, -10.000] | -3.5 | -3.5 | 4.9 | 0.00 | 100.0% | 0.67 |
| 051 | scan_051.csv | placé | [4.000, 1.600, -20.000] | [3.970, 1.570, -20.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.33 |
| 052 | scan_052.csv | placé | [4.000, 1.600, -30.000] | [3.965, 1.565, -30.000] | -3.5 | -3.5 | 4.9 | 0.00 | 100.0% | 0.67 |
| 053 | scan_053.csv | placé | [4.000, 1.600, -40.000] | [3.980, 1.580, -40.000] | -2.0 | -2.0 | 2.8 | 0.00 | 100.0% | 0.58 |
| 054 | scan_054.csv | placé | [4.000, 1.600, -50.000] | [3.970, 1.570, -50.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.47 |
| 055 | scan_055.csv | placé | [4.000, 1.600, -60.000] | [3.965, 1.565, -60.000] | -3.5 | -3.5 | 4.9 | 0.00 | 100.0% | 0.33 |
| 056 | scan_056.csv | placé | [4.000, 1.600, -70.000] | [3.965, 1.565, -70.000] | -3.5 | -3.5 | 4.9 | 0.00 | 100.0% | 0.58 |
| 057 | scan_057.csv | placé | [4.000, 1.600, -80.000] | [3.980, 1.580, -80.000] | -2.0 | -2.0 | 2.8 | 0.00 | 100.0% | 0.33 |
| 058 | scan_058.csv | placé | [4.000, 1.600, -90.000] | [3.970, 1.570, -90.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.47 |
| 059 | scan_059.csv | placé | [4.000, 1.460, -90.000] | [3.970, 1.420, -90.000] | -3.0 | -4.0 | 5.0 | 0.00 | 100.0% | 0.67 |
| 060 | scan_060.csv | placé | [4.000, 1.320, -90.000] | [3.975, 1.300, -90.000] | -2.5 | -2.0 | 3.2 | 0.00 | 100.0% | 0.58 |
| 061 | scan_061.csv | placé | [4.000, 1.180, -90.000] | [3.975, 1.150, -90.000] | -2.5 | -3.0 | 3.9 | 0.00 | 100.0% | 0.75 |
| 062 | scan_062.csv | placé | [4.000, 1.040, -90.000] | [3.975, 1.000, -90.000] | -2.5 | -4.0 | 4.7 | 0.00 | 100.0% | 0.75 |
| 063 | scan_063.csv | placé | [4.000, 0.900, -90.000] | [3.980, 0.880, -90.000] | -2.0 | -2.0 | 2.8 | 0.00 | 100.0% | 0.82 |
| 064 | scan_064.csv | placé | [4.000, 0.760, -90.000] | [3.980, 0.730, -90.000] | -2.0 | -3.0 | 3.6 | 0.00 | 100.0% | 0.58 |
| 065 | scan_065.csv | placé | [4.000, 0.620, -90.000] | [3.965, 0.590, -90.000] | -3.5 | -3.0 | 4.6 | 0.00 | 100.0% | 0.58 |
| 066 | scan_066.csv | placé | [4.000, 0.480, -90.000] | [3.980, 0.455, -90.000] | -2.0 | -2.5 | 3.2 | 0.00 | 100.0% | 0.75 |
| 067 | scan_067.csv | placé | [4.000, 0.340, -90.000] | [3.965, 0.315, -90.000] | -3.5 | -2.5 | 4.3 | 0.00 | 99.1% | 0.47 |
| 068 | scan_068.csv | placé | [4.000, 0.200, -90.000] | [3.965, 0.165, -90.000] | -3.5 | -3.5 | 4.9 | 0.00 | 99.1% | 0.89 |
| 069 | scan_069.csv | placé | [4.050, 0.067, -82.500] | [4.005, 0.055, -83.000] | -4.5 | -1.2 | 4.6 | -0.50 | 99.1% | 1.92 |
| 070 | scan_070.csv | placé | [4.100, -0.067, -75.000] | [4.065, -0.085, -75.000] | -3.5 | -1.8 | 4.0 | 0.00 | 98.7% | 0.89 |
| 071 | scan_071.csv | placé | [4.150, -0.200, -67.500] | [4.120, -0.230, -67.500] | -3.0 | -3.0 | 4.2 | 0.00 | 98.7% | 0.82 |
| 072 | scan_072.csv | placé | [4.200, -0.333, -60.000] | [4.165, -0.360, -60.000] | -3.5 | -2.7 | 4.4 | 0.00 | 98.2% | 0.89 |
| 073 | scan_073.csv | placé | [4.250, -0.467, -52.500] | [4.230, -0.495, -52.500] | -2.0 | -2.8 | 3.5 | 0.00 | 98.2% | 0.89 |
| 074 | scan_074.csv | placé | [4.300, -0.600, -45.000] | [4.270, -0.630, -45.000] | -3.0 | -3.0 | 4.2 | 0.00 | 98.7% | 1.01 |
| 075 | scan_075.csv | placé | [4.446, -0.600, -41.538] | [4.415, -0.635, -41.500] | -3.1 | -3.5 | 4.7 | 0.04 | 99.1% | 1.06 |
| 076 | scan_076.csv | placé | [4.592, -0.600, -38.077] | [4.565, -0.635, -38.000] | -2.7 | -3.5 | 4.4 | 0.08 | 98.7% | 1.01 |
| 077 | scan_077.csv | placé | [4.738, -0.600, -34.615] | [4.720, -0.630, -34.500] | -1.8 | -3.0 | 3.5 | 0.12 | 97.3% | 1.07 |
| 078 | scan_078.csv | placé | [4.885, -0.600, -31.154] | [4.850, -0.625, -31.500] | -3.5 | -2.5 | 4.3 | -0.35 | 96.0% | 0.68 |
| 079 | scan_079.csv | placé | [5.031, -0.600, -27.692] | [5.005, -0.620, -27.500] | -2.6 | -2.0 | 3.3 | 0.19 | 96.0% | 1.27 |
| 080 | scan_080.csv | placé | [5.177, -0.600, -24.231] | [5.145, -0.630, -24.500] | -3.2 | -3.0 | 4.4 | -0.27 | 99.1% | 1.16 |
| 081 | scan_081.csv | placé | [5.323, -0.600, -20.769] | [5.300, -0.625, -21.000] | -2.3 | -2.5 | 3.4 | -0.23 | 100.0% | 1.29 |
| 082 | scan_082.csv | placé | [5.469, -0.600, -17.308] | [5.440, -0.635, -17.500] | -2.9 | -3.5 | 4.6 | -0.19 | 100.0% | 0.67 |
| 083 | scan_083.csv | placé | [5.615, -0.600, -13.846] | [5.590, -0.635, -14.000] | -2.5 | -3.5 | 4.3 | -0.15 | 100.0% | 0.82 |
| 084 | scan_084.csv | placé | [5.762, -0.600, -10.385] | [5.730, -0.620, -10.500] | -3.2 | -2.0 | 3.7 | -0.12 | 100.0% | 0.88 |
| 085 | scan_085.csv | placé | [5.908, -0.600, -6.923] | [5.870, -0.630, -7.000] | -3.8 | -3.0 | 4.8 | -0.08 | 100.0% | 0.82 |
| 086 | scan_086.csv | placé | [6.054, -0.600, -3.462] | [6.025, -0.625, -3.500] | -2.9 | -2.5 | 3.8 | -0.04 | 100.0% | 0.67 |
| 087 | scan_087.csv | placé | [6.200, -0.600, 0.000] | [6.180, -0.620, 0.000] | -2.0 | -2.0 | 2.8 | 0.00 | 100.0% | 0.67 |
| 088 | scan_088.csv | placé | [6.200, -0.450, 4.091] | [6.170, -0.480, 4.000] | -3.0 | -3.0 | 4.2 | -0.09 | 100.0% | 0.75 |
| 089 | scan_089.csv | placé | [6.200, -0.300, 8.182] | [6.175, -0.325, 8.500] | -2.5 | -2.5 | 3.5 | 0.32 | 100.0% | 0.33 |
| 090 | scan_090.csv | placé | [6.200, -0.150, 12.273] | [6.180, -0.170, 12.000] | -2.0 | -2.0 | 2.8 | -0.27 | 100.0% | 0.47 |
| 091 | scan_091.csv | placé | [6.200, 0.000, 16.364] | [6.170, -0.030, 16.000] | -3.0 | -3.0 | 4.2 | -0.36 | 100.0% | 0.58 |
| 092 | scan_092.csv | placé | [6.200, 0.150, 20.455] | [6.175, 0.125, 20.500] | -2.5 | -2.5 | 3.5 | 0.05 | 100.0% | 0.33 |
| 093 | scan_093.csv | placé | [6.200, 0.300, 24.545] | [6.180, 0.280, 24.500] | -2.0 | -2.0 | 2.8 | -0.05 | 100.0% | 0.00 |
| 094 | scan_094.csv | placé | [6.200, 0.450, 28.636] | [6.170, 0.420, 28.500] | -3.0 | -3.0 | 4.2 | -0.14 | 100.0% | 0.47 |
| 095 | scan_095.csv | placé | [6.200, 0.600, 32.727] | [6.175, 0.575, 33.000] | -2.5 | -2.5 | 3.5 | 0.27 | 100.0% | 0.47 |
| 096 | scan_096.csv | placé | [6.200, 0.750, 36.818] | [6.180, 0.730, 37.000] | -2.0 | -2.0 | 2.8 | 0.18 | 100.0% | 0.00 |
| 097 | scan_097.csv | placé | [6.200, 0.900, 40.909] | [6.170, 0.870, 41.000] | -3.0 | -3.0 | 4.2 | 0.09 | 100.0% | 0.47 |
| 098 | scan_098.csv | placé | [6.200, 1.050, 45.000] | [6.175, 1.025, 45.000] | -2.5 | -2.5 | 3.5 | 0.00 | 100.0% | 0.47 |
| 099 | scan_099.csv | placé | [6.200, 1.200, 49.091] | [6.180, 1.180, 49.500] | -2.0 | -2.0 | 2.8 | 0.41 | 100.0% | 0.00 |
| 100 | scan_100.csv | placé | [6.200, 1.350, 53.182] | [6.170, 1.320, 53.000] | -3.0 | -3.0 | 4.2 | -0.18 | 100.0% | 0.47 |
| 101 | scan_101.csv | placé | [6.200, 1.500, 57.273] | [6.175, 1.475, 57.000] | -2.5 | -2.5 | 3.5 | -0.27 | 100.0% | 0.58 |
| 102 | scan_102.csv | placé | [6.200, 1.650, 61.364] | [6.180, 1.630, 61.500] | -2.0 | -2.0 | 2.8 | 0.14 | 100.0% | 0.47 |
| 103 | scan_103.csv | placé | [6.200, 1.800, 65.455] | [6.170, 1.770, 65.500] | -3.0 | -3.0 | 4.2 | 0.05 | 100.0% | 0.47 |
| 104 | scan_104.csv | placé | [6.200, 1.950, 69.545] | [6.175, 1.925, 69.500] | -2.5 | -2.5 | 3.5 | -0.05 | 100.0% | 0.47 |
| 105 | scan_105.csv | placé | [6.200, 2.100, 73.636] | [6.165, 2.065, 73.500] | -3.5 | -3.5 | 4.9 | -0.14 | 100.0% | 0.58 |
| 106 | scan_106.csv | placé | [6.200, 2.250, 77.727] | [6.180, 2.230, 78.000] | -2.0 | -2.0 | 2.8 | 0.27 | 100.0% | 0.33 |
| 107 | scan_107.csv | placé | [6.200, 2.400, 81.818] | [6.170, 2.370, 82.000] | -3.0 | -3.0 | 4.2 | 0.18 | 100.0% | 0.33 |
| 108 | scan_108.csv | placé | [6.200, 2.550, 85.909] | [6.175, 2.525, 86.000] | -2.5 | -2.5 | 3.5 | 0.09 | 100.0% | 0.00 |
| 109 | scan_109.csv | placé | [6.200, 2.700, 90.000] | [6.180, 2.680, 89.500] | -2.0 | -2.0 | 2.8 | -0.50 | 100.0% | 0.00 |
| 110 | scan_110.csv | placé | [6.200, 2.700, 100.000] | [6.170, 2.670, 100.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.33 |
| 111 | scan_111.csv | placé | [6.200, 2.700, 110.000] | [6.170, 2.670, 110.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.00 |
| 112 | scan_112.csv | placé | [6.200, 2.700, 120.000] | [6.170, 2.670, 120.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.33 |
| 113 | scan_113.csv | placé | [6.200, 2.700, 130.000] | [6.170, 2.670, 130.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.33 |
| 114 | scan_114.csv | placé | [6.200, 2.700, 140.000] | [6.170, 2.670, 140.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.33 |
| 115 | scan_115.csv | placé | [6.200, 2.700, 150.000] | [6.170, 2.670, 150.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.00 |
| 116 | scan_116.csv | placé | [6.200, 2.700, 160.000] | [6.170, 2.670, 160.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.00 |
| 117 | scan_117.csv | placé | [6.200, 2.700, 170.000] | [6.170, 2.670, 170.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.00 |
| 118 | scan_118.csv | placé | [6.200, 2.700, -180.000] | [6.170, 2.670, -180.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.33 |
| 119 | scan_119.csv | placé | [6.080, 2.700, -180.000] | [6.065, 2.665, -180.000] | -1.5 | -3.5 | 3.8 | 0.00 | 100.0% | 0.67 |
| 120 | scan_120.csv | placé | [5.960, 2.700, -180.000] | [5.940, 2.665, -180.000] | -2.0 | -3.5 | 4.0 | 0.00 | 100.0% | 0.33 |
| 121 | scan_121.csv | placé | [5.840, 2.700, -180.000] | [5.820, 2.670, -180.000] | -2.0 | -3.0 | 3.6 | 0.00 | 100.0% | 0.00 |
| 122 | scan_122.csv | placé | [5.720, 2.700, -180.000] | [5.690, 2.665, -179.500] | -3.0 | -3.5 | 4.6 | 0.50 | 100.0% | 0.33 |
| 123 | scan_123.csv | placé | [5.600, 2.700, -180.000] | [5.580, 2.680, -180.000] | -2.0 | -2.0 | 2.8 | 0.00 | 100.0% | 0.00 |
| 124 | scan_124.csv | placé | [5.457, 2.700, -180.000] | [5.430, 2.680, -180.000] | -2.7 | -2.0 | 3.4 | 0.00 | 100.0% | 0.00 |
| 125 | scan_125.csv | placé | [5.314, 2.700, -180.000] | [5.290, 2.690, 179.500] | -2.4 | -1.0 | 2.6 | -0.50 | 100.0% | 0.47 |
| 126 | scan_126.csv | placé | [5.171, 2.700, -180.000] | [5.155, 2.680, -180.000] | -1.6 | -2.0 | 2.6 | 0.00 | 100.0% | 0.00 |
| 127 | scan_127.csv | placé | [5.029, 2.700, -180.000] | [5.005, 2.680, -180.000] | -2.4 | -2.0 | 3.1 | 0.00 | 100.0% | 0.28 |
| 128 | scan_128.csv | placé | [4.886, 2.700, -180.000] | [4.865, 2.665, -180.000] | -2.1 | -3.5 | 4.1 | 0.00 | 99.1% | 1.34 |
| 129 | scan_129.csv | placé | [4.743, 2.700, -180.000] | [4.715, 2.665, -180.000] | -2.8 | -3.5 | 4.5 | 0.00 | 99.1% | 1.00 |
| 130 | scan_130.csv | placé | [4.600, 2.700, -180.000] | [4.570, 2.670, -180.000] | -3.0 | -3.0 | 4.2 | 0.00 | 100.0% | 0.88 |

## 3. Comparaison de géométries

### Corpus adversarial existant — graines 101 à 110 (10 cas/scénario)

Les références sont converties en grille, puis locateScanOnGrid produit des candidats et la décision est prise avec les valeurs par défaut actuelles de chooseCandidate. Il s'agit d'essais de localisation d'un scan contre une petite carte de référence, pas de dix parcours complets par géométrie. Seuil d'erreur identique : 10 cm / 2°.

| Géométrie | Acceptées correctes | Fausses acceptations | Refusées | Lecture |
|---|---:|---:|---:|---|
| Salle meublée asymétrique | 10/10 | 0 | 0 | Bon résultat sur ces graines. |
| Rectangle symétrique | 0/10 | 0 | 10/10 | Refus prudent face aux poses ambiguës; très faible disponibilité. |
| Symétrie centrale / retournement | 0/10 | 0 | 10/10 | Refus cohérent avec l'indiscernabilité. |
| Autre pièce sans murs communs | 0/10 | 0 | 10/10 | Aucun faux placement observé dans cet échantillon. |
| Salle en L, branche ressemblante | 0/10 | 0 | 10/10 | Pas de faux placement, mais rejet de toutes les poses vraies de cet échantillon : possible faux négatif sévère. |
| Deux pièces avec géométrie distincte | 10/10 | 0 | 0 | Bon résultat sur ces graines. |
| Couloir parallèle avec cloison transversale repère | 1/10 | 0 | 9/10 | Seed 110 acceptée (2,2 cm; 0,5°); neuf poses vraies non acceptées malgré le repère simulé. |

L'échantillon par géométrie est limité à dix graines et ne donne pas un taux populationnel fiable. La salle en L et le couloir montrent que l'absence de faux positifs peut être obtenue au prix d'un excès de refus.

## 4. Effets du bruit, des retours aberrants et des scans incomplets

Essai exploratoire d'un seul déplacement connu dans une salle meublée; une graine par condition. Le scan de référence reste propre. Ce n'est pas un benchmark statistique.

| Condition sur le scan à localiser | Décision | eXY | eθ absolu | Overlap | RMS inlier |
|---|---|---:|---:|---:|---:|
| Base, σ bruit 8 mm, 450 retours | accepté | 2,83 cm | 0,5° | 98,7 % | 3,29 cm |
| Bruit σ 30 mm | accepté | 0 cm | 0° | 94,7 % | 4,01 cm |
| Bruit σ 80 mm | accepté | 6,67 cm | 1° | 70,2 % | 5,28 cm |
| Scan réduit à 180 rayons | accepté | 1,41 cm | 0,5° | 99,4 % | 3,30 cm |
| 45 retours aberrants ajoutés aux 450 | accepté | 2,83 cm | 0° | 92,7 % | 3,38 cm |

Ces résultats indiquent une tolérance sur ces cinq essais, pas une robustesse générale. Les extras ne reproduisent pas complètement une personne en mouvement, des vitres ou des mesures multi-échos. Aucun test de dropout angulaire contigu, de scan temporellement déformé ou de perturbation d'intensité réaliste n'a été réalisé ici.

## 5. Mauvaises initialisations et contamination

### Mauvaise initialisation

Sur une carte issue d'un scan de référence, quatre estimations initiales ont été essayées autour d'une vraie pose relative [0,15 m; 0,02 m; 3°]. Le pipeline reproduit celui d'assemblage : recherche locale autour de l'initialisation, puis nouvelle recherche globale avec le résultat local comme graine. Les estimations initiales testées étaient [0,0,0°], [0,3;0,3;20°], [−0,3;−0,3;−20°] et [2;2;90°]. Les quatre sorties finales étaient acceptées; erreurs de position entre 1,1 et 2,5 cm et erreurs d'angle entre 0 et 0,5°. Dans le cas [2;2;90°], l'étape locale n'était pas acceptée, mais la recherche globale a retrouvé une bonne pose. Résultat limité à une salle asymétrique et quatre initialisations; il ne couvre pas une carte déjà contaminée ni les grands changements d'environnement.

### Scan refusé intercalé

Comparaison contrôle [scan A valide, scan C valide] et essai [A, scan B d'une pièce indépendante, C]. B est signalé refusé; la pose de C est strictement identique au contrôle (écart XY = 0 m, écart angle = 0°), deux scans sont placés. Cela vérifie ce cas de bout en bout. Le code ne construit la grille qu'à partir de la liste placed; une entrée en attente/refusée n'y est pas ajoutée. Cette preuve ne signifie pas qu'un faux positif accepté ne peut pas contaminer la carte : une acceptation erronée entre bien dans placed.

## 6. Reproductibilité et intégrité du corpus

- Régénération des 130 CSV en rejouant les waypoints du manifeste et les graines fixes : 130/130 fichiers identiques octet par octet.
- Assemblage complet répété deux fois : signatures identiques pour les 130 décisions et poses (hash ci-dessus).
- Point d'attention : régénérer les CSV directement depuis les poses arrondies à 6 décimales de verite.json entraîne des différences pour six scans (040, 046, 072, 077, 126, 128), car les CSV originaux ont été générés avec les positions interpolées non arrondies. Le script et les waypoints sont la source de reproductibilité exacte; verite.json suffit aux métriques de pose mais pas à reconstruire exactement chaque rayon/CSV.

## 7. Faux positifs, faux négatifs et limites

- Faux positifs observés : 0 sur la trajectoire principale (129 poses acceptées), 0 dans les 70 cas adversariaux de dix graines/scénario, et 0 dans les cinq essais de perturbation. Ces cas sont synthétiques et corrélés; ils ne donnent pas une borne fiable pour la salle réelle.
- Refus / faux négatifs potentiels : 10/10 dans le L et 9/10 dans le couloir de l'échantillon. Pour les rectangles parfaitement symétriques, refuser est le comportement de sûreté attendu. Pour le L et le couloir à repère, les refus réduisent fortement l'utilité et doivent être diagnostiqués par observabilité/information géométrique avant d'être qualifiés définitivement de faux négatifs.
- Tous les scans de la trajectoire principale voient essentiellement la même scène statique, sont produits par le même simulateur, avec petits déplacements prescrits et bruit gaussien indépendant. Ils ne couvrent ni la physique du LD06, ni l'odométrie, glissement, vibration, vitesse, occultations humaines, vitres, mobilier déplacé, erreurs d'horodatage, défaut de synchronisation, ni longues zones sans recouvrement.
- La trajectoire de 130 captures est fortement corrélée : les succès successifs ne sont pas des essais indépendants. Une carte presque identique à chaque instant rend le cas plus facile qu'un vrai relevé étendu.
- Les seuils actuels, notamment le veto 14,2 %, ne sont pas validés par une vérité terrain réelle indépendante.

## 8. Critères de réussite à conserver avant toute correction

1. Sûreté primaire : zéro fausse acceptation sur un holdout adversarial multi-scènes, avec vérité terrain indépendante; tout cas ambigu est refusé ou reste multi-hypothèse sans fusion.
2. Précision : sur les poses acceptées et observables, P95 eXY ≤ 10 cm et P95 orientation ≤ 2° (seuils de campagne provisoires à confirmer avec le besoin réel).
3. Disponibilité : au moins 95 % d'acceptation des poses correctement observables, mesuré par scène, et taux de refus publié; ne pas masquer un algorithme qui refuse presque tout.
4. Trajectoire : P95 de l'erreur relative et de dérive respecte le même budget; fermeture de boucle mesurée séparément.
5. Intégrité de carte : un scan refusé n'ajoute aucune cellule; un candidat douteux doit pouvoir être annulé; journaliser les raisons et métriques de décision.
6. Robustesse : rejouer plusieurs graines, bruit, retours aberrants, dropouts contigus, scans partiels, parallèles, L, symétries, zone nouvelle et initialisations erronées. Séparer calibration et holdout avant les essais.
7. Robot réel : répéter un parcours mesuré par un moyen externe avec incertitude connue. L'accord avec Auto-SLAM ne compte pas comme vérité terrain.

Ces critères sont formulés avant toute correction et ne sont pas encore tous satisfaits; ils ne constituent pas un résultat de développement.

## 9. Verdict

**Fiabilité actuelle : insuffisante pour autoriser la fusion automatique sans contrôle ni pour garantir le SLAM d'une salle réelle.** Le commit actuel réussit très bien le parcours synthétique nominal et récupère plusieurs perturbations isolées. Toutefois, le couloir et surtout le L donnent des refus massifs, les tests perturbés n'ont qu'une graine, et il n'existe pas encore de validation sur robot avec vérité indépendante. Les résultats ne justifient pas une modification supplémentaire ou une activation automatique; il faut d'abord élargir le holdout et tester le robot avec référence indépendante.
