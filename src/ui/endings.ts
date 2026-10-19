import type { Ending } from '../model/types'

/** Les façons de perdre la partie, et la chaîne de causes qui y mène. */
export const ENDINGS: Record<Ending, { icon: string; title: string; text: string; chain: string[] }> = {
  revolte: {
    icon: '🔥',
    title: 'Le pays se soulève',
    text: 'Grèves générales, blocages, manifestations massives : le gouvernement tombe. Les Français n’acceptent plus ce qu’on leur impose.',
    chain: [
      'Le mécontentement s’accumule d’année en année : baisse du niveau de vie, hausse des impôts, chômage, inflation, pauvreté, austérité.',
      'Une baisse brutale du pouvoir d’achat ou une hausse massive des prélèvements suffit à elle seule : les gilets jaunes (2018) sont partis d’une taxe sur le carburant.',
      'Au-delà d’un certain seuil, aucun gouvernement ne tient.',
    ],
  },
  faillite: {
    icon: '💥',
    title: 'L’État fait faillite',
    text: 'Plus personne n’accepte de prêter à la France à un prix supportable : l’État ne peut plus payer ses fonctionnaires, ses retraites et ses créanciers.',
    chain: [
      'La dette grossit plus vite que ce que la France peut rembourser : les prêteurs exigent des taux de plus en plus élevés.',
      'Sans plan d’aide européen, plus de filet : les intérêts dévorent les recettes publiques.',
      'Comme l’Argentine en 2001 ou la Grèce en 2012, il faut alors restructurer la dette dans la douleur.',
    ],
  },
  hyperinflation: {
    icon: '🌀',
    title: 'La monnaie ne vaut plus rien',
    text: 'Les prix s’envolent de plus de 25 % par an : l’épargne fond, les salaires ne suivent pas, la confiance dans la monnaie disparaît.',
    chain: [
      'Créer de la monnaie pour financer l’État, ou un choc sur les prix (énergie, droits de douane), alimente une spirale prix-salaires.',
      'Les prêteurs réclament une compensation : les taux montent, la dette coûte plus cher.',
    ],
  },
  depression: {
    icon: '📉',
    title: 'Dépression économique',
    text: 'Un actif sur cinq est sans emploi : l’économie s’effondre, comme les États-Unis en 1933 ou la Grèce en 2013.',
    chain: [
      'Une chute brutale de la demande (impôts massifs, austérité, crise) fait plonger la production.',
      'Le chômage réduit les revenus, qui réduisent encore la demande : la spirale s’auto-entretient.',
    ],
  },
}
