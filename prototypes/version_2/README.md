# Lidar Lab — version 2 (en cours)

L’application v2 est une copie de travail indépendante. La version enregistrée reste dans les fichiers racine du dépôt, avec le tag Git `v1.0`.

## Démarrer et déroulé du TP

Pour l’import CSV, ouvrir `index.html` dans un navigateur récent. Pour la capture USB directe, servir ce dossier en local (par exemple `python -m http.server 8000` depuis `version_2`, puis ouvrir `http://localhost:8000`) dans Chrome ou Edge. Brancher une carte Arduino/Teensy programmée avec le sketch `arduino/LD06_capture` du dépôt TP; choisir **Connecter et capturer** et autoriser le port série à 921600 bauds. Le navigateur reçoit les tours CSV complets, les convertit en scans et les ajoute à la liste.

Charger aussi des poses de vérité terrain indépendantes pour calculer des erreurs de localisation. La capture directe dépend du sketch, de la carte USB série et des permissions du navigateur; elle n’est pas testée sur le robot dans cette version.

1. Afficher les nuages et régler les poses individuelles (x, y, angle); contrôler le repère et exporter les poses.
2. Générer la grid map probabiliste: les rayons libèrent les cellules traversées et marquent l’impact occupé. Régler le pas, puis exporter la carte.
3. Produire les segments avec l’extraction Split-and-Merge et régler les seuils. L’atelier V2 mesure l’angle non orienté (0° parallèle), l’écart latéral et le trou longitudinal, fusionne les segments compatibles et calcule les intersections. Une coupe exige un point intérieur au segment cible; à égalité à `1e-6 m` près, elle garde le côté du premier point. Exporte les segments fusionnés ou le CSV des coupes.
4. Comparer les trois localisateurs disponibles: occupation, carte vectorielle et ICP scan-à-scan. Garder les mêmes scans et la même pose initiale. La réussite est calculée séparément sur les seuils configurables de position (5 cm par défaut) et d’angle (2°); l’erreur position, l’erreur angle et le temps sont affichés et exportables.
5. Lancer le parcours cartographique incrémental hors ligne, puis vérifier visuellement les raccords, la dérive et les parties non couvertes avant les exports PNG, grid, vectoriel et CSV.
6. Expliquer les choix de résolution, probabilités, seuils et erreurs. Utiliser [PLAN_TP.md](PLAN_TP.md) comme matrice de couverture, puis compléter le rapport à partir des mesures réelles.

**Enregistrer projet JSON** conserve les points de tous les scans, leurs poses, la visibilité et les réglages; **Ouvrir projet JSON** recharge cette séance sans les CSV sources. **Exporter le brouillon Markdown** prépare le compte rendu avec les paramètres et résultats affichés, et laisse à compléter les mesures terrain, leur provenance et la conclusion personnelle.

## Fichiers

- `index.html`: interface V2, capture CSV USB via Web Serial, cartographie et localisation.
- `geometry.js`: extraction Split-and-Merge et opérations géométriques 2D réutilisables, alignées sur les règles du TP.
- `PLAN_TP.md`: exigences, méthodes, conventions, tolérances et limites connues.

## Limites à lever avec le matériel et les données du groupe

La capture directe de la v2 reçoit le CSV produit par le sketch Arduino/Teensy; elle ne décode pas les trames binaires brutes du LD06. Elle ne commande pas les moteurs, et sa chaîne ICP est un recalage incrémental hors ligne sans optimisation de graphe. La carte complète d’une salle nécessite des prises de scans qui la couvrent réellement. Les comparaisons ne constituent pas des résultats expérimentaux tant qu’elles ne sont pas exécutées sur les données du TP avec une référence de pose indépendante.
