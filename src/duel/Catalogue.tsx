import { useEffect, useMemo, useState } from 'react'
import { CANDIDATES, candidateById, type Candidate } from '../game/candidates'
import { num } from '../ui/format'
import { ACTIONS, cardArt, cardName, copiesOf, CRISES, generic, GENERIC_MEASURES, isAdded, PLAYABLE_MEASURES, programmeOf, rarityOf, taglineOf, type ActionId, type Card, type CrisisId } from './cards'
import { CONTEXTS, type ContextId } from './contexts'
import { baseCost, budgetCost, neutralGame } from './engine'
import { cardImpact, type Impact } from './why'
import { WhyPage } from './WhyPage'
import { useBack } from './back'

/**
 * Toutes les cartes du jeu, pour comprendre (et déboguer) le duel : les mesures, les promesses de chaque candidat,
 * les coups, les parades, les actions, les légendaires et les conjonctures. Pour chacune : son coût, ce qu'elle coûte
 * au budget la première année (calculé par le modèle sur la France de 2027), sa rareté, combien d'exemplaires dans
 * la pioche, et son effet principal. Toucher une carte ouvre sa page « Pourquoi ? », sur une France neutre.
 */

type Group = 'mesure' | 'promesse' | 'coup' | 'parade' | 'action' | 'legendaire'

type Entry = {
  card: Card
  group: Group
  /** Le candidat sans qui la carte n'est pas dans la pioche (sa promesse, son coup signature). */
  owner: Candidate | null
  /** Pour une mesure générale : les candidats qui la promettent (leur version remplace alors la générale). */
  promisedBy: Candidate[]
  kind: { cls: string; label: string }
}

const GROUPS: { id: Group | 'tout' | 'contexte'; label: string }[] = [
  { id: 'tout', label: 'Tout' },
  { id: 'mesure', label: '📜 Mesures' },
  { id: 'promesse', label: '⭐ Promesses' },
  { id: 'coup', label: '💥 Coups' },
  { id: 'parade', label: '🛡️ Parades' },
  { id: 'action', label: '🎴 Actions' },
  { id: 'legendaire', label: '🌟 Légendaires' },
  { id: 'contexte', label: '🌍 Conjonctures' },
]

const crisisKind = (id: CrisisId) => {
  const { family } = CRISES[id]
  return { cls: 'kind-crise', label: family === 'politique' ? '🎯 Coup politique' : family === 'scandale' ? '🗞️ Scandale' : '💥 Crise' }
}

function actionEntry(id: ActionId): Entry {
  const def = ACTIONS[id]
  const card: Card = { kind: 'action', action: id, uid: `cat-${id}` }
  const legend = rarityOf(card) === 'legendaire'
  const owner = def.signature ? (candidateById(def.signature) ?? null) : null
  const label = legend ? '🌟 Légendaire' : owner ? `${owner.emblem} Signature` : def.reaction ? '🛡️ Parade' : def.events?.length ? '🎉 Événement' : '🎴 Action'
  return { card, group: legend ? 'legendaire' : def.reaction ? 'parade' : 'action', owner, promisedBy: [], kind: { cls: 'kind-action', label } }
}

function allEntries(): Entry[] {
  // Les promesses jouées : toutes celles que le moteur sait jouer, pour chaque candidat.
  const programmes = CANDIDATES.map((c) => ({ c, pledges: programmeOf(c, 0, 'catalogue').filter((p) => !isAdded(p)) }))
  const promises: Entry[] = programmes.flatMap(({ c, pledges }) =>
    pledges.map((pledge, i) => ({
      card: { kind: 'mesure' as const, pledge, uid: `cat-${c.id}-${i}` },
      group: 'promesse' as const,
      owner: c,
      promisedBy: [],
      kind: { cls: 'kind-promesse', label: `⭐ ${c.emblem} ${c.name}` },
    })),
  )
  const measures: Entry[] = PLAYABLE_MEASURES.map((m) => ({
    card: { kind: 'mesure' as const, pledge: generic(m.id), uid: `cat-${m.id}` },
    group: 'mesure' as const,
    owner: null,
    promisedBy: programmes.filter(({ pledges }) => pledges.some((p) => p.measure!.id === m.id)).map(({ c }) => c),
    kind: { cls: 'kind-mesure', label: '📜 Mesure' },
  }))
  const coups: Entry[] = (Object.keys(CRISES) as CrisisId[]).map((id) => ({ card: { kind: 'crise', crisis: id, uid: `cat-${id}` }, group: 'coup', owner: null, promisedBy: [], kind: crisisKind(id) }))
  return [...measures, ...promises, ...coups, ...(Object.keys(ACTIONS) as ActionId[]).map(actionEntry)]
}

/** Combien d'exemplaires dans la pioche, et à quelle condition. */
function copiesText(e: Entry): string {
  if (e.group === 'promesse') {
    return `×1 · seulement si ${e.owner!.name} est dans la partie`
  }
  if (e.group === 'mesure') {
    const also = e.promisedBy.length ? ` · ou en promesse si ${e.promisedBy.map((c) => c.name).join(', ')} est dans la partie` : ''
    return `🎲 ${GENERIC_MEASURES} tirées sur ${PLAYABLE_MEASURES.length} à chaque partie${also}`
  }
  const n = copiesOf(e.card)
  return e.owner ? `×${n} · seulement si ${e.owner.name} est dans la partie` : `×${n}`
}

const RARITY_TEXT = { commune: 'Commune', rare: '◆ Rare', legendaire: '🌟 Légendaire' }

const mdText = (md: number) => `${md > 0 ? '+' : md < 0 ? '−' : '±'}${num(Math.abs(md), Math.abs(md) < 10 ? 1 : 0)} Md€`
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${num(Math.abs(v), 0)}`

/** Ce que le modèle dit d'une carte, calculé petit à petit (une centaine de cartes, deux simulations chacune). */
type Computed = { md: number; impact: Impact | null }

export function Catalogue({ onClose }: { onClose: () => void }) {
  const g = useMemo(() => neutralGame(), [])
  const entries = useMemo(() => allEntries(), [])
  const [group, setGroup] = useState<Group | 'tout' | 'contexte'>('tout')
  const [who, setWho] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Entry | null>(null)
  // Le retour du téléphone referme la carte ouverte, pas tout le catalogue.
  useBack(!!open, () => setOpen(null))
  const [computed, setComputed] = useState<Map<string, Computed>>(() => new Map())

  // Le modèle calcule chaque carte à son tour, sans bloquer l'écran.
  useEffect(() => {
    let i = 0
    let timer = 0
    const step = () => {
      const batch = entries.slice(i, i + 4)
      i += batch.length
      setComputed((prev) => {
        const next = new Map(prev)
        for (const e of batch) {
          const side = 'player'
          next.set(e.card.uid, { md: budgetCost(g, side, e.card), impact: cardImpact(g, side, e.card) })
        }
        return next
      })
      if (i < entries.length) {
        timer = window.setTimeout(step, 0)
      }
    }
    timer = window.setTimeout(step, 50)
    return () => window.clearTimeout(timer)
  }, [entries, g])

  const words = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  const matches = (text: string) => {
    const t = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
    return words.every((w) => t.includes(w))
  }
  const shown = entries.filter(
    (e) =>
      (group === 'tout' || group === e.group) &&
      (!who || e.owner?.id === who || e.promisedBy.some((c) => c.id === who)) &&
      matches(`${cardName(e.card)} ${e.kind.label} ${taglineOf(e.card) ?? ''} ${e.card.kind === 'mesure' ? e.card.pledge.quote : ''}`),
  )
  const contexts = (Object.keys(CONTEXTS) as ContextId[]).filter((id) => (group === 'tout' || group === 'contexte') && !who && matches(`${CONTEXTS[id].name} ${CONTEXTS[id].rule}`))

  return (
    <div className="dlc" role="dialog" aria-modal="true" aria-label="Toutes les cartes">
      <header className="dlg-top">
        <button type="button" className="ghost small" onClick={onClose}>
          ← Retour
        </button>
        <strong className="dl-year">🃏 Toutes les cartes</strong>
        <small className="dlc-count">{shown.length + (group === 'contexte' || group === 'tout' ? contexts.length : 0)}</small>
      </header>
      <div className="dlc-filters">
        <div className="dlc-groups" role="radiogroup" aria-label="Type de carte">
          {GROUPS.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={group === x.id} className={group === x.id ? 'is-on' : ''} onClick={() => setGroup(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="dlc-search">
          <input type="search" placeholder="🔍 Chercher (immigration, SMIC…)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Chercher une carte" />
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Candidat">
            <option value="">Tous les candidats</option>
            {CANDIDATES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emblem} {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="dlc-list">
        {group !== 'contexte'
          ? shown.map((e) => {
              const c = computed.get(e.card.uid)
              const rarity = rarityOf(e.card)
              const spends = e.card.kind === 'mesure' || (e.card.kind === 'action' && !!ACTIONS[e.card.action].spend)
              return (
                <button key={e.card.uid} type="button" className="dlc-row" onClick={() => setOpen(e)} style={e.owner ? ({ '--c': e.owner.color } as React.CSSProperties) : undefined}>
                  <span className={`dl-card mini ${e.kind.cls} ${rarity === 'commune' ? '' : `rar-${rarity}`}`} aria-hidden="true">
                    <span className="dl-cost">⚡{baseCost(e.card)}</span>
                    <span className="dl-art">{cardArt(e.card)}</span>
                  </span>
                  <span className="dlc-info">
                    <strong>{cardName(e.card)}</strong>
                    <small className="dlc-kind">
                      {e.kind.label} · {RARITY_TEXT[rarity]}
                    </small>
                    <small className="dlc-copies">{copiesText(e)}</small>
                    <span className="dlc-fx">
                      {spends && c ? <i className={c.md > 0.05 ? 'bad' : c.md < -0.05 ? 'good' : ''}>💶 {mdText(c.md)}</i> : null}
                      {c?.impact ? (
                        <>
                          <i className={!c.impact.health ? '' : c.impact.health > 0 === (c.impact.target === 'player') ? 'good' : 'bad'}>
                            📊 {c.impact.target === 'player' ? 'Note' : 'Sa note'} {signed(c.impact.health)}
                          </i>
                          {c.impact.indicators.slice(0, 2).map((ind) => (
                            <i key={ind.node} className={ind.good === (c.impact!.target === 'player') ? 'good' : 'bad'}>
                              {ind.label} {ind.text}
                            </i>
                          ))}
                        </>
                      ) : c ? (
                        <i>🎴 Règles du duel</i>
                      ) : (
                        <i>⏳</i>
                      )}
                    </span>
                  </span>
                </button>
              )
            })
          : null}
        {contexts.map((id) => {
          const ctx = CONTEXTS[id]
          return (
            <div key={id} className="dlc-row is-context">
              <span className="dl-card mini kind-contexte" aria-hidden="true">
                <span className="dl-art">{ctx.art}</span>
              </span>
              <span className="dlc-info">
                <strong>{ctx.name}</strong>
                <small className="dlc-kind">🌍 Conjoncture · ×1, une par année</small>
                <small>{ctx.text}</small>
                <small className="dlc-rule">{ctx.rule}</small>
              </span>
            </div>
          )
        })}
        {!shown.length && !contexts.length ? <p className="note">Aucune carte ne correspond.</p> : null}
      </div>
      {open ? (
        <WhyPage
          g={g}
          card={open.card}
          side="player"
          kind={open.kind}
          onBack={() => setOpen(null)}
          backLabel="← Toutes les cartes"
          neutral
          pager={{ index: Math.max(0, shown.findIndex((e) => e.card.uid === open.card.uid)), count: shown.length, onGo: (i) => setOpen(shown[i]) }}
        />
      ) : null}
    </div>
  )
}
