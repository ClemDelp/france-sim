import type { DataConnection, Peer, PeerError } from 'peerjs'
import type { GuestMatch, HostMatch, Link } from './match'
import { peerIdOf } from './online'

/**
 * Le tuyau entre les deux téléphones : WebRTC, par PeerJS. Le service public de PeerJS ne sert qu'à se trouver
 * (l'hôte s'y inscrit sous le nom tiré du code, l'invité le demande) ; ensuite, les deux navigateurs se parlent en direct.
 * Sans serveur relais (TURN), certains réseaux bloquent la connexion directe : on le dit, et on propose le Wi-Fi.
 */

export type NetState = {
  status: 'courtier' | 'attente' | 'connecte' | 'perdu' | 'erreur'
  /** Ce qu'on dit au joueur quand ça ne va pas. */
  message: string | null
}

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
}

/** Un signe de vie toutes les 3 s ; sans nouvelles depuis 10 s, l'autre est parti. */
const PING_EVERY = 3000
const SILENT_AFTER = 10000
/** Une connexion directe qui ne s'ouvre pas en 15 s : le réseau la bloque sans doute. */
const OPEN_TIMEOUT = 15000
const RETRY_EVERY = 4000

const NO_BROKER = '📡 Pas de connexion internet ?'
const BLOCKED = '🚧 Ce réseau bloque la connexion : essayez en Wi-Fi. On réessaie…'
const OLD_BROWSER = '🌐 Navigateur trop ancien : essayez Safari, Chrome ou Firefox à jour.'
const BROKER_ERRORS = ['network', 'server-error', 'socket-error', 'socket-closed']

const loadPeer = async () => (await import('peerjs')).Peer

/** Un lien vers l'autre bout : on n'envoie que si la connexion est ouverte. */
const linkOf = (conn: DataConnection): Link => ({
  send: (m) => {
    if (conn.open) {
      void conn.send(m)
    }
  },
})

/** Surveiller une connexion : des signes de vie, et l'alerte quand l'autre se tait. */
function heartbeat(conn: DataConnection, onSilent: () => void) {
  let last = Date.now()
  conn.on('data', () => {
    last = Date.now()
  })
  const id = window.setInterval(() => {
    if (conn.open) {
      void conn.send({ t: 'ping' })
    }
    if (Date.now() - last > SILENT_AFTER) {
      window.clearInterval(id)
      onSilent()
    }
  }, PING_EVERY)
  return () => window.clearInterval(id)
}

/** Un minuteur à la fois : relancer remplace la relance prévue. */
function timer() {
  let id = 0
  return {
    set: (f: () => void, ms: number) => {
      window.clearTimeout(id)
      id = window.setTimeout(f, ms)
    },
    clear: () => window.clearTimeout(id),
  }
}

/** L'hôte : il s'inscrit sous le nom du code, et accueille l'invité (une connexion à la fois ; une nouvelle remplace l'ancienne). */
export function openHost(code: string, match: HostMatch, onState: (s: NetState) => void): () => void {
  let peer: Peer | null = null
  let current: DataConnection | null = null
  let stopBeat = () => {}
  let closed = false
  const retry = timer()
  const set = (status: NetState['status'], message: string | null = null) => {
    if (!closed) {
      onState({ status, message })
    }
  }

  const accept = (conn: DataConnection) => {
    conn.on('open', () => {
      if (current && current !== conn) {
        current.close()
      }
      stopBeat()
      current = conn
      const link = linkOf(conn)
      match.connect(link)
      conn.on('data', (data) => match.receive(data))
      const lost = () => {
        if (current === conn) {
          match.disconnect(link)
          current = null
          stopBeat()
          set('perdu', '🔌 Ami déconnecté : il rouvre le lien pour revenir.')
        }
      }
      conn.on('close', lost)
      conn.on('error', lost)
      stopBeat = heartbeat(conn, () => {
        lost()
        conn.close()
      })
      set('connecte')
    })
  }

  const start = async () => {
    const Peer = await loadPeer()
    if (closed) {
      return
    }
    peer?.destroy()
    const p = new Peer(peerIdOf(code), { config: ICE })
    peer = p
    // Les nouvelles d'une ancienne inscription (remplacée) ne comptent plus.
    const live = () => !closed && peer === p
    p.on('open', () => live() && set(current ? 'connecte' : 'attente'))
    p.on('connection', (conn) => (live() ? accept(conn) : conn.close()))
    p.on('disconnected', () => {
      // Perdu le service de mise en relation (pas forcément l'ami) : on s'y réinscrit.
      if (live()) {
        retry.set(() => live() && !p.destroyed && p.reconnect(), RETRY_EVERY)
      }
    })
    p.on('error', (e: PeerError<string>) => {
      if (!live()) {
        return
      }
      if (e.type === 'unavailable-id') {
        // Après un rechargement, l'ancienne inscription traîne quelques secondes chez le courtier : on réessaie.
        set('courtier', 'Reprise de la partie…')
        peer = null
        p.destroy()
        retry.set(() => void start(), RETRY_EVERY)
      } else if (BROKER_ERRORS.includes(e.type)) {
        if (!current) {
          set('erreur', NO_BROKER)
        }
      } else if (e.type === 'browser-incompatible') {
        set('erreur', OLD_BROWSER)
      }
    })
  }
  set('courtier')
  void start()
  return () => {
    closed = true
    retry.clear()
    stopBeat()
    current?.close()
    peer?.destroy()
  }
}

/** L'invité : il demande l'hôte par son code ; si la connexion tombe, il la retente tout seul. */
export function openGuest(code: string, match: GuestMatch, onState: (s: NetState) => void): () => void {
  let peer: Peer | null = null
  let conn: DataConnection | null = null
  let stopBeat = () => {}
  let closed = false
  const retry = timer()
  const opening = timer()
  const set = (status: NetState['status'], message: string | null = null) => {
    if (!closed) {
      onState({ status, message })
    }
  }

  const join = () => {
    if (closed || !peer || peer.destroyed) {
      return
    }
    if (peer.disconnected) {
      peer.reconnect()
      retry.set(join, RETRY_EVERY)
      return
    }
    conn?.close()
    const c = peer.connect(peerIdOf(code), { reliable: true })
    conn = c
    let opened = false
    opening.set(() => {
      if (!opened && conn === c) {
        set('erreur', BLOCKED)
        conn = null
        c.close()
        retry.set(join, RETRY_EVERY)
      }
    }, OPEN_TIMEOUT)
    c.on('open', () => {
      if (conn !== c) {
        c.close()
        return
      }
      opened = true
      opening.clear()
      stopBeat()
      match.connect(linkOf(c))
      c.on('data', (data) => match.receive(data))
      stopBeat = heartbeat(c, () => c.close())
      set('connecte')
    })
    c.on('close', () => {
      if (opened && conn === c && !closed) {
        conn = null
        stopBeat()
        set('perdu', '🔌 Connexion coupée. On réessaie…')
        retry.set(join, RETRY_EVERY / 2)
      }
    })
  }

  const start = async () => {
    const Peer = await loadPeer()
    if (closed) {
      return
    }
    const p = new Peer({ config: ICE })
    peer = p
    p.on('open', () => {
      if (!closed) {
        set('attente')
        join()
      }
    })
    p.on('error', (e: PeerError<string>) => {
      if (closed) {
        return
      }
      if (e.type === 'peer-unavailable') {
        // L'hôte n'est pas (ou plus) là : il a peut-être fermé l'onglet ou rechargé la page.
        opening.clear()
        conn = null
        set('perdu', '💤 Votre ami n’est pas en ligne. On réessaie…')
        retry.set(join, RETRY_EVERY)
      } else if (BROKER_ERRORS.includes(e.type)) {
        if (!conn?.open) {
          set('erreur', NO_BROKER)
          retry.set(join, RETRY_EVERY * 2)
        }
      } else if (e.type === 'browser-incompatible') {
        set('erreur', OLD_BROWSER)
      }
    })
  }
  set('courtier')
  void start()
  return () => {
    closed = true
    retry.clear()
    opening.clear()
    stopBeat()
    conn?.close()
    peer?.destroy()
  }
}
