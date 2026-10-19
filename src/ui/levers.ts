import type { PolicyKey } from '../model/types'

export type LeverDef = {
  key: PolicyKey
  label: string
  min: number
  max: number
  step: number
  /** Comment afficher la valeur. */
  unit: 'pct' | 'bn' | 'years' | 'thousands' | 'euros' | 'share'
  hint: string
}

export type LeverGroup = { id: string; label: string; icon: string; levers: LeverDef[] }

/** Tous les leviers du jeu, rangés par thème. */
export const LEVER_GROUPS: LeverGroup[] = [
  {
    id: 'impots',
    label: 'Impôts',
    icon: '💶',
    levers: [
      { key: 'vat', label: 'TVA (taux normal)', min: 0.1, max: 0.3, step: 0.005, unit: 'pct', hint: '1 point de TVA rapporte ≈ 9 Md€. Elle pèse plus lourd sur ceux qui dépensent tout leur revenu.' },
      { key: 'incomeTaxTop', label: 'Impôt sur le revenu des plus aisés', min: -0.05, max: 0.15, step: 0.005, unit: 'pct', hint: 'Points d’imposition ajoutés aux 10 % les plus riches (un quart pour les aisés).' },
      { key: 'csg', label: 'CSG', min: 0.06, max: 0.14, step: 0.002, unit: 'pct', hint: 'Prélevée sur presque tous les revenus, elle finance la Sécu.' },
      { key: 'corporateTax', label: 'Impôt sur les sociétés', min: 0, max: 0.4, step: 0.01, unit: 'pct', hint: 'Taux sur les bénéfices des entreprises (25 % aujourd’hui).' },
      { key: 'wealthTax', label: 'Impôt sur la fortune', min: 0, max: 0.05, step: 0.0025, unit: 'pct', hint: 'Taux annuel sur les gros patrimoines financiers. Plus il est haut, plus les fortunes partent ou se cachent.' },
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
    ],
  },
  {
    id: 'secu',
    label: 'Sécurité sociale',
    icon: '🤝',
    levers: [
      { key: 'retirementAge', label: 'Âge de départ à la retraite', min: 60, max: 67, step: 0.25, unit: 'years', hint: 'La loi actuelle mène à 64 ans en 2032. Monter se fait de 3 mois par an au plus.' },
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
      { key: 'netMigration', label: 'Solde migratoire', min: -100, max: 400, step: 10, unit: 'thousands', hint: '+176 000 par an en 2025. Les arrivants sont surtout en âge de travailler.' },
    ],
  },
  {
    id: 'energie',
    label: 'Énergie',
    icon: '⚡',
    levers: [
      { key: 'electrification', label: 'Rythme d’électrification', min: 0, max: 0.08, step: 0.0025, unit: 'pct', hint: 'Part du pétrole et du gaz remplacée chaque année par l’électricité. Coûte de l’investissement, réduit la facture importée et l’exposition aux chocs.' },
      { key: 'nuclearShare', label: 'Part du nucléaire dans l’électricité', min: 0, max: 0.85, step: 0.01, unit: 'pct', hint: '68 % en 2025. Moins de nucléaire = électricité plus chère et plus de gaz.' },
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
  }
}
