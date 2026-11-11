/**
 * Les répliques de l'IA, une bulle de quelques mots au-dessus de sa fiche : quand elle pose une carte, vous envoie un coup,
 * pare le vôtre, en prend un, mène ou est menée à la fin de l'année, gagne ou perd. Chaque personnage a son ton
 * (sur ses idées, jamais sur la personne) ; les autres répliques sont communes.
 * Les répliques se coupent dans les réglages ; le choix est gardé dans le navigateur.
 */

export type Moment = 'play' | 'crisis' | 'parried' | 'hit' | 'block' | 'lead' | 'behind' | 'win' | 'lose'

const KEY = 'duel-repliques'

let enabled = readEnabled()

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'non'
  } catch {
    return true
  }
}

export const tauntsOn = () => enabled

export function setTauntsOn(on: boolean) {
  enabled = on
  try {
    localStorage.setItem(KEY, on ? 'oui' : 'non')
  } catch {
    // Pas de stockage (navigation privée) : le choix vaut pour la session.
  }
}

const COMMON: Record<Moment, string[]> = {
  play: ['😏 Regardez et apprenez.', '📜 Et une de plus !', '🧠 Coup de génie.', '👌 Tout est sous contrôle.'],
  crisis: ['💥 Cadeau !', '😈 Tenez, c’est pour vous.', '🎁 Surprise !', '🌩️ Petite averse chez vous.'],
  parried: ['😤 Bien paré…', '🙄 Coup de chance.', '😒 Vous aviez une cellule, hein ?'],
  hit: ['😵 Aïe.', '🤕 Même pas mal.', '😬 On encaisse, on avance.'],
  block: ['🛡️ Raté !', '😎 Trop facile.', '🙅 Pas chez moi.'],
  lead: ['😎 Je mène, tranquille.', '📈 Les sondages m’adorent.', '🍾 Au frais, le champagne.'],
  behind: ['😬 Rien n’est joué !', '🔥 Je reviens.', '🙃 Vous ne perdez rien pour attendre.'],
  win: ['🏆 La France a choisi.', '🎉 Merci, merci, pas de selfie.'],
  lose: ['🤝 Bien joué… cette fois.', '🫡 Revanche quand vous voulez.'],
}

/** Le ton de chaque personnage (les répliques manquantes viennent de COMMON). */
const PERSONAS: Record<string, Partial<Record<Moment, string[]>>> = {
  melenchon: {
    play: ['📢 Le programme, rien que le programme !', '📢 Partagez les richesses !'],
    crisis: ['📢 Résistez donc à ça !'],
    lead: ['📢 Le peuple est avec moi !'],
    behind: ['📢 Ce n’est qu’un début !'],
  },
  roussel: {
    play: ['🛠️ Du nucléaire et des salaires !', '🏭 On rallume les usines !'],
    lead: ['🧀 À table, la France gagne !'],
  },
  ruffin: {
    play: ['🧢 Pour les gens d’en bas !', '🧢 Les fins de mois d’abord !'],
    behind: ['🧢 On lâche rien, on remonte !'],
  },
  tondelier: {
    play: ['🌱 Le climat n’attend pas !', '🚲 Un pas de plus vers 2050 !'],
    crisis: ['🌱 Même mes crises sont bio.'],
    lead: ['🌿 Ça pousse !'],
  },
  glucksmann: {
    play: ['🇪🇺 Pour l’Europe !', '🇪🇺 Plus d’Europe, moins de soucis.'],
    lead: ['🇪🇺 L’Europe, ça marche !'],
  },
  attal: {
    play: ['🏝️ Sérieux budgétaire, toujours.', '📉 Moins de dépenses, plus de résultats.'],
    lead: ['📊 Les comptes sont bons.'],
  },
  philippe: {
    play: ['⚓ Cap tenu.', '⚓ Un pas après l’autre.'],
    behind: ['⚓ Gros temps : on garde le cap.'],
  },
  retailleau: {
    play: ['🛡️ L’ordre, d’abord.'],
    block: ['🛡️ Rien ne passe.'],
  },
  'le-pen': {
    play: ['🖊️ Signé, tamponné.'],
    lead: ['🖊️ Les Français ont compris.'],
  },
  zemmour: {
    play: ['📜 L’Histoire me donnera raison.'],
    behind: ['📜 Je l’avais prédit…'],
  },
  teddy: {
    play: ['🥋 Hajime !', '💪 On s’échauffe.', '🏋️ Encore une série !'],
    crisis: ['🥋 Uchi-mata budgétaire !', '🤼 Clé de bras sur votre PIB !'],
    parried: ['🥋 Joli waza-ari…'],
    hit: ['🥋 Même pas tombé.'],
    block: ['🥋 IPPON !'],
    lead: ['🏅 Médaille d’or en vue.'],
    behind: ['🥋 Je suis sur le tatami, pas au sol.'],
    win: ['🥇 Champion de France… et président !'],
    lose: ['🥋 Salut au tatami. Respect.'],
  },
  durif: {
    play: ['🔮 Les astres l’ont voulu.', '🪐 Vibrations positives.', '✨ Je le sens bien, celle-là.'],
    crisis: ['☄️ Un petit astéroïde pour vous.', '🌪️ Le cosmos vous teste.'],
    parried: ['🌑 Votre aura est forte…'],
    hit: ['🪐 Mercure rétrograde, ça explique tout.'],
    block: ['🔮 Je l’avais vu venir. Littéralement.'],
    lead: ['✨ L’univers vote pour moi.'],
    behind: ['🔮 Les étoiles changent d’avis.'],
    win: ['✨ L’alignement était parfait.'],
    lose: ['🕊️ Paix cosmique sur votre mandat.'],
  },
  bot: {
    play: ['🤖 Calcul optimal.', '🤖 Bip. Loi votée.'],
    crisis: ['🤖 Exécution : crise.exe'],
    lead: ['🤖 Probabilité de victoire : 99 %.'],
    behind: ['🤖 Erreur 404 : avance introuvable.'],
    win: ['🤖 Bip boup. Victoire.'],
    lose: ['🤖 Mise à jour nécessaire…'],
  },
}

/** À quelle fréquence l'IA commente ses cartes posées (pour ne pas parler à chaque coup). */
const PLAY_ODDS = 0.4

/** Une réplique pour ce moment (ou null : les répliques sont coupées, ou l'IA se tait cette fois). */
export function taunt(persona: string | null, moment: Moment): string | null {
  if (!enabled || (moment === 'play' && Math.random() > PLAY_ODDS)) {
    return null
  }
  const own = PERSONAS[persona ?? 'bot']?.[moment] ?? []
  // Le plus souvent une réplique du personnage, parfois une commune.
  const pool = own.length && Math.random() < 0.75 ? own : [...own, ...COMMON[moment]]
  return pool[Math.floor(Math.random() * pool.length)]
}
