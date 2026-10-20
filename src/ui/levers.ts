import type { PolicyKey } from '../model/types'

export type LeverDef = {
  key: PolicyKey
  label: string
  min: number
  max: number
  step: number
  /** Comment afficher la valeur. */
  unit: 'pct' | 'bn' | 'years' | 'thousands' | 'euros' | 'share' | 'perTon'
  hint: string
  /** Poids politique d'une réforme sur ce levier (1 = normal ; 2 = très contestée). */
  weight?: number
}

export type LeverGroup = { id: string; label: string; icon: string; levers: LeverDef[] }

/** Tous les leviers du jeu, rangés par thème. */
export const LEVER_GROUPS: LeverGroup[] = [
  {
    id: 'impots',
    label: 'Impôts',
    icon: '💶',
    levers: [
      { key: 'vat', weight: 1.5, label: 'TVA (taux normal)', min: 0.1, max: 0.3, step: 0.005, unit: 'pct', hint: '1 point de TVA rapporte ≈ 9 Md€. Elle pèse plus lourd sur ceux qui dépensent tout leur revenu.' },
      { key: 'incomeTaxTop', label: 'Impôt sur le revenu des plus aisés', min: -0.05, max: 0.15, step: 0.005, unit: 'pct', hint: 'Points d’imposition ajoutés aux 10 % les plus riches (un quart pour les aisés).' },
      { key: 'csg', weight: 1.5, label: 'CSG', min: 0.06, max: 0.14, step: 0.002, unit: 'pct', hint: 'Prélevée sur presque tous les revenus, elle finance la Sécu.' },
      { key: 'corporateTax', label: 'Impôt sur les sociétés', min: 0, max: 0.4, step: 0.01, unit: 'pct', hint: 'Taux sur les bénéfices des entreprises (25 % aujourd’hui).' },
      { key: 'wealthTax', weight: 1.5, label: 'Impôt sur la fortune', min: 0, max: 0.05, step: 0.0025, unit: 'pct', hint: 'Taux annuel sur les gros patrimoines financiers. Plus il est haut, plus les fortunes partent ou se cachent.' },
      { key: 'inheritanceTax', label: 'Droits de succession', min: 0, max: 1, step: 0.01, unit: 'pct', hint: '≈ 300 Md€ transmis chaque année. Taux moyen ≈ 7 % aujourd’hui ; 100 % = suppression de l’héritage.' },
      { key: 'productionTaxes', label: 'Impôts de production', min: 100, max: 260, step: 5, unit: 'bn', hint: 'Payés par les entreprises quel que soit leur bénéfice (Md€ de 2025).' },
    ],
  },
  {
    id: 'depenses',
    label: 'Dépenses publiques',
    icon: '🏛️',
    levers: [
      { key: 'health', label: 'Santé (soins)', min: 150, max: 330, step: 5, unit: 'bn', hint: 'Hôpital, médecine de ville, médicaments (Md€ de 2025).' },
      { key: 'prevention', label: 'Prévention et dépistage', min: 0, max: 40, step: 1, unit: 'bn', hint: '≈ 9 Md€ aujourd’hui. Ex. : dépistage annuel du cancer pour les 50 ans et plus. Allonge l’espérance de vie, avec retard.' },
      { key: 'education', label: 'Éducation', min: 100, max: 230, step: 5, unit: 'bn', hint: 'Effet sur la productivité, lent : 10 à 20 ans.' },
      { key: 'defence', label: 'Défense', min: 30, max: 160, step: 5, unit: 'bn', hint: '≈ 60 Md€ aujourd’hui ; l’OTAN demande 3,5 % du PIB (≈ 105 Md€).' },
      { key: 'investment', label: 'Investissement public, grands chantiers', min: 60, max: 300, step: 5, unit: 'bn', hint: 'Routes, rail, logement, réseaux. Soutient l’activité et un peu la productivité.' },
      { key: 'otherServices', label: 'Autres services publics', min: 180, max: 340, step: 5, unit: 'bn', hint: 'Police, justice, collectivités, administration.' },
      { key: 'firmAid', label: 'Aides aux entreprises', min: 0, max: 150, step: 5, unit: 'bn', hint: 'Subventions et aides directes (≈ 75 Md€ dans ce modèle ; 112 à 272 Md€ selon les définitions larges).' },
      { key: 'firmAidSmeShare', label: 'Part des aides allant aux PME', min: 0, max: 1, step: 0.05, unit: 'pct', hint: 'Aujourd’hui ≈ 45 %. Une PME manque souvent de trésorerie : elle investit une plus grande part de l’aide qu’un grand groupe.' },
    ],
  },
  {
    id: 'secu',
    label: 'Sécurité sociale',
    icon: '🤝',
    levers: [
      { key: 'retirementAge', weight: 2, label: 'Âge de départ à la retraite', min: 60, max: 67, step: 0.25, unit: 'years', hint: 'La loi actuelle mène à 64 ans en 2032. Monter se fait de 3 mois par an au plus.' },
      { key: 'pensionIndexation', label: 'Indexation des retraites sur les prix', min: 0, max: 1.2, step: 0.05, unit: 'share', hint: '100 % = les pensions suivent l’inflation. Moins = gel partiel.' },
      { key: 'unemploymentReplacement', label: 'Allocation chômage (taux de remplacement)', min: 0.3, max: 0.8, step: 0.01, unit: 'pct', hint: 'Part de l’ancien salaire versée aux chômeurs indemnisés.' },
      { key: 'minima', label: 'Minima sociaux en plus', min: -20, max: 80, step: 5, unit: 'bn', hint: 'RSA, prime d’activité, aides au logement : surtout aux 20 % les plus modestes.' },
      { key: 'foodSecurity', label: 'Sécurité sociale de l’alimentation', min: 0, max: 250, step: 10, unit: 'euros', hint: 'Une somme par personne et par mois pour se nourrir, financée par une cotisation sur les revenus. 150 € ≈ 125 Md€ par an.' },
    ],
  },
  {
    id: 'travail',
    label: 'Travail et population',
    icon: '👷',
    levers: [
      { key: 'smicBoost', label: 'Coup de pouce au SMIC', min: -0.1, max: 0.4, step: 0.01, unit: 'pct', hint: 'En plus de l’indexation. Augmente les bas salaires, mais renchérit le travail peu qualifié.' },
    ],
  },
  {
    id: 'energie',
    label: 'Énergie',
    icon: '⚡',
    levers: [
      { key: 'electrification', label: 'Rythme d’électrification', min: 0, max: 0.08, step: 0.0025, unit: 'pct', hint: 'Part du pétrole et du gaz remplacée chaque année par l’électricité. Coûte de l’investissement, réduit la facture importée et l’exposition aux chocs.' },
      { key: 'nuclearShare', label: 'Part du nucléaire dans l’électricité', min: 0, max: 0.85, step: 0.01, unit: 'pct', weight: 1.5, hint: '68 % en 2025. Moins de nucléaire = électricité plus chère et plus de gaz.' },
    ],
  },
  {
    id: 'immigration',
    label: 'Immigration',
    icon: '🧳',
    levers: [
      { key: 'netMigration', label: 'Immigration légale', min: -50, max: 400, step: 10, unit: 'thousands', weight: 1.5, hint: '≈ 120 000 par an en 2025 (travail, études, famille). S’y ajoutent ≈ 56 000 arrivées hors voies légales, qui dépendent des guerres et du climat dans le monde, pas de ce levier.' },
      { key: 'borderControl', label: 'Contrôle et reconduites', min: 0, max: 20, step: 0.5, unit: 'bn', weight: 1.5, hint: '≈ 2 Md€ par an. Réduit les arrivées irrégulières, mais avec des rendements décroissants : au mieux la moitié, quoi qu’on dépense.' },
      { key: 'integration', label: 'Intégration des arrivants', min: 0, max: 15, step: 0.5, unit: 'bn', hint: '≈ 1,5 Md€ par an. Langue, formation, logement : les arrivants trouvent plus vite un emploi, et l’accueil crée moins de tensions.' },
      { key: 'softPower', label: 'Rayonnement culturel et diplomatie', min: 0, max: 30, step: 0.5, unit: 'bn', hint: '≈ 6 Md€ par an (culture, audiovisuel extérieur, réseau diplomatique). Renforce l’influence de la France : accords plus faciles, moins de représailles, exportations, confiance des prêteurs.' },
      { key: 'developmentAid', label: 'Aide au développement et à la paix', min: 0, max: 60, step: 1, unit: 'bn', hint: '≈ 15 Md€ par an (0,5 % du revenu national). Prévient guerres et misère sur le long terme : moins de conflits, moins de départs forcés.' },
    ],
  },
  {
    id: 'modele',
    label: 'Modèle économique',
    icon: '🏛️',
    levers: [
      { key: 'publicOwnership', label: 'Entreprises contrôlées par l’État', min: 0, max: 0.6, step: 0.05, unit: 'pct', weight: 2, hint: '≈ 10 % en 2025 (EDF, SNCF, La Poste…). Nationaliser : l’État rachète en obligations (la dette monte), touche les dividendes, oriente l’investissement, mais fait fuir des capitaux. Privatiser : l’inverse.' },
      { key: 'regulation', label: 'Intensité des règles', min: 0, max: 1, step: 0.05, unit: 'share', weight: 2, hint: '60 % en 2025. Moins de règles (licenciement, normes, concurrence) : plus de productivité et d’embauches, mais plus de précarité, d’inégalités et d’émissions. Plus de règles : l’inverse.' },
    ],
  },
  {
    id: 'climat',
    label: 'Climat',
    icon: '🌍',
    levers: [
      { key: 'carbonTax', label: 'Taxe carbone', min: 0, max: 400, step: 5, unit: 'perTon', weight: 1.5, hint: '44,6 € la tonne en 2025 (gelée depuis la crise des gilets jaunes). Réduit les émissions et rapporte, mais renchérit le carburant et le chauffage : les modestes trinquent si on ne redistribue pas.' },
      { key: 'adaptation', label: 'Adaptation au réchauffement', min: 0, max: 40, step: 1, unit: 'bn', hint: '≈ 3 Md€ par an aujourd’hui. Digues, eau, bâtiments, cultures : réduit les dégâts et la colère quand le climat se dérègle, mais jamais à 100 %.' },
      { key: 'climateAid', label: 'Aide climat aux pays du Sud', min: 0, max: 50, step: 1, unit: 'bn', hint: '≈ 6 Md€ par an. Une tonne évitée ailleurs coûte souvent moins cher qu’en France, et c’est le monde entier qui fait la température.' },
    ],
  },
  {
    id: 'commerce',
    label: 'Commerce',
    icon: '🚢',
    levers: [
      { key: 'tariffs', label: 'Droits de douane (hors UE)', min: 0, max: 0.4, step: 0.01, unit: 'pct', hint: 'Protège la production, renchérit les prix, provoque des représailles sur nos exportations.' },
      { key: 'tariffChinaEV', label: 'Droits sur les voitures électriques chinoises', min: 0, max: 1, step: 0.05, unit: 'pct', hint: '≈ 27 à 45 % aujourd’hui (10 % + droits compensateurs). Protège l’industrie automobile, ralentit l’électrification.' },
    ],
  },
  {
    id: 'monnaie',
    label: 'Dette et monnaie',
    icon: '🏦',
    levers: [
      { key: 'monetization', label: 'Planche à billets', min: 0, max: 1, step: 0.05, unit: 'pct', hint: 'Part du déficit financée par la banque centrale. Interdit par les traités européens.' },
      { key: 'savingsToFirms', label: 'Orienter l’épargne vers les entreprises françaises', min: 0, max: 0.4, step: 0.01, unit: 'pct', hint: 'Part du Livret A et de l’assurance-vie redirigée vers le capital des entreprises.' },
    ],
  },
]

export const ALL_LEVERS = LEVER_GROUPS.flatMap((g) => g.levers)

export function formatLever(def: LeverDef, v: number): string {
  const n = (x: number, d = 1) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(x)
  switch (def.unit) {
    case 'pct':
      return `${n(v * 100, 1)} %`
    case 'bn':
      return `${n(v, 0)} Md€`
    case 'years':
      return `${n(v, 2)} ans`
    case 'thousands':
      return v === 0 ? '0 / an' : `${n(v, 0)} 000 / an`
    case 'euros':
      return `${n(v, 0)} € / mois`
    case 'share':
      return `${n(v * 100, 0)} %`
    case 'perTon':
      return `${n(v, 0)} € / t`
  }
}
