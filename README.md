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
  On bouge, on voit l’effet estimé l’an prochain, puis on avance d’un an ou de cinq.
- **Carte des flux** : l’argent qui circule entre ménages, entreprises, État, Sécu, banques, Banque de France,
  énergie importée et reste du monde.
- **Le monde réagit** : choc d’Ormuz, crise financière, pandémie, récession, hausse des taux de la BCE.
- **Idées reçues** : 16 idées testées sur 10 ans, avec « ce qui se passe vraiment » à 2 ans et à 10 ans,
  et ce que le modèle ne capte pas. Lien direct : `#idee=tax-rich`, `#idee=cancel-foreign`, etc.
- **Onglets** : qui gagne et qui perd (5 tranches de revenu, pauvreté, Gini, espérance de vie), budget et Sécu par branche,
  dette et ses détenteurs, énergie et commerce, journal de la partie.

## Le modèle (`src/model/`)

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

Calage 2025 : INSEE (comptes nationaux base 2020, comptes distribués, pauvreté), DREES, COR, Banque de France,
Agence France Trésor, SDES, LFSS 2026. La pauvreté de départ est un peu sous-estimée (≈ 13 % contre 15,4 %).

## Tests

```bash
npm test
```

Bouclage comptable chaque année, calage 2025, et les grands mécanismes (redistribution, annulation de dette selon le détenteur,
retraite à 60 ans, immigration, politiques extrêmes qui restent numériquement stables).
