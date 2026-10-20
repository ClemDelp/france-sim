import type { Policy } from '../model/types'

/**
 * Trois grands programmes économiques, à appliquer d'un coup (au prix d'un énorme capital politique) ou petit à petit.
 * Ce sont des caricatures cohérentes, pas les programmes de partis réels.
 */
export type Doctrine = { id: string; icon: string; title: string; text: string; patch: Partial<Policy> }

export const DOCTRINES: Doctrine[] = [
  {
    id: 'liberal',
    icon: '🦅',
    title: 'Ultra-libéral',
    text: 'Privatiser, déréglementer, baisser les impôts et les dépenses publiques, alléger les protections.',
    patch: { publicOwnership: 0, regulation: 0.15, corporateTax: 0.15, wealthTax: 0, incomeTaxTop: -0.03, inheritanceTax: 0.03, otherServices: 210, firmAid: 40, unemploymentReplacement: 0.45, minima: -10, smicBoost: -0.05, retirementAge: 66, tariffs: 0 },
  },
  {
    id: 'actuel',
    icon: '⚖️',
    title: 'L’entre-deux actuel',
    text: 'Une économie de marché très encadrée, un État-providence large et des entreprises publiques dans l’énergie et les transports.',
    patch: { publicOwnership: 0.1, regulation: 0.6, corporateTax: 0.25, wealthTax: 0, incomeTaxTop: 0, inheritanceTax: 0.067, otherServices: 260, firmAid: 75, unemploymentReplacement: 0.57, minima: 0, smicBoost: 0, retirementAge: 64, tariffs: 0 },
  },
  {
    id: 'etatiste',
    icon: '🏭',
    title: 'Étatiste',
    text: 'Nationaliser les grandes entreprises, encadrer fortement, taxer le capital, étendre les services publics et protéger le marché intérieur.',
    patch: { publicOwnership: 0.45, regulation: 0.9, corporateTax: 0.33, wealthTax: 0.015, incomeTaxTop: 0.05, inheritanceTax: 0.15, otherServices: 290, firmAid: 75, unemploymentReplacement: 0.65, minima: 20, smicBoost: 0.1, retirementAge: 62, tariffs: 0.1 },
  },
]
