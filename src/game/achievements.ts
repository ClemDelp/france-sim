import type { YearState } from '../model/types'
import { electionAt, isElectionYear } from './score'

/** Ce qu'on regarde pour décerner un succès : la partie en cours, plus quelques actions du joueur. */
export type Context = {
  states: YearState[]
  elections: boolean
  lost: boolean
  /** Meilleures étoiles par scénario (gardées d'une partie à l'autre). */
  stars: Record<string, number>
  myths: number
  openedModel: boolean
}

export type Achievement = { id: string; icon: string; title: string; text: string; check: (c: Context) => boolean }

const played = (c: Context) => c.states.slice(1)
const wins = (c: Context) => (c.elections ? played(c).filter((s) => isElectionYear(s.year) && electionAt(s).won).length : 0)

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'reelu', icon: '🗳️', title: 'Réélu', text: 'Gagner une élection présidentielle.', check: (c) => wins(c) >= 1 },
  { id: 'dynastie', icon: '🏛️', title: 'Dynastie', text: 'Gagner trois élections d’affilée.', check: (c) => wins(c) >= 3 },
  { id: 'excedent', icon: '💶', title: 'Comme en 1974', text: 'Afficher un budget en excédent.', check: (c) => played(c).some((s) => s.deficit < 0) },
  { id: 'plein-emploi', icon: '👷', title: 'Plein emploi', text: 'Faire passer le chômage sous 5 %.', check: (c) => played(c).some((s) => s.unemployment < 0.05) },
  { id: 'robin', icon: '🏹', title: 'Robin des bois', text: 'Faire passer la pauvreté sous 11 %.', check: (c) => played(c).some((s) => s.poverty < 0.11) },
  { id: 'desendette', icon: '🪶', title: 'Poids plume', text: 'Ramener la dette sous 90 % du PIB.', check: (c) => played(c).some((s) => s.debtRatio < 0.9) },
  { id: 'electrique', icon: '⚡', title: 'Courant alternatif', text: 'Faire passer le pétrole et le gaz sous 30 % de l’énergie.', check: (c) => played(c).some((s) => s.fossilShare < 0.3) },
  {
    id: 'pompier',
    icon: '🧯',
    title: 'Pompier',
    text: 'Traverser une crise de la dette et tenir trois ans de plus.',
    check: (c) => {
      const crisis = played(c).find((s) => s.debtCrisis)
      return !!crisis && !c.lost && c.states.at(-1)!.year >= crisis.year + 3
    },
  },
  { id: 'bas-carbone', icon: '🌱', title: 'Bon élève de Paris', text: 'Ramener les émissions françaises sous 270 Mt (objectif 2030).', check: (c) => played(c).some((s) => s.frenchEmissions < 270) },
  { id: 'neutre', icon: '🌳', title: 'Presque neutre', text: 'Ramener les émissions françaises sous 100 Mt.', check: (c) => played(c).some((s) => s.frenchEmissions < 100) },
  { id: 'bouclier', icon: '🛡️', title: 'Bouclier climatique', text: 'Éviter 40 % des dégâts climatiques grâce à l’adaptation.', check: (c) => played(c).some((s) => s.adaptationCoverage >= 0.4) },
  { id: 'thermostat', icon: '🌡️', title: 'Thermostat', text: 'Atteindre 2075 sous +2 °C.', check: (c) => c.states.at(-1)!.year >= 2075 && c.states.at(-1)!.temperature < 2 },
  { id: 'paix', icon: '🕊️', title: 'Artisan de paix', text: 'Éviter 30 % des conflits et des départs forcés grâce à l’aide au développement.', check: (c) => played(c).some((s) => s.peaceEffect >= 0.3) },
  { id: 'voyageur', icon: '🚀', title: 'Voyageur du temps', text: 'Atteindre 2075.', check: (c) => (c.states.at(-1)?.year ?? 0) >= 2075 },
  { id: 'chute', icon: '🪦', title: 'On apprend en tombant', text: 'Perdre une partie.', check: (c) => c.lost },
  { id: 'etoiles', icon: '⭐', title: 'Trois étoiles', text: 'Réussir tous les objectifs d’un scénario.', check: (c) => Object.values(c.stars).some((n) => n >= 3) },
  { id: 'collection', icon: '🌟', title: 'Collectionneur', text: 'Gagner au moins une étoile dans cinq scénarios.', check: (c) => Object.values(c.stars).filter((n) => n >= 1).length >= 5 },
  { id: 'mythbuster', icon: '💡', title: 'Chasseur d’idées reçues', text: 'Tester trois idées reçues.', check: (c) => c.myths >= 3 },
  { id: 'curieux', icon: '🧠', title: 'Curieux', text: 'Ouvrir le cerveau du modèle.', check: (c) => c.openedModel },
]
