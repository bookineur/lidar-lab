# Version 2 — couverture des exigences du TP

Cette matrice distingue les fonctions déjà présentes du travail restant. Elle sert de plan de réalisation et de support pour le compte rendu; elle ne prétend pas qu'une validation terrain a déjà eu lieu.

| Exigence du TP | Couverture actuelle de la v2 | À produire / limite |
|---|---|---|
| Capturer des scans polaires LD06 réels | Import CSV et capture USB Web Serial du CSV produit par le sketch Arduino/Teensy `LD06_capture` à 921600 bauds | Nécessite Chrome/Edge sur localhost/HTTPS, la carte programmée, autorisation du port série et une validation réelle; le protocole binaire direct n'est pas décodé dans le navigateur |
| Voir plusieurs scans cartésiens, couleurs distinctes, poses indépendantes | Présent dans le socle v1 copié dans v2 | Documenter et illustrer une expérience réelle |
| Grid map, ray tracing libre/occupé, résolution et inconnus | Présent dans le socle | Justifier résolution, modèle inverse et limites au bruit/occlusion |
| Segments: extraction, angle, proximité, fusion, intersection et coupe | Extraction Split-and-Merge, angle non orienté, proximité en écart latéral + trou longitudinal, fusion pondérée, intersection et coupe selon les règles de `carto/segments.py` | Examiner des cas réels, choisir les tolérances adaptées aux données |
| Construire la carte vectorielle | Extraction et export présents; atelier v2 calcule aussi les segments fusionnés | Comparer résultat grid/vectoriel sur une même pièce |
| Localisation sur trois références | Socle: carte d'occupation, segments vectoriels et ICP scan-à-scan | Comparaison et erreurs seulement crédibles si poses de vérité indépendantes |
| Erreurs position/angle, temps, succès, pose initiale variable | Benchmarks et seuils réglables présents | Exécuter sur les scans du TP et joindre les CSV exportés |
| Localisation + cartographie (SLAM) | Alignement incrémental hors ligne des scans puis fusion des poses | Ce n'est pas un SLAM optimisé par graphe ni un traitement temps réel |
| Carte complète de la salle | Export PNG, grille, vecteurs et nuage fusionné | Acquérir des scans couvrant toute la salle et les raccorder sur place |
| Déplacement automatique du robot (bonus) | Non implémenté | Nécessite interface moteur, protocole robot, sûreté et essais physiques |
| Git accessible et conclusion personnelle | Dépôt Git local; v1 figée par tag | Exporter l'historique avec le rendu final; conclusion à rédiger à partir des mesures |

## Méthode de comparaison

Pour les trois localisateurs, conserver les mêmes CSV et la même pose initiale. Le localisateur grid score les impacts contre les cellules occupées; le localisateur vectoriel score les points contre les segments; ICP apparie les points du scan mobile avec ceux du scan de référence. Mesurer le temps avec l'horloge monotone du navigateur et l'erreur de pose à partir d'un fichier de référence indépendant. La v2 déclare séparément un seuil position (5 cm par défaut) et un seuil angle (2°); la réussite exige de respecter les deux. Le compte rendu doit annoncer ces seuils avant de comparer les résultats.

Une pose saisie à la main ne constitue pas une vérité terrain indépendante. La capture robot, la couverture complète de la salle, et la validation en situation réelle restent indispensables avant de conclure qu'une méthode répond expérimentalement au TP.

## Règles géométriques de l'atelier

- Angle non orienté entre segments: 0° parallèle, 90° perpendiculaire.
- Deux segments sont candidats à la fusion si l'angle entre leurs droites est sous le seuil, les extrémités du plus court sont proches de la droite du plus long, et le trou projeté dans le sens du mur est sous le seuil. La direction fusionnée est pondérée par la longueur; le milieu et les extrémités sont recalculés par projection.
- Une intersection appartient aux deux segments, extrémités incluses à `1e-6 m` près. Les parallèles et colinéaires ne donnent pas d’intersection unique.
- Pour la coupe, le point doit être strictement intérieur au segment cible (à plus de `1e-6 m` des extrémités); le segment qui coupe peut se terminer exactement au point.
- La coupe compare les deux longueurs et conserve le côté le plus long. Si elles sont égales à `1e-6 m` près, elle conserve le côté contenant le premier point du segment cible.
- La proximité/fusion utilise 8° par défaut, 5 cm d’écart latéral et 10 cm de trou longitudinal. Ces seuils sont réglables et doivent être examinés sur les scans du TP.
- L’extraction utilise par défaut 20 cm entre clusters, 10 cm d’écart maximal à la droite, 6 points et 15 cm de longueur minimale.
