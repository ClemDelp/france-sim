import type { Policy } from '../model/types'

/** Les indicateurs qu'un verdict peut mettre en avant. */
export type Focus = 'gdp' | 'unemployment' | 'inflation' | 'deficit' | 'debt' | 'rate' | 'poverty' | 'gini' | 'poor' | 'rich' | 'life' | 'energy' | 'retirees' | 'savings'

/**
 * Une idée reçue à tester : ce qu'on croit, la décision appliquée, et ce qui se passe vraiment, en clair.
 * Les chiffres du verdict sont calculés par la simulation ; le texte explique le mécanisme.
 */
export type Mission = {
  id: string
  icon: string
  title: string
  belief: string
  patch: Partial<Policy>
  focus: Focus[]
  /** Le mécanisme, en quelques phrases, pour comprendre les chiffres. */
  mechanism: string[]
  /** Ce que le modèle ne capte pas et qui pourrait changer le verdict. */
  limits?: string
}

export const MISSIONS: Mission[] = [
  {
    id: 'tax-rich',
    icon: '💰',
    title: 'Taxons les riches pour donner aux pauvres',
    belief: 'Il suffit de prendre aux plus riches pour régler la pauvreté et les comptes publics.',
    patch: { wealthTax: 0.02, incomeTaxTop: 0.05, minima: 30 },
    focus: ['poverty', 'gini', 'poor', 'rich', 'deficit', 'gdp'],
    mechanism: [
      'Les 10 % les plus riches perdent une part visible de leur revenu, les plus modestes en gagnent : la pauvreté et les inégalités baissent réellement.',
      'Mais l’assiette fond : une partie des fortunes se déplace, se cache ou s’expatrie, et l’impôt rapporte moins que le calcul « taux × patrimoine ».',
      'Un euro pris aux riches, qui l’auraient surtout épargné, et donné aux modestes, qui le dépensent, soutient un peu la consommation ; un peu moins d’investissement freine l’activité à long terme.',
    ],
  },
  {
    id: 'cancel-bce',
    icon: '🏦',
    title: 'Annulons la dette détenue par la BCE',
    belief: 'La banque centrale peut effacer la dette qu’elle détient : ça ne coûte rien à personne.',
    patch: { cancelShare: 1, cancelHolder: 'bce' },
    focus: ['debt', 'deficit', 'rate', 'gdp'],
    mechanism: [
      'Le ratio de dette baisse d’un coup sur le papier.',
      'Mais les intérêts que l’État payait à la Banque de France lui revenaient déjà sous forme de bénéfices reversés : le budget ne gagne presque rien.',
      'Et c’est interdit par les traités européens : la confiance s’effrite, les taux montent un peu.',
    ],
  },
  {
    id: 'cancel-foreign',
    icon: '🌍',
    title: 'Ne remboursons pas les étrangers',
    belief: 'Plus de la moitié de notre dette est détenue à l’étranger : n’en remboursons qu’une partie.',
    patch: { cancelShare: 0.5, cancelHolder: 'monde' },
    focus: ['debt', 'rate', 'gdp', 'unemployment', 'deficit'],
    mechanism: [
      'La dette baisse, mais c’est un défaut : les prêteurs exigent une forte prime, et la France emprunte bien plus cher pendant des années.',
      'Les investisseurs étrangers fuient : il faut trouver en France l’argent qu’ils prêtaient, et les entreprises investissent moins.',
      'L’activité recule, le chômage monte : une partie du gain est reperdue en intérêts et en recettes fiscales.',
    ],
    limits: 'Le modèle ne simule pas une sortie de la zone euro, la contagion aux banques européennes ni une exclusion durable des marchés : dans la réalité, le prix pourrait être bien plus élevé.',
  },
  {
    id: 'cancel-french',
    icon: '🏠',
    title: 'Annulons la dette détenue en France',
    belief: 'Annulons la dette détenue par les assureurs français, ce sont des institutions financières.',
    patch: { cancelShare: 1, cancelHolder: 'assureurs' },
    focus: ['debt', 'savings', 'gdp', 'rate', 'deficit'],
    mechanism: [
      'Les assureurs placent l’argent des contrats d’assurance-vie : annuler cette dette, c’est faire perdre leur épargne à des millions de ménages français.',
      'Les ménages aisés, qui ont le plus d’assurance-vie, perdent le plus, mais tous les épargnants sont touchés.',
      'C’est aussi un défaut : les taux montent, ce qui renchérit tout le reste de la dette.',
    ],
  },
  {
    id: 'smic',
    icon: '👷',
    title: 'Augmentons le SMIC de 20 %',
    belief: 'Augmenter fortement le SMIC, c’est plus de pouvoir d’achat pour tout le monde.',
    patch: { smicBoost: 0.2 },
    focus: ['poor', 'unemployment', 'inflation', 'poverty', 'gini'],
    mechanism: [
      'Les salariés au SMIC et juste au-dessus gagnent nettement plus : la pauvreté au travail recule.',
      'Mais le travail peu qualifié coûte plus cher : certaines entreprises embauchent moins ou automatisent, le chômage monte un peu.',
      'Une partie de la hausse se diffuse aux prix la première année.',
    ],
  },
  {
    id: 'money',
    icon: '🖨️',
    title: 'Faisons tourner la planche à billets',
    belief: 'Il suffit que la banque centrale imprime de l’argent pour financer l’État.',
    patch: { monetization: 0.8 },
    focus: ['inflation', 'rate', 'gdp', 'poor', 'debt'],
    mechanism: [
      'La banque centrale achète la dette : à court terme, l’État emprunte moins cher.',
      'Mais créer de la monnaie sans production en face fait monter les prix : l’inflation ronge les salaires et les pensions, surtout ceux des plus modestes.',
      'Les prêteurs anticipent l’inflation et la sortie des règles européennes : les taux finissent par remonter.',
    ],
  },
  {
    id: 'zero-migration',
    icon: '🛂',
    title: 'Zéro immigration',
    belief: 'Sans immigration, il y aurait plus d’emplois et moins de dépenses pour les Français.',
    patch: { netMigration: 0 },
    focus: ['gdp', 'unemployment', 'retirees', 'deficit', 'inflation'],
    mechanism: [
      'Les arrivants sont surtout en âge de travailler : sans eux, la population active diminue chaque année.',
      'Le chômage baisse un peu, mais parce qu’il y a moins de candidats : l’économie produit moins, et les pénuries de main-d’œuvre poussent les salaires et les prix.',
      'Il y a moins d’actifs pour financer chaque retraité.',
    ],
  },
  {
    id: 'retire-60',
    icon: '🏖️',
    title: 'La retraite à 60 ans',
    belief: 'Partir plus tôt libère des emplois pour les jeunes.',
    patch: { retirementAge: 60 },
    focus: ['deficit', 'debt', 'gdp', 'retirees', 'unemployment'],
    mechanism: [
      'Des centaines de milliers de personnes partent plus tôt : il faut payer leur pension plus longtemps.',
      'Ce ne sont pas des emplois libérés un pour un : il y a moins de gens au travail, donc moins de production et de cotisations.',
      'Le déficit des retraites se creuse et la dette monte.',
    ],
  },
  {
    id: 'live-longer',
    icon: '🩺',
    title: 'Vivre plus vieux sans travailler plus longtemps',
    belief: 'Mieux soigner et prévenir, c’est vivre plus longtemps, et l’âge de départ peut rester le même.',
    patch: { prevention: 25, health: 245, retirementAge: 62.75 },
    focus: ['life', 'retirees', 'deficit', 'debt', 'gdp'],
    mechanism: [
      'La prévention et le dépistage (cancer, maladies cardiaques) allongent la vie, avec quelques années de retard.',
      'Si l’âge de départ ne bouge pas, chaque année de vie gagnée est une année de retraite de plus à financer.',
      'Le nombre de retraités augmente plus vite que celui des actifs : il faut plus de cotisations, ou de la dette.',
    ],
  },
  {
    id: 'electric',
    icon: '⚡',
    title: 'Tout électrique',
    belief: 'Passer à l’électrique coûte cher et ne rapporte rien.',
    patch: { electrification: 0.05 },
    focus: ['energy', 'gdp', 'inflation', 'deficit'],
    mechanism: [
      'Il faut investir (bornes, pompes à chaleur, réseaux, véhicules) : ça coûte au début, mais ça fait aussi travailler.',
      'Chaque année, on importe moins de pétrole et de gaz : la facture extérieure baisse, et le prochain choc pétrolier fera moins mal.',
      'Avec 68 % d’électricité nucléaire, la France produit l’essentiel de son électricité elle-même.',
    ],
  },
  {
    id: 'big-works',
    icon: '🏗️',
    title: 'Lançons de grands chantiers',
    belief: 'Construire, c’est des emplois, de la consommation, donc de la croissance : ça se finance tout seul.',
    patch: { investment: 190 },
    focus: ['gdp', 'unemployment', 'deficit', 'debt', 'inflation'],
    mechanism: [
      'Les chantiers créent des emplois, qui créent des revenus, qui créent de la consommation : l’activité monte bien.',
      'Mais une partie de la dépense part en importations, et l’économie approche de ses limites : les prix montent.',
      'Les recettes fiscales supplémentaires ne couvrent pas tout : sans financement, la dette augmente. Les chantiers utiles (rail, réseaux) rendent l’économie un peu plus productive à long terme.',
    ],
  },
  {
    id: 'inheritance',
    icon: '⚱️',
    title: 'Supprimons l’héritage',
    belief: 'Si l’État récupérait tous les héritages, il n’y aurait plus d’inégalités de naissance et plus de déficit.',
    patch: { inheritanceTax: 1 },
    focus: ['deficit', 'debt', 'gini', 'rich', 'gdp'],
    mechanism: [
      '≈ 300 Md€ sont transmis chaque année : sur le papier, c’est énorme.',
      'En pratique, les patrimoines s’organisent pour échapper à l’impôt (donations, expatriation, montages), et les entreprises familiales sont fragilisées.',
      'Les inégalités de patrimoine reculent à long terme, mais celles de revenu bougent peu à court terme.',
    ],
    limits: 'L’ampleur de l’évitement (donations, départs, montages) est très incertaine : le modèle en retient la moitié à 100 %. Il ne simule pas non plus la disparition des entreprises familiales ni les effets sur l’envie d’entreprendre.',
  },
  {
    id: 'food',
    icon: '🥕',
    title: 'Une Sécurité sociale de l’alimentation',
    belief: '150 € par mois et par personne pour se nourrir, c’est impossible à financer.',
    patch: { foodSecurity: 150 },
    focus: ['poverty', 'poor', 'rich', 'gini', 'deficit'],
    mechanism: [
      'Le coût est énorme (≈ 125 Md€ par an), mais il est financé par une cotisation sur tous les revenus : le budget public reste équilibré.',
      'Chacun reçoit la même somme et cotise selon ses revenus : les modestes y gagnent, les aisés y perdent.',
      'C’est le principe de la Sécu, appliqué à l’alimentation : une mutualisation.',
    ],
  },
  {
    id: 'vat',
    icon: '🧾',
    title: 'Augmentons la TVA, c’est indolore',
    belief: 'La TVA est un impôt que personne ne voit : augmentons-la pour réduire le déficit.',
    patch: { vat: 0.25 },
    focus: ['deficit', 'inflation', 'poor', 'poverty', 'gdp'],
    mechanism: [
      'Elle rapporte beaucoup (≈ 9 Md€ par point) et réduit bien le déficit.',
      'Mais elle fait monter les prix : ceux qui dépensent tout leur revenu, les plus modestes, la paient proportionnellement le plus.',
      'La consommation ralentit un temps, puis la baisse du déficit fait baisser les taux et compense.',
    ],
  },
  {
    id: 'protection',
    icon: '🚧',
    title: 'Fermons les frontières aux importations',
    belief: 'Des droits de douane élevés protègent nos emplois.',
    patch: { tariffs: 0.2, tariffChinaEV: 1 },
    focus: ['inflation', 'gdp', 'unemployment', 'energy', 'poor'],
    mechanism: [
      'Les produits importés coûtent plus cher : une partie de la demande se reporte sur la production française.',
      'Mais tout le monde paie plus cher, et nos partenaires répliquent sur nos exportations.',
      'Les voitures électriques chinoises plus chères ralentissent l’électrification.',
    ],
  },
  {
    id: 'austerity',
    icon: '✂️',
    title: 'Il suffit de couper dans les dépenses',
    belief: 'Réduire fortement la dépense publique règle le problème de la dette.',
    patch: { otherServices: 210, health: 210, investment: 100 },
    focus: ['deficit', 'debt', 'gdp', 'unemployment', 'life'],
    mechanism: [
      'Le déficit baisse, mais moins que les économies faites : moins de dépense publique, c’est moins d’activité, donc moins de recettes.',
      'Le chômage monte le temps que l’économie s’ajuste, et moins de soins se paient plus tard en santé.',
      'Le ratio de dette baisse lentement : le PIB, au dénominateur, grandit moins vite.',
    ],
  },
]
