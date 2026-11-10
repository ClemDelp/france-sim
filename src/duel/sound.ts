/**
 * Les bruitages du duel, fabriqués à la volée avec WebAudio (aucun fichier à charger).
 * Le son se coupe dans les réglages ; le choix est gardé dans le navigateur.
 * Rien ne joue avant le premier geste du joueur : les navigateurs l'interdisent, et c'est plus poli.
 */

export type Sfx = 'click' | 'hover' | 'pick' | 'draw' | 'play' | 'discard' | 'coin' | 'energy' | 'crisis' | 'promise' | 'flip' | 'victory' | 'defeat'

const KEY = 'duel-son'
const VOLUME = 0.22

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = readEnabled()
let unlocked = false

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'non'
  } catch {
    return true
  }
}

export const soundOn = () => enabled

export function setSoundOn(on: boolean) {
  enabled = on
  try {
    localStorage.setItem(KEY, on ? 'oui' : 'non')
  } catch {
    // Pas de stockage (navigation privée) : le choix vaut pour la session.
  }
}

// Le premier geste du joueur ouvre le son.
if (typeof window !== 'undefined') {
  const unlock = () => {
    unlocked = true
    void audio()?.resume()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

function audio(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) {
      return null
    }
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = VOLUME
    master.connect(ctx.destination)
  }
  return ctx
}

/** Une note : une onde, une enveloppe courte, éventuellement un glissando. */
function tone(at: number, freq: number, length: number, opts: { type?: OscillatorType; to?: number; gain?: number; attack?: number } = {}) {
  const c = ctx!
  const osc = c.createOscillator()
  const env = c.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, at)
  if (opts.to) {
    osc.frequency.exponentialRampToValueAtTime(opts.to, at + length)
  }
  const peak = opts.gain ?? 0.6
  env.gain.setValueAtTime(0.0001, at)
  env.gain.exponentialRampToValueAtTime(peak, at + (opts.attack ?? 0.008))
  env.gain.exponentialRampToValueAtTime(0.0001, at + length)
  osc.connect(env).connect(master!)
  osc.start(at)
  osc.stop(at + length + 0.02)
}

/** Un souffle : du bruit filtré (carte qui glisse, claque, grondement). */
function noise(at: number, length: number, opts: { freq: number; to?: number; q?: number; gain?: number; type?: BiquadFilterType }) {
  const c = ctx!
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1
  }
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = opts.type ?? 'bandpass'
  filter.Q.value = opts.q ?? 1
  filter.frequency.setValueAtTime(opts.freq, at)
  if (opts.to) {
    filter.frequency.exponentialRampToValueAtTime(opts.to, at + length)
  }
  const env = c.createGain()
  env.gain.setValueAtTime(opts.gain ?? 0.7, at)
  env.gain.exponentialRampToValueAtTime(0.0001, at + length)
  src.connect(filter).connect(env).connect(master!)
  src.start(at)
}

const notes = (at: number, freqs: number[], step: number, length: number, type: OscillatorType = 'triangle', gain = 0.45) =>
  freqs.forEach((f, i) => tone(at + i * step, f, length, { type, gain }))

const SOUNDS: Record<Sfx, (t: number) => void> = {
  click: (t) => tone(t, 660, 0.05, { type: 'square', gain: 0.12 }),
  hover: (t) => tone(t, 1400, 0.03, { type: 'sine', gain: 0.08 }),
  pick: (t) => {
    noise(t, 0.06, { freq: 3000, gain: 0.25 })
    tone(t, 520, 0.09, { type: 'triangle', to: 780, gain: 0.25 })
  },
  draw: (t) => {
    noise(t, 0.14, { freq: 1200, to: 4000, gain: 0.35 })
    noise(t + 0.09, 0.12, { freq: 1500, to: 4500, gain: 0.25 })
  },
  play: (t) => {
    noise(t, 0.09, { freq: 900, to: 300, q: 0.8, gain: 1 })
    tone(t, 140, 0.12, { type: 'sine', to: 70, gain: 0.7 })
  },
  discard: (t) => noise(t, 0.25, { freq: 3500, to: 600, gain: 0.4 }),
  coin: (t) => {
    tone(t, 988, 0.08, { type: 'square', gain: 0.18 })
    tone(t + 0.07, 1319, 0.28, { type: 'square', gain: 0.18 })
  },
  energy: (t) => tone(t, 440, 0.25, { type: 'sawtooth', to: 1320, gain: 0.15 }),
  crisis: (t) => {
    tone(t, 90, 0.7, { type: 'sawtooth', to: 40, gain: 0.5 })
    noise(t, 0.8, { freq: 200, to: 60, type: 'lowpass', gain: 1 })
    tone(t + 0.05, 233, 0.5, { type: 'square', to: 110, gain: 0.12 })
  },
  promise: (t) => {
    notes(t, [523, 659, 784], 0.09, 0.18)
    tone(t + 0.27, 1047, 0.45, { type: 'triangle', gain: 0.5 })
  },
  flip: (t) => {
    noise(t, 0.07, { freq: 2500, gain: 0.4 })
    noise(t + 0.12, 0.07, { freq: 2200, gain: 0.35 })
    tone(t + 0.2, 330, 0.3, { type: 'triangle', to: 494, gain: 0.25 })
  },
  victory: (t) => {
    notes(t, [523, 659, 784, 1047], 0.12, 0.2)
    notes(t + 0.5, [784, 1047], 0, 0.7, 'triangle', 0.4)
    tone(t + 0.5, 1319, 0.7, { type: 'sine', gain: 0.3 })
  },
  defeat: (t) => {
    notes(t, [392, 370, 349], 0.22, 0.24, 'sawtooth', 0.18)
    tone(t + 0.66, 330, 0.8, { type: 'sawtooth', to: 220, gain: 0.2 })
  },
}

/** Jouer un bruitage (si le son est activé et que le joueur a déjà touché l'écran). */
export function sfx(name: Sfx) {
  if (!enabled || !unlocked) {
    return
  }
  const c = audio()
  if (!c) {
    return
  }
  try {
    SOUNDS[name](c.currentTime + 0.01)
  } catch {
    // Un navigateur sans WebAudio complet : on joue sans le son.
  }
}
