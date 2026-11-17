# Pré-développement — localisation et construction de carte

**État :** audit Codex en lecture seule, 7 novembre 2026  
**Périmètre :** séance robot du 4 novembre, corpus `repetition_tp2`, comparaison de Lidar Lab avec TP-cartographie et risques du bouton « Localiser et construire la carte ».  
**Modification autorisée pour cette étape :** ce rapport uniquement. Aucun code, scan, paramètre ou commit n’a été modifié.

> **Statut.** Les faits ci-dessous ont été vérifiés dans les fichiers locaux. Ce document est un rapport technique préparé pour une relecture croisée ; une seconde analyse peut faire apparaître des désaccords supplémentaires.

## Recommandation exécutive

**Ne pas considérer le bouton comme prêt à être développé et validé sur le robot avec la logique actuelle.** Un prototype d’interface peut être poursuivi, mais l’algorithme d’acceptation doit d’abord passer les scénarios de falsification ci-dessous. Le corpus simulé fournit une vérité terrain exploitable; la séance réelle du 04/11 ne fournit pas de vérité terrain indépendante. Il faut aussi réaliser une courte séance réelle avec des poses mesurées indépendamment avant de présenter les erreurs Auto-SLAM comme une précision réelle.

La raison déterminante est un défaut de sûreté de résultat : les tests locaux marquent encore `TODO` des cas où une pose sans correspondance réelle pourrait être acceptée. Le rapport ne recommande pas de corriger ces cas en augmentant arbitrairement un seuil; il faut mesurer la séparation entre bonnes poses, faux positifs et refus sur un corpus contrôlé.

## 1. Séance du 04/11 : inventaire vérifié

Dossier source : `C:\Users\HP\TP-cartographie\data\robot_wifi\seance_2026-11-04_17h42m59\`.

Le dossier contient **52 CSV bruts distincts**, tous avec une empreinte SHA-256 différente. `seance.json` sélectionne une séance de **40 captures**; les 12 autres sont un essai antérieur dont les numéros `scan_01` à `scan_12` ont été réutilisés. Les noms portant le même numéro ne sont donc pas des doublons de contenu. Aucun CSV identique octet pour octet n’a été trouvé dans les 52 fichiers.

### 12 captures de l’essai antérieur, hors `seance.json`

`scan_01_19h19m50.csv`, `scan_02_19h19m59.csv`, `scan_03_19h20m24.csv`, `scan_04_19h20m33.csv`, `scan_05_19h21m26.csv`, `scan_06_19h21m31.csv`, `scan_07_19h22m27.csv`, `scan_08_19h22m37.csv`, `scan_09_19h22m51.csv`, `scan_10_19h23m00.csv`, `scan_11_19h23m11.csv`, `scan_12_19h23m32.csv`.

### Les 40 captures référencées par `seance.json`, dans leur ordre enregistré

| Nº | Fichier | Nº | Fichier |
|---:|---|---:|---|
| 1 | `scan_01_19h20m09.csv` | 21 | `scan_21_19h28m03.csv` |
| 2 | `scan_02_19h24m06.csv` | 22 | `scan_22_19h28m07.csv` |
| 3 | `scan_03_19h24m30.csv` | 23 | `scan_23_19h28m11.csv` |
| 4 | `scan_04_19h24m33.csv` | 24 | `scan_24_19h28m15.csv` |
| 5 | `scan_05_19h25m06.csv` | 25 | `scan_25_19h28m18.csv` |
| 6 | `scan_06_19h25m27.csv` | 26 | `scan_26_19h28m46.csv` |
| 7 | `scan_07_19h25m53.csv` | 27 | `scan_27_19h29m36.csv` |
| 8 | `scan_08_19h26m00.csv` | 28 | `scan_28_19h30m00.csv` |
| 9 | `scan_09_19h26m04.csv` | 29 | `scan_29_19h30m16.csv` |
| 10 | `scan_10_19h26m07.csv` | 30 | `scan_30_19h30m52.csv` |
| 11 | `scan_11_19h26m11.csv` | 31 | `scan_31_19h31m12.csv` |
| 12 | `scan_12_19h26m14.csv` | 32 | `scan_32_19h31m28.csv` |
| 13 | `scan_13_19h26m17.csv` | 33 | `scan_33_19h31m56.csv` |
| 14 | `scan_14_19h26m23.csv` | 34 | `scan_34_19h32m16.csv` |
| 15 | `scan_15_19h26m26.csv` | 35 | `scan_35_19h32m34.csv` |
| 16 | `scan_16_19h26m29.csv` | 36 | `scan_36_19h32m52.csv` |
| 17 | `scan_17_19h26m39.csv` | 37 | `scan_37_19h33m40.csv` |
| 18 | `scan_18_19h26m57.csv` | 38 | `scan_38_19h33m54.csv` |
| 19 | `scan_19_19h27m13.csv` | 39 | `scan_39_19h34m10.csv` |
| 20 | `scan_20_19h27m40.csv` | 40 | `scan_40_19h35m03.csv` |

Les timestamps JSON sont en UTC (`Z`), tandis que les heures dans les noms correspondent à l’heure locale de Paris; le décalage visible est d’une heure. Pour rejouer cette séance, utiliser l’ordre de `seance.json`, pas un tri numérique des seuls numéros de scan : cela évite de mêler l’essai antérieur.

### Métadonnées et fichiers dérivés

- `LISEZMOI.md` décrit des CSV LD06 acquis par Wi-Fi, avec une ligne `# robot_wifi id=… hz=… pts=… pwm=… moving=0|1`, puis `angle_deg,distance_mm,intensity`. La séance manifeste compte 314 à 321 points par tour.
- Paramètres enregistrés dans `seance.json` et `reference_autoslam_2026-11-04.json` : grille 5 cm, portée 0,05–12 m, seuil d’intensité 0, recouvrement minimum 35 %, filtre temporel activé.
- `seance.json` contient les 40 captures, leur date, leur nombre de points, pose, statut (`reg`) et note. `poses.json` ne contient que les 35 poses acceptées. `reference_autoslam_2026-11-04.json` est une copie explicative des mêmes résultats (35 acceptés et 5 refusés), pas un jeu de mesures indépendant.
- `grid_map.csv` et `grid_map_map_tool.csv` sont des cartes dérivées, pas des scans source. Les exports ne remplacent pas les CSV bruts pour comparer des algorithmes.

## 2. Poses Auto-SLAM : disponibilité et signification

Les poses sont disponibles pour **35 scans acceptés sur 40**. L’origine choisie est `scan_01_19h20m09` à `(0, 0, 0°)`. Les scans 27, 29, 30, 31 et 32 sont enregistrés comme refusés pour « plusieurs positions possibles » et n’ont pas de pose validée. La carte et les poses sont donc exprimées dans un repère arbitraire relatif au premier scan, et non dans un repère mesuré de la salle.

Ces poses ont été calculées par le scan matching de l’Auto-SLAM de Lidar Lab contre la carte accumulée. Le recouvrement et l’« écart » notés dans les métadonnées sont des indicateurs internes de qualité du recalage; ils ne sont pas l’erreur par rapport à une position physique mesurée. Le fichier `LISEZMOI.md` précise explicitement qu’aucune pose n’a été mesurée au sol. **La séance du 04/11 permet de comparer la cohérence/reproductibilité entre méthodes, pas d’annoncer une précision absolue.**

## 3. `repetition_tp2` et `verite.json`

Le corpus `C:\Users\HP\TP-cartographie\data\repetition_tp2\` contient 16 scans synthétiques, `poses.json`, `verite.json` et un sous-dossier `robotcontrol` avec les mêmes acquisitions dans un format d’entrée supplémentaire. La documentation de génération indique `python -m carto simulate --tp2` : ce corpus est une simulation, pas une collecte du robot.

`verite.json` associe chaque scan à `[x_m, y_m, theta_deg]`, pose simulée de référence. `poses.json` contient une pose estimée/bruitée et réutilise la même pose estimée pour certains scans répétés à des positions proches; les scans eux-mêmes ne sont pas des copies exactes. En comparant directement les 16 paires présentes dans ces deux JSON, l’écart des poses de `poses.json` à `verite.json` est : translation moyenne **2,48 cm**, médiane **1,86 cm**, maximum **5,75 cm**; angle absolu moyen **1,40°**, médian **1,44°**, maximum **3,70°**. Ces valeurs décrivent l’écart du fichier de poses de départ à la vérité simulée; **elles ne mesurent pas la performance d’un algorithme candidat**.

La documentation annonce une erreur de génération d’environ 1,5 cm / 1,5°. La statistique observée sur ces 16 échantillons montre une médiane proche de cette échelle, mais une moyenne et des maxima plus élevés. Le test doit donc comparer la sortie candidate à `verite.json`, et ne pas prendre `poses.json` pour la vérité.

## 4. Mesure objective des erreurs

Pour chaque scan ayant une pose de vérité :

1. Translation : `e_xy = sqrt((x_est-x_vrai)^2 + (y_est-y_vrai)^2)` en mètres.
2. Angle : `e_theta = abs(wrap180(theta_est-theta_vrai))` en degrés, avec différence angulaire ramenée dans `[-180°, 180°)`.
3. Sur toute la trajectoire : publier médiane, moyenne, RMSE, p90 et maximum des deux erreurs; taux de réussite avec seuils fixés avant les essais, par exemple `< 5 cm` **et** `< 2°`; taux de refus; surtout taux de faux positifs (pose erronée acceptée).
4. Mesurer aussi l’erreur relative entre paires successives (RPE) pour quantifier la dérive. Comparer les poses absolues dans le même repère d’ancrage; si une liberté globale de repère est autorisée, publier séparément les métriques avant et après alignement SE(2), car l’alignement peut masquer une erreur d’origine/orientation.
5. Sur une carte simulée à géométrie connue, mesurer également la qualité de carte (IoU/F1 occupé-libre, erreur de frontière, cellules inconnues) contre la carte de vérité. Publier temps de calcul et matériel utilisé.

Sur des données réelles, constituer une référence indépendante : points de repère au sol, positions du centre lidar mesurées, orientation mesurée par une ligne de référence, trajets courts répétés et incertitudes indiquées. Les poses Auto-SLAM et les poses issues d’un autre algorithme ne peuvent pas servir de vérité pour évaluer l’un l’autre.

## 5. Assemblage successif et alternatives

| Méthode | Adaptée à | Atout | Limite à mesurer |
|---|---|---|---|
| Scan matching successif (scan précédent, puis carte) | Captures chronologiques et petits déplacements avec recouvrement | Réutilise la proximité temporelle; correspond au déroulé demandé et au cours | Dérive accumulée; erreur propagée; échec si scan précédent pauvre, déplacement trop grand ou scène ambiguë |
| Recalage global/corrélation puis ICP | Relocalisation plus large sur la carte | Peut sortir d’une initialisation locale moins précise | Coût de recherche; répétitions/symétries; faux positifs si score d’acceptation ne représente pas une preuve de correspondance |
| ICP local point-à-point / point-à-droite | Raffinement autour d’une bonne pose initiale | Simple et précis si les correspondances sont correctes | Minimum local; ne résout pas à lui seul le problème d’initialisation |
| Référence Grid Map, carte vectorielle ou nuage de scans | Localisation d’un scan sur une carte construite | Permet de comparer des fonctions de coût et représentations différentes | Les représentations et prétraitements changent les résultats; la carte de référence doit être fiable |
| Toutes paires / graphe d’assemblage | Scans non ordonnés ou diagnostic de liens | Peut exploiter plusieurs recouvrements éloignés dans l’ordre | Plus coûteux; liens erronés possibles; sans optimisation de graphe et fermeture de boucle, incohérences globales possibles |
| Filtre particulaire / multi-hypothèses | Ambiguïtés et plusieurs poses plausibles | Peut conserver plusieurs hypothèses au lieu d’en choisir une trop tôt | Coût et paramètres supplémentaires; nécessite une politique explicite de convergence/refus |

Le TP-cartographie documente le scan matching successif comme méthode par défaut pour des scans proches et ordonnés, et une méthode toutes-paires comme option de diagnostic pour des scans mélangés. Son rapport de simulation cite 101 scans, 29 s, 8 cm d’erreur médiane et 12 cm de dérive; ce sont des résultats **simulés et propres à ce protocole**, pas une garantie sur le robot. Le rapport indique également que la méthode successive ne replace correctement que 10 des 39 scans réels mélangés; cela confirme que l’ordre et la proximité des prises doivent être contrôlés avant toute comparaison.

## 6. Comparaison de Lidar Lab et TP-cartographie sur les mêmes données

**Oui, techniquement les deux projets peuvent ingérer les mêmes CSV bruts LD06.** `codex_lidar/lidar_core.js` documente un parseur LD06/RobotControl/MapTool; `TP-cartographie/carto/scan.py` documente et lit `angle_deg,distance_mm,intensity`. Le dossier de séance est déjà présent sous TP-cartographie. Cette compatibilité de format ne suffit pas, à elle seule, à rendre les résultats comparables.

Pour une comparaison juste, figer et partager :

- la liste des 40 fichiers de `seance.json` et l’ordre de capture exact;
- les 40 scans, y compris ceux refusés par Auto-SLAM, afin de compter aussi les refus et faux positifs;
- unités, sens de l’angle, repère, gestion des angles circulaires, filtres de portée/intensité/temporels, résolution de grille et options de correction;
- même scan d’ancrage, même initialisation pour chaque scan, mêmes seuils et même vérité terrain quand elle existe;
- mesures de sortie par scan dans un format commun `[x_m, y_m, theta_deg]`, sans utiliser la pose Auto-SLAM comme vérité.

Avant le benchmark, vérifier par une lecture automatique que les deux parseurs donnent le même nombre de retours valides et des coordonnées polaires/cartésiennes concordantes, puis publier un manifeste avec SHA-256 des CSV. La comparaison réelle doit être qualifiée de **cohérence entre méthodes** tant qu’aucune vérité terrain indépendante n’a été relevée.

## 7. Risques du bouton « Localiser et construire la carte »

1. **Faux positif malgré absence de mur commun.** Dans l’arbre de travail présent, `tests/assemblage_hors_ligne.test.js` contient un cas A5b marqué `TODO`: la graine 99 peut placer un scan sans correspondance réelle.
2. **Symétrie et salle répétitive.** Le test A6b est marqué `TODO`: une symétrie centrale peut être acceptée malgré deux poses physiquement équivalentes, parce que l’écart relatif des scores est grand alors que les coûts sont tous deux très faibles.
3. **Géométrie partielle trompeuse.** Le test A7b est `TODO`: un bras de salle de 2 m peut être confondu avec une bande de 2 m de la zone précédente malgré 68 % de recouvrement.
4. **Critères d’acceptation insuffisants seuls.** Un seuil de recouvrement ou un écart de score relatif ne prouve pas que la géométrie est unique. Contrôler aussi le coût absolu/résidu, distribution spatiale des inliers, étendue angulaire, nombre de cellules/murs indépendants soutenant la solution, cohérence avec mouvement plausible et marge entre hypothèses.
5. **Dérive et erreurs de carte auto-renforcées.** Intégrer une pose fausse pollue la carte; les scans suivants peuvent ensuite confirmer cette fausse carte. Prévoir validation en deux phases (proposition puis intégration), rollback, journal de décision et possibilité de geler/rejouer la carte.
6. **Ordre et recouvrement.** Charger les 52 CSV au lieu des 40 du manifeste, trier uniquement par numéro, ou assembler des prises éloignées produit un trajet incohérent. Un mur hors des 12 m du LD06, une porte ou une salle sans recouvrement ne peut être raccordé par une preuve lidar inexistante.
7. **Dynamique et mouvement pendant le tour.** Les personnes/objets mobiles et les scans pris alors que le robot se déplace modifient la géométrie; `moving` doit être conservé et contrôlé, les retours dynamiques filtrés prudemment.
8. **Limites structurelles du SLAM V1.** Sans odométrie fiable, graphe de poses optimisé ni fermeture de boucle, l’ajout incrémental peut dériver et ne corrige pas naturellement les anciennes poses lorsqu’une boucle revient à son point de départ.
9. **Absence de vérité indépendante sur le réel.** Les écarts des métadonnées sont internes au même estimateur; ils ne valident ni la pose physique, ni la carte absolue.
10. **Comparaison de parseurs.** Les conventions d’angle, filtres et points conservés peuvent diverger entre implémentations; une différence d’entrée serait faussement attribuée à l’algorithme.

### Vérification locale non destructive

Le dépôt `codex_lidar` était déjà modifié avant cet audit (`index.html`, `lidar_core.js` et fichiers de test/copies non suivis). Ces changements ont été laissés intacts. Un lancement de `node --test tests/assemblage_hors_ligne.test.js` a montré les scénarios A5b, A6b et A7b en `TODO` avec les faux positifs décrits ci-dessus. Il a aussi affiché A9 en échec; le processus a ensuite été interrompu avant le résumé final, donc **la cause exacte de A9 et le résultat complet de la suite n’ont pas été vérifiés**. Ce lancement partiel n’est pas une validation réussie.

## 8. Critères de sortie avant validation de l’algorithme

- Aucun faux positif dans une batterie synthétique déterministe couvrant zéro recouvrement, faible recouvrement, corridors, salles symétriques, murs répétitifs, changements d’objets, portes, grands déplacements et mouvements pendant un scan.
- Chaque refus explicite sa cause; les scans refusés restent disponibles pour reprise sans polluer la carte.
- Sur `repetition_tp2`, publier résultat par scan contre `verite.json`, réussite sous seuils fixés, taux de refus/faux positif et RPE; utiliser des graines/scénarios distincts pour réglage et évaluation finale.
- Sur la séance du 04/11, rejouer exactement les 40 captures ordonnées et publier les résultats de toutes les méthodes sur les mêmes CSV; la référence Auto-SLAM est seulement un comparateur de cohérence.
- Faire une séance réelle contrôlée avec plusieurs poses mesurées indépendamment; annoncer les incertitudes de position et d’orientation et répéter le parcours.
- Confirmer l’équivalence d’entrée JS/Python par manifeste SHA-256 et comparaison de retours après prétraitement identique.
- N’intégrer une pose à la carte qu’après validation des critères absolus et des hypothèses ambiguës; garder journal, export et retour arrière.

## 9. Désaccords et questions ouvertes

- **Aucun désaccord formel ne peut être affirmé** sans seconde analyse. L’inventaire, les hashes, les statuts de capture et les statistiques de `repetition_tp2` sont des observations reproductibles des fichiers.
- Points à trancher ou à confirmer : la cause de l’échec A9; la meilleure règle de rejet combinant coût absolu, qualité spatiale et écart entre hypothèses; l’ordre d’évaluation des scans refusés; et le rôle d’un graphe de poses/odométrie dans la version visée.
- Ne pas confondre les 12 anciens fichiers portant des numéros répétés avec des duplications d’octets, ni les poses Auto-SLAM avec une vérité terrain. Sur ces deux distinctions, les fichiers disponibles apportent une réponse directe.

## Sources vérifiées

- `C:\Users\HP\TP-cartographie\data\robot_wifi\seance_2026-11-04_17h42m59\LISEZMOI.md`
- `C:\Users\HP\TP-cartographie\data\robot_wifi\seance_2026-11-04_17h42m59\seance.json`
- `C:\Users\HP\TP-cartographie\data\robot_wifi\seance_2026-11-04_17h42m59\poses.json`
- `C:\Users\HP\TP-cartographie\data\robot_wifi\seance_2026-11-04_17h42m59\reference_autoslam_2026-11-04.json`
- `C:\Users\HP\TP-cartographie\data\repetition_tp2\verite.json` et `poses.json`
- `C:\Users\HP\TP-cartographie\README.md`, `carto/scan.py`, `carto/register.py`, `carto/localisation.py`, `resultats/localisation/version_1/synthese.md`
- `lidar_lab/lidar_core.js`, `serveur_robot/auto_slam.js`, `tests/resultats_simulation.md`, `tests/assemblage_hors_ligne.test.js`
