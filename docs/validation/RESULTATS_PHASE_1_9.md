# RÉSULTATS_PHASE_1_9 — À COMPLÉTER APRÈS LES MESURES

**Statut :** en attente des neuf scans, des poses terrain et de leurs incertitudes. Aucun résultat de localisation physique n'est disponible à ce stade.

## Versions et paramètres gelés

| Élément | Valeur |
|---|---|
| Commit Lidar Lab | `c62a2544b717e9e536e74ecfdd099146f4b2e47a` |
| Version/commit TP-cartographie | à relever |
| Paramètres LiDAR Lab | overlap 35 %, ambiguïté active, veto contradiction 14,2 % |
| Filtres communs | à relever et harmoniser |
| SHA-256 des scans | `poses_mesurees.json` |
| Tolérance de comparaison provisoire | 10 cm / 2°, à confirmer avant lecture des résultats |

## Tableau par pose

| ID | Scan | Observable avant test | X vrai ± incertitude | Y vrai ± incertitude | θ vrai ± incertitude | Pose initiale commune | Lidar Lab estimée/statut | TP-cartographie estimée/statut | eXY LL | eθ LL | eXY TP | eθ TP |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|
| P01 | `scan_P01.csv` | à définir | à mesurer | à mesurer | à mesurer | à fixer | en attente | en attente | — | — | — | — |
| P02 | `scan_P02.csv` | à définir | à mesurer | à mesurer | à mesurer | à fixer | en attente | en attente | — | — | — | — |
| P03 | `scan_P03.csv` | à définir | à mesurer | à mesurer | à mesurer | à fixer | en attente | en attente | — | — | — | — |
| P04 | `scan_P04.csv` | à définir | à mesurer | à mesurer | à mesurer | à fixer | en attente | en attente | — | — | — | — |
| P05 | `scan_P05.csv` | à définir | à mesurer | à mesurer | à mesurer | à fixer | en attente | en attente | — | — | — | — |
| P06 | `scan_P06.csv` | à définir | à mesurer | à mesurer | à mesurer | à fixer | en attente | en attente | — | — | — | — |
| P07 | `scan_P07.csv` | à définir | à mesurer | à mesurer | à mesurer | à fixer | en attente | en attente | — | — | — | — |
| P08 | `scan_P08.csv` | à définir | à mesurer | à mesurer | à mesurer | à fixer | en attente | en attente | — | — | — | — |
| P09 | `scan_P09.csv` | à définir | à mesurer | à mesurer | à mesurer | à fixer | en attente | en attente | — | — | — | — |

## Résumé statistique à publier

Pour chaque outil et chaque mode (localisation contre référence commune / assemblage successif), calculer moyenne, médiane, P95 et maximum des erreurs XY et angulaires; précision, rappel, taux de fausses acceptations, taux de refus et temps de calcul. Donner les effectifs et incertitudes; ne pas compter les poses ambiguës comme faux négatifs sans justification d'observabilité.

## Faux placements et intégrité de la carte

| Essai | Scan refusé/incertain | Carte avant/après inchangée ? | Pose du scan suivant identique au témoin ? | Résultat |
|---|---|---|---|---|
| À exécuter | — | — | — | en attente |

## Conclusion

En attente des acquisitions physiques. Ne pas conclure sur la précision réelle avant de renseigner les poses terrain, les incertitudes, les versions des outils et les neuf résultats. La fusion automatique reste non autorisée.
