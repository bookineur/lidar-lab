# Corpus synthétique — trajectoire continue

Ce dossier contient 130 scans générés par simulation logicielle, pas des mesures du robot.

- Ordre : manifest.json, champ scans (scan 001 à 130).
- Scans LD06 : scans/*.csv, angles en degrés, distances en mm, intensité synthétique.
- Vérité terrain : verite.json, poses globales [x_m, y_m, theta_deg]. Pour comparer au repère de la première pose, appliquer T_0^-1 T_i.
- Mouvement entre deux captures consécutives : <= 0,15 m et <= 10°. Rotations sur place incluses.
- Scène : salle avec cloison et porte, corridor en U à murs parallèles et obstacles statiques.
- Bruit simulé : sigma 8 mm; graine déterministe par scan.

La vérité terrain est séparée des CSV pour éviter que l'algorithme de localisation puisse la lire comme une donnée capteur.
