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

---

# Étape 3 — ambiguïté jugée aussi sur le recouvrement

## Règle annoncée avant la mesure

Un candidat rival éloigné (> 0,6 m ou > 0,4 rad du meilleur) rend la pose **ambiguë** si son recouvrement est ≥ p − 2·√(p(1−p)/N), avec p le recouvrement du meilleur (borné à [0,05 ; 0,95]) et N le nombre de points comparés : un intervalle à 95 % d’une proportion, sans paramètre réglé. Ce critère s’ajoute à l’ancien (écart de coût relatif < 8 %). Il est actif seulement dans l’assemblage du bouton ; l’Auto-SLAM et le robot sont inchangés.

## Réglage (graines 1–100, 600 cas) avec ce critère

La règle (0 faux positif, puis le plus de bonnes poses, puis le moins strict) désigne **maxFreeHit = 0.05, maxWallCross = ∞** : 220 bonnes poses, **0 faux positif**, 380 refus.

## Évaluation sur les graines 101–200 (jamais utilisées pour le réglage)

| Configuration | Bonnes poses | Faux positifs | Refus | Salle en L (bonnes / FP / refus) |
|---|---|---|---|---|
| étape 1 (aucun) | 204 | **255** | 141 | 4 / 63 / 33 |
| ambiguïté seule | 200 | **48** | 352 | 0 / 47 / 53 |
| espace libre seul 5 % | 277 | **193** | 130 | 77 / 1 / 22 |
| les deux | 215 | **2** | 383 | 15 / 1 / 84 |

Le critère de réussite « 0 faux positif » **n’est pas atteint** : 2 faux positifs sur 600 avec les deux tests (1 salle en L, 1 symétrie centrale).

## Jeux de données indépendants

| Jeu | Configuration | Résultat |
|---|---|---|
| `repetition_tp2` (simulé, `verite.json`) | étape 1 | 1 bonne pose, **14 faux positifs**, 0 refus |
| | ambiguïté seule | **15 bonnes poses, 0 faux positif**, 0 refus (erreur médiane 1,2 cm) |
| | espace libre seul | 13 bonnes, 2 faux positifs |
| | les deux | 15 bonnes, 0 faux positif |
| Séance réelle du 04/11 (40 scans, sans vérité terrain) | étape 1 | 40 placés ; écart médian 4,3 cm avec l’Auto-SLAM, mais **9 scans à 90°** |
| | ambiguïté seule | 37 placés, 3 refusés (38–40) ; **31 des 32 scans comparables à moins de 10 cm** de l’Auto-SLAM ; **0 à 90°** ; scan 28 à 4,1 m (l’Auto-SLAM l’avait accepté avec 53 % de recouvrement) |
| | les deux | 34 placés ; les scans 7 et 8 sautent de 3,8 m alors que les scans 6 et 9, pris quelques secondes avant et après, restent d’accord avec l’Auto-SLAM : **physiquement impossible** |

## Décision et justification

- **Activé par défaut dans l’assemblage : l’ambiguïté sur le recouvrement** (`overlapAmbiguity: true`). Ce critère ne peut qu’**ajouter des refus**, jamais faire accepter une autre pose (vérifié par le test A14). Il ne peut donc pas créer de faux positif par rapport à l’étape 1.
- **Désactivé par défaut : le test d’espace libre** (`freeSpace: null`, seuils documentés). Il **change le candidat retenu** : quand la bonne pose est écartée, une fausse peut gagner. Sur la séance réelle, il produit des sauts de 3,8 m. Les défauts réels du LD06 (vitres, personnes, bords) mettent sans doute plus de 5 % des points de la bonne pose dans du « vide », ce que la simulation ne reproduit pas.
- **Limite restante** : bras étroit d’une salle en L (47 faux positifs sur 100 graines avec l’ambiguïté seule) — test A7b laissé « à faire ».

Mesures du 08/11/2026. Scans simulés sauf la séance réelle du 04/11.
