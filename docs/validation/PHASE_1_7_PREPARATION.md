# PHASE 1.7 — PRÉPARATION DU PROTOCOLE DE VALIDATION

**Date :** 8 novembre 2026  
**Portée :** audit en lecture seule des modifications existantes, analyse des scénarios de faux positifs, création d'un corpus synthétique neuf et définition du protocole.  
**Limite :** aucun algorithme, scan d'origine, configuration ou historique Git n'a été modifié. Aucun commit n'a été créé. Le générateur et le corpus ajoutés dans `validation_phase_1_7/` sont des artefacts de validation séparés.

## 1. Décision du projet prise en compte

La phase prépare des preuves avant toute correction de l'algorithme. Elle ne vaut pas autorisation de modifier ou d'activer la localisation automatique ni la fusion automatique. Les décisions retenues sont : acquisition LiDAR et visualisation conservées; grid map utilisée seulement avec poses jugées fiables; localisation automatique actuelle soumise à validation; fusion sans contrôle désactivée; vector map après validation; SLAM complet ultérieur.

## 2. Audit des modifications non commitées

### État Git observé

HEAD au moment de l'audit : `e34e3d76518b2e7ea965e7e306321b58f850dcfe`, daté du 8 novembre 2026 à 20:34:48 +01:00. Le commit indique Miguel Korgo comme auteur et committer.

Fichiers modifiés non commités observés :

| Fichier | Contenu du diff | Objectif apparent | Attribution vérifiable |
|---|---|---|---|
| `lidar_core.js` | Ajoute un contrôle `contradictionCheck` après sélection du meilleur candidat; calcule `freeHit`; active `overlapAmbiguity`; ajoute un seuil par défaut `contradiction.maxFreeHit = 0.142`; refuse une pose contradictoire sans basculer sur un autre candidat. | Refuser un candidat qui contredit des cellules de vide confirmé et compléter le rejet par ambiguïté. | Git ne conserve pas l'auteur d'un diff non commité. Non attribuable avec certitude. |
| `tests/assemblage_hors_ligne.test.js` | Retire le marqueur TODO d'A7b; ajoute l'explication du seuil; étend A14 pour vérifier que les filtres n'acceptent pas un autre candidat; vérifie la valeur par défaut de 0,142. | Couvrir le nouveau refus et sa propriété de sûreté. | Non attribuable avec certitude. |
| `tests/corpus_faux_positifs.js` | Propage le seuil de contradiction dans la fonction d'évaluation du corpus. | Comparer ce veto aux scénarios synthétiques. | Non attribuable avec certitude. |

Fichiers non suivis liés au même état de travail : copies suffixées `e34e3d7` dans `anciennes_versions/`, rapport `resultats_faux_positifs_976dc55.md`, trois rapports de phases antérieures et `version_2/`. Ils sont restés intacts. Les horodatages des trois fichiers sources sont postérieurs au commit et ceux des copies sont proches des premières modifications; ce sont des indices de séquence, pas une preuve d'auteur. Git ne fournit donc pas de réponse fiable à « qui a écrit les changements non commités ». Le commit antérieur ne permet pas de leur attribuer automatiquement son auteur ou son co-auteur.

### Risque particulier de la proposition actuelle

Le nouveau seuil 14,2 % est décrit dans le code comme dérivé de la séance du 04/11, en prenant 1,5 fois le plus haut taux de points libres observé parmi des scans considérés comme placés en accord avec Auto-SLAM. Cette référence n'est pas une vérité terrain indépendante. Elle ne prouve donc ni la justesse de la limite ni sa transférabilité à d'autres salles, personnes, vitres ou objets mobiles. Les tests unitaires qui injectent exactement `0.142` prouvent le comportement du veto, pas la qualité métrologique du seuil. La règle est bien « veto du candidat choisi »; elle ne recherche pas une autre pose après rejet, ce qui évite ce type de substitution silencieuse mais peut accroître les refus.

Le rapport synthétique antérieur `anciennes_versions/resultats_faux_positifs_976dc55.md` indique que l'ambiguïté seule a laissé 48 faux positifs sur 600 cas d'évaluation, et que les deux contrôles combinés en ont laissé 2/600. Ces nombres ne prouvent pas zéro faux positif; le corpus concerné est synthétique. Sur `repetition_tp2`, les nombres historiques rapportés sont meilleurs, mais ce corpus n'est pas une trajectoire séquentielle de petits déplacements. Sur la séance réelle du 04/11, Auto-SLAM sert de comparaison et non de vérité terrain indépendante.

## 3. Les cinq assertions précédemment TODO

Le rapport Phase 1.6 avait recensé les cinq cas suivants comme TODO/échecs. Dans le worktree actuel, les cinq tests sont désormais des tests ordinaires (aucun marqueur `{ todo: ... }` n'apparaît dans ces déclarations). A7b a été décommenté et le veto de contradiction a été ajouté depuis le commit. Il faut donc séparer le diagnostic historique de l'état de test actuel.

| Assertion | Mauvais placement qu'elle cherche à empêcher | Diagnostic du rapport précédent | État actuel observé pendant cette phase |
|---|---|---|---|
| A5b — pièce sans mur commun, plusieurs graines | Un scan d'une pièce éloignée est « posé » dans la carte d'une autre pièce par coïncidence du score. | Le rapport antérieur indique que la graine 99 était acceptée malgré l'absence de murs communs. | Exécutée maintenant avec le nom `A5b` : **ok**. Le résultat vérifié couvre les graines du test courant (99, 7, 42); il ne constitue pas une preuve sur toutes les graines ni sur des données réelles. |
| A6 — salle rectangulaire parfaitement symétrique | Accepter une pose fausse (dans le résultat historique, près de 2 m et 179,5° d'erreur) au lieu de refuser l'ambiguïté ou de retrouver la vérité. | Les deux orientations/positions produisent des scans presque indiscernables dans la géométrie parfaite; le critère de score historique acceptait le faux minimum. | Exécutée maintenant : **ok** selon l'assertion « refus ou pose correcte ». Elle autorise encore l'option refus; ce n'est pas une démonstration que le système sait départager une symétrie. |
| A6b — symétrie centrale, scan retourné de 180° | Accepter une orientation inversée que les observations d'un rectangle parfait ne peuvent distinguer. | Le rapport antérieur relevait un placement accepté alors que le test exigeait un refus. | Exécutée maintenant : **ok**, le test demande un refus. Ce cas doit rester explicitement une ambiguïté/rejet, faute d'information asymétrique ou d'un autre capteur. |
| A7b — branche étroite d'une salle en L | Superposer un scan du bras étroit sur une géométrie ressemblante de la première zone, malgré une partie de l'environnement différente. | L'ancien résultat plaçait `scan_02_09h00m10.csv` à une mauvaise pose. | Le diff non commité indique environ 23 % de points en vide confirmé et applique le veto 14,2 %. Exécutée maintenant : **ok**. Cette réussite dépend d'un seuil encore non validé indépendamment. |
| A10b — même pièce éloignée via l'interface | L'UI marque `mapRegistered=true` et fusionne un scan sans correspondance réelle. | Le rapport antérieur signalait le même faux positif que A5b à travers l'interface. | Présent dans le fichier, mais **résultat d'exécution non confirmé** dans la sortie disponible au moment de la rédaction. Ne pas le déclarer réussi sans le TAP complet. |

Sortie TAP conservée pendant cette phase : A5b, A6b et A7b affichent `ok`; A6 affiche `ok`. La commande ciblée incluant A10b était encore en cours au dernier retour outil. Aucun résultat complet n'est donc affirmé pour A10b. A6 ne prouve pas la localisation dans une symétrie : l'assertion passe si le système refuse.

## 4. Corpus de trajectoire continue préparé

Nouveau corpus isolé : [`validation_phase_1_7/corpus_trajectoire_continue_v1/`](validation_phase_1_7/corpus_trajectoire_continue_v1/). Il contient 130 fichiers `scan_001.csv` à `scan_130.csv`, un `manifest.json`, un `verite.json` séparé et son README. Générateur : [`validation_phase_1_7/generer_corpus.js`](validation_phase_1_7/generer_corpus.js).

Le générateur reprend le simulateur existant sans le modifier (`tests/synthetic_ld06.js`). Il produit des scans logiciels déterministes par graine, avec un modèle de salle 9 × 7 m, cloison avec ouverture, zone à murs parallèles en U et obstacles statiques. Les pas consécutifs sont limités par construction à 0,15 m et 10°; le script a affiché 130 scans, maximum mesuré 0,15000000000000036 m (écart d'arrondi flottant) et 10°. Les captures comprennent des translations, des rotations sur place, le passage par une porte et l'entrée/sortie de la zone parallèle. Les poses globales véritables sont stockées séparément des CSV sous la forme `[x_m, y_m, theta_deg]`, 0° vers +X et sens trigonométrique.

Le corpus est reproductible à partir du générateur et des graines fixes; son `generated_utc` varie à chaque génération, et le générateur refuse d'écraser un dossier existant. Il s'agit d'une vérité terrain exacte du simulateur, pas d'une vérité terrain robot mesurée. Le modèle ne simule pas encore les occultations dynamiques, les vitres, les erreurs de montage, la dérive d'odométrie ni les pertes de scans.

Vérification effectuée : le script rapporte 130 scans et respecte les maxima de pas annoncés. La vérification du parsing de tous les fichiers et le test A10b n'ont pas encore livré leur sortie complète; aucune réussite de ces vérifications n'est revendiquée ici.

## 5. Protocole de mesure proposé

### 5.1 Association et repères

L'ordre d'exécution doit venir du tableau `scans` dans `manifest.json`, pas d'un tri implicite du nom. Relier chaque nom de CSV à la même clé de `verite.json`, contrôler les comptes, l'absence de noms orphelins, le nombre de points parsés et la continuité des poses. Pour comparer l'assembleur ancré au premier scan, exprimer chaque vérité dans le repère du scan 1 : `T_rel = inverse(T_0) * T_i`. Calculer `e_xy = hypot(x_est - x_gt, y_est - y_gt)` et `e_theta = abs(wrap180(theta_est - theta_gt))`. Inclure les scans refusés dans les métriques de taux d'acceptation et les poses absentes dans les métriques de couverture.

### 5.2 Indicateurs à collecter pour chaque scan

- décision : accepté, ambigu, refusé, invalide; intégration effective ou non;
- erreur XY, erreur angulaire, erreur de déplacement relatif (RPE), et dérive cumulée le long du parcours;
- recouvrement total et recouvrement par secteur angulaire / région spatiale;
- coût absolu et RMS sur tous les points et sur les seuls inliers, avec nombre d'inliers;
- nombre de zones/segments géométriques indépendants soutenant la pose et leur distribution dans l'image 2D;
- meilleur, second et autres minima spatialement distincts, leur coût, recouvrement et séparation;
- contradiction avec espace libre confirmé, rayons traversant des obstacles confirmés, incertitude/conditionnement de la pose;
- temps de calcul et état de la carte avant/après intégration.

Le nombre brut de points correspondants ne suffit pas : une longue portion d'un mur peut compter beaucoup sans contraindre le déplacement le long du mur. Il faut mesurer la couverture spatiale/angulaire et la contrainte des degrés de liberté. Des murs parallèles peuvent bien contraindre la distance perpendiculaire tout en laissant la translation parallèle faible; une géométrie symétrique peut être intrinsèquement non identifiable.

### 5.3 Seuils et décision

Ne pas choisir un seuil pour faire passer A5b/A6/A7b ni le corpus de trajectoire. Avant le réglage, définir les limites applicatives de tolérance de pose et de dérive, le coût maximum acceptable des faux positifs et le taux de refus tolérable. Estimer la sensibilité sur un lot de calibration, puis figer les critères et publier les résultats sur un lot holdout non consulté. Répéter les scènes et graines; publier matrice acceptation correcte / fausse / refus, médiane, P90, maximum et intervalle d'incertitude.

Une acceptation exige des preuves complémentaires : recouvrement suffisant, score absolu compatible avec le bruit, appuis bien répartis, absence de minimum rival plausible, mouvement cohérent avec une odométrie si elle existe, et incertitude compatible avec le besoin. Une règle isolée ne doit pas compenser l'échec d'une autre preuve. Sans odométrie, la cohérence de mouvement n'est qu'un a priori et ne doit pas forcer un faux placement. Si la scène est ambiguë, refuser et conserver le scan en attente sans toucher à la carte.

Mesurer le taux de faux positifs d'abord, puis la couverture des bonnes poses. Évaluer les faux positifs par type de scène : parallèle, symétrie, L, porte/faible recouvrement, mauvaise initialisation, zone nouvelle et pièce sans correspondance. Les seuils doivent être calibrés sur données représentatives indépendantes; aucun seuil de réussite numérique n'est déclaré dans cette préparation.

## 6. Stratégies de correction à comparer, sans les implémenter

| Stratégie | Atout | Limite / vérification requise |
|---|---|---|
| Assemblage séquentiel actuel + critères renforcés | Simple à instrumenter; respecte le modèle de petits déplacements; intégration facile à annuler. | Accumule la dérive; une erreur admise peut contaminer tous les scans suivants; les critères doivent traiter les minima multiples et l'incertitude. |
| Scan-to-scan avec prédiction odométrique, puis scan-to-map | L'odométrie resserre les candidats; la carte locale consolide les observations; trajectoire adaptée au déplacement manuel ou motorisé si les encodeurs sont fiables. | Odométrie possiblement absente ou non calibrée; glissement des roues; nécessite une vraie mesure et des intervalles d'incertitude. |
| Carte sous-cartes / pose graph avec fermeture de boucle | Permet de redistribuer l'erreur après retour à une zone connue; limite le drift global. | Architecture sensiblement plus complexe; une fausse boucle peut déformer toute la carte; exige des contraintes de boucle robustes et validation dédiée. |
| NDT / correlative scan matching / ICP robustifié | Méthodes établies pouvant améliorer la convergence ou exploiter des structures géométriques différentes. | Ne résolvent pas une scène non observable ni une mauvaise initialisation par magie; chacune peut converger vers un minimum faux. Comparer sur le même corpus, même initialisations et même critère de rejet. |
| Localisation probabiliste (multi-hypothèses, particules) | Représente naturellement les ambiguïtés de couloir/symétrie et peut reporter une décision. | Coût de calcul et besoin de modèle de mouvement; nécessite calibrage des probabilités et observation discriminante. |

La comparaison doit utiliser le même ordre de scans, les mêmes CSV, la même vérité, la même résolution de carte, la même fenêtre de calcul, la même initialisation et le même budget de temps. Les résultats de `TP-cartographie` ne sont comparables à Lidar Lab que si parser, conventions, ordre et repère initial sont harmonisés et si chaque outil reçoit strictement les mêmes données.

## 7. Critères d'acceptation de la campagne

Avant de discuter d'une correction ou d'un bouton automatique :

1. Le manifeste et la vérité terrain s'associent 1:1 aux CSV; le parser ne perd ni ne mélange de scan; le corpus se régénère de manière déterministe (hors horodatage de manifeste).
2. Les tests TODO historiques sont rejoués explicitement avec sortie TAP archivée; toute assertion de sûreté passe, et des cas positifs vérifient que les bonnes poses ne sont pas toutes refusées.
3. Le lot holdout couvre plusieurs scènes et graines indépendantes, notamment salle symétrique, corridor parallèle, L, ouverture, faible recouvrement, autre pièce et mauvaise initialisation.
4. Les faux positifs, faux rejets, erreurs XY/angle, RPE, dérive, incertitude, proportion intégrée et temps sont rapportés pour tous les scans; une décision refusée n'altère pas la carte.
5. Les résultats sont stables et reproductibles, et la méthode gagne sur une référence simple sous le même protocole sans dégrader les scènes adverses.
6. Les données réelles disposent d'une vérité terrain indépendante ou d'une mesure externe avec incertitude connue; l'accord avec Auto-SLAM seul ne compte pas comme exactitude.

Les valeurs numériques des tolérances applicatives restent à définir avant calibration avec les exigences du projet et les capacités réelles du LD06. Le corpus synthétique est un prérequis de test, pas un substitut aux mesures robot.

## 8. Conclusion et recommandation

**Décision : prêt à poursuivre la préparation, pas prêt à modifier/corriger ou activer la localisation automatique.** Le corpus continu de simulation est maintenant disponible dans un dossier neuf. Les changements non commités proposent une amélioration de refus, mais l'auteur n'est pas prouvable et le seuil 14,2 % n'est pas calibré par vérité terrain indépendante. Quatre assertions ont fourni `ok` dans les sorties observées; la sortie complète d'A10b manque, et cette petite suite ne remplace pas un holdout multi-scènes ni une validation robot.

Étapes suivantes autorisées sans toucher à l'algorithme : terminer les contrôles d'intégrité du nouveau corpus; récupérer la sortie TAP complète de A10b; écrire un exécuteur d'évaluation isolé si nécessaire; préparer des scènes holdout, des résultats chiffrés et une vérité terrain réelle indépendante. Toute modification de `lidar_core.js`, des critères d'acceptation ou de la fusion nécessite une autorisation explicite ultérieure.
