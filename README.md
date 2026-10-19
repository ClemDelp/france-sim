# France·Sim

Un simulateur ludique de l’économie française, pour comprendre comment marche vraiment un pays :
d’où vient l’argent public, où il va, qui détient la dette, pourquoi l’énergie est partout,
et ce que changent vraiment des idées qui paraissent simples (« taxons les riches », « annulons la dette »,
« zéro immigration », « la retraite à 60 ans »…).

C’est un **simulateur pédagogique** : il montre des mécanismes justes et des ordres de grandeur, pas des prévisions.

## Jouer

```bash
npm install
npm run dev
```

- **Leviers** (à gauche) : impôts, dépenses, Sécurité sociale, travail et population, énergie, commerce, dette et monnaie.
  On bouge, on voit l’effet estimé l’an prochain, puis on avance d’un an, de 5, de 10, ou jusqu’en 2075.
  Au-delà de 2040, les courbes sont grisées : ce sont des tendances, pas des prévisions.
- **Carte des flux** : l’argent qui circule entre ménages, entreprises, État, Sécu, banques, Banque de France,
  énergie importée et reste du monde.
- **Le monde réagit** : choc d’Ormuz, crise financière, pandémie, récession, hausse des taux de la BCE.
- **Idées reçues** : 16 idées testées sur 10 ans, avec « ce qui se passe vraiment » à 2 ans et à 10 ans,
  et ce que le modèle ne capte pas. Lien direct : `#idee=tax-rich`, `#idee=cancel-foreign`, etc.
- **Onglets** : qui gagne et qui perd (5 tranches de revenu, pauvreté, Gini, espérance de vie), courbes sur toute la partie,
  budget et Sécu par branche, dette et ses détenteurs, énergie et commerce, journal de la partie.
  Les montants sont en euros de 2025 (inflation retirée).
- **🧠 Le modèle** : le graphe de toutes les interactions (75 variables, plus de 150 liens), ce qui fait bouger chaque indicateur
  dans votre partie, et les 274 paramètres avec leur source et leur fiabilité. On peut essayer d’autres valeurs :
  toute la partie se recalcule. Un clic sur un indicateur ouvre directement ce qui le fait bouger.

## Un modèle ouvert

Toutes les hypothèses sont dans des fichiers CSV du dossier [`modele/`](modele/), lisibles et modifiables dans un tableur,
avec une source et un degré de fiabilité (mesuré, estimé, hypothèse) pour chaque valeur.
Voir [CONTRIBUER.md](CONTRIBUER.md) pour proposer une correction, et [docs/COMMENT-CA-MARCHE.md](docs/COMMENT-CA-MARCHE.md)
pour comprendre le fonctionnement avec des schémas (architecture, boucle annuelle, flux d’argent, graphe des causes).

## Le moteur (`src/model/`)

Un modèle annuel **stock-flux cohérent** : chaque euro versé par un acteur est reçu par un autre,
et la somme des soldes de tous les acteurs est nulle chaque année (testé).

- Ménages en 5 tranches (20 % les plus modestes → 10 % les plus riches) : salaires, revenus du capital,
  transferts, impôts, consommation, épargne, patrimoine ; pauvreté et Gini reconstitués par tranche.
- Entreprises, banques (crédit, fonds propres, rationnement), État et Sécu, Banque de France, reste du monde.
- Dette par détenteur (étrangers, BCE, assurance-vie, banques), taux qui dépend de la confiance, défaut et sa mémoire.
- Prix et salaires : l’inflation peut venir de l’énergie, des droits de douane, de la TVA ou d’une économie en surchauffe ;
  les salaires suivent la productivité et le chômage plus que les prix.
- Démographie : actifs, retraités, espérance de vie (santé, prévention, pauvreté), âge de départ, immigration.
- Énergie : prix du pétrole, part du fossile, électrification, part du nucléaire, facture importée.

Les valeurs de 2025 et les comportements sont lus dans `modele/*.csv` (`params.ts`), jamais écrits en dur dans le moteur.

Calage 2025 : INSEE (comptes nationaux base 2020, comptes distribués, pauvreté), DREES, COR, Banque de France,
Agence France Trésor, SDES, LFSS 2026. La pauvreté de départ est un peu sous-estimée (≈ 13 % contre 15,4 %).

## Tests

```bash
npm test
```

Bouclage comptable chaque année, calage 2025, les grands mécanismes (redistribution, annulation de dette selon le détenteur,
retraite à 60 ans, immigration, politiques extrêmes qui restent numériquement stables), stabilité jusqu’en 2075,
et cohérence des fichiers du modèle (chaque paramètre utilisé, chaque lien du graphe valide).

## Limites connues

Voir la fin de [docs/COMMENT-CA-MARCHE.md](docs/COMMENT-CA-MARCHE.md#8-ce-que-le-modèle-ne-sait-pas-faire-limites-connues).
