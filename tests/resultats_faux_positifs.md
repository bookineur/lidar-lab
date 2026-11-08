# Faux positifs de la localisation sur carte cumulée — test de cohérence avec l’espace libre

Scans LD06 **simulés** (lancer de rayons, graines fixes), produits par `tests/corpus_faux_positifs.js`. Ce ne sont pas des mesures du robot.

## Protocole annoncé avant la mesure

- Six scénarios : salle meublée, salle symétrique, symétrie centrale (robot retourné de 180°), autre pièce sans mur commun (doit être refusé), bras étroit d’une salle en L, deux pièces. 100 graines par scénario.
- **Réglage** : graines 1 à 100. **Évaluation** : graines 101 à 200, non utilisées pour le réglage.
- Une pose acceptée est **bonne** si elle est à moins de 10 cm et 2° de la vérité ; sinon c’est un **faux positif**. Pour « autre pièce », toute acceptation est un faux positif.
- Grille testée : maxFreeHit et maxWallCross dans {0,02 ; 0,05 ; 0,1 ; 0,15 ; 0,2 ; 0,3 ; ∞}.
- **Règle de choix** : garder les couples à 0 faux positif, puis celui qui accepte le plus de bonnes poses ; à égalité, le moins strict.

## Résultat du réglage (600 cas, 383 s)

**Aucun couple de seuils n’atteint 0 faux positif.** La règle ne désigne donc pas de seuil : le test reste **désactivé par défaut** (`ASSEMBLY_DEFAULTS.freeSpace = null`). Le critère de réussite de l’étape 2 n’est pas atteint.

Minimum de la grille : 189 faux positifs, contre 251 sans le test.

### Par scénario : bonnes poses / faux positifs / refus (100 cas chacun)

| Scénario | sans test | maxFreeHit 0,05 | maxFreeHit 0,1 | maxFreeHit 0,15 |
|---|---|---|---|---|
| salle_meublee | 99 / 1 / 0 | 100 / 0 / 0 | 100 / 0 / 0 | 100 / 0 / 0 |
| salle_symetrique | 0 / 87 / 13 | 0 / 87 / 13 | 0 / 87 / 13 | 0 / 87 / 13 |
| symetrie_centrale | 0 / 100 / 0 | 0 / 100 / 0 | 0 / 100 / 0 | 0 / 100 / 0 |
| autre_piece | 0 / 2 / 98 | 0 / 0 / 100 | 0 / 0 / 100 | 0 / 0 / 100 |
| salle_L_bras | 5 / 61 / 34 | 75 / 3 / 22 | 74 / 2 / 24 | 73 / 3 / 24 |
| deux_pieces | 100 / 0 / 0 | 100 / 0 / 0 | 100 / 0 / 0 | 100 / 0 / 0 |

*(maxWallCross n’apporte presque rien en plus : avec 0,05 en plus de maxFreeHit 0,1, les chiffres sont identiques.)*

## Interprétation

- Le test d’espace libre **corrige les faux positifs dus à une géométrie seulement ressemblante** : bras étroit du L (61 → 2), autre pièce (2 → 0), salle meublée (1 → 0). Il augmente aussi le nombre de bonnes poses (L : 5 → 74), car une fausse pose ne bloque plus la bonne dans le test d’ambiguïté.
- Il **ne peut pas** corriger les salles **parfaitement symétriques**. Depuis la pose fausse, le scan est physiquement identique et ne contredit aucune cellule libre. Le défaut est ailleurs : le test d’ambiguïté compare des coûts *relatifs*, or deux poses équivalentes ont des coûts minuscules (environ 0,001 à 0,002 m²) dont l’écart relatif dépasse facilement 8 %.
- Une salle réelle parfaitement symétrique est rare (meubles, portes), mais une salle presque rectangulaire et vide l’est beaucoup moins. C’est sans doute la cause de la divergence à 90° observée sur la séance du 04/11.

## Grille complète (réglage)

| maxFreeHit | maxWallCross | bonnes | faux positifs | refus |
|---|---|---|---|---|
| 0.02 | 0.02 | 273 | 202 | 125 |
| 0.02 | 0.05 | 275 | 191 | 134 |
| 0.02 | 0.1 | 275 | 190 | 135 |
| 0.02 | 0.15 | 275 | 190 | 135 |
| 0.02 | 0.2 | 275 | 190 | 135 |
| 0.02 | 0.3 | 275 | 190 | 135 |
| 0.02 | ∞ | 275 | 190 | 135 |
| 0.05 | 0.02 | 273 | 200 | 127 |
| 0.05 | 0.05 | 275 | 190 | 135 |
| 0.05 | 0.1 | 275 | 190 | 135 |
| 0.05 | 0.15 | 275 | 190 | 135 |
| 0.05 | 0.2 | 275 | 190 | 135 |
| 0.05 | 0.3 | 275 | 190 | 135 |
| 0.05 | ∞ | 275 | 190 | 135 |
| 0.1 | 0.02 | 272 | 199 | 129 |
| 0.1 | 0.05 | 274 | 189 | 137 |
| 0.1 | 0.1 | 274 | 189 | 137 |
| 0.1 | 0.15 | 274 | 189 | 137 |
| 0.1 | 0.2 | 274 | 189 | 137 |
| 0.1 | 0.3 | 274 | 189 | 137 |
| 0.1 | ∞ | 274 | 189 | 137 |
| 0.15 | 0.02 | 271 | 200 | 129 |
| 0.15 | 0.05 | 273 | 190 | 137 |
| 0.15 | 0.1 | 273 | 190 | 137 |
| 0.15 | 0.15 | 273 | 190 | 137 |
| 0.15 | 0.2 | 273 | 190 | 137 |
| 0.15 | 0.3 | 273 | 190 | 137 |
| 0.15 | ∞ | 273 | 190 | 137 |
| 0.2 | 0.02 | 264 | 215 | 121 |
| 0.2 | 0.05 | 263 | 220 | 117 |
| 0.2 | 0.1 | 262 | 224 | 114 |
| 0.2 | 0.15 | 262 | 224 | 114 |
| 0.2 | 0.2 | 262 | 224 | 114 |
| 0.2 | 0.3 | 262 | 224 | 114 |
| 0.2 | ∞ | 262 | 224 | 114 |
| 0.3 | 0.02 | 206 | 260 | 134 |
| 0.3 | 0.05 | 207 | 273 | 120 |
| 0.3 | 0.1 | 206 | 277 | 117 |
| 0.3 | 0.15 | 206 | 277 | 117 |
| 0.3 | 0.2 | 206 | 277 | 117 |
| 0.3 | 0.3 | 206 | 277 | 117 |
| 0.3 | ∞ | 206 | 277 | 117 |
| ∞ | 0.02 | 204 | 274 | 122 |
| ∞ | 0.05 | 205 | 256 | 139 |
| ∞ | 0.1 | 204 | 251 | 145 |
| ∞ | 0.15 | 204 | 251 | 145 |
| ∞ | 0.2 | 204 | 251 | 145 |
| ∞ | 0.3 | 204 | 251 | 145 |
| ∞ | ∞ | 204 | 251 | 145 |

Les graines d’évaluation 101 à 200 n’ont pas encore été utilisées.
