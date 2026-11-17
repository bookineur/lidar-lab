# PHASE 1.6 — INVESTIGATION DES ERREURS DE LOCALISATION

**Date :** 8 novembre 2026  
**Mode :** inspection et calculs en mémoire. Aucun code, scan, configuration ou historique Git n’a été modifié par cet audit. Seul ce rapport est créé.  
**Référence :** commit 7e3ccf3. Dans cette version, les options expérimentales espace libre et ambiguïté par overlap sont désactivées par défaut.

> Pendant l’audit, un diff non commité est apparu dans lidar_core.js et tests/corpus_faux_positifs.js, avec des copies d’archives non suivies. Je ne l’ai ni créé ni modifié. Il ajoute notamment une option overlapAmbiguity, désactivée par défaut. Les résultats ci-dessous concernent les réglages par défaut.

## Décision

**La localisation actuelle n’est pas fiable pour intégrer automatiquement une pose à la carte.** Le rejeu utilise un jeu TP2 qui n’est pas une trajectoire de petits déplacements, mais il révèle aussi une faiblesse d’acceptation : un recalage faux satisfait les critères, est accepté et sert ensuite de référence aux scans suivants.

La cause principale démontrée est un critère d’acceptation trop faible face aux minima géométriques concurrents, aggravé par l’utilisation d’un corpus de poses dispersées comme une séquence. Les vérifications n’indiquent pas d’erreur d’association scan-vérité ni de conversion d’unités ou d’angle. Aucun bouton qui intègre automatiquement les poses ne devrait être développé avant les validations du §9.

## 1. Données, association, unités et repères

### Association scan → vérité

Dans TP-cartographie/carto/simulate.py, simulate_tp2_session incrémente k, nomme le scan scank, écrit scank.csv, puis affecte truth[name] = true dans la même boucle. save_poses écrit ce dictionnaire dans verite.json. L’association est donc scan1.csv → verite.json["scan1"], jusqu’à scan16.

Le générateur prend six repères aléatoires, ajoute deux repères décalés de 30 cm près des deux premiers, et prend deux scans par repère. Les 16 scans sont huit paires de reprises, pas une trajectoire continue. Les noms n’ont pas d’heure; l’ordre 1..16 est l’ordre de génération. Les passages entre paires peuvent être des déplacements de plusieurs mètres.

poses.json contient la pose mesurée du repère, commune aux deux prises d’une paire. verite.json contient la pose vraie de chaque prise, incluant l’erreur simulée de repositionnement. Le calcul ci-dessous utilise seulement verite.json comme vérité terrain.

### Conventions

- CSV source : angle_deg, distance_mm, intensity. Angles en degrés trigonométriques, distances en millimètres.
- Le générateur lance les rayons avec angle_scan + theta_vrai; les ranges internes sont en mètres et sont convertis en mm à l’écriture.
- LidarCore.parseCsv divise distance_mm par 1000 et calcule x = r cos(angle), y = r sin(angle).
- La transformation de pose est p_monde = R(theta) p_local + t, avec rotation trigonométrique standard. TP-cartographie/carto/scan.py utilise la même convention.
- verite.json exprime des poses globales [x_m, y_m, theta_deg]. L’assembleur ancre le premier scan à [0,0,0]. La comparaison doit d’abord exprimer la vérité dans ce repère relatif.

La vérité relative utilisée est T_rel = T_0⁻¹ T_i :

    dxw = x_i - x_0                  dyw = y_i - y_0
    x_ref = cos(theta_0) dxw + sin(theta_0) dyw
    y_ref = -sin(theta_0) dxw + cos(theta_0) dyw
    theta_ref = wrap180(theta_i - theta_0)

La formule est identique à relativePose dans tests/synthetic_ld06.js. Les erreurs du tableau sont estimé moins référence pour X et Y, sqrt(Δx²+Δy²) pour eXY et différence angulaire absolue repliée dans [-180°,180°].

Les CSV RobotControl sont écrits dans la même boucle à partir des mêmes angles/ranges, avec une précision d’écriture différente. Le scan2, traité avec le même parseur JS et le même calcul de repère que les autres, se recale à 2 mm / 0,11° de la vérité. Ces éléments ne soutiennent pas une erreur globale d’association ou de convention angulaire.

## 2. Méthode et équations utilisées

Le bouton appelle LidarCore.assembleSession / assembleSteps et localise sur une grid map des cellules occupées. Il n’utilise pas l’ICP point-à-point d’une autre fonction.

1. Les scans déjà acceptés construisent une grille log-odds à 5 cm par défaut : cellules traversées libres, cellule d’impact occupée.
2. Un champ de distance chamfer à voisinage 8 fournit la distance approximative à la cellule occupée la plus proche.
3. Pour un point p_j et une pose candidate T, le coût grossier est la moyenne de d(Tp_j, obstacles)², avec plafonds de 1,2 m ou 0,5 m. Au raffinement, C = moyenne(min(d_j,c)²), c = max(0,30 m, 6 × résolution), donc 0,30 m à 5 cm.
4. Recherche globale : étendue de la carte en x/y, pas d’au moins 20 cm, angles de -180° à 180° par pas de 15°. Les meilleurs candidats sont affinés par une recherche intermédiaire et une recherche fine.
5. Recherche locale : autour de la pose du dernier scan accepté, fenêtre ±0,30 m et ±20°, pas grossier 10 cm et 5°, puis affinage. Sa pose est transmise comme graine à une nouvelle recherche globale. Elle ne limite donc pas la pose finale.
6. Overlap : parmi environ 220 points, part à distance <= max(0,10 m, 2 cellules) d’une cellule occupée. Pour une grille à 5 cm, le rayon d’inlier vaut 10 cm.
7. RMS : racine de la moyenne d² calculée uniquement sur les inliers.
8. Ambiguïté : prochain candidat distant de plus de 0,6 m ou 0,4 rad; gap = (C2-C1)/C2. La règle score seule marque ambigu si gap < 8 %. Si aucun rival suffisamment distant n’est retenu, gap vaut 1.
9. Acceptation par défaut : overlap >= 35 % et candidat non ambigu. Aucun seuil absolu sur C, mean ou RMS. Le label quality ne bloque pas l’intégration. Le test d’espace libre est optionnel et freeSpace vaut null; overlapAmbiguity vaut false.
10. Tout scan accepté est ajouté immédiatement à la carte. La localisation suivante prend cette carte pour référence. L’assemblage n’optimise pas un graphe de poses ou une fermeture de boucle.

locateScanOnGrid expose mean, mais assembleSession ne le conserve pas dans le bilan. Pour remplir le tableau, le coût mean a été recalculé en mémoire à chaque étape avec la carte des poses précédemment acceptées. Les autres diagnostics sont ceux de l’assembleur.

## 3. Résultats détaillés — 15 poses estimées

Rejeu en mémoire des scans scan1.csv à scan16.csv, dans l’ordre fourni, avec les valeurs par défaut. Le scan1 est l’ancre et n’est pas compté comme une estimation. Score = mean (m), soit une mesure de distance globale plafonnée; overlap est la fraction d’inliers; marge = gap relatif; RMSᵢ porte uniquement sur les inliers. Toutes les poses suivantes ont été acceptées.

| Scan | Estimation [x,y,θ] | Référence relative [x,y,θ] | Δx m | Δy m | eXY m | eθ ° | Score m | Overlap | Gap | RMSᵢ cm | Décision |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| scan2 | [0.015,-0.010,-0.500] | [0.017,-0.011,-0.613] | -0.002 | +0.001 | 0.002 | 0.11 | 0.0433 | 1.000 | 0.945 | 4.33 | Accepté |
| scan3 | [1.490,-0.835,88.500] | [-3.618,3.663,-92.380] | +5.108 | -4.498 | 6.806 | 179.12 | 0.4812 | 0.645 | 0.096 | 3.89 | Accepté |
| scan4 | [1.480,-0.845,89.500] | [-3.592,3.673,-91.619] | +5.072 | -4.518 | 6.793 | 178.88 | 0.1686 | 0.937 | 0.770 | 3.32 | Accepté |
| scan5 | [0.515,1.840,0.000] | [-2.671,0.994,178.852] | +3.186 | +0.846 | 3.296 | 178.85 | 0.2647 | 0.800 | 0.458 | 4.26 | Accepté |
| scan6 | [0.515,1.890,-0.500] | [-2.677,0.961,178.657] | +3.192 | +0.929 | 3.324 | 179.16 | 0.1520 | 0.946 | 0.828 | 4.02 | Accepté |
| scan7 | [1.900,0.350,-90.000] | [-4.033,2.508,89.133] | +5.933 | -2.158 | 6.313 | 179.13 | 0.0352 | 0.995 | 0.930 | 3.34 | Accepté |
| scan8 | [1.930,0.330,-93.500] | [-4.056,2.512,85.683] | +5.986 | -2.182 | 6.371 | 179.18 | 0.0295 | 0.995 | 0.949 | 2.85 | Accepté |
| scan9 | [-2.010,2.090,0.500] | [-0.148,0.694,179.506] | -1.862 | +1.396 | 2.327 | 179.01 | 0.2884 | 0.839 | 0.480 | 3.82 | Accepté |
| scan10 | [-2.005,2.120,-0.500] | [-0.163,0.677,178.581] | -1.842 | +1.443 | 2.340 | 179.08 | 0.0532 | 0.977 | 0.910 | 3.80 | Accepté |
| scan11 | [0.440,1.465,-1.500] | [-2.591,1.365,177.593] | +3.031 | +0.100 | 3.033 | 179.09 | 0.0297 | 0.996 | 0.973 | 2.87 | Accepté |
| scan12 | [0.415,1.465,0.500] | [-2.574,1.352,179.635] | +2.989 | +0.113 | 2.991 | 179.13 | 0.0273 | 0.995 | 0.977 | 2.61 | Accepté |
| scan13 | [-2.460,2.790,-180.000] | [0.287,-0.005,-0.900] | -2.747 | +2.795 | 3.919 | 179.10 | 0.0350 | 0.995 | 0.958 | 3.35 | Accepté |
| scan14 | [-2.470,2.780,179.000] | [0.306,0.009,-1.635] | -2.776 | +2.771 | 3.922 | 179.37 | 0.0278 | 1.000 | 0.973 | 2.78 | Accepté |
| scan15 | [1.190,-0.810,89.000] | [-3.301,3.649,-91.823] | +4.491 | -4.459 | 6.329 | 179.18 | 0.0239 | 1.000 | 0.968 | 2.39 | Accepté |
| scan16 | [1.205,-0.820,90.500] | [-3.313,3.639,-90.644] | +4.518 | -4.459 | 6.348 | 178.86 | 0.0243 | 1.000 | 0.966 | 2.43 | Accepté |

### Synthèse

- 15 estimations, 15 acceptées, 0 refus. Une pose est dans les seuils de contrôle XY < 5 cm et θ < 2° : scan2.
- Erreur de translation : moyenne 4,274 m, médiane 3,919 m, maximum 6,806 m. Erreur angulaire : moyenne 167,15°, médiane 179,10°, maximum 179,37°.
- Les 14 faux placements ont pourtant 64,5–100 % d’overlap et RMS inliers 2,39–4,26 cm.
- Première erreur majeure, scan3 : 6,806 m et 179,12°, mais overlap 64,5 %, gap 9,6 % (tout juste supérieur au seuil d’ambiguïté), RMS 3,89 cm et score global 0,4812 m. Le seuil de 35 % et l’absence de garde sur le score absolu laissent passer ce candidat.
- Scan4, même repère physique que scan3, est alors recalé sur la carte contaminée : erreur 6,793 m, overlap 93,7 %, gap 77 %, RMS 3,32 cm. Pour scan15, le score devient même 0,0239 m alors que l’erreur est 6,329 m / 179,18°. C’est une cohérence interne avec une carte déjà fausse, pas une preuve de justesse.

## 4. Vérification indépendante : causes et facteurs

### Causes non confirmées par les preuves

- **Association scan/pose :** non. Le générateur écrit le CSV et son entrée vérité dans la même boucle avec le même nom.
- **Erreur degrés/radians ou miroir :** non identifiée. Le simulateur, les deux parseurs et les transformations utilisent le même sens trigonométrique; scan2 sert de contrôle positif.
- **Mauvais repère de comparaison :** non. La vérité a été transformée par T0⁻¹ dans le repère ancré du premier scan, comme dans le helper de tests.
- **Vérité terrain corrompue :** aucune preuve. poses.json est bruité; verite.json est le champ explicitement alimenté par les poses vraies du simulateur. La simulation reste une représentation synthétique de salle, et ne prouve pas toute la physique du robot réel.

### Cause identifiée et facteur de protocole

1. **Le protocole n’est pas une trajectoire séquentielle.** repetition_tp2 a des poses aléatoires en salle, avec répétitions locales seulement par paires. C’est un corpus de localisation de poses, pas un test de petits déplacements successifs. Le rejouer comme un SLAM enchaîné teste la recherche globale sur des changements non nominaux.
2. **L’algorithme accepte une correspondance partielle non unique.** Le champ de distance ne recherche que la proximité de points aux cellules occupées. Par défaut, aucun contrôle des contradictions d’espace libre, de distribution de murs distincts ni de conditionnement de pose n’est activé.
3. **Le score d’ambiguïté ne protège pas contre un mauvais minimum.** Scan3 a gap 9,6 %, juste au-dessus de 8 %; le critère conclut à l’absence d’ambiguïté malgré une erreur de près de 7 m. Les coûts absolus et RMS ne sont pas des conditions d’acceptation.
4. **La carte se renforce elle-même.** Une pose fausse est intégrée; les autres scans similaires retrouvent ensuite cette carte fausse avec overlap/RMS convaincants. La qualité numérique devient meilleure à mesure que la carte diverge de la vérité.
5. **La recherche globale contourne la fenêtre locale.** ±0,3 m / ±20° donne une graine locale, puis la recherche globale peut accepter une solution partout dans la carte. Ces limites ne sont pas des garde-fous de mouvement.

## 5. Cinq tests TODO : résultat TAP ciblé

Commande exécutée :

    node --test --test-name-pattern='A5b|A6|A7b|A10b' --test-reporter=tap tests/assemblage_hors_ligne.test.js

Résultat vérifiable : les cinq assertions ciblées sont sorties **not ok**, chacune annotée TODO; récapitulatif du runner : tests 5, todo 5. Elles ne sont donc pas des tests verts, même si le statut TODO les exclut des échecs ordinaires du résumé.

| Test | Résultat exact observé | Cas et défaut |
|---|---|---|
| A5b — autre pièce sans murs communs, graines 99/7/42 | graine 99 : résultat placé, alors que l’assertion attend un statut différent de placé. | Un petit rectangle situé vers [30,30]–[33,32] est placé à tort dans la carte existante. |
| A6 — rectangle symétrique 6 × 4 | Pose acceptée [-0.01,-0.01,179.5°], vérité relative [2,0,0°]. Overlap 99,56 %, gap 20,97 %, RMS inliers 3,52 cm. Erreur ~2,01 m / 179,5°. | Le meilleur candidat est faux, mais le score seul ne le considère pas ambigu. Le commentaire dit « 21/30 »; le corps du test n’exécute qu’un seul cas, il ne reproduit pas cette statistique. |
| A6b — symétrie centrale, scan retourné | Résultat observé placé, attendu refusé. | Les observations ne permettent pas de départager une pose équivalente dans un rectangle parfait; le système choisit quand même. |
| A7b — salle en L | Assertion échouée : scan_02_09h00m10.csv placé à une pose fausse. | Une branche est confondue avec l’autre malgré le score de recouvrement décrit dans le commentaire du test. |
| A10b — cas autre pièce via interface | mapRegistered vaut true, attendu false. | Le bouton intègre le même faux positif que A5b; le défaut n’est pas uniquement de présentation. |

A5b/A10b couvrent le non-recouvrement avec variations d’exécution et d’interface; A6/A6b couvrent deux cas de symétrie; A7b couvre le bras du L. Les critères positifs comptent autant : empêcher tous les scans d’être intégrés n’est pas une correction acceptable.

## 6. Critères pour mieux rejeter sans rejeter systématiquement les bonnes poses

Ne pas remplacer les seuils actuels par des valeurs choisies sur ce seul corpus. Les critères à calibrer sur un ensemble de réglage puis à évaluer sur un ensemble séparé sont :

- score absolu et RMS (avec points rejetés comptés), conjointement à l’overlap;
- nombre et couverture angulaire/spatiale de segments indépendants soutenant le recalage;
- second et troisième minima séparés, ambiguïté évaluée sur score absolu et relatif, comparaison d’overlap et incertitude statistique;
- cohérence avec les rayons libres et obstacles confirmés; cette option est présente dans le code mais désactivée par défaut;
- cohérence avec une odométrie mesurée, si disponible. Sans encodeurs et lorsqu’on pousse le robot à la main, utiliser une hypothèse large ou multiple et refuser si l’observation n’identifie pas la pose;
- validation de la carte en mode transactionnel : ne pas fusionner la pose candidate avant acceptation; conserver version précédente, permettre rollback.

Mesurer par scénario les vrais positifs intégrés, faux positifs, bonnes poses refusées, précision XY/angle, incertitude et durée. Fixer les critères de réussite avant d’observer les résultats. Une symétrie véritablement indiscernable doit produire une ambiguïté, même si cela conduit à un refus; une configuration bien contrainte doit continuer à localiser les bonnes poses.

## 7. Corrections proposées avant développement

1. **Séparer les benchmarks.** Tester le bouton SLAM sur une trajectoire courte, ordonnée, à petits déplacements et vérité mesurée par capture. Utiliser repetition_tp2 pour la localisation de scans sur une carte/référence avec la même initialisation, pas comme parcours séquentiel.
2. **Corriger les cinq tests TODO.** A5b/A10b, A6/A6b et A7b doivent réellement passer leurs assertions; ajouter des contre-tests où les poses justes sont acceptées.
3. **Reproduire la revendication 21/30** avec une boucle de 30 graines dans le test, pas seulement dans son commentaire; publier la distribution et la graine.
4. **Ajouter une validation anti-alias.** Corridors parallèles, rectangles symétriques, pièces répétées, L, faible overlap, zones nouvelles, points dynamiques, mauvaises initialisations et grandes transitions.
5. **Rendre le choix mesurable et inspectable.** Exposer le coût absolu et les candidats concurrents dans le bilan; les bilans actuels gardent overlap, gap et RMS mais omettent mean.
6. **Évaluer l’option d’espace libre et d’ambiguïté par overlap** sur seeds de réglage séparés des seeds d’évaluation; elles ne doivent pas être activées par simple intuition.
7. **Protéger la carte.** Pose proposée puis validée avant fusion, journal complet des scores et rollback.
8. **Collecter une vraie vérité terrain.** Parcours court avec positions lidar et orientation mesurées indépendamment, incertitudes indiquées et répétitions. La séance Auto-SLAM du 04/11 ne peut servir que de comparaison de cohérence.

## Recommandation finale

- **Peut-on faire confiance à la localisation actuelle ?** Non, pas pour déplacer ou fusionner automatiquement les scans sans validation humaine.
- **Cause principale ?** Le critère d’acceptation se satisfait d’un alignement partiel de cellules occupées sans preuve de pose unique ni contrôle de score absolu. La première fausse intégration contamine ensuite la grille. L’ordre dispersé de repetition_tp2 révèle cette faiblesse mais n’est pas un benchmark nominal de SLAM séquentiel.
- **Corrections indispensables ?** Faire passer les cinq cas de faux positifs avec contre-tests de bonnes poses, calibrer les critères sur des données séparées, activer et valider la cohérence espace libre/ambiguïté, utiliser une vraie trajectoire mesurée, et retarder/annuler toute intégration douteuse. Pas de nouveaux seuils numériques prescrits sans mesures indépendantes.

## Sources

- TP-cartographie/carto/simulate.py : génération de repetition_tp2 et associations des poses.
- TP-cartographie/carto/scan.py : unités, conventions et transformations.
- TP-cartographie/data/repetition_tp2/scan1.csv…scan16.csv, verite.json et poses.json.
- codex_lidar/lidar_core.js : parseCsv, transformed, computeGridCells, locateScanOnGrid, chooseCandidate, freeSpaceConsistency, assembleSteps.
- codex_lidar/tests/synthetic_ld06.js : générateur déterministe et relativePose.
- codex_lidar/tests/assemblage_hors_ligne.test.js : A5b, A6, A6b, A7b, A10b.
- Tests TODO du §5; durée totale affichée 26 576 ms.
- Rejeu en mémoire de assembleSession deux fois (décisions identiques) et recalcul de locateScanOnGrid étape par étape pour capturer mean.
