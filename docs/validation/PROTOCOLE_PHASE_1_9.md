# PROTOCOLE_PHASE_1_9 — VALIDATION PHYSIQUE DE LA LOCALISATION

**Statut :** à réaliser sur place. Aucun scan ni résultat physique n'est encore disponible dans ce protocole.  
**Référence logicielle gelée :** commit `a9540b4df8d1a3564d9509c60aa2e933d31379e7`. Ne pas modifier ni recalibrer l'algorithme pendant l'acquisition et l'analyse de cette campagne.  
**But :** mesurer l'erreur de pose contre des repères physiques indépendants, puis comparer Lidar Lab et TP-cartographie sur les mêmes acquisitions.

## 1. Plan de l'expérience

- Choisir trois repères fixes au sol, stables et non colinéaires. Leur donner les identifiants `R1`, `R2`, `R3`.
- Construire un repère salle mesurable : origine au repère `R1`; axe X matérialisé par une ligne de référence; axe Y perpendiculaire à X. Noter les coordonnées mesurées des trois repères dans ce repère.
- Prendre trois poses distinctes du robot autour de chaque repère, soit neuf poses au total. Identifier les prises `P01` à `P09`, et noter le repère associé, l'ordre réel et les déplacements/rotations entre captures.
- À chaque pose, immobiliser le robot, attendre la fin du mouvement et enregistrer un tour LiDAR complet. Ne pas déplacer les points ni modifier les CSV après acquisition.
- Acquérir deux répétitions supplémentaires à au moins une pose (recommandé) pour quantifier la répétabilité du capteur et de la procédure; elles ne remplacent pas les neuf poses principales.
- Relever l'état de la salle : portes, mobilier, personnes en mouvement, obstacles, surfaces vitrées, hauteur et orientation du LiDAR, vitesse de rotation si disponible, pertes ou troncatures observées.

## 2. Mesure indépendante de la vérité terrain

### Repère salle et position du LiDAR

La pose vraie est celle du centre de rotation optique du LiDAR, pas celle du centre du châssis. Mesurer le décalage du centre du LiDAR par rapport au repère du châssis et l'appliquer aux mesures du châssis. Documenter ce décalage et son incertitude.

Mesurer X et Y depuis les axes matérialisés au sol, avec un instrument dont le modèle, la résolution et la précision annoncée sont consignés. Faire au moins trois lectures indépendantes de la position pour chaque pose et conserver les lectures brutes ou les photos avec le mètre visible. Ne pas recopier la pose calculée par le LiDAR, Lidar Lab, le robot ou Auto-SLAM comme vérité terrain.

Mesurer l'orientation avec l'axe avant du robot matérialisé par deux points connus du châssis, puis calculer `theta = atan2(y_avant - y_arriere, x_avant - x_arriere)`. Corriger l'angle fixe entre l'axe du châssis et l'axe zéro du LiDAR s'il existe. Noter la convention : degrés, sens trigonométrique, 0° vers +X.

### Incertitude

Pour chaque pose, inscrire les lectures répétées, l'instrument, sa précision/résolution, l'incertitude de la position du centre LiDAR et celle de l'orientation. Estimer les incertitudes X, Y et theta à partir de la précision instrumentale et de la dispersion des répétitions; conserver la méthode de calcul. Ne pas mettre `0` par défaut lorsqu'une incertitude est inconnue : utiliser `null` et expliquer ce qui manque.

Rapporter les différences algorithme–terrain avec leur incertitude de référence. Si l'incertitude terrain est du même ordre que l'erreur mesurée, déclarer le résultat non concluant plutôt que de choisir arbitrairement lequel est exact.

## 3. Fichiers et conservation

- `scans_references/scan_P01.csv` à `scan_P09.csv` : CSV bruts originaux. Les noms dans `poses_mesurees.json` doivent correspondre exactement.
- `poses_mesurees.json` : vérité terrain et incertitude, séparées des poses initiales de localisation.
- `RESULTATS_PHASE_1_9.md` : mesures, comparaisons et verdict, à remplir après la campagne.
- Garder une copie de sauvegarde des CSV avant import. Calculer et inscrire leur SHA-256; une conversion éventuelle doit créer un fichier dérivé séparé, sans remplacer l'original.
- Capturer le même tour et utiliser le même CSV d'origine dans les deux outils. Conserver l'ordre de capture et le manifeste des fichiers.

## 4. Comparaison équitable Lidar Lab / TP-cartographie

Faire deux évaluations séparées afin de ne pas confondre localisation sur référence et assemblage SLAM successif.

### A. Localisation contre une référence commune

1. Pour chaque pose testée, construire une référence avec les scans des autres repères seulement. Exclure de la référence les acquisitions du même repère au sol que le scan testé (y compris les répétitions à moins de 15 cm) afin d'éviter qu'une quasi-copie du scan testé fournisse artificiellement la réponse.
2. Construire la même référence géométrique pour les deux outils, à la même résolution et avec les mêmes filtres. La référence peut être produite avec les poses mesurées, mais ces poses ne doivent pas être celles de l'estimation à évaluer.
3. Avant d'exécuter les algorithmes, fixer une pose initiale commune par scan et l'inscrire dans `initial_guess` de `poses_mesurees.json`. Cette pose initiale doit être une estimation grossière indépendante, pas la vérité terrain copiée. La figer avant de regarder les résultats.
4. Donner le même CSV, la même pose initiale et la même référence aux deux outils. Pour TP-cartographie, sélectionner et noter la méthode de `carto.localisation` (GridRef/VectorRef, méthode, fenêtre, sigma). Pour Lidar Lab, noter la fonction et les options appelées; l'interface d'assemblage séquentiel seule ne permet pas de fixer une initialisation distincte pour chaque scan.
5. Garder toutes les estimations, y compris les refus et les échecs de convergence.

Ce volet mesure la capacité de scan matching à retrouver une pose connue avec une carte de référence commune; il ne démontre pas à lui seul un SLAM.

### B. Assemblage séquentiel de bout en bout

Donner à chaque outil les neuf mêmes CSV, dans l'ordre réel, avec uniquement le premier scan comme origine. Ne pas injecter les poses vraies dans la construction de la carte. Comparer ensuite les poses produites aux mesures indépendantes. Les paramètres et les versions des outils sont consignés et gelés avant le lancement.

**Conventions communes :** mètres, angles finaux exprimés en degrés, repère main droite/trigonométrique, premier scan comme origine locale pour les poses d'assemblage. TP-cartographie stocke theta interne en radians; convertir seulement à l'interface des résultats, sans changer les données brutes. Les CSV `angle_deg,distance_mm,intensity` sont lus par les deux projets; vérifier le nombre de points conservés et les filtres appliqués.

## 5. Mesures et classification

Pour chaque pose estimée :

- `eXY = sqrt((x_est - x_vrai)^2 + (y_est - y_vrai)^2)`;
- `eTheta = abs(wrap180(theta_est - theta_vrai))`;
- erreur relative scan à scan, dérive cumulée, statut accepté/incertain/refusé, score, recouvrement, ambiguïté, RMS, méthode et temps de calcul;
- différence entre outils et incertitude associée à la vérité terrain.

Avant le calcul, déclarer pour chaque pose si sa géométrie est suffisamment observable. Le label « observable / ambigu » est établi à partir de la scène et de la référence, avant de consulter les décisions des algorithmes. Le refus d'une pose parfaitement symétrique ou non observable n'est pas un faux négatif automatique.

Pour les poses déclarées observables, publier la matrice :

| Vérité terrain | Accepté correctement | Accepté hors tolérance | Refusé/incertain |
|---|---:|---:|---:|
| Pose observable | TP | FP | FN |

Calculer précision `TP/(TP+FP)`, rappel `TP/(TP+FN)`, taux de fausse acceptation `FP/(TP+FP)` et taux de rejet. Publier les dénominateurs et des intervalles d'incertitude; avec seulement neuf poses, les résultats restent exploratoires. Les cas non observables sont rapportés à part comme rejets attendus ou mauvaises acceptations.

Conserver comme tolérances de comparaison provisoires celles déjà utilisées pour la Phase 1.8 : 10 cm et 2°, sans les présenter comme certifiées pour l'usage robot. Ajouter les erreurs brutes et les incertitudes plutôt que de cacher un cas à la limite.

## 6. Test d'intégrité de la carte

- Sauvegarder la carte et le bilan juste avant l'insertion d'un scan marqué rejeté ou incertain.
- Vérifier qu'il n'ajoute aucune cellule ni point, et qu'il ne modifie pas les poses déjà validées.
- Comparer le scan valide suivant dans un essai témoin (sans scan rejeté) et dans l'essai avec scan rejeté intercalé; les poses et la grille doivent être identiques, à l'arrondi documenté près.
- Refaire un essai avec un scan incorrect accepté artificiellement seulement dans un environnement de test séparé pour vérifier le mécanisme d'annulation/retour arrière; ne jamais contaminer la carte de référence de la campagne réelle.

## 7. Seuils expérimentaux conservés

Les seuils du commit gelé restent les paramètres de référence : overlap minimal **35 %**, contrôle d'ambiguïté activé, contradiction **14,2 %**. Le seuil de contradiction a été choisi en partie à partir d'une comparaison avec Auto-SLAM; il n'est donc ni une garantie de précision ni une tolérance physique validée. Ne pas l'ajuster au cours de la Phase 1.9. Documenter explicitement tout refus lié à chacun de ces contrôles.

## 8. Liste de contrôle avant acquisition

- [ ] Coordonnées au sol et axes X/Y matérialisés; trois repères non colinéaires identifiés.
- [ ] Décalage châssis–centre optique mesuré.
- [ ] Instrument(s) et incertitudes consignés.
- [ ] Neuf poses planifiées et identifiées, trois par repère.
- [ ] Ordre de passage et fichiers vides associés dans `poses_mesurees.json`.
- [ ] Poses initiales grossières fixées séparément de la vérité terrain.
- [ ] Algorithmes et paramètres gelés; versions/commit consignés.
- [ ] Salle stabilisée ou changements/personnes consignés.
- [ ] Sauvegarde prête; noms de fichiers identiques dans les deux projets.

## 9. Résultat attendu

Cette campagne permettra de juger la précision des deux outils pour ces neuf poses mesurées et ces conditions physiques. Elle ne suffira pas à certifier tous les lieux ou toutes les géométries. Toute fusion automatique reste hors périmètre et non autorisée par ce protocole.
