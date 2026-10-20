# France·Sim

Un simulateur ludique de l’économie française, pour comprendre comment marche vraiment un pays :
d’où vient l’argent public, où il va, qui détient la dette, pourquoi l’énergie est partout,
et ce que changent vraiment des idées qui paraissent simples (« taxons les riches », « annulons la dette »,
« zéro immigration », « la retraite à 60 ans »…).

C’est un **simulateur pédagogique** : il montre des mécanismes justes et des ordres de grandeur, pas des prévisions.

## Documentation

La documentation complète est dans [`docs/`](docs/index.html) : ouvrez `docs/index.html` dans un navigateur.

| Pour… | Page |
| --- | --- |
| Comprendre le modèle en schémas | [Comprendre le modèle](docs/modele.html), [glossaire](docs/glossaire.html) |
| Modifier un paramètre sans coder | [Modifier un paramètre](docs/parametres.html), [tester son changement](docs/tester.html), [catalogue des paramètres](docs/catalogue.html) |
| Développer le jeu | [Guide du développeur](docs/developpeurs.html), [le moteur pas à pas](docs/moteur.html), [recettes](docs/recettes.html) |

Le catalogue et la page « Comprendre le modèle » sont générés à partir de `modele/*.csv` et de `docs/COMMENT-CA-MARCHE.md` : `npm run docs`.

## Jouer

```bash
npm install
npm run dev
```

### Le jeu

- **Accueil** : votre nom de président·e, et cinq façons de jouer (tutoriel, scénarios, partie libre, idées reçues, comprendre le modèle).
- **Visite guidée** : douze étapes qui présentent chaque zone de l’écran.
- **8 scénarios** avec un récit, trois objectifs (une étoile chacun) et une difficulté : *Premier mandat*, *Le choc d’Ormuz*,
  *La France électrique*, *Sauver les retraites*, *Sous l’œil des marchés*, *Zéro pauvreté ?*, *2008 recommence*, *Le grand chelem*.
  Un test vérifie que chacun reste gagnable (et que ne rien faire ne suffit pas).
- **Popularité et élections** : votre popularité suit le climat social ; élection en 2027 puis tous les cinq ans,
  il faut 40 % de popularité pour être réélu. Soirée électorale animée.
- **Vos ministres** commentent chaque décision avant que vous avanciez (comptes, emploi, solidarités, transition, ordre public).
- **Le climat** : réchauffement mondial calculé à partir du CO2 cumulé (GIEC), émissions mondiales (Global Carbon Budget)
  et françaises (Citepa), dégâts en France (richesse, prix, espérance de vie, colère), adaptation, points de bascule,
  et une fin de partie « effondrement ». La France émet 0,8 % du CO2 mondial : elle agit surtout par l’adaptation,
  l’exemple et l’aide aux pays du Sud. Leviers : taxe carbone, adaptation, aide climat.
- **L’immigration** : la pression migratoire vient du monde (guerres, famines, réchauffement) ; vos leviers : immigration légale,
  contrôle et reconduites (efficacité plafonnée, coût croissant), intégration, aide au développement et à la paix.
- **L’influence de la France** : armée, économie, culture, aide, exemplarité climatique et stabilité font son poids dans le monde,
  qui facilite les accords, limite les représailles, aide les exportations et rassure les prêteurs.
- **Pourquoi ?** : chaque événement dit ce qui l’a rendu probable ; la une du journal ouvre une explication de l’année qui mesure
  la part de chaque décision et de chaque événement, et l’effet de leur combinaison.
- **Le monde bouge tout seul** : 24 événements (canicules, méga-feux, inondations, guerres, krachs, pandémies, IA, accords
  climatiques, grèves, scandales…) tirés au sort chaque année, plus fréquents quand la situation s’y prête.
- **Le capital politique** : on ne peut pas tout réformer la même année ; les points dépendent de la popularité.
- **Le modèle économique** : nationaliser ou privatiser, réglementer ou libéraliser, et trois programmes clés en main
  (ultra-libéral, entre-deux actuel, étatiste).
- **L’ambiance suit le pays** : la planète qui brûle (rouge, flammes), la colère (pancartes de manifestants), la panique des marchés.
- **Le Conseil des ministres** : un bandeau flottant qui réagit à chaque décision avant de la prendre.
- **La une du journal** chaque année ; **14 succès** à débloquer ; records d’étoiles gardés dans le navigateur.

### Les outils

- **Leviers** (à gauche) : impôts, dépenses, Sécurité sociale, travail et population, énergie, commerce, dette et monnaie.
  On bouge, on voit l’effet estimé l’an prochain, puis on avance d’un an, de 5, de 10, ou jusqu’en 2075.
  Au-delà de 2040, les courbes sont grisées : ce sont des tendances, pas des prévisions.
- **Carte des flux** : l’argent qui circule entre ménages, entreprises, État, Sécu, banques, Banque de France,
  énergie importée et reste du monde.
- **Le monde réagit** : choc d’Ormuz, crise financière, pandémie, récession, hausse des taux de la BCE.
- **Perdre la partie** : révolte sociale, faillite de l’État, hyperinflation ou dépression. Une crise de la dette met le jeu en pause :
  accepter le plan d’aide européen, le refuser, faire défaut… On peut revenir avant sa dernière décision.
- **Idées reçues** : 16 idées testées sur 10 ans, avec « ce qui se passe vraiment » à 2 ans et à 10 ans,
  et ce que le modèle ne capte pas. Lien direct : `#idee=tax-rich`, `#idee=cancel-foreign`, etc.
- **Onglets** : qui gagne et qui perd (5 tranches de revenu, pauvreté, Gini, espérance de vie), courbes sur toute la partie,
  budget et Sécu par branche, dette et ses détenteurs, énergie et commerce, journal de la partie.
  Les montants sont en euros de 2025 (inflation retirée).
- **🧠 Le modèle** : le graphe de toutes les interactions (85 variables, 200 liens), ce qui fait bouger chaque indicateur
  dans votre partie, et près de 350 paramètres avec leur source et leur fiabilité. On peut essayer d’autres valeurs :
  toute la partie se recalcule. Un clic sur un indicateur ouvre directement ce qui le fait bouger.
- **Face au passé** : le modèle rejoue 2000–2024 avec les décisions réellement prises, et on compare à l’histoire.
- **Ce résultat est-il solide ?** : on refait le calcul en faisant varier chaque hypothèse du modèle ; verdict solide,
  à nuancer ou fragile, avec les hypothèses qui décident.

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

Voir la fin de [docs/COMMENT-CA-MARCHE.md](docs/COMMENT-CA-MARCHE.md#17-ce-que-le-modèle-ne-sait-pas-faire-limites-connues).
