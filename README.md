# Lidar Lab (prototype)

Application locale, sans installation ni serveur, pour afficher et assembler visuellement plusieurs scans LiDAR, gérer leurs poses et évaluer leur recouvrement.

## Lancer

Pour l’usage hors ligne, ouvrir `index.html` dans un navigateur récent et charger des CSV. Pour la capture USB LD06, servir ce dossier sur `http://localhost` (ex. `python -m http.server 8000`) et utiliser Chrome ou Edge. Brancher la carte programmée avec `C:\Users\HP\TP-cartographie\arduino\LD06_capture\LD06_capture.ino`, cliquer « Connecter au robot » une fois et autoriser le port série à 921600 bauds. À chaque position, immobiliser le robot et cliquer « Prendre le scan suivant »; l’option activée ancre le premier scan à l’origine puis recale les suivants sur la carte cumulée. Si une grid map est déjà chargée, elle localise le premier scan. Sélectionner une ligne et cliquer « Exporter le CSV brut du scan sélectionné » pour enregistrer sa mesure originale; déconnecter après le relevé. Les fichiers restent dans le navigateur; aucune donnée n’est envoyée en ligne.

Formats de scans pris en charge (délimiteurs virgule ou point-virgule; décimales point, et virgule pour les fichiers séparés par point-virgule) :

- Projet LD06 : `angle_deg,distance_mm,intensity`.
- RobotControl : `angle_deg,distance_m,intensity`.
- MapTool : `angle_deg,r_m,x_rel_m,y_rel_m`.
- `printScanCSV` : `N,Angle,Distance,Intensity,x,y`.
- Nuage fusionné cartésien : colonnes `x_m,y_m` (par exemple `scans_fusionnes.csv`).

Un fichier de poses JSON du projet peut être chargé. Pour le scan sélectionné, le bouton « Utiliser pose connue » reprend sa pose `[x_m, y_m, theta_deg]`.

## Utilisation

1. Charger autant de scans que nécessaire par CSV, ou les capturer par USB (jusqu’à 10 par session) avec l’esquisse `LD06_capture`; la capture directe reçoit le CSV texte du sketch et ne décode pas le flux binaire brut LD06. Cocher les scans à afficher. Un CSV de grid map se charge dans le champ séparé « Grid map CSV »; il s’affiche dans la vue Grid sans être interprété comme un scan à `0 pts`. Les fichiers MapTool avec `origin=(x,y)` et `cell=...` sont reconnus. Les CSV de nuage fusionné avec `x_m,y_m` sont aussi acceptés comme points cartésiens.
2. Cliquer sur une ligne pour sélectionner le scan à manipuler; régler x, y et θ dans les champs.
3. La vue par défaut est la grid map probabiliste, avec un pas initial de 5 cm réglable. Chaque rayon met à jour en log-odds les cellules traversées comme libres et la cellule d’impact comme occupée; les valeurs sont bornées pour éviter une certitude infinie. Le fond non observé reste inconnu. Le ray tracing utilise Bresenham. Le sélecteur permet aussi d’afficher le nuage ou les segments extraits.
   Les seuils de distance entre points, longueur minimale et erreur de droite sont réglables; « Exporter vector_map.txt » écrit les segments retenus sous la forme `x1,y1,x2,y2`.
4. Sur le graphique, glisser avec le bouton gauche pour déplacer le scan actif. Clic droit + glisser (ou Maj + glisser) le fait tourner.
5. Zoomer avec la molette; déplacer la vue avec le bouton central de la souris. « Recadrer » réinitialise le zoom et centre à nouveau tous les scans visibles.
6. Les boutons « Annuler » et « Rétablir » restaurent les poses précédentes (jusqu’à 50 opérations).
7. Pour une localisation sans pose initiale, charger la grid map via « Grid map CSV », puis un scan brut LiDAR (angles/distances) et cliquer « Localiser automatiquement sur la grid map ». La recherche globale essaie les positions et orientations sur toute la carte, puis affine le meilleur candidat. La pose estimée X/Y/θ est appliquée au scan et affichée avec une erreur moyenne et un indicateur de qualité; une carte symétrique peut produire plusieurs poses ambiguës. Si le CSV de carte ne fournit pas son origine, régler Origine X/Y avant la localisation.
   Pour un relevé de salle incrémental, ancrer le premier scan à (0,0,0°), puis sélectionner chaque scan suivant et cliquer « Localiser sur la carte cumulée ». L’application recale ce scan sur les précédents intégrés; la grid map se construit au fur et à mesure. La pose est relative au premier scan, et non à un repère géographique absolu. Le nettoyage règle portée et intensité. Le filtre temporel garde le scan initial intact et masque les retours isolés des scans suivants; les zones nouvelles demandent un scan de confirmation. L’intensité n’identifie pas à elle seule une personne; calibre le seuil avec tes mesures. Si le score est faible ou plusieurs poses se ressemblent, le scan est refusé et masqué; prends un scan intermédiaire avec des murs déjà cartographiés pour éviter de déformer la carte.
   Pour un recalage local, choisir une référence et un scan cible; « Auto-aligner (ICP) » affine la pose du scan cible à partir de la pose actuelle. Le scan doit être placé à proximité de la bonne solution pour éviter un mauvais minimum local.
   « Recherche exhaustive Grid » retire temporairement le scan cible de la carte et recherche sa pose dans la fenêtre et avec le pas réglés dans les champs. Les autres scans visibles forment la grid map de référence, puis un raffinement local améliore le résultat.
   « Localiser sur carte vectorielle » fait la recherche avec les mêmes réglages en minimisant les distances point-segment vers les segments extraits des autres scans visibles.
   « Comparer les méthodes » exécute ces deux recherches et l’ICP depuis la même pose initiale, affiche leurs poses et temps, puis permet d’appliquer un résultat ou d’exporter `comparaison_localisation.csv`. Si des poses de référence sont chargées, l’écart position/angle est aussi affiché. Les résidus diffèrent selon le type de référence; ce tableau est un diagnostic, pas un classement direct des scores.
   « Sensibilité à la pose initiale » lance des essais Grid, vectoriels et ICP appariés aux perturbations 5 cm / 2°, 15 cm / 5° et 25 cm / 8°. Il faut charger une pose de référence et sélectionner un scan de référence différent du scan cible pour l’ICP; le seuil de réussite est 5 cm et 2°. Les essais peuvent être exportés en `sensibilite_localisation.csv`.
8. « Aligner tous les scans » parcourt les scans visibles dans l’ordre de chargement et tente de les raccorder au nuage déjà assemblé, à partir de la pose initiale de chacun. C’est un recalage en chaîne, pas une optimisation globale de graphe; contrôlez les poses obtenues.
9. « Évaluer vs référence » rapporte le recouvrement après alignement.
10. « Fusionner / exporter CSV » produit un nuage combiné des scans visibles dans le repère carte, avec coordonnées et intensité.
11. « Exporter la carte en PNG » enregistre l’image de la superposition affichée. « Exporter grid_map.csv » produit une matrice du haut vers le bas avec l’origine et le pas en commentaire; les valeurs sont `-1` inconnu, `0` libre et `1` occupé. « Exporter grid MapTool (0/1) » écrit la même carte dans le format binaire du MapTool, avec son origine et sa résolution. Les deux formats s’importent ensuite via « Grid map CSV ».
12. Exporter `experience_lidar.json` pour conserver les poses, la visibilité, les résultats affichés, la résolution de grille et les seuils de segmentation.
13. « Exporter poses.json » écrit les poses au format `{nom_scan: [x_m, y_m, theta_deg]}`, réutilisable par le projet `TP-cartographie`.
14. « Ouvrir expérience » recharge les poses et la visibilité depuis un export précédent; il faut d’abord charger les mêmes scans CSV.

Le score est la distance quadratique moyenne de chaque point du scan cible transformé à son point le plus proche dans la référence transformée. Le taux indique la part des points sous le seuil choisi. Ces indicateurs sont pédagogiques : ils ne prouvent pas à eux seuls qu’une pose est correcte et peuvent être trompés par une géométrie répétitive ou des objets mobiles.

## Limites

- La capture directe est prévue pour une carte avec le sketch CSV `LD06_capture`; le navigateur ne décode pas le protocole binaire LD06 via adaptateur USB-UART.
- La localisation globale sur grid map estime une pose pour un scan chargé; elle n’assure pas encore le suivi continu du robot. Les ICP et recalages locaux nécessitent une pose de départ proche.
- La qualité doit être validée avec des poses terrain indépendantes; les zones symétriques, les obstacles mobiles, l’origine de grille et le mouvement pendant un tour LiDAR peuvent fausser l’estimation.
- L’application ne commande pas le robot.
