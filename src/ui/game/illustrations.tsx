import type { ReactNode } from 'react'

/**
 * Les illustrations de la une, dessinées à l'encre comme une gravure de presse (traits, hachures, trame de points).
 * Toutes dans un cadre 200 × 120, sans fichier à télécharger : le journal marche hors ligne.
 */
export type Art =
  | 'hemicycle'
  | 'urne'
  | 'canicule'
  | 'feu'
  | 'tempete'
  | 'exode'
  | 'eolienne'
  | 'manif'
  | 'krach'
  | 'caddie'
  | 'chomage'
  | 'usine'
  | 'petrole'
  | 'conteneurs'
  | 'globe'
  | 'sante'
  | 'ordi'
  | 'foot'
  | 'europe'

const INK = '#1c1a17'

/** Un personnage stylisé (tête ronde, corps en trait), pour les foules. */
const person = (x: number, y: number, s = 1, key?: string | number) => (
  <g key={key} transform={`translate(${x} ${y}) scale(${s})`}>
    <circle cx="0" cy="-22" r="5" fill={INK} />
    <path d="M0 -17 V0 M0 -12 L-6 -4 M0 -12 L6 -4 M0 0 L-5 12 M0 0 L5 12" />
  </g>
)

const ART: Record<Art, ReactNode> = {
  hemicycle: (
    <>
      <path d="M20 104 A80 80 0 0 1 180 104 Z" />
      {Array.from({ length: 5 }, (_, row) => {
        const n = 9 + row * 3
        const r = 34 + row * 11
        return Array.from({ length: n }, (_, i) => {
          const a = Math.PI * (1 - (i + 0.5) / n)
          return <circle key={`${row}-${i}`} cx={100 + r * Math.cos(a)} cy={104 - r * Math.sin(a)} r="2.6" fill={i < n * 0.45 ? INK : '#f4efe3'} />
        })
      })}
      <rect x="86" y="88" width="28" height="16" fill="#f4efe3" />
      <path d="M90 104 V92 H110 V104 M100 92 V84" />
      <path d="M100 84 l10 3 l-10 3" fill={INK} />
    </>
  ),
  urne: (
    <>
      <path d="M60 50 H140 L132 108 H68 Z" fill="url(#hatch)" />
      <path d="M60 50 H140 L132 108 H68 Z" />
      <path d="M86 50 H114" strokeWidth="5" />
      <path d="M88 52 L92 8 H120 L116 48" fill="#f4efe3" />
      <path d="M96 20 H112 M95 28 H110 M94 36 H108" />
      <path d="M78 80 l8 8 l16 -18" strokeWidth="4" />
    </>
  ),
  canicule: (
    <>
      <circle cx="140" cy="36" r="20" fill="url(#dots)" />
      <circle cx="140" cy="36" r="20" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return <path key={i} d={`M${140 + 26 * Math.cos(a)} ${36 + 26 * Math.sin(a)} L${140 + 36 * Math.cos(a)} ${36 + 36 * Math.sin(a)}`} />
      })}
      <path d="M10 100 Q40 92 70 100 T130 100 T190 100" />
      <path d="M20 108 Q50 101 80 108 T140 108" strokeDasharray="4 5" />
      <rect x="44" y="30" width="14" height="56" rx="7" fill="#f4efe3" />
      <circle cx="51" cy="88" r="11" fill={INK} />
      <rect x="48" y="36" width="6" height="50" fill={INK} />
      <path d="M62 40 H68 M62 52 H68 M62 64 H68" />
      <path d="M86 70 l-6 -12 l6 -10 l-6 -12" opacity="0.6" />
    </>
  ),
  feu: (
    <>
      {[30, 70, 120, 160].map((x, i) => (
        <g key={x}>
          <path d={`M${x} 104 V${74 - (i % 2) * 8}`} strokeWidth="3" />
          <path d={`M${x - 14} ${84 - (i % 2) * 8} L${x} ${50 - (i % 2) * 8} L${x + 14} ${84 - (i % 2) * 8} Z`} fill="url(#hatch)" />
        </g>
      ))}
      <path d="M40 104 C30 80 52 74 46 52 C62 64 70 44 66 28 C86 46 96 64 88 80 C100 74 104 62 102 52 C118 70 120 90 108 104 Z" fill={INK} />
      <path d="M62 104 C56 92 66 86 64 74 C74 82 80 74 80 66 C90 80 92 92 86 104 Z" fill="#f4efe3" />
      <path d="M124 30 q8 -8 0 -16 q-8 -8 0 -16" opacity="0.5" transform="translate(0 20)" />
      <path d="M150 40 q8 -8 0 -16 q-8 -8 0 -16" opacity="0.5" transform="translate(0 16)" />
      <path d="M0 104 H200" />
    </>
  ),
  tempete: (
    <>
      <path d="M40 40 a18 18 0 0 1 30 -14 a24 24 0 0 1 44 6 a16 16 0 0 1 10 30 H44 a14 14 0 0 1 -4 -22 Z" fill="url(#dots)" />
      <path d="M40 40 a18 18 0 0 1 30 -14 a24 24 0 0 1 44 6 a16 16 0 0 1 10 30 H44 a14 14 0 0 1 -4 -22 Z" />
      <path d="M92 62 L80 82 H94 L84 104" strokeWidth="3" />
      {[50, 60, 110, 122, 134].map((x) => (
        <path key={x} d={`M${x} 68 l-6 14`} />
      ))}
      <path d="M140 90 q10 -10 20 0 t20 0" />
      <path d="M0 100 q12 -8 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0" />
      <path d="M0 110 q12 -8 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0" />
      <path d="M160 40 q18 0 18 12 q0 10 -12 10" />
    </>
  ),
  exode: (
    <>
      <path d="M0 98 H200" />
      <circle cx="170" cy="30" r="12" fill="url(#dots)" />
      {[24, 50, 76, 102, 128].map((x, i) => (
        <g key={x}>
          {person(x, 92, i % 2 ? 0.9 : 1)}
          {i % 2 ? null : <rect x={x + 4} y="68" width="12" height="10" fill="url(#hatch)" />}
        </g>
      ))}
      <path d="M140 98 Q160 70 200 66" strokeDasharray="3 4" />
    </>
  ),
  eolienne: (
    <>
      <path d="M0 104 Q60 90 120 100 T200 96" />
      {[
        [60, 1],
        [130, 0.75],
      ].map(([x, s]) => (
        <g key={x} transform={`translate(${x} 104) scale(${s})`}>
          <path d="M-3 0 L-1.5 -70 H1.5 L3 0 Z" fill={INK} />
          <circle cx="0" cy="-70" r="4" fill={INK} />
          <path d="M0 -70 L4 -110 L-2 -72 Z M0 -70 L36 -54 L2 -66 Z M0 -70 L-34 -52 L-2 -68 Z" fill={INK} />
        </g>
      ))}
      <path d="M150 104 l12 -16 h22 l-12 16 Z M156 96 h22" fill="url(#hatch)" />
      <circle cx="170" cy="26" r="10" />
    </>
  ),
  manif: (
    <>
      {Array.from({ length: 9 }, (_, i) => person(14 + i * 22, 98 - (i % 2) * 4, 0.9 + (i % 3) * 0.05, i))}
      <rect x="30" y="20" width="62" height="28" fill="#f4efe3" />
      <path d="M30 20 h62 v28 h-62 Z M44 48 V76 M78 48 V76" />
      <text x="61" y="39" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="900" fontSize="13" fill={INK} stroke="none">
        NON !
      </text>
      <rect x="116" y="14" width="56" height="24" fill="url(#hatch)" />
      <path d="M116 14 h56 v24 h-56 Z M144 38 V72" />
      <path d="M0 104 H200" />
    </>
  ),
  krach: (
    <>
      <path d="M18 14 V104 H190" />
      {[30, 50, 70, 90].map((y) => (
        <path key={y} d={`M18 ${y} H190`} strokeDasharray="2 6" opacity="0.5" />
      ))}
      <path d="M22 50 L44 40 L62 46 L80 30 L98 36 L114 26 L130 70 L146 62 L162 96 L180 92" strokeWidth="4" />
      <path d="M172 82 L182 98 L164 98" fill={INK} />
      <path d="M118 30 l-8 6 l10 4 l-6 8" />
      <rect x="136" y="18" width="46" height="22" fill="#f4efe3" />
      <text x="159" y="34" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="900" fontSize="13" fill={INK} stroke="none">
        −8 %
      </text>
    </>
  ),
  caddie: (
    <>
      <path d="M20 30 H40 L56 84 H150 L166 44 H48" />
      <path d="M50 54 H160 M54 68 H154" opacity="0.6" />
      <circle cx="66" cy="98" r="8" fill={INK} />
      <circle cx="140" cy="98" r="8" fill={INK} />
      <rect x="64" y="26" width="22" height="28" fill="url(#hatch)" />
      <rect x="92" y="18" width="16" height="36" />
      <path d="M118 54 a14 14 0 0 1 28 0" fill="url(#dots)" />
      <path d="M172 18 V60 M164 28 L172 18 L180 28" strokeWidth="4" />
      <text x="186" y="74" textAnchor="end" fontFamily="Georgia, serif" fontWeight="900" fontSize="14" fill={INK} stroke="none">
        €
      </text>
    </>
  ),
  chomage: (
    <>
      <path d="M130 104 V30 H196 V104" fill="url(#hatch)" />
      <path d="M130 104 V30 H196 V104" />
      <rect x="146" y="60" width="34" height="44" fill="#f4efe3" />
      <rect x="140" y="38" width="46" height="16" fill="#f4efe3" />
      <text x="163" y="50" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="900" fontSize="10" fill={INK} stroke="none">
        EMPLOI
      </text>
      {Array.from({ length: 6 }, (_, i) => person(116 - i * 20, 98, 0.95, i))}
      <path d="M0 104 H200" />
    </>
  ),
  usine: (
    <>
      <path d="M10 104 V60 L40 44 V60 L70 44 V60 L100 44 V104 Z" fill="url(#hatch)" />
      <path d="M10 104 V60 L40 44 V60 L70 44 V60 L100 44 V104 Z" />
      <rect x="112" y="18" width="12" height="86" fill={INK} />
      <rect x="140" y="34" width="12" height="70" fill={INK} />
      <path d="M118 14 q-10 -8 4 -12 q14 -4 8 -10" opacity="0.6" transform="translate(0 4)" />
      <path d="M146 30 q-10 -8 4 -12 q14 -4 8 -10" opacity="0.6" />
      <rect x="160" y="70" width="34" height="34" />
      <path d="M160 82 H194 M177 70 V104" />
      <path d="M0 104 H200" />
    </>
  ),
  petrole: (
    <>
      <path d="M0 96 q12 -6 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0" />
      <path d="M30 86 H170 L156 100 H44 Z" fill={INK} />
      <rect x="130" y="66" width="26" height="20" fill="url(#hatch)" />
      <path d="M130 66 h26 v20 h-26 Z M140 66 V54 H146" />
      <path d="M50 86 V76 H120 V86" />
      <path d="M58 76 a6 6 0 0 1 12 0 M80 76 a6 6 0 0 1 12 0 M102 76 a6 6 0 0 1 12 0" />
      <path d="M150 54 q-10 -10 4 -16 q12 -6 4 -16" opacity="0.6" />
      <path d="M28 30 q0 -12 8 -20 q8 8 8 20 a8 8 0 0 1 -16 0 Z" fill={INK} />
      <text x="54" y="34" fontFamily="Georgia, serif" fontWeight="900" fontSize="13" fill={INK} stroke="none">
        $ / baril
      </text>
    </>
  ),
  conteneurs: (
    <>
      <path d="M0 98 q12 -6 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0" />
      <path d="M20 84 H180 L166 98 H34 Z" fill={INK} />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x={40 + i * 24} y="64" width="22" height="20" fill={i % 2 ? 'url(#hatch)' : '#f4efe3'} />
          {i < 3 ? <rect x={52 + i * 24} y="44" width="22" height="20" fill={i % 2 ? '#f4efe3' : 'url(#dots)'} /> : null}
        </g>
      ))}
      <path d="M164 84 V40 H178 V84 M164 52 H178" />
      <path d="M150 20 L178 40" />
    </>
  ),
  globe: (
    <>
      <circle cx="100" cy="60" r="44" fill="url(#dots)" />
      <circle cx="100" cy="60" r="44" />
      <ellipse cx="100" cy="60" rx="18" ry="44" />
      <path d="M56 60 H144 M64 38 H136 M64 82 H136" />
      <path d="M74 30 q10 8 4 18 q-8 6 2 14 q12 2 10 16 M118 26 q-6 12 6 18 q10 4 6 18" strokeWidth="3" />
      <path d="M100 104 V112 M80 112 H120" />
    </>
  ),
  sante: (
    <>
      <rect x="40" y="36" width="120" height="68" fill="url(#hatch)" />
      <rect x="40" y="36" width="120" height="68" />
      <path d="M30 40 L100 10 L170 40" />
      <rect x="84" y="46" width="32" height="32" fill="#f4efe3" />
      <path d="M100 52 V72 M90 62 H110" strokeWidth="6" />
      <rect x="90" y="84" width="20" height="20" fill="#f4efe3" />
      <path d="M0 104 H200" />
    </>
  ),
  ordi: (
    <>
      <rect x="44" y="20" width="112" height="70" rx="4" fill={INK} />
      <rect x="52" y="28" width="96" height="54" fill="#f4efe3" />
      <path d="M30 100 H170 L160 90 H40 Z" fill="url(#hatch)" />
      <text x="58" y="44" fontFamily="monospace" fontSize="8" fill={INK} stroke="none">
        01001 01 10
      </text>
      <text x="58" y="56" fontFamily="monospace" fontSize="8" fill={INK} stroke="none">
        10 1101 0011
      </text>
      <path d="M100 60 a8 8 0 0 1 8 8 v6 h-16 v-6 a8 8 0 0 1 8 -8 Z" fill={INK} />
      <path d="M94 60 v-4 a6 6 0 0 1 12 0 v4" fill="none" />
    </>
  ),
  foot: (
    <>
      <path d="M10 104 H190 M100 104 V80" />
      <path d="M140 104 V60 H190" />
      <path d="M140 60 L190 70 M140 70 L190 80 M140 80 L190 90 M150 60 V104 M160 60 V104 M170 60 V104 M180 60 V104" opacity="0.5" />
      <circle cx="96" cy="50" r="16" fill="#f4efe3" />
      <path d="M96 42 l7 5 l-3 8 h-8 l-3 -8 Z" fill={INK} />
      <path d="M80 50 h-26 M82 40 h-20 M82 60 h-18" opacity="0.6" />
      <path d="M30 24 l6 -8 l6 8 l-6 -2 Z M28 24 v22 a8 8 0 0 0 16 0 v-22" fill="url(#hatch)" />
    </>
  ),
  europe: (
    <>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        const x = 100 + 40 * Math.cos(a)
        const y = 58 + 40 * Math.sin(a)
        return <path key={i} d={`M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y - 2} L${x + 3} ${y + 1} L${x + 5} ${y + 7} L${x} ${y + 3} L${x - 5} ${y + 7} L${x - 3} ${y + 1} L${x - 7} ${y - 2} L${x - 2} ${y - 2} Z`} fill={INK} />
      })}
      <path d="M86 58 h28 M100 44 v28" opacity="0.3" />
    </>
  ),
}

/** Le dessin de la une, à l'encre sur le papier du journal. */
export function Illustration({ art, label }: { art: Art; label: string }) {
  return (
    <svg className="news-art" viewBox="0 0 200 120" role="img" aria-label={label} fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 V5" stroke={INK} strokeWidth="1.4" />
        </pattern>
        <pattern id="dots" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="1.1" fill={INK} stroke="none" />
        </pattern>
      </defs>
      {ART[art]}
    </svg>
  )
}
