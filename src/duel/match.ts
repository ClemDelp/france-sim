import { newGame, resolveYear, type Game } from './engine'
import { applyIntent, entrantPlayer, isMessage, pack, PROTOCOL, unpack, viewFor, type Entrant, type Intent, type Message, type WireGame } from './online'

/**
 * Les deux bouts d'une partie entre amis, sans réseau ni React : l'hôte (l'arbitre) et l'invité.
 * Le réseau (PeerJS) n'est qu'un tuyau : on lui donne `send`, et on lui passe ce qui arrive avec `receive`.
 */

/** Un tuyau vers l'autre joueur. */
export type Link = { send: (m: Message) => void }

/** Ce que l'hôte garde d'une partie (dans le navigateur) pour la reprendre après un rechargement. */
export type Saved = { code: string; me: Entrant; years: number; guest: Entrant | null; seed: number; game: WireGame | null }

/** Les couleurs d'un programme surprise : rouge pour l'hôte, bleu pour l'invité. */
const HOST_COLOR = '#e05a5a'
const GUEST_COLOR = '#5b8def'

export class HostMatch {
  game: Game | null = null
  guest: Entrant | null = null
  /** Le numéro du dernier envoi (l'invité ignore un envoi plus ancien que celui qu'il a). */
  private n = 0
  private link: Link | null = null
  private intro = false
  private seed: number
  /** Appelé à chaque changement (pour l'écran, et pour sauvegarder). */
  onChange: () => void = () => {}

  readonly code: string
  readonly me: Entrant
  readonly years: number

  constructor(code: string, me: Entrant, years: number, saved?: Saved) {
    this.code = code
    this.me = me
    this.years = years
    this.seed = saved?.seed ?? Math.floor(Math.random() * 1e9)
    if (saved) {
      this.guest = saved.guest
      this.game = saved.game ? unpack(saved.game) : null
    }
  }

  /** Un invité vient de se connecter (ou de se reconnecter) : il se présentera par « hello ». */
  connect(link: Link) {
    this.link = link
  }

  disconnect(link: Link) {
    if (this.link === link) {
      this.link = null
    }
  }

  receive(m: unknown) {
    if (!isMessage(m)) {
      return
    }
    switch (m.t) {
      case 'hello':
        if (m.v !== PROTOCOL) {
          this.send({ t: 'refuse', reason: 'Vous n’avez pas la même version du jeu. Rechargez la page tous les deux, puis réessayez.' })
        } else {
          // Qui il affronte (son pseudo), puis la partie si elle a commencé : l'invité qui revient la reprend où elle en est.
          this.send({ t: 'lobby', host: this.me, years: this.years })
          this.sendView()
        }
        break
      case 'pick':
        if (!this.game && !(m.who.candidate && m.who.candidate === this.me.candidate)) {
          this.guest = m.who
          this.start()
        }
        break
      case 'intent':
        if (this.game) {
          this.update(applyIntent(this.game, 'ai', m.intent))
        }
        break
      case 'rematch':
        if (this.game?.outcome) {
          this.rematch()
        }
        break
      case 'ping':
        this.send({ t: 'pong' })
        break
    }
  }

  /** L'hôte joue (il est « player » dans le moteur). */
  act(intent: Intent) {
    if (this.game) {
      this.update(applyIntent(this.game, 'player', intent))
    }
  }

  /** Les deux ont passé : l'année se joue (l'hôte l'appelle après un court suspense). */
  resolve() {
    const g = this.game
    if (g && g.turn === null && !g.pending && !g.outcome) {
      this.update(resolveYear(g))
    }
  }

  rematch() {
    if (this.guest) {
      this.seed = Math.floor(Math.random() * 1e9)
      this.start()
    }
  }

  save(): Saved {
    return { code: this.code, me: this.me, years: this.years, guest: this.guest, seed: this.seed, game: this.game ? pack(this.game) : null }
  }

  private start() {
    this.intro = true
    this.update(newGame(entrantPlayer(this.me, HOST_COLOR), entrantPlayer(this.guest!, GUEST_COLOR), { seed: this.seed, years: this.years }))
    this.intro = false
  }

  private update(next: Game) {
    if (next === this.game) {
      return
    }
    this.game = next
    this.sendView()
    this.onChange()
  }

  private sendView() {
    if (this.game) {
      this.n += 1
      this.send({ t: 'view', n: this.n, game: pack(viewFor(this.game, 'ai')), intro: this.intro })
    }
  }

  private send(m: Message) {
    this.link?.send(m)
  }
}

export class GuestMatch {
  /** La partie vue de sa place (il y est « player »). */
  view: Game | null = null
  lobby: { host: Entrant; years: number } | null = null
  refused: string | null = null
  /** La partie vient de commencer : on joue l'entrée sur le ring. */
  intro = false
  private n = 0
  private link: Link | null = null
  onChange: () => void = () => {}

  readonly nick: string

  constructor(nick: string) {
    this.nick = nick
  }

  connect(link: Link) {
    this.link = link
    // Après une reconnexion, l'hôte peut avoir recommencé à compter : on accepte son prochain envoi.
    this.n = 0
    link.send({ t: 'hello', v: PROTOCOL, nick: this.nick })
  }

  receive(m: unknown) {
    if (!isMessage(m)) {
      return
    }
    switch (m.t) {
      case 'lobby':
        this.lobby = { host: m.host, years: m.years }
        this.onChange()
        break
      case 'view':
        if (m.n > this.n) {
          this.n = m.n
          this.view = unpack(m.game)
          this.intro = m.intro
          this.onChange()
        }
        break
      case 'refuse':
        this.refused = m.reason
        this.onChange()
        break
      case 'ping':
        this.link?.send({ t: 'pong' })
        break
    }
  }

  pick(who: Entrant) {
    this.link?.send({ t: 'pick', who })
  }

  act(intent: Intent) {
    this.link?.send({ t: 'intent', intent })
  }

  rematch() {
    this.link?.send({ t: 'rematch' })
  }
}
