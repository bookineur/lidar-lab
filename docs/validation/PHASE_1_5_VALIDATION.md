# PHASE 1.5 — VALIDATION DES ALGORITHMES DE LOCALISATION

**Date :** 7 novembre 2026  
**Mode :** audit en lecture seule. Aucun code, scan, réglage, commit ou historique Git n’a été modifié. Ce fichier est le seul artefact créé à cette étape.  
**Commit du code examiné :** `1b0fd69` — `Bouton « Localiser et construire la carte » : assemblage automatique de scans enregistrés`.

## Recommandation finale : PAS ENCORE PRÊT

Ne pas lancer le développement de la fonction comme localisateur automatique fiable ni valider ses poses sur le robot. Le prototype de bouton peut exister, mais il ne faut pas considérer l’acceptation/rejet de pose comme sûre : des scénarios de faux positifs restent explicitement en `TODO`, et un rejeu exploratoire sur `repetition_tp2` accepte 14 poses manifestement fausses sur 15 poses estimées.

Les seuils `±0,3 m / ±20°` ne sont pas justifiés par un balayage de validation. De plus, dans l’implémentation courante, ils ne bornent pas l’acceptation : une recherche globale est effectuée après la recherche locale et peut accepter une pose lointaine. La priorité est donc de fiabiliser le critère de validation des hypothèses, pas de régler les fenêtres à l’intuition.

## 1. Les scénarios `TODO` et les poses erronées à empêcher

Le fichier actuel `tests/assemblage_hors_ligne.test.js` contient **cinq déclarations `TODO`**, correspondant à **trois familles de risques**. Le rapport précédent avait résumé trois scénarios; cette relecture a trouvé aussi les tests d’interface A10b et un second test de symétrie A6b.

| Famille | Tests concernés | Mauvaise pose à empêcher |
|---|---|---|
| Pièce sans recouvrement | **A5b**, **A10b** | Trois scans de référence décrivent une pièce; un scan généré dans une autre pièce éloignée (rectangle vers `[30,30]–[33,32]`, pose vraie `[31.5,31,0]`, graine 99) ne partage aucun mur. L’assembleur le place pourtant parfois à un emplacement de la première pièce. A10b exerce le même cas par le bouton. La seule pose acceptable est un refus, sans intégration ni pollution de la carte. |
| Symétrie / géométrie répétitive | **A6**, **A6b** | Dans une salle rectangulaire parfaite de 6 × 4 m, deux poses différentes peuvent produire des murs presque équivalents. A6 demande de refuser ou de retrouver la pose relative attendue `[2,0,0]` à moins de 10 cm. A6b teste un robot retourné de 180° dans la même salle et exige un refus quand la carte ne permet pas de départager les hypothèses. Une solution symétrique mais fausse ne doit jamais être présentée comme certaine. |
| Bras étroit d’une salle en L | **A7b** | Le scan de la branche du L ne doit pas être superposé à la bande de même largeur dans la première branche. Le commentaire du test décrit un faux alignement à **68 % de recouvrement** et **28 % d’écart relatif de score**. Toute pose estimée présente doit rester à moins de 10 cm de la pose relative de vérité; le refus est préférable à la fausse intégration. |

**Point de qualité sur les tests :** le commentaire d’A6 mentionne « 21 tirages sur 30 », mais le corps actuel du test ne lance qu’un assemblage déterministe de deux scans. Cette statistique n’est donc pas reproduite par A6 lui-même et doit être documentée par un test répétable distinct avant d’être traitée comme une mesure confirmée. A7b ne vérifie pas explicitement qu’un scan légitime est finalement accepté; il pourrait passer en refusant tous les scans. Les corrections devront tester simultanément faux positifs et taux de refus.

## 2. Test A9 : diagnostic disponible

Le test A9 vérifie le parcours d’interface complet sur huit scans synthétiques : chargement, clic sur « Localiser et construire la carte », intégration de tous les scans, origine du premier scan, tableau de bilan, export CSV et présence de cellules occupées dans l’export de grid map.

Commande isolée exécutée sur le code actuel :

```text
node --test --test-name-pattern='A9\.' tests/assemblage_hors_ligne.test.js
```

Résultat terminal vérifié : **1 test, 1 réussi, 0 échec, 0 ignoré**, durée du test 48 724 ms (durée totale 49 779,99 ms). A9 passe donc dans le commit actuel.

Lors de l’audit précédent, un lancement plus large avait affiché A9 en échec dans un arbre de travail antérieur, mais avait été interrompu avant le rapport d’erreur final. Entre-temps, l’implémentation a été enregistrée dans le commit `1b0fd69`. Le diagnostic d’assertion de cet ancien échec n’est pas disponible; **sa cause historique exacte ne peut pas être déterminée** sans le résultat complet ou le snapshot exact de cet ancien état. Le succès isolé d’aujourd’hui montre que l’échec ne se reproduit pas sur le code courant, mais ne permet pas d’affirmer quel changement l’a corrigé. La suite complète n’a pas été exécutée dans cette phase.

## 3. Fonction de localisation dans `lidar_core.js`

### `locateScanOnGrid`

1. Extrait les cellules occupées de la grille; refuse si moins de 10 cellules occupées.
2. Calcule un champ de distance à la cellule occupée la plus proche.
3. Échantillonne au plus environ 110 points pour la recherche grossière et 220 pour le raffinement.
4. Cherche une pose sur toute la grille par pas d’au moins 20 cm et 15°. Pour une option `around`, la recherche locale utilise un pas de translation d’au moins 5 cm / deux cellules (10 cm pour une grille à 5 cm) et un pas angulaire de 5°.
5. Garde plusieurs candidats dans deux classements : score complet plafonné à 1,2 m et score dont les distances sont plafonnées à 0,5 m. Raffine ensuite ces candidats, puis une petite fenêtre fine autour de chacun.
6. Calcule les inliers comme les points à au plus `max(0,10 m, 2 cellules)` d’une cellule occupée. L’overlap est la fraction de points inliers. Le RMS est calculé uniquement sur les inliers; le score global robuste plafonne les points non appariés.
7. Compare le meilleur candidat au prochain candidat suffisamment éloigné. L’ambiguïté est définie par un écart relatif de score inférieur à 8 %. La pose est acceptée si elle n’est pas ainsi marquée ambiguë et si l’overlap atteint le seuil.

Le résultat expose `mean`, `overlap`, `inlierRms`, `gap`, `ambiguous` et `quality`; cependant, **`mean`, `inlierRms` et `quality` ne participent pas à la condition `ok`**. L’acceptation revient actuellement à : `!ambiguous && overlap >= minOverlap`.

### `assembleSteps` / `assembleSession`

- Vérifie le format, le repère, le nombre minimum de points (20) et les doublons de distances.
- Trie par heure du nom lorsque toutes les captures ont une heure; sinon conserve l’ordre fourni.
- Ancre le premier scan à `(0,0,0°)`.
- Pour chaque scan suivant, construit une grille des scans acceptés, cherche localement autour du dernier scan placé, puis relance la recherche globale sur toute la carte avec la solution locale comme graine.
- Applique à la solution globale le critère overlap/ambiguïté. Si un scan est refusé, il est conservé en attente et réessayé après chaque nouvelle intégration.
- L’assemblage est déterministe pour les mêmes fichiers, options, ordre et environnement d’exécution dans l’essai décrit plus bas.

## 4. Vérification des critères de recouvrement, ambiguïté et rejet

- **Recouvrement par défaut : 35 %.** Sur environ 220 points raffinés, cela autorise environ 77 points proches d’un mur déjà occupé. Une solution peut donc ignorer la majorité des points et rester candidate. Cela peut être utile pour une zone nouvelle, mais ce seuil seul n’établit pas que les points concordants couvrent une géométrie distinctive.
- **Distance d’inlier : 10 cm** pour la grille à 5 cm. Des murs parallèles voisins ou deux bandes de largeur similaire peuvent fournir beaucoup d’inliers à une translation erronée.
- **Score robuste : plafond de 30 cm** dans le raffinement pour cette résolution. Les points sans correspondance sont pénalisés de manière bornée; le champ de score mesure la proximité des retours aux murs occupés, sans pénalité équivalente explicite pour une contradiction avec l’espace libre des rayons. Un petit sous-ensemble de retours alignés peut donc dominer une géométrie pourtant incompatible.
- **Ambiguïté : marge relative < 8 %.** Si le second candidat n’existe pas dans la liste conservée, la pose n’est pas déclarée ambiguë. La différence relative peut aussi être trompeuse lorsque les deux scores sont tous deux très faibles : A6b est précisément un cas `TODO` où une marge relative de 29 % ne départage pas deux solutions symétriques.
- **Pas de garde de score absolu.** Il n’existe pas de maximum accepté pour le RMS des inliers ni pour le coût robuste. Le RMS peut être affiché comme qualité sans bloquer l’intégration.
- **Rejet / reprise :** les refus ne sont pas intégrés et peuvent être réessayés après un nouveau scan. C’est une bonne propriété de sûreté, mais le critère actuel peut accepter un faux positif avant de pouvoir le reprendre.

### Risques conceptuels par géométrie et initialisation

- **Peu de recouvrement :** le seuil de 35 % et le plafond du coût permettent de faire correspondre une petite portion des murs et de traiter le reste comme zone nouvelle. Risque de raccordement à une mauvaise pièce; tester avec recouvrement contrôlé de 0, 10, 20, 35, 50, 70 et 90 %.
- **Murs parallèles/couloirs :** la translation le long d’un mur ou entre deux murs parallèles est faiblement observable. Overlap élevé et petit RMS local ne garantissent pas une position longitudinale unique. Vérifier la dispersion spatiale des inliers et la courbure/Hessienne du score; rejeter les directions mal contraintes.
- **Environnements symétriques/répétitifs :** plusieurs orientations ou translations peuvent produire des scores proches. La symétrie centrale A6b montre que l’écart relatif seul n’est pas une règle suffisante. Conserver les hypothèses et refuser lorsqu’elles sont physiquement indiscernables sans odométrie ou information supplémentaire.
- **Mauvaise initialisation :** la recherche locale ne suffit pas à corriger un départ hors fenêtre. La recherche globale peut sortir d’une mauvaise initialisation, mais elle augmente alors le risque de trouver une autre structure ressemblante. Il faut évaluer séparément les erreurs initiales et les taux d’acceptation fausse.
- **Carte contaminée :** dès qu’un faux positif est intégré, il devient une référence pour les scans suivants. Il faut une intégration transactionnelle (proposition, validation, commit de pose), un historique et un rollback/rejeu.

## 5. Les seuils `±0,3 m / ±20°` sont-ils justifiés ?

**Non, pas par les données actuellement disponibles.** `ASSEMBLY_DEFAULTS` fixe `localXY: 0.3` et `localDeg: 20`; le commentaire renvoie à une fenêtre de `±0,2 m / ±15°`, ce qui ne justifie pas exactement les valeurs retenues. Aucun balayage documenté ne compare ces fenêtres à une vérité terrain pour plusieurs tailles de déplacement.

Plus important : dans le code actuel, la fenêtre n’est **pas un garde-fou d’acceptation**. La recherche locale fournit une graine, puis `locateScanOnGrid` lance une recherche globale sur toute la carte. La fonction `near()` sert à nommer la méthode « locale » ou « globale »; elle n’empêche pas l’acceptation d’une pose éloignée. Ainsi, `±0,3 m / ±20°` ne borne pas effectivement le saut de pose.

`repetition_tp2` n’est pas une trajectoire de petits déplacements : c’est un corpus de poses de localisation espacées. La séance du 04/11 contient aussi, selon les poses Auto-SLAM (qui ne sont pas une vérité indépendante), des changements successifs bien plus grands que 0,3 m ou 20°. Ces ensembles ne peuvent ni valider ni calibrer une fenêtre de mouvement du robot. Pour justifier les seuils, il faut mesurer les déplacements réellement effectués par le châssis entre captures, puis balayer des bornes et initialisations autour de cette distribution, avec trajectoires de vérité mesurées.

## 6. Reproductibilité sur `repetition_tp2` / `verite.json`

Un rejeu exploratoire en mémoire a chargé `scan1.csv` à `scan16.csv` avec `LidarCore.parseCsv`, puis appelé deux fois `LidarCore.assembleSession` avec les mêmes scans et les mêmes options. Aucun fichier n’a été écrit.

Résultat vérifiable :

- les deux bilans JSON (statuts, poses, overlap et écart) sont identiques;
- les 16 scans sont placés (le premier est l’origine), aucun n’est refusé;
- la comparaison utilise `verite.json` et le calcul de pose relative du helper `tests/synthetic_ld06.js`, afin de comparer les sorties dans le repère du premier scan;
- parmi les 15 poses estimées, scan 2 est proche de la vérité (2 mm / 0,11°); **les 14 autres sont fausses de 2,3 à 6,8 m et d’environ 179°**, tout en étant acceptées. Erreur de translation des 15 : médiane 3,919 m, moyenne 4,274 m, maximum 6,806 m; erreur angulaire médiane 179,10°, moyenne 167,15°, maximum 179,37°.

Ce rejeu démontre une **reproductibilité déterministe, pas une bonne précision**. Il constitue une alerte forte de faux positifs, mais pas un benchmark représentatif de l’assemblage de captures consécutives : les 16 scans TP2 ne sont pas ordonnés comme une trajectoire avec petits déplacements et fort recouvrement. Les évaluations principales doivent utiliser les outils TP2 adaptés à la localisation de poses avec initialisations connues; ce rejeu du bouton doit rester un stress test d’assemblage non ordonné.

La vérité utilisée est bien `verite.json`, pas `poses.json`. Le second fichier est une pose bruitée/estimée et ne doit pas être traité comme vérité de l’algorithme. Les résultats antérieurs sur l’écart de `poses.json` à `verite.json` (médiane proche de 1,9 cm, maximum proche de 5,8 cm en translation) décrivent le bruit de cette référence bruitée, pas les performances de l’assembleur.

## 7. Corrections et validations nécessaires avant le développement fiable

1. **Rendre le score absolu contraignant :** définir des bornes calibrées pour coût robuste et RMS des inliers; vérifier l’accord du score avec l’erreur à la vérité sur simulations bruitées et données réelles mesurées.
2. **Renforcer la preuve géométrique :** demander des inliers couvrant plusieurs orientations/segments et une portion spatiale suffisante; détecter les alignements dominés par un seul mur parallèle; intégrer une pénalité d’incohérence avec l’espace libre quand le modèle le permet.
3. **Revoir la règle d’ambiguïté :** comparer plusieurs minima séparés, utiliser une marge absolue et relative, et refuser les symétries non résolues. Tester l’absence d’un deuxième candidat conservé.
4. **Séparer recherche et mouvement plausible :** décider si la pose doit rester dans une fenêtre de mouvement imposée par la commande/odométrie; à défaut, ne pas présenter ±0,3 m / ±20° comme limite de sécurité. Évaluer erreurs d’initialisation et déplacements réellement mesurés.
5. **Réparer les scénarios `TODO` :** A5b/A10b (aucune pièce commune), A6/A6b (symétries), A7b (bras du L), avec assertions sur erreur de pose, taux de refus des cas impossibles et maintien des vrais placements. Reproduire la revendication 21/30 avec un vrai test multi-graine.
6. **Ajouter un benchmark de faux positifs :** mêmes scans, ordre, paramètres, prétraitement et initialisations; mesurer précision/rappel d’intégration, faux positifs, refus, erreur XY/angle, p50/p90/max et durée. Ajouter corridors parallèles, fenêtres avec faible recouvrement, répétitions de salle et initialisations éloignées.
7. **Évaluer `repetition_tp2` selon sa finalité :** localiser chaque scan sur la référence/carte pertinente avec la même initialisation et vérité `verite.json`; ne pas présenter l’assemblage séquentiel du fichier `scan1..16` comme protocole TP2 si les captures ne forment pas une trajectoire.
8. **Ajouter une vérité terrain réelle :** parcours court avec points au sol, orientation mesurée et incertitudes chiffrées; comparer les estimateurs à cette référence indépendante.
9. **Mettre la carte à l’abri des faux positifs :** conserver scan brut, décision, hypothèses, scores et pose; intégrer après confirmation et permettre annulation/rejeu.
10. **Rendre les résultats vérifiables :** une commande de test déterministe, un résumé complet non interrompu et un rapport qui distingue succès des tests, TODO, skips et expériences exploratoires.

## Conclusion

**Décision : PAS ENCORE PRÊT.** A9 est vert sur le commit actuel, mais il valide surtout le flux de l’interface et l’export sur une simulation favorable; il ne valide pas la sûreté de localisation. Les `TODO` restent les blocages principaux et le rejeu reproductible sur `repetition_tp2` révèle des intégrations catastrophiquement fausses quand les scans ne suivent pas une courte trajectoire recouvrante. Après correction des faux positifs et validation avec une vérité terrain indépendante, la recommandation pourra être réévaluée comme « prêt sous conditions ».

## Sources examinées

- `codex_lidar/lidar_core.js` : `locateScanOnGrid`, `ASSEMBLY_DEFAULTS`, `assembleSteps`, `assembleSession`.
- `codex_lidar/tests/assemblage_hors_ligne.test.js` : A5b, A6, A6b, A7b, A9, A10b, A11.
- `codex_lidar/tests/synthetic_ld06.js` : géométries, poses relatives et générateur de scans synthétiques.
- `TP-cartographie/data/repetition_tp2/scan1.csv` à `scan16.csv`, `poses.json`, `verite.json`.
- `TP-cartographie/data/robot_wifi/seance_2026-11-04_17h42m59/reference_autoslam_2026-11-04.json` pour le contexte des poses relatives; cette référence n’est pas une vérité terrain.
