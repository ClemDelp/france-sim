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
        T["tranches.csv<br/>qui reçoit et qui paie<br/>(5 tranches de revenu)"]
        V["variables.csv + liens.csv<br/>le graphe des causes<br/>(ce qui fait bouger quoi)"]
    end
    subgraph moteur["⚙️ src/model/"]
        P["params.ts<br/>lit les CSV,<br/>permet d’essayer une variante"]
        CAL["calibration.ts<br/>BASE, P, GROUP_PARAMS"]
        SIM["sim.ts<br/>simule une année,<br/>puis la suivante"]
        G["graph.ts<br/>le graphe des causes"]
    end
    subgraph ui["🖥️ src/ui/ + App.tsx"]
        GAME["Le jeu<br/>leviers, carte des flux,<br/>idées reçues, courbes"]
        BRAIN["🧠 Le modèle<br/>graphe, paramètres,<br/>variantes"]
    end
    D --> P
    C --> P
    T --> P
    P --> CAL --> SIM
    V --> G
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
    A0["0. Annulation de dette ?<br/>qui perd, panique des prêteurs"] --> A1
    A1["1. Démographie<br/>naissances, immigration, départs en retraite,<br/>espérance de vie, nombre d’actifs"] --> A2
    A2["2. Énergie, prix, salaires<br/>pétrole, électricité, inflation,<br/>salaires, productivité"] --> A3
    A3["3. Taux d’intérêt<br/>BCE + prime de risque<br/>(dette, déficit, confiance)"] --> A4
    A4["4. Production, revenus, demande<br/>on cherche le PIB qui boucle"] --> A5
    A5["5. Qui finance le déficit ?<br/>étrangers, BCE, assureurs, banques"] --> A6
    A6["6. Bilans de fin d’année<br/>dette, patrimoine, fonds propres"] --> A7
    A7["7. Inégalités et santé<br/>pauvreté, Gini, espérance de vie"] --> A8
    A8["8. Contrôle comptable<br/>la somme des soldes = 0"]
    A8 -. "les stocks passent à l’année suivante" .-> A0

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

Le graphe complet (75 variables, plus de 150 liens) est dans l’application, onglet « 🧠 Le modèle ».
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

## 7. Participer : du tableur au modèle

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

Voir [CONTRIBUER.md](../CONTRIBUER.md) pour le détail.

## 8. Ce que le modèle ne sait pas faire (limites connues)

Un simulateur honnête dit où il s’arrête. Les principales limites aujourd’hui :

- **Les prévisions au-delà de 15 ans sont des tendances.** Après 2040, l’interface grise les courbes :
  la démographie et la dette y sont crédibles, l’innovation, le climat ou la géopolitique non.
- **La Banque centrale européenne ne réagit pas à la France.** Son taux est fixé par le scénario mondial :
  une politique très inflationniste en France n’entraîne pas de hausse des taux de la BCE.
- **Pas de crise de la dette automatique.** La prime de risque monte avec la dette, mais rien ne déclenche une crise brutale
  quand la dette dépasse 200 % du PIB : en réalité, les prêteurs refuseraient bien avant. Le journal signale l’effet boule de neige.
- **Les entreprises forment un seul bloc.** Pas encore de distinction entre PME, ETI et grands groupes, ni entre secteurs.
- **La pauvreté de départ est un peu sous-estimée** (≈ 13 % contre 15,4 % mesurés par l’INSEE), car on reconstitue
  la distribution à partir de 5 tranches.
- **Les comportements sont des moyennes stables.** Le modèle ne capte pas les changements d’habitudes brutaux
  (fuite massive des capitaux, révolte fiscale, effondrement de la confiance), au-delà de plafonds prudents.
- **Pas de calage sur 2000–2024.** Le modèle part de 2025 ; le rejouer sur le passé est la prochaine étape pour le valider.
- **Beaucoup de comportements sont des hypothèses.** Leur colonne `fiabilite` le dit : c’est là que les contributions sont les plus utiles.
