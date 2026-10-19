# Contribuer au modèle

France·Sim est un modèle **ouvert** : chacun peut vérifier d’où viennent les chiffres, proposer une meilleure source,
corriger une hypothèse ou ajouter un mécanisme. Pas besoin de savoir programmer pour la plupart des contributions.

## Les fichiers du modèle (`modele/`)

Ouvrez-les dans Excel, LibreOffice ou Google Sheets : séparateur « ; », virgule décimale, encodage UTF-8.
N’écrivez pas de « ; » dans les textes (un test le vérifie) : utilisez une virgule.

Les colonnes `min` et `max` de `comportements.csv` donnent la **plage plausible** d’une hypothèse : l’analyse « Ce résultat est-il solide ? » la parcourt.

| Fichier | Contenu | Colonnes |
| --- | --- | --- |
| `donnees-2025.csv` | La France de 2025 : PIB, budget, dette, population… | `id ; valeur ; unite ; bloc ; nom ; source` |
| `comportements.csv` | Comment chacun réagit : élasticités, délais, seuils | `id ; valeur ; unite ; bloc ; nom ; explication ; fiabilite ; source ; min ; max` |
| `tranches.csv` | Qui reçoit quoi, qui paie quoi, par tranche de revenu | `id ; nom ; g1 … g5 ; explication ; source` |
| `entreprises.csv` | PME, ETI, grands groupes : poids et sensibilités | `id ; nom ; pme ; eti ; ge ; explication ; fiabilite ; source` |
| `variables.csv` | Les variables du graphe des causes | `id ; nom ; bloc ; colonne ; explication` |
| `donnees-2000.csv` | La France de 2000, pour rejouer le passé | comme `donnees-2025.csv` |
| `politiques-2000-2024.csv` | Les décisions réellement prises de 2000 à 2024 | `annee ; levier ; valeur ; commentaire` |
| `monde.csv` | Le monde année par année (pétrole, BCE, croissance, crises) | `annee ; petrole ; tauxBce ; croissanceMonde ; panique ; chocDemande ; rachatsBce ; commentaire` |
| `historique.csv` | Ce qui s’est vraiment passé de 2000 à 2024 | `annee ; croissance ; chomage ; inflation ; deficit ; dette ; taux10ans ; pauvrete` |
| `liens.csv` | Les liens de cause à effet | `de ; vers ; sens ; parametres ; explication` |

La colonne `fiabilite` vaut :

- **mesuré** : une statistique officielle (INSEE, Banque de France, DREES…) ;
- **estimé** : une valeur tirée d’études sérieuses, avec une marge d’incertitude ;
- **hypothèse** : un choix raisonnable faute de mieux. **C’est là que votre aide compte le plus.**

## Proposer une meilleure valeur

1. Dans l’application, ouvrez **🧠 Le modèle**, trouvez le paramètre et essayez votre valeur :
   toute la partie se recalcule et un bandeau montre l’effet sur la croissance, le chômage, la dette et la pauvreté.
2. Téléchargez le fichier modifié (onglet « Tous les paramètres »), ou modifiez directement le CSV dans votre tableur.
3. Ouvrez une *pull request* sur GitHub avec :
   - la valeur proposée et **sa source** (lien vers l’étude ou la statistique) ;
   - si possible, mettez à jour la colonne `fiabilite`.

## Corriger ou ajouter un lien du graphe

`liens.csv` décrit le moteur pour qu’on puisse le lire : « A fait monter B, à cause du paramètre X ».
Si un lien manque, va dans le mauvais sens ou s’explique mal, corrigez la ligne ou ouvrez une *issue*.
Si le lien n’existe pas encore dans le moteur (`src/model/sim.ts`), il faut aussi le coder : décrivez le mécanisme
et sa source dans l’*issue*, quelqu’un pourra s’en charger.

## Ce que vérifient les tests

`npm test` lance des contrôles automatiques à chaque proposition :

- **bouclage comptable** : chaque année, la somme des soldes de tous les acteurs est nulle ;
- **stabilité** : jusqu’en 2075, sans rien changer et avec chaque idée reçue, rien ne s’emballe (inflation, chômage, croissance) ;
- **cohérence du graphe** : chaque lien relie des variables qui existent et cite des paramètres qui existent,
  chaque paramètre des fichiers est utilisé par le moteur, chaque levier du jeu est dans le graphe ;
- **mécanismes** : taxer les riches réduit la pauvreté, annuler la dette de la BCE ne rapporte presque rien, tous les impôts au maximum font perdre la partie, etc. ;
- **le passé** : rejoué de 2000 à 2024, le modèle doit rester proche de l’histoire (écarts moyens plafonnés). Si votre modification améliore ce rejeu, c’est un excellent argument.

## Ajouter un levier ou un mécanisme (développeurs)

1. Ajoutez le levier dans `src/model/types.ts` (`Policy`) et sa valeur de 2025 dans `src/model/calibration.ts` (`BASE_POLICY`).
2. Ajoutez ses bornes et son explication dans `src/ui/levers.ts`.
3. Codez son effet dans `src/model/sim.ts`, avec des coefficients **nommés** lus dans `modele/comportements.csv`
   (jamais de nombre magique dans le code).
4. Ajoutez la variable et ses liens dans `modele/variables.csv` et `modele/liens.csv`.
5. `npm test && npm run lint && npm run build`.

Le fonctionnement complet est expliqué avec des schémas dans [docs/COMMENT-CA-MARCHE.md](docs/COMMENT-CA-MARCHE.md).
