import { useEffect, useMemo, useState } from 'react'
import { cardName } from './cards'
import { Intro, Setup, Table, type Stage } from './Duel'
import { newGame, other, resolveYear, type Game, type Player, type Side } from './engine'
import { GuestMatch, HostMatch, type Saved } from './match'
import { actorOf, applyIntent, entrantPlayer, isCode, newCode, viewFor, type Entrant, type Intent } from './online'
import { openGuest, openHost, type NetState } from './peer'
import { sfx } from './sound'
import './duel.css'

/**
 * Jouer avec un ami : en ligne (on crée une partie, on envoie le lien, l'ami la rejoint), ou à deux sur le même téléphone.
 * En ligne, le téléphone de celui qui crée la partie fait l'arbitre ; aucun serveur à nous, le site reste un site statique.
 */

const RESOLVE_DELAY = 900
const PSEUDO_KEY = 'france-sim-pseudo'
const HOST_KEY = 'france-sim-hote'

// — Ce qu'on garde dans le navigateur (un accès qui peut échouer : navigation privée, stockage bloqué)

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    }
  } catch {
    // Pas de stockage : la partie ne se reprendra pas après un rechargement, c'est tout.
  }
}

const readPseudo = () => {
  try {
    return window.localStorage.getItem(PSEUDO_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Ce qu'on envoie de son président : son identifiant, ou un programme surprise à son pseudo. */
const entrantOf = (p: Player, nick: string): Entrant => ({ candidate: p.candidate?.id ?? null, nick: nick || (p.candidate ? '' : 'Mon programme') })

const linkFor = (code: string) => `${window.location.origin}${window.location.pathname}#rejoindre/${code}`

// — Le menu : créer, rejoindre, ou jouer à deux sur ce téléphone

export function Friends({ onExit, onHost, onJoin, onLocal }: { onExit: () => void; onHost: (code: string) => void; onJoin: (code: string) => void; onLocal: () => void }) {
  const [nick, setNick] = useState(readPseudo)
  const [code, setCode] = useState('')
  const saved = useMemo(() => read<Saved>(HOST_KEY), [])
  const resumable = saved?.game && !saved.game.outcome ? saved : null
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return (
    <div className="dlg dlg-setup dlo">
      <header className="dlg-top">
        <button type="button" className="ghost small" onClick={onExit}>
          ← Accueil
        </button>
        <strong className="dl-year">🤝 Jouer avec un ami</strong>
        <span />
      </header>
      <main className="dlo-menu">
        <label className="dlo-field">
          <span>Votre pseudo</span>
          <input
            value={nick}
            maxLength={16}
            placeholder="Ex. : Julie"
            onChange={(e) => {
              setNick(e.target.value)
              write(PSEUDO_KEY, e.target.value.trim() || null)
            }}
          />
        </label>
        {resumable ? (
          <button type="button" className="dlo-card is-resume" onClick={() => onHost(resumable.code)}>
            <span aria-hidden="true">▶</span>
            <strong>Reprendre la partie {resumable.code}</strong>
            <small>🔗 Même lien, même partie</small>
          </button>
        ) : null}
        <button
          type="button"
          className="dlo-card"
          onClick={() => {
            sfx('select')
            onHost(newCode())
          }}
        >
          <span aria-hidden="true">🌐</span>
          <strong>Créer une partie en ligne</strong>
          <small>📨 Un lien à envoyer</small>
        </button>
        <form
          className="dlo-card dlo-join"
          onSubmit={(e) => {
            e.preventDefault()
            if (isCode(clean)) {
              sfx('select')
              onJoin(clean)
            }
          }}
        >
          <span aria-hidden="true">🔑</span>
          <strong>Rejoindre avec un code</strong>
          <span className="dlo-join-row">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC123" maxLength={8} autoCapitalize="characters" autoComplete="off" aria-label="Le code de la partie" />
            <button type="submit" className="primary" disabled={!isCode(clean)}>
              Rejoindre
            </button>
          </span>
        </form>
        <button
          type="button"
          className="dlo-card"
          onClick={() => {
            sfx('select')
            onLocal()
          }}
        >
          <span aria-hidden="true">📱</span>
          <strong>À deux sur ce téléphone</strong>
          <small>🔄 On se passe le téléphone</small>
        </button>
      </main>
      <p className="note dlg-setup-foot" title="En ligne, vos deux téléphones se parlent en direct (WebRTC) : pas de compte, aucune donnée gardée ailleurs.">🔒 Sans compte · en direct</p>
    </div>
  )
}

// — Les états de la connexion, en une pastille ; et ce qui recouvre la table quand l'ami n'est plus là

function NetPill({ net, friend }: { net: NetState; friend: string }) {
  const [dot, label] =
    net.status === 'connecte'
      ? ['🟢', friend]
      : net.status === 'attente'
        ? ['🟡', 'En attente…']
        : net.status === 'courtier'
          ? ['🟡', 'Connexion…']
          : net.status === 'perdu'
            ? ['🟠', 'Déconnecté']
            : ['🔴', 'Réseau']
  return (
    <span className={`dlo-pill is-${net.status}`} title={net.message ?? (net.status === 'connecte' ? `Connecté avec ${friend}` : label)}>
      {dot}
      <span className="dlg-lbl"> {label}</span>
    </span>
  )
}

function NetOverlay({ net, code, onExit }: { net: NetState; code?: string; onExit: () => void }) {
  if (net.status === 'connecte' || !net.message) {
    return null
  }
  return (
    <div className="dlo-overlay" role="alertdialog" aria-label="Connexion">
      <div className="dlo-overlay-box">
        <p className="dlo-spinner" aria-hidden="true">
          📡
        </p>
        <p>{net.message}</p>
        {code ? <ShareCode code={code} compact /> : null}
        <button type="button" className="ghost small" onClick={onExit}>
          Quitter
        </button>
      </div>
    </div>
  )
}

/** Le code en grand, le lien, et de quoi l'envoyer. */
function ShareCode({ code, compact }: { code: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const link = linkFor(code)
  const share = async () => {
    sfx('click')
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
    if (nav.share) {
      try {
        await nav.share({ title: 'France·Sim : un duel ?', text: `Viens m’affronter au duel des présidents ! Code ${code}`, url: link })
        return
      } catch {
        // Partage annulé : on copie le lien à la place.
      }
    }
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copiez ce lien et envoyez-le à votre ami :', link)
    }
  }
  return (
    <div className={`dlo-share ${compact ? 'is-compact' : ''}`}>
      {compact ? null : <small>Le code de la partie</small>}
      <strong className="dlo-code">{code}</strong>
      <button type="button" className="primary" onClick={() => void share()}>
        {copied ? '✅ Lien copié' : '📨 Envoyer le lien'}
      </button>
      {compact ? null : <small className="dlo-link">{link}</small>}
    </div>
  )
}

// — L'hôte : il choisit son président et la durée, envoie le lien, et arbitre la partie

/** Rendre un objet (la partie de l'hôte, celle de l'invité) visible à React : on redessine à chaque changement. */
function useTick(): [number, () => void] {
  const [n, setN] = useState(0)
  return [n, () => setN((x) => x + 1)]
}

export function HostScreen({ code, onExit }: { code: string; onExit: () => void }) {
  const [match, setMatch] = useState<HostMatch | null>(() => {
    const saved = read<Saved>(HOST_KEY)
    return saved?.code === code ? new HostMatch(code, saved.me, saved.years, saved) : null
  })
  const [, tick] = useTick()
  const [net, setNet] = useState<NetState>({ status: 'courtier', message: null })
  /** L'entrée sur le ring, jouée quand une partie commence pendant qu'on regarde (pas à la reprise d'une partie). */
  const [intro, setIntro] = useState<Game | null>(null)

  useEffect(() => {
    if (!match) {
      return
    }
    let last = match.game
    match.onChange = () => {
      write(HOST_KEY, match.save())
      const g = match.game
      if (g && g !== last && g.reports.length === 0 && g.moves.length === 0 && (!last || last.outcome || last.seed !== g.seed)) {
        setIntro(g)
      }
      last = g
      tick()
    }
    write(HOST_KEY, match.save())
    return openHost(code, match, setNet)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [match, code])

  // Les deux ont passé : l'année se joue chez l'hôte, après un court suspense.
  const game = match?.game ?? null
  useEffect(() => {
    if (!match || !game || game.outcome || actorOf(game) !== null) {
      return
    }
    const id = window.setTimeout(() => match.resolve(), RESOLVE_DELAY)
    return () => window.clearTimeout(id)
  }, [match, game])

  if (!match) {
    return (
      <Setup
        mode="hote"
        onExit={onExit}
        onStart={(me, _foe, years) => {
          setMatch(new HostMatch(code, entrantOf(me, readPseudo()), years))
        }}
      />
    )
  }
  const friend = match.guest?.nick || 'Votre ami'
  if (!game) {
    const me = entrantPlayer(match.me, '#e05a5a')
    return (
      <div className="dlg dlg-setup dlo">
        <header className="dlg-top">
          <button
            type="button"
            className="ghost small"
            onClick={() => {
              write(HOST_KEY, null)
              onExit()
            }}
          >
            ← Annuler
          </button>
          <strong className="dl-year">🌐 Partie en ligne</strong>
          <NetPill net={net} friend={friend} />
        </header>
        <main className="dlo-lobby">
          <div className="dlo-lobby-vs">
            <span className="dlo-mini" style={{ '--c': me.color } as React.CSSProperties}>
              <b aria-hidden="true">{me.emblem}</b>
              <small>{me.candidate ? me.name : 'Vous'}</small>
            </span>
            <strong className="dlv-vs is-on">VS</strong>
            <span className="dlo-mini is-waiting">
              <b aria-hidden="true">?</b>
              <small>{net.status === 'connecte' ? `${friend} choisit…` : 'Votre ami'}</small>
            </span>
          </div>
          <ShareCode code={code} />
          <p className="dlo-status">
            {net.status === 'courtier'
              ? 'Ouverture de la partie…'
              : net.status === 'attente'
                ? `📨 Envoyez le lien · ${match.years} rounds`
                : net.status === 'connecte'
                  ? `✋ ${friend} choisit son président…`
                  : net.message}
          </p>
          <small className="note" title="C’est votre téléphone qui fait l’arbitre.">📱 Gardez cette page ouverte</small>
        </main>
      </div>
    )
  }
  if (intro) {
    return <Intro me={intro.seats.player} foe={intro.seats.ai} onDone={() => setIntro(null)} />
  }
  return (
    <Table
      game={game}
      onIntent={(i) => match.act(i)}
      onExit={onExit}
      onReplay={() => match.rematch()}
      badge={<NetPill net={net} friend={friend} />}
      status={net.status === 'perdu' || net.status === 'erreur' ? <NetOverlay net={net} code={code} onExit={onExit} /> : null}
    />
  )
}

// — L'invité : il arrive par le lien, choisit son président face à celui de l'hôte, puis joue la partie reçue

export function GuestScreen({ code, onExit }: { code: string; onExit: () => void }) {
  const [nick] = useState(readPseudo)
  const match = useMemo(() => new GuestMatch(nick), [nick])
  const [, tick] = useTick()
  const [net, setNet] = useState<NetState>({ status: 'courtier', message: null })
  const [picked, setPicked] = useState(false)
  const [intro, setIntro] = useState<Game | null>(null)

  useEffect(() => {
    let last: Game | null = null
    match.onChange = () => {
      const v = match.view
      if (v && match.intro && v !== last) {
        setIntro(v)
      }
      last = v
      tick()
    }
    return openGuest(code, match, setNet)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [match, code])

  const view = match.view
  const host = match.lobby ? entrantPlayer(match.lobby.host, '#e05a5a') : null
  if (match.refused) {
    return (
      <div className="dlg dlg-setup dlo dlo-solo">
        <main className="dlo-lobby">
          <p className="dlo-status">⚠️ {match.refused}</p>
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            🔄 Recharger
          </button>
          <button type="button" className="ghost" onClick={onExit}>
            Accueil
          </button>
        </main>
      </div>
    )
  }
  if (!view) {
    if (host && match.lobby && !picked) {
      return (
        <>
          <Setup
            mode="invite"
            host={host}
            hostYears={match.lobby.years}
            foeTag={match.lobby.host.nick}
            onExit={onExit}
            onStart={(me) => {
              setPicked(true)
              match.pick(entrantOf(me, nick))
            }}
          />
          {net.status !== 'connecte' ? <NetOverlay net={net} onExit={onExit} /> : null}
        </>
      )
    }
    return (
      <div className="dlg dlg-setup dlo">
        <header className="dlg-top">
          <button type="button" className="ghost small" onClick={onExit}>
            ← Accueil
          </button>
          <strong className="dl-year">🌐 Partie {code}</strong>
          <NetPill net={net} friend={match.lobby?.host.nick || 'Connecté'} />
        </header>
        <main className="dlo-lobby">
          <p className="dlo-spinner" aria-hidden="true">
            {picked ? '🥊' : '📡'}
          </p>
          <p className="dlo-status">{picked ? 'Le combat va commencer…' : (net.message ?? 'Connexion à la partie de votre ami…')}</p>
          {net.status === 'erreur' ? <small className="note">🔑 Bon code ? Page de l’ami ouverte ?</small> : null}
        </main>
      </div>
    )
  }
  if (intro) {
    return <Intro me={intro.seats.player} foe={intro.seats.ai} onDone={() => setIntro(null)} />
  }
  return (
    <Table
      game={view}
      onIntent={(i) => match.act(i)}
      onExit={onExit}
      onReplay={() => match.rematch()}
      badge={<NetPill net={net} friend={match.lobby?.host.nick || view.seats.ai.name} />}
      status={net.status !== 'connecte' ? <NetOverlay net={net} onExit={onExit} /> : null}
    />
  )
}

// — À deux sur le même téléphone : on se le passe, et chacun ne voit que sa main

/** Ce que l'autre vient de faire depuis votre dernier passage, à lire en prenant le téléphone. */
function lastMoves(g: Game, side: Side): string[] {
  const out: string[] = []
  for (let i = g.moves.length - 1; i >= 0 && g.moves[i].side !== side; i -= 1) {
    const m = g.moves[i]
    const name = m.card ? `« ${cardName(m.card)} »` : ''
    out.unshift(
      m.kind === 'jeu' ? `a joué ${name}` : m.kind === 'passe' ? 'a passé' : m.kind === 'achat' ? `a acheté ${name}` : m.kind === 'vente' ? `a mis ${name} en vente` : m.kind === 'jet' ? 'a jeté une carte' : `a répondu à ${name}`,
    )
  }
  return out
}

export function HotSeat({ onExit }: { onExit: () => void }) {
  const [game, setGame] = useState<Game | null>(null)
  /** Qui tient le téléphone (la table est vue de sa place). */
  const [holder, setHolder] = useState<Side>('player')
  /** Ce que chacun a déjà vu : les bilans d'année, et la conjoncture de quelle année. */
  const [seen, setSeen] = useState<Record<Side, { reports: number; year: number }>>({ player: { reports: 0, year: 0 }, ai: { reports: 0, year: 0 } })

  // Les deux ont passé : l'année se joue.
  useEffect(() => {
    if (!game || game.outcome || actorOf(game) !== null) {
      return
    }
    const id = window.setTimeout(() => setGame(resolveYear(game)), RESOLVE_DELAY)
    return () => window.clearTimeout(id)
  }, [game])

  if (!game) {
    return (
      <Setup
        mode="local"
        onExit={onExit}
        onStart={(one, two, years) => {
          const named = (p: Player, name: string) => (p.candidate ? p : { ...p, name })
          const g = newGame(named(one, 'Joueur 1'), named(two!, 'Joueur 2'), { seed: Math.floor(Math.random() * 1e9), years })
          setGame(g)
          setHolder(actorOf(g) ?? 'player')
          setSeen({ player: { reports: 0, year: 0 }, ai: { reports: 0, year: 0 } })
        }}
      />
    )
  }
  const actor = actorOf(game) ?? holder
  if (actor !== holder) {
    const next = game.seats[actor]
    const said = lastMoves(game, actor)
    return (
      <div className="dlg dlg-setup dlo dlo-solo">
        <main className="dlo-lobby dlo-handoff" style={{ '--c': next.color } as React.CSSProperties}>
          <p className="dlo-spinner" aria-hidden="true">
            📱➡️
          </p>
          <p className="dlo-status">
            Passez le téléphone à <strong>{next.name}</strong>
          </p>
          {said.length && game.pending?.from !== actor ? (
            <ul className="dlo-said">
              {said.map((t, i) => (
                <li key={i}>
                  {game.seats[other(actor)].emblem} {game.seats[other(actor)].name} {t}
                </li>
              ))}
            </ul>
          ) : null}
          {game.pending && game.pending.from !== actor ? <p className="note">🎯 Une carte vous vise !</p> : null}
          <button
            type="button"
            className="primary big"
            onClick={() => {
              sfx('select')
              setHolder(actor)
            }}
          >
            ✋ C’est moi, {next.name}
          </button>
          <button type="button" className="ghost small" onClick={onExit}>
            Quitter la partie
          </button>
        </main>
      </div>
    )
  }
  const mine = seen[holder]
  const initial: Stage = mine.reports < game.reports.length ? 'report' : mine.year < game.year ? 'context' : 'play'
  return (
    <Table
      key={`${holder}-${game.seed}`}
      game={viewFor(game, holder)}
      initialStage={initial}
      onIntent={(i: Intent) => setGame(applyIntent(game, holder, i))}
      onExit={onExit}
      onReplay={() => setGame(null)}
      onStage={(stage) => {
        if (stage === 'play' && (mine.reports < game.reports.length || mine.year < game.year)) {
          setSeen((s) => ({ ...s, [holder]: { reports: game.reports.length, year: game.year } }))
        }
      }}
      badge={
        <span className="dlo-pill is-connecte" title={`${game.seats[holder].name} tient le téléphone`}>
          📱<span className="dlg-lbl"> {game.seats[holder].name}</span>
        </span>
      }
    />
  )
}

