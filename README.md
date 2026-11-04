# Lidar Lab (prototype)

Application locale, sans installation ni serveur, pour afficher et assembler visuellement plusieurs scans LiDAR, gérer leurs poses et évaluer leur recouvrement.

## Lancer

Pour l’usage hors ligne, ouvrir `index.html` dans un navigateur récent et charger des CSV. Pour la capture USB LD06, servir ce dossier sur `http://localhost` (ex. `python -m http.server 8000`) et utiliser Chrome ou Edge. Pour une ESP32, utiliser `C:\Users\HP\TP-cartographie\arduino\ESP32_LD06_CSV_intensite\ESP32_LD06_CSV_intensite.ino` (Serial2, RX GPIO33, PWM GPIO32); `LD06_capture.ino` convient au câblage Serial1 correspondant. La sortie doit être CSV `printScanCSV`, pas Teleplot. Brancher la carte, cliquer « Connecter au robot » une fois et autoriser le port série à 921600 bauds. À chaque position, immobiliser le robot et observer l’aperçu en direct puis cliquer « Capturer le scan affiché »; l’option activée ancre le premier scan à l’origine puis recale les suivants sur la carte cumulée. Si une grid map est déjà chargée, elle localise le premier scan. Sélectionner une ligne et cliquer « Exporter le CSV brut du scan sélectionné » pour enregistrer sa mesure originale; déconnecter après le relevé. Les fichiers restent dans le navigateur; aucune donnée n’est envoyée en ligne.

Formats de scans pris en charge (délimiteurs virgule ou point-virgule; décimales point, et virgule pour les fichiers séparés par point-virgule) :

- Projet LD06 : `angle_deg,distance_mm,intensity`.
- RobotControl : `angle_deg,distance_m,intensity`.
- MapTool : `angle_deg,r_m,x_rel_m,y_rel_m`.
- `printScanCSV` : `N,Angle,Distance,Intensity,x,y`.
- Nuage fusionné cartésien : colonnes `x_m,y_m` (par exemple `scans_fusionnes.csv`).

Un fichier de poses JSON du projet peut être chargé. Pour le scan sélectionné, le bouton « Utiliser pose connue » reprend sa pose `[x_m, y_m, theta_deg]`.

## Connexion Wi-Fi sans câble

Le sketch ESP32_robot_wifi_v2.ino crée le point d’accès Robot-LiDAR (mot de passe lidar2026) à l’adresse http://192.168.4.1. Il expose le dernier tour complet via GET /scan avec un identifiant de scan et l’en-tête CORS attendu par l’application.

1. Téléverser ce sketch sur l’ESP32 qui reçoit le LD06, puis connecter le PC au Wi-Fi Robot-LiDAR.
2. Lancer Lidar Lab sur http://localhost dans Chrome ou Edge. Garder le port de l’application sur localhost : le navigateur exige un contexte sécurisé pour contacter les appareils du réseau local.
3. Dans « Connexion Wi-Fi au robot ESP32 », garder http://192.168.4.1 ou saisir l’adresse du robot si le sketch utilise une autre adresse; cliquer « Connecter en Wi-Fi » et autoriser le réseau local si le navigateur le demande.
4. L’aperçu se rafraîchit par lecture HTTP des nouveaux tours. Capturer le tour affiché pour estimer la pose et l’ajouter à la carte cumulée, comme en USB. La liaison Wi-Fi de Lidar Lab reçoit les mesures; elle ne pilote pas les moteurs depuis cette page.

## Relevé incrémental et méthode SLAM

Le flux d’utilisation est « observer → capturer → recaler → intégrer → déplacer un peu → recommencer ». L’aperçu USB est actualisé à chaque tour CSV complet du LiDAR; le blanc identifie le tour affiché, qui n’est pas encore ajouté à la carte. Le bouton capture ce tour sans attendre le suivant. Si la forme n’est pas stable ou lisible, attendre le prochain tour avant de cliquer.

Le premier scan devient le repère local (x=0, y=0, θ=0°). Pour chaque scan suivant, l’application cherche sa pose sur la grid map formée par les scans déjà intégrés. Elle compare les points transformés aux cellules occupées, mesure le recouvrement et rejette une pose si le recouvrement minimal n’est pas atteint ou si une autre pose est presque aussi bonne. Un scan accepté ajoute ses retours à la carte; un scan refusé reste hors carte afin d’éviter de propager une pose incertaine. Continuer par petits déplacements avec des murs déjà cartographiés visibles dans le scan.

C’est une **construction incrémentale de carte avec scan matching LiDAR** et une démonstration pédagogique d’une partie du SLAM 2D. Ce n’est pas une implémentation complète de Cartographer : la V1 ne possède ni odométrie codeur/IMU, ni graphe de poses, ni fermeture de boucle, ni optimisation qui corrige rétroactivement toute la trajectoire. Les poses sont relatives au premier scan et le drift peut donc s’accumuler. Cette distinction correspond à l’architecture décrite par Cartographer : scan matching local contre des sous-cartes, puis graphe global et contraintes de fermeture de boucle pour corriger la dérive ([article Google Cartographer](https://research.google/pubs/real-time-loop-closure-in-2d-lidar-slam/), [documentation du scan matcher 2D](https://google-cartographer.github.io/cartographer/configuration_files/trajectory_builder_2d.html)).

### Essai avec le robot

1. Démarrer la V1 sur localhost dans Chrome ou Edge; téléverser le sketch ESP32 qui envoie le CSV `printScanCSV`; fermer le moniteur série Arduino.
2. Connecter le port série. Attendre l’aperçu blanc d’un tour complet; tourner le robot sur place ou le déplacer un peu pour reconnaître la salle.
3. Capturer le premier scan pour fixer l’origine. Le résultat donne un repère local, pas la position absolue dans le bâtiment.
4. Déplacer le robot d’une petite distance en gardant des murs communs, attendre que le nouveau contour se stabilise, puis capturer. Vérifier la pose X/Y/θ et l’alignement avant de poursuivre.
5. Si le recalage est refusé, ne pas forcer l’intégration automatique : rapprocher le robot d’une zone déjà vue ou saisir une pose mesurée; un espace sans mur commun ne permet pas d’estimer le déplacement par LiDAR seul.
6. Répéter jusqu’à couvrir la salle. Exporter la grid map et les poses pour conserver le résultat. Une vraie validation de SLAM nécessitera de comparer les poses et la carte à des mesures terrain indépendantes.

## Utilisation

1. Charger jusqu’à 50 scans par session, par fichiers CSV ou par capture USB avec l’esquisse `LD06_capture`; la capture directe reçoit le CSV texte du sketch et ne décode pas le flux binaire brut LD06. Cocher les scans à afficher. Un CSV de grid map se charge dans le champ séparé « Grid map CSV »; il s’affiche dans la vue Grid sans être interprété comme un scan à `0 pts`. Les fichiers MapTool avec `origin=(x,y)` et `cell=...` sont reconnus. Les CSV de nuage fusionné avec `x_m,y_m` sont aussi acceptés comme points cartésiens.
2. Cliquer sur une ligne pour sélectionner le scan à manipuler; régler x, y et θ dans les champs.
3. La vue par défaut est la grid map probabiliste, avec un pas initial de 5 cm réglable. Chaque rayon met à jour en log-odds les cellules traversées comme libres et la cellule d’impact comme occupée; les valeurs sont bornées pour éviter une certitude infinie. Le fond non observé reste inconnu. Le ray tracing utilise Bresenham. Le sélecteur permet aussi d’afficher le nuage ou les segments extraits.
   Les seuils de distance entre points, longueur minimale et erreur de droite sont réglables; « Exporter vector_map.txt » écrit les segments retenus sous la forme `x1,y1,x2,y2`.
4. Sur le graphique, glisser avec le bouton gauche pour déplacer le scan actif. Clic droit + glisser (ou Maj + glisser) le fait tourner.
5. Zoomer avec la molette; déplacer la vue avec le bouton central de la souris. « Recadrer » réinitialise le zoom et centre à nouveau tous les scans visibles.
6. Les boutons « Annuler » et « Rétablir » restaurent les poses précédentes (jusqu’à 50 opérations).
7. Pour une localisation sans pose initiale, charger la grid map via « Grid map CSV », puis un scan brut LiDAR (angles/distances) et cliquer « Localiser automatiquement sur la grid map ». La recherche globale essaie les positions et orientations sur toute la carte, puis affine le meilleur candidat. La pose estimée X/Y/θ est appliquée au scan et affichée avec une erreur moyenne et un indicateur de qualité; une carte symétrique peut produire plusieurs poses ambiguës. Si le CSV de carte ne fournit pas son origine, régler Origine X/Y avant la localisation.
   Pour un relevé de salle incrémental, ancrer le premier scan à (0,0,0°), puis sélectionner chaque scan suivant et cliquer « Localiser sur la carte cumulée ». L’application recale ce scan sur les précédents intégrés; la grid map se construit au fur et à mesure. La pose est relative au premier scan, et non à un repère géographique absolu. Le nettoyage règle portée et intensité. Le filtre temporel garde le scan initial intact et masque les retours isolés des scans suivants; les zones nouvelles demandent un scan de confirmation. L’intensité n’identifie pas à elle seule une personne; calibre le seuil avec tes mesures. Le recalage est accepté si au moins « Recouvrement min » (35 % par défaut) des points du scan tombent à moins de 10 cm (ou 2 cellules) d’un mur déjà cartographié et si aucune autre pose ne donne un score proche : une personne ou une zone nouvelle ne fait donc plus refuser le scan. La carte qui sert de référence au recalage contient aussi les murs vus une seule fois (non encore confirmés), sinon le scan suivant ne pourrait jamais les confirmer; la carte affichée et exportée garde, elle, le filtre temporel. Si le recouvrement est trop faible ou plusieurs poses se ressemblent, le scan est refusé et masqué; prends un scan intermédiaire avec des murs déjà cartographiés pour éviter de déformer la carte. Sans aucun mur commun (autre pièce, couloir aveugle), aucun recalage automatique n’est possible : place le scan à la main (pose mesurée ou odométrie), puis « Intégrer à la pose saisie (sans recalage) »; les scans suivants de cette zone se recalent ensuite dessus. Un CSV sans colonne d’intensité (Teleplot, MapTool) n’est pas filtré par le seuil d’intensité.
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

## Tests automatisés (simulation)

Les calculs (lecture CSV, filtres portée/intensité, filtre temporel, grid map, localisation) sont dans `lidar_core.js`, chargé par `index.html`. Les tests pilotent le vrai `index.html` dans Node avec un DOM simulé et des scans LD06 **synthétiques** (lancer de rayons, graine fixe) : ce ne sont pas des mesures du robot.

```bash
node --test "tests/*.test.js"
node tests/rapport_simulation.js
```

Le second script compare la V1.0 archivée (`anciennes_versions/index_v1.0_e37950a.html`) et la version actuelle et écrit `tests/resultats_simulation.md`. Des scans simulés prêts à charger sont dans `tests/donnees_simulees/` (préfixe `SIM_`). `tests/v1_usb_capture.test.js` vérifie l’aperçu et la capture USB avec un **faux port série**, ainsi que la lecture Wi-Fi de `/scan` avec une réponse HTTP simulée. Les simulations testent le logiciel, pas le réseau du robot, le câble, la carte ni le LD06 réels.

## Limites

- La capture directe est prévue pour une carte avec le sketch CSV `LD06_capture`; le navigateur ne décode pas le protocole binaire LD06 via adaptateur USB-UART.
- Le flux série donne un aperçu à chaque tour; le recalage et l’ajout à la carte se font à la demande, lorsque l’utilisateur capture. Il n’y a pas de commande moteur ni d’odométrie intégrée.
- La qualité doit être validée avec des poses terrain indépendantes; les zones symétriques, les obstacles mobiles, l’origine de grille et le mouvement pendant un tour LiDAR peuvent fausser l’estimation.
- Le filtre temporel garde le scan initial intact : une personne présente dans ce scan reste dans la carte. Une personne immobile au même endroit dans deux scans est confirmée comme un mur.
- Sans mur commun avec la carte, la localisation globale ne peut pas savoir où est le robot : le scan est refusé (ou, si une autre pièce ressemble à une pièce déjà cartographiée, il pourrait être mal placé); il faut alors saisir la pose.
- L’application ne commande pas le robot.
