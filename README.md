# Lidar Lab (prototype)

Application locale, sans installation ni serveur, pour afficher et assembler visuellement plusieurs scans LiDAR, gérer leurs poses et évaluer leur recouvrement.

## Lancer

Ouvrir `index.html` dans un navigateur récent, puis charger au moins deux CSV de scans. Les fichiers restent dans le navigateur; aucune donnée n’est envoyée en ligne.

Formats de scans pris en charge (délimiteurs virgule ou point-virgule; décimales point, et virgule pour les fichiers séparés par point-virgule) :

- Projet LD06 : `angle_deg,distance_mm,intensity`.
- RobotControl : `angle_deg,distance_m,intensity`.
- MapTool : `angle_deg,r_m,x_rel_m,y_rel_m`.
- `printScanCSV` : `N,Angle,Distance,Intensity,x,y`.

Un fichier de poses JSON du projet peut être chargé. Pour le scan sélectionné, le bouton « Utiliser pose connue » reprend sa pose `[x_m, y_m, theta_deg]`.

## Utilisation

1. Charger autant de scans que nécessaire et cocher ceux à afficher.
2. Cliquer sur une ligne pour sélectionner le scan à manipuler; régler x, y et θ dans les champs.
3. La vue par défaut est la grid map probabiliste, avec un pas initial de 5 cm réglable. Chaque rayon met à jour en log-odds les cellules traversées comme libres et la cellule d’impact comme occupée; les valeurs sont bornées pour éviter une certitude infinie. Le fond non observé reste inconnu. Le ray tracing utilise Bresenham. Le sélecteur permet aussi d’afficher le nuage ou les segments extraits.
   Les seuils de distance entre points, longueur minimale et erreur de droite sont réglables; « Exporter vector_map.txt » écrit les segments retenus sous la forme `x1,y1,x2,y2`.
4. Sur le graphique, glisser avec le bouton gauche pour déplacer le scan actif. Clic droit + glisser (ou Maj + glisser) le fait tourner.
5. Zoomer avec la molette; déplacer la vue avec le bouton central de la souris. « Recadrer » réinitialise le zoom et centre à nouveau tous les scans visibles.
6. Les boutons « Annuler » et « Rétablir » restaurent les poses précédentes (jusqu’à 50 opérations).
7. Choisir une référence et un scan cible; « Auto-aligner (ICP) » affine la pose du scan cible à partir de la pose actuelle. Le scan doit être placé à proximité de la bonne solution pour éviter un mauvais minimum local.
   « Recherche exhaustive Grid » retire temporairement le scan cible de la carte et recherche sa pose dans la fenêtre et avec le pas réglés dans les champs. Les autres scans visibles forment la grid map de référence, puis un raffinement local améliore le résultat.
   « Localiser sur carte vectorielle » fait la recherche avec les mêmes réglages en minimisant les distances point-segment vers les segments extraits des autres scans visibles.
   « Comparer les méthodes » exécute ces deux recherches et l’ICP depuis la même pose initiale, affiche leurs poses et temps, puis permet d’appliquer un résultat ou d’exporter `comparaison_localisation.csv`. Si des poses de référence sont chargées, l’écart position/angle est aussi affiché. Les résidus diffèrent selon le type de référence; ce tableau est un diagnostic, pas un classement direct des scores.
8. « Aligner tous les scans » parcourt les scans visibles dans l’ordre de chargement et tente de les raccorder au nuage déjà assemblé, à partir de la pose initiale de chacun. C’est un recalage en chaîne, pas une optimisation globale de graphe; contrôlez les poses obtenues.
9. « Évaluer vs référence » rapporte le recouvrement après alignement.
10. « Fusionner / exporter CSV » produit un nuage combiné des scans visibles dans le repère carte, avec coordonnées et intensité.
11. « Exporter la carte en PNG » enregistre l’image de la superposition affichée. « Exporter grid_map.csv » produit une matrice du haut vers le bas avec l’origine et le pas en commentaire; les valeurs sont `-1` inconnu, `0` libre et `1` occupé. C’est un format pédagogique à trois états; convertissez-le en 0/1 pour les outils qui n’acceptent que le binaire.
12. Exporter `experience_lidar.json` pour conserver les poses, la visibilité, les résultats affichés, la résolution de grille et les seuils de segmentation.
13. « Exporter poses.json » écrit les poses au format `{nom_scan: [x_m, y_m, theta_deg]}`, réutilisable par le projet `TP-cartographie`.
14. « Ouvrir expérience » recharge les poses et la visibilité depuis un export précédent; il faut d’abord charger les mêmes scans CSV.

Le score est la distance quadratique moyenne de chaque point du scan cible transformé à son point le plus proche dans la référence transformée. Le taux indique la part des points sous le seuil choisi. Ces indicateurs sont pédagogiques : ils ne prouvent pas à eux seuls qu’une pose est correcte et peuvent être trompés par une géométrie répétitive ou des objets mobiles.

## Limites connues du MVP

- Alignement automatique ICP par scan; Gauss-Newton et les autres méthodes seront ajoutés ensuite.
- La pose est fournie par l’utilisateur ou reprise d’un JSON; pas d’estimation automatique pour l’instant.
- Pas encore de chargement de grid map ni de carte vectorielle.
- Le manifeste conserve les noms de fichiers et les paramètres/résultats, mais pas les données CSV complètes.
- L’application ne commande pas le robot et ne modifie aucun fichier source.
