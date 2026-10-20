# Comment marche France·Sim

Ce document explique, avec des schémas, comment le simulateur fonctionne : d’où viennent les chiffres,
ce qui se passe quand on avance d’un an, et comment les variables s’influencent.
Les schémas sont en [Mermaid](https://mermaid.js.org/) : GitHub les affiche directement.

## 1. Vue d’ensemble : des fichiers ouverts, un moteur, une interface

Toutes les hypothèses sont dans des fichiers CSV du dossier `modele/`, lisibles dans un tableur.
Le moteur les lit, simule la France année par année, et l’interface montre le résultat.

```mermaid
flowchart LR
    subgraph modele["📂 modele/ (modifiable dans Excel)"]
        D["donnees-2025.csv<br/>la France de 2025<br/>(PIB, dette, population…)"]
        C["comportements.csv<br/>comment chacun réagit<br/>(élasticités, délais, seuils)"]
        T["tranches.csv + entreprises.csv<br/>qui reçoit et qui paie<br/>(5 tranches, 3 tailles d’entreprise)"]
        H["donnees-2000.csv, politiques-2000-2024.csv,<br/>monde.csv, historique.csv<br/>le passé, pour rejouer 2000–2024"]
        V["variables.csv + liens.csv<br/>le graphe des causes<br/>(ce qui fait bouger quoi)"]
    end
    subgraph moteur["⚙️ src/model/"]
        P["params.ts<br/>lit les CSV,<br/>permet d’essayer une variante"]
        CAL["calibration.ts<br/>BASE, P, GROUP_PARAMS"]
        SIM["sim.ts<br/>simule une année,<br/>puis la suivante"]
        G["graph.ts<br/>le graphe des causes"]
        R["replay.ts<br/>rejoue 2000–2024"]
        ROB["robustness.ts<br/>teste la solidité<br/>d’un résultat"]
    end
    subgraph ui["🖥️ src/ui/ + App.tsx"]
        GAME["Le jeu<br/>leviers, carte des flux,<br/>idées reçues, courbes"]
        BRAIN["🧠 Le modèle<br/>graphe, paramètres, variantes,<br/>face au passé"]
    end
    D --> P
    C --> P
    T --> P
    P --> CAL --> SIM
    V --> G
    H --> R
    SIM --> R --> BRAIN
    SIM --> ROB --> GAME
    SIM --> GAME
    G --> BRAIN
    CAL --> BRAIN
    BRAIN -- "variante de paramètres" --> SIM
    GAME -- "décisions, événements" --> SIM
```

Le graphe (`variables.csv`, `liens.csv`) **décrit** le moteur pour qu’on puisse le lire et le discuter.
Le moteur (`sim.ts`) reste la référence : des tests vérifient que chaque lien cite des paramètres qui existent,
et que chaque paramètre des fichiers est vraiment utilisé.

## 2. Une partie : vos choix comparés à « si on n’avait rien changé »

À chaque affichage, le simulateur refait tout le chemin depuis 2025, deux fois :
une fois avec vos décisions, une fois sans. Tous les écarts affichés sont la différence entre les deux.
C’est ce qui permet de dire « la pauvreté baisse de 1,2 point **à cause de** votre décision »,
même quand le monde change en même temps (crise, pétrole, vieillissement).

```mermaid
sequenceDiagram
    actor J as Joueur
    participant UI as Interface
    participant S as Simulateur
    J->>UI: bouge un levier (ex. impôt sur la fortune 2 %)
    UI->>S: aperçu : l’année prochaine avec / sans ce changement
    S-->>UI: effet estimé (déficit, chômage, pauvreté)
    J->>UI: avance de 1, 5, 10 ans ou jusqu’en 2075
    UI->>S: simule 2025 → année, avec les décisions
    UI->>S: simule 2025 → année, sans décision (même monde)
    S-->>UI: deux trajectoires
    UI-->>J: chiffres clés, écarts, courbes, journal
    J->>UI: clique sur « Pauvreté »
    UI-->>J: ce qui la fait bouger, et quelles causes ont bougé
```

## 3. Une année dans le moteur

Chaque année suit le même ordre. L’étape 4 est une recherche d’équilibre : la production dépend de la demande,
qui dépend des revenus, qui dépendent de la production. Le moteur tâtonne (jusqu’à 60 essais) jusqu’à ce que tout boucle.

```mermaid
flowchart TD
    A0["0. Annulation de dette ? Crise de la dette ?<br/>qui perd, panique des prêteurs, plan d’aide"] --> A1
    A1["1. Démographie<br/>naissances, immigration, départs en retraite,<br/>espérance de vie, nombre d’actifs"] --> A2
    A2["2. Énergie, prix, salaires<br/>pétrole, électricité, inflation,<br/>salaires, productivité"] --> A3
    A3["3. Taux d’intérêt<br/>BCE + prime de risque<br/>(dette, déficit, confiance)"] --> A4
    A4["4. Production, revenus, demande<br/>on cherche le PIB qui boucle"] --> A5
    A5["5. Qui finance le déficit ?<br/>étrangers, BCE, assureurs, banques"] --> A6
    A6["6. Bilans de fin d’année<br/>dette, patrimoine, fonds propres"] --> A7
    A7["7. Inégalités et santé<br/>pauvreté, Gini, espérance de vie"] --> A8
    A8["8. Contrôle comptable<br/>la somme des soldes = 0"] --> A9
    A9["9. Tension sur la dette, colère sociale<br/>la partie est-elle perdue ?"] --> A10
    A10["10. Entreprises par taille<br/>PME, ETI, grands groupes"]
    A10 -. "les stocks passent à l’année suivante" .-> A0

    subgraph boucle["4. la boucle d’équilibre"]
        direction LR
        PIB["PIB supposé"] --> EMP["emplois, salaires,<br/>profits, impôts"]
        EMP --> REV["revenus des<br/>5 tranches"]
        REV --> DEM["consommation, investissement,<br/>exportations, importations"]
        DEM -- "demande ≠ PIB ?<br/>on corrige" --> PIB
    end
    A4 --- boucle
```

## 4. Où circule l’argent (le modèle stock-flux)

Chaque euro a un payeur et un receveur. La somme des excédents et des déficits de tous les acteurs est nulle chaque année :
si l’État est en déficit, quelqu’un d’autre (ménages, entreprises ou reste du monde) a épargné le montant correspondant.
C’est le principe des modèles « stock-flux cohérents » (Godley et Lavoie), et un test le vérifie chaque année.

```mermaid
flowchart LR
    M["👨‍👩‍👧 Ménages<br/>5 tranches"]
    E["🏭 Entreprises"]
    ET["🏛️ État"]
    SE["🤝 Sécurité sociale"]
    B["🏦 Banques"]
    BCE["💶 Banque de France"]
    W["🌍 Reste du monde"]
    EN["⚡ Énergie importée"]

    M -- "consommation, logement" --> E
    E -- "salaires, dividendes" --> M
    M -- "impôt sur le revenu, fortune, succession" --> ET
    M -- "cotisations, CSG" --> SE
    E -- "cotisations patronales" --> SE
    E -- "TVA, impôts de production, IS" --> ET
    SE -- "retraites, chômage, famille" --> M
    ET -- "minima sociaux, aides" --> M
    ET -- "achats publics, aides" --> E
    ET -- "intérêts" --> B
    ET -- "intérêts (assurance-vie)" --> M
    ET -- "intérêts, contribution UE" --> W
    ET -- "intérêts" --> BCE
    BCE -- "bénéfices reversés" --> ET
    E -- "intérêts des crédits" --> B
    M -- "intérêts immobiliers" --> B
    B -- "intérêts des dépôts, dividendes" --> M
    E -- "importations" --> W
    W -- "exportations" --> E
    E -- "pétrole et gaz" --> EN
    EN --> W
```

## 5. Le graphe des causes, en version simplifiée

Le graphe complet (85 variables, 200 liens) est dans l’application, onglet « 🧠 Le modèle ».
Voici ses grandes boucles. Un lien « + » veut dire « quand l’un monte, l’autre monte » ; « − » : « quand l’un monte, l’autre baisse ».

```mermaid
flowchart LR
    subgraph leviers["Vos décisions"]
        IMP["Impôts"]
        DEP["Dépenses publiques"]
        RET["Âge de la retraite"]
        ENE["Électrification,<br/>nucléaire"]
        MIG["Immigration"]
    end
    subgraph monde["Le monde"]
        OIL["Prix du pétrole"]
        BCE["Taux de la BCE"]
    end
    REV["Revenu des ménages"]
    CONS["Consommation"]
    INV["Investissement"]
    PIB["PIB"]
    CHO["Chômage"]
    SAL["Salaires"]
    INF["Inflation"]
    REC["Recettes publiques"]
    DEF["Déficit"]
    DET["Dette"]
    TAUX["Taux d’emprunt"]
    INT["Charge de la dette"]
    POV["Pauvreté"]
    ACT["Actifs"]

    IMP -- "+" --> REC
    IMP -- "−" --> REV
    DEP -- "+" --> PIB
    DEP -- "+" --> DEF
    RET -- "+" --> ACT
    MIG -- "+" --> ACT
    ACT -- "+" --> PIB
    ENE -- "−" --> OIL
    OIL -- "+" --> INF
    BCE -- "+" --> TAUX

    REV -- "+" --> CONS
    CONS -- "+" --> PIB
    INV -- "+" --> PIB
    PIB -- "+" --> REV
    PIB -- "−" --> CHO
    CHO -- "−" --> SAL
    SAL -- "+" --> INF
    INF -- "+" --> SAL
    PIB -- "+" --> REC
    REC -- "−" --> DEF
    DEF -- "+" --> DET
    DET -- "+" --> TAUX
    TAUX -- "+" --> INT
    INT -- "+" --> DEF
    TAUX -- "−" --> INV
    REV -- "−" --> POV
```

Trois boucles expliquent l’essentiel de ce qu’on voit en jouant :

- **Le multiplicateur** (revenu → consommation → PIB → revenu) : une dépense publique ou une baisse d’impôt soutient l’activité,
  d’autant plus qu’elle va à des ménages modestes, qui dépensent presque tout ce qu’ils reçoivent.
- **La boucle salaires-prix** (chômage → salaires → inflation → salaires) : quand le chômage passe sous 7 %,
  les salaires accélèrent et les prix suivent ; un choc pétrolier lance la même spirale par les prix.
- **La boule de neige de la dette** (déficit → dette → taux → intérêts → déficit) : quand le taux payé dépasse la croissance,
  la dette grossit d’elle-même, même sans nouvelle dépense. Le journal de la partie signale le moment où cela arrive.

## 6. Les ménages : de 5 tranches à la pauvreté et aux inégalités

```mermaid
flowchart LR
    subgraph revenus["Revenus de chaque tranche"]
        W["salaires"]
        K["dividendes, intérêts"]
        TR["retraites, chômage,<br/>famille, minima"]
    end
    subgraph prelev["Prélèvements"]
        CO["cotisations, CSG"]
        IR["impôt sur le revenu"]
        PAT["impôts sur la fortune"]
    end
    revenus --> YD["Revenu disponible<br/>de la tranche"]
    prelev --> YD
    YD --> PX["÷ prix vus par la tranche<br/>(TVA et énergie pèsent plus<br/>sur les modestes)"]
    PX --> NIV["Niveau de vie moyen<br/>par personne"]
    NIV --> DIST["Distribution à l’intérieur<br/>de chaque tranche<br/>(loi log-normale)"]
    DIST --> POV["Pauvreté<br/>(sous 60 % du médian)"]
    DIST --> GINI["Indice de Gini,<br/>rapport D9/D1"]
    POV --> LE["Espérance de vie"]
```

## 7. Le climat

```mermaid
flowchart LR
    FR["Émissions françaises<br/>≈ 370 Mt (0,8 % du monde)"] -- "exemple, diplomatie" --> W["Émissions mondiales<br/>≈ 42 Gt de CO2 par an"]
    AID["Aide climat<br/>aux pays du Sud"] -- "tonnes évitées" --> W
    EV["Accord mondial ou renoncement<br/>(événements)"] --> W
    W -- "CO2 cumulé × 0,5 °C<br/>par 1000 Gt" --> T["Réchauffement mondial"]
    T -- "au-delà de 2 °C" --> TIP["Points de bascule<br/>(pergélisol, forêts)"] --> W
    T --> D["Dégâts en France<br/>(part du PIB)"]
    AD["Adaptation"] -- "évite une partie" --> D
    D --> PROD["Productivité, prix,<br/>reconstruction"]
    T --> LE["Espérance de vie"]
    FOS["Sortie du pétrole<br/>et du gaz"] -- "moins de pollution de l’air" --> LE
    T --> COL["Colère"]
    D -- "≥ 10 % du PIB" --> END["🔥 Effondrement"]
    TAX["Taxe carbone"] --> FOS
    TAX --> FR
```

Sans changement de politique dans le monde, le réchauffement atteint environ +1,8 °C en 2050 et +2,3 °C en 2075
(soit une trajectoire vers +2,7 °C en 2100, comme l’estime l’ONU). Les chiffres viennent du GIEC (AR6), du Global Carbon Budget,
de l’ONU Environnement, du Citepa et de Santé publique France ; les fonctions de dégâts sont des hypothèses, à discuter.

## 8. L’immigration : tout est cause et effet

```mermaid
flowchart LR
    T["Réchauffement"] -- "sécheresses,<br/>terres perdues" --> PR["Pression migratoire"]
    T -- "attise" --> CF["Conflits autour<br/>de l’Europe"]
    EV["Guerres, famines<br/>(événements)"] --> CF
    CF --> PR
    AID["Aide au développement<br/>et à la paix"] -- "prévient (lentement)" --> CF
    AID -- "moins de départs" --> PR
    PR --> IR["Arrivées hors<br/>voies légales"]
    CTRL["Contrôle et reconduites"] -- "au mieux la moitié,<br/>de plus en plus cher" --> IR
    LEG["Immigration légale"] --> POP["Actifs, population"]
    IR --> POP
    IR -- "accueil" --> COST["Dépenses publiques"]
    CTRL --> COST
    INT["Intégration"] --> COST
    IR -- "accueil débordé" --> ANG["Tensions sociales"]
    INT -- "apaise" --> ANG
    INT -- "emploi plus rapide" --> U["Chômage"]
```

Le contrôle des frontières a des rendements décroissants : on n’empêche au mieux que la moitié des arrivées irrégulières, et la pression revient
tant que guerres, misère et réchauffement poussent au départ. L’aide au développement et la lutte contre le réchauffement agissent sur les causes,
mais sur des décennies. Toutes ces règles sont dans `modele/comportements.csv` (bloc Immigration), avec leurs sources ou leur statut d’hypothèse.

## 9. L’influence de la France

```mermaid
flowchart LR
    ARM["Défense"] --> INF["Influence<br/>(1 = 2025)"]
    ECO["Croissance comparée<br/>au reste du monde"] --> INF
    CUL["Rayonnement culturel<br/>et diplomatie"] --> INF
    AID["Aide au développement"] --> INF
    CLI["Exemplarité climatique"] --> INF
    STA["Stabilité intérieure<br/>(paix sociale, pas de plan d’aide)"] --> INF
    INF --> DEAL["Accords climat et paix<br/>plus probables"]
    INF --> TRADE["Moins de guerres commerciales<br/>et de représailles"]
    INF --> EXP["Exportations"]
    INF --> RATE["Taux d’emprunt plus bas"]
    INF --> PEACE["Conflits apaisés<br/>(médiation, dissuasion)"]
    INF --> PRIDE["Fierté : moins de colère"]
```

L’influence suit la puissance avec retard (quelques années). Sans rien faire, elle s’érode doucement : le monde croît plus vite que la France.
Toutes les pondérations et tous les effets sont dans `modele/comportements.csv` (bloc Influence) ; ce sont des hypothèses, inspirées des indices
de puissance (Lowy Institute) et de soft power.

## 10. Comprendre pourquoi : causes, combinaisons, effets émergents

Le jeu ne raconte rien d’écrit à l’avance : il mesure.

- **Pourquoi un événement arrive** : chaque probabilité est une somme de raisons nommées (« 8 % de base, +12 % parce que la planète
  a pris 0,4 °C, ×0,8 grâce à votre aide au développement »). Les mêmes raisons servent au tirage au sort et à l’explication.
- **Pourquoi la France en est là** : le bouton « 🔍 Pourquoi en est-on là ? » de la une rejoue la partie en retirant, une à une,
  chaque décision et chaque événement. La différence est la part de chacun. Ce qui reste une fois tout additionné est
  l’**effet de combinaison** : des causes qui se renforcent ou s’amortissent entre elles, sans qu’aucune règle ne l’ait prévu.

```mermaid
flowchart LR
    T["Tendance de fond<br/>(rien ne se passe)"] --> V["Valeur de l’année"]
    D1["Décision 1"] -- "part mesurée en la retirant" --> V
    D2["Décision 2"] --> V
    E1["Événement"] --> V
    C["🌀 Effet de combinaison<br/>(ce que les causes font ensemble)"] --> V
```

Tendance + parts de chaque cause + effet de combinaison = la valeur réelle, exactement (un test le vérifie).

## 11. Le monde bouge, le Parlement freine

- **Événements** : chaque année, 24 événements possibles sont tirés au sort (une partie différente à chaque fois). Leur probabilité
  dépend de la situation : plus il fait chaud, plus il y a de canicules et de sécheresses ; plus la colère monte, plus il y a de grèves ;
  une France qui réduit ses émissions rend un accord climatique mondial plus probable.
- **Capital politique** : chaque réforme coûte des points selon son ampleur et son poids politique (âge de la retraite, nationalisations,
  réglementation coûtent double). Les points dépendent de la popularité, avec un bonus juste après une élection.
- **Modèle économique** : nationaliser (l’État rachète en obligations, touche les dividendes, oriente l’investissement, mais perd en efficacité
  et fait fuir des capitaux) ou privatiser ; réglementer (protège les salaires du bas et les émissions, mais relève le chômage d’équilibre
  et freine la productivité) ou libéraliser.

## 12. Crise de la dette et fin de partie

Une partie peut mal finir. Le moteur suit deux jauges, et quatre façons de perdre.

```mermaid
flowchart LR
    subgraph dette["Tension sur la dette"]
        D1["Niveau de la dette<br/>au-delà de 100 % du PIB"] --> TS["Tension"]
        D2["Écart entre le solde public<br/>et ce qui stabiliserait la dette<br/>(taux payé − croissance) × dette"] --> TS
        QE["Rachats de la BCE"] -. "protègent" .-> TS
    end
    TS -- "≥ 1" --> CR["💥 Crise de la dette<br/>taux qui bondissent, obligations<br/>qui perdent de la valeur"]
    CR --> CH{"Le joueur choisit"}
    CH -- "accepter" --> PL["🇪🇺 Plan d’aide européen<br/>taux plafonnés 3 ans,<br/>économies imposées"]
    CH -- "refuser" --> RF["Emprunter au prix fort"]
    CH -- "défaut" --> DF["Effacer une partie de la dette<br/>(étrangers ou épargnants)"]
    subgraph colere["Mécontentement social"]
        C1["Baisse du niveau de vie"] --> MC["Colère"]
        C2["Hausse des prélèvements"] --> MC
        C3["Chômage, inflation,<br/>pauvreté"] --> MC
        PL --> C4["Austérité imposée"] --> MC
    end
    MC -- "≥ 1" --> E1["🔥 Révolte"]
    RF -- "prime ≥ 8 points ou<br/>intérêts ≥ 25 % des recettes" --> E2["💥 Faillite de l’État"]
    E3["🌀 Hyperinflation<br/>(inflation ≥ 25 %)"]
    E4["📉 Dépression<br/>(chômage ≥ 20 %)"]
```

Quand les impôts s’envolent, une partie échappe au fisc (fraude, travail au noir) et les hauts revenus partent :
chaque hausse rapporte de moins en moins. Tous les seuils sont dans `modele/comportements.csv`, avec leur plage plausible.

## 13. Les entreprises : PME, ETI, grands groupes

Le moteur garde une seule économie, mais chaque taille d’entreprise réagit à sa façon (`modele/entreprises.csv`) :
les PME dépendent de leur banque et emploient plus de salariés au SMIC ; les ETI portent l’industrie qui consomme de l’énergie ;
les grands groupes exportent et peuvent déclarer leurs bénéfices ailleurs. Une aide publique est en partie investie :
beaucoup par une PME qui manque de trésorerie, peu par un grand groupe. Le levier « Part des aides allant aux PME » le montre.

## 14. Le test de vérité : rejouer 2000–2024

Le même moteur repart de la France de 2000 (`donnees-2000.csv`), avec les décisions réellement prises
(`politiques-2000-2024.csv`) et le monde tel qu’il a été (`monde.csv`). On compare à ce qui s’est passé (`historique.csv`).

```mermaid
flowchart LR
    A["France de 2000"] --> M["Même moteur,<br/>mêmes comportements"]
    B["Décisions réelles<br/>35 h, retraites, CICE,<br/>aides Covid…"] --> M
    C["Monde réel<br/>2008, crise de l’euro,<br/>Covid, Ukraine"] --> M
    M --> R["Trajectoire rejouée"]
    H["Ce qui s’est vraiment passé"] --> CMP{"Écarts"}
    R --> CMP
    CMP --> T["Test automatique :<br/>une contribution ne doit pas<br/>dégrader le rejeu"]
```

Aujourd’hui, l’écart moyen est d’environ 1,7 point sur la croissance et le chômage, 1,2 sur l’inflation, 1,5 sur le déficit,
0,4 sur le taux à 10 ans ; la dette de 2024 est retrouvée à une dizaine de points près. Ce rejeu a permis de corriger
plusieurs défauts : un impôt sur le revenu deux fois et demie trop lourd, des chocs pétroliers qui ne touchaient que la France,
des taux longs qui suivaient trop vite la BCE. L’onglet « Face au passé » du modèle montre les courbes, et dit si votre variante
de paramètres reproduit mieux ou moins bien l’histoire.

## 15. Ce résultat est-il solide ?

Pour une décision et un indicateur, on refait le calcul en faisant varier chaque **hypothèse** du modèle (les paramètres
dont la fiabilité est « hypothèse ») dans sa plage plausible (colonnes `min` et `max`, sinon ± 30 %). Verdict :

- **solide** : le sens et l’ampleur de l’effet tiennent ;
- **à nuancer** : le sens tient, l’ampleur dépend d’hypothèses ;
- **fragile** : l’effet peut changer de sens selon une hypothèse incertaine.

L’analyse nomme les hypothèses qui décident : ce sont elles qu’il faut documenter en priorité.

## 16. Participer : du tableur au modèle

```mermaid
flowchart LR
    A["Je doute d’un chiffre<br/>ou d’un lien"] --> B["🧠 Le modèle :<br/>j’essaie une autre valeur"]
    B --> C["Toute la partie se recalcule ;<br/>le bandeau montre l’effet"]
    C --> D["⬇ Je télécharge le CSV modifié<br/>(ou je l’édite dans Excel)"]
    D --> E["Pull request sur GitHub,<br/>avec ma source"]
    E --> F["Tests automatiques :<br/>bouclage comptable, stabilité<br/>sur 50 ans, graphe cohérent"]
    F --> G["Relecture et discussion"]
    G --> H["Le modèle s’améliore"]
```

Voir [CONTRIBUER.md](../CONTRIBUER.md) pour le détail, et la documentation HTML (`docs/index.html`) pour les guides pas à pas.

## 17. Ce que le modèle ne sait pas faire (limites connues)

Un simulateur honnête dit où il s’arrête. Les principales limites aujourd’hui :

- **Les prévisions au-delà de 15 ans sont des tendances.** Après 2040, l’interface grise les courbes :
  la démographie et la dette y sont crédibles, l’innovation, le climat ou la géopolitique non.
- **La Banque centrale européenne ne réagit pas à la France.** Son taux est fixé par le scénario mondial :
  une politique très inflationniste en France n’entraîne pas de hausse des taux de la BCE.
- **Les crises et la colère sociale suivent des seuils.** Ce sont des ordres de grandeur tirés de l’histoire (Grèce, Italie,
  gilets jaunes), pas des lois : leurs paramètres sont des hypothèses, à discuter.
- **Les entreprises ne forment qu’une économie.** Les trois tailles ont des sensibilités différentes, mais pas de secteurs
  (industrie, services, agriculture) ni de faillites d’entreprises.
- **Les inégalités sont reconstituées à partir de 5 tranches.** La pauvreté de départ (≈ 14,7 %) est proche de l’INSEE (15,4 %),
  mais l’indice de Gini (≈ 0,33) est plus élevé que celui de l’INSEE (0,29), car les tranches viennent des comptes nationaux
  « distribués », qui comptent plus largement les revenus du capital.
- **Le rejeu 2000–2024 rate certaines périodes** : le chômage de 2014-2018, la croissance de 2022-2024 (le bouclier tarifaire
  et l’énigme de la productivité ne sont pas modélisés). Les données de 2000 et l’historique sont des ordres de grandeur arrondis,
  à vérifier.
- **Beaucoup de comportements sont des hypothèses.** Leur colonne `fiabilite` le dit, et l’analyse de solidité montre
  lesquelles comptent : c’est là que les contributions sont les plus utiles.
