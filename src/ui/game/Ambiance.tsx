import type { CSSProperties } from 'react'
import type { EventDef, YearState } from '../../model/types'

type Props = { state: YearState; start: YearState; eventsThisYear: EventDef[] }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const FIRE_EVENTS = ['heatwave', 'wildfires', 'drought']

/** Ce que scandent les manifestants : les vraies raisons de la colère cette année. */
function slogans(s: YearState, start: YearState): string[] {
  const out: string[] = []
  if (s.retirementTarget > start.retirementTarget + 0.4) out.push('Retraites : pas touche !', `${Math.round(s.retirementTarget)} ans, c’est non !`)
  if (s.taxBurden - start.taxBurden > 0.02) out.push('Trop d’impôts !', 'Ras-le-bol fiscal !')
  if (s.unemployment > 0.085) out.push('Du travail !', 'Non aux licenciements !')
  if (s.inflation > 0.035) out.push('Pouvoir d’achat !', 'Les prix flambent !')
  if (s.rescueYears > 0) out.push('Non à l’austérité !', 'Troïka dehors !')
  if (s.temperature > 1.7 || s.climateDamage > 0.01) out.push('Climat : agissez !', 'Pas de planète B')
  if (s.poverty > start.poverty + 0.01) out.push('Justice sociale !')
  if (s.evasion > 0.05) out.push('Halte au matraquage !')
  if (!out.length) out.push('Ras-le-bol !', 'Écoutez-nous !')
  return out
}

/**
 * L'ambiance du pays, à l'écran : la planète qui brûle (rouge, flammes), la colère qui gronde (pancartes),
 * (la panique des marchés : PanicTicker, accroché sous l'en-tête). Purement décoratif : rien ne bloque la souris.
 */
export function Ambiance({ state: s, start, eventsThisYear }: Props) {
  const heatEvent = eventsThisYear.some((e) => FIRE_EVENTS.includes(e.id))
  const fire = Math.max(clamp01((s.temperature - 1.5) / 1.2), clamp01(s.climateDamage / 0.05), heatEvent ? 0.6 : 0)
  const anger = clamp01((s.discontent - 0.3) / 0.6)
  const words = slogans(s, start)
  const signs = Math.round(anger * 8)
  const flames = Math.round(fire * 16)
  return (
    <div className="ambiance" aria-hidden="true" style={{ '--fire': fire, '--anger': anger } as CSSProperties}>
      {fire > 0.05 ? <div className="amb-heat" /> : null}
      {flames ? (
        <div className="amb-flames">
          {Array.from({ length: flames }, (_, i) => (
            <span key={i} style={{ left: `${(i / flames) * 100 + ((i * 37) % 7)}%`, animationDelay: `${(i * 0.37) % 1.5}s`, fontSize: `${1.4 + ((i * 13) % 5) * 0.3}rem` }}>
              🔥
            </span>
          ))}
        </div>
      ) : null}
      {signs ? (
        <div className="amb-protest">
          {Array.from({ length: signs }, (_, i) => (
            <div key={i} className={`sign ${i % 2 ? 'sign-right' : 'sign-left'}`} style={{ left: `${30 + ((i * 17) % 62)}%`, bottom: `${190 + (i % 3) * 26}px`, animationDelay: `${(i * 0.43) % 1.2}s` }}>
              <span>{words[i % words.length]}</span>
              <i />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** La panique des marchés : un bandeau rouge qui défile juste sous l'en-tête (quelle que soit sa hauteur). */
export function PanicTicker({ state: s }: { state: YearState }) {
  if (!s.debtCrisis && s.marketStress < 0.85) {
    return null
  }
  const rate = (s.rate * 100).toFixed(1).replace('.', ',')
  return (
    <div className="amb-panic" aria-hidden="true">
      <span>
        📉 PANIQUE SUR LES MARCHÉS · TAUX À {rate} % · LES PRÊTEURS DOUTENT · 📉 PANIQUE SUR LES MARCHÉS · TAUX À {rate} %
      </span>
    </div>
  )
}
