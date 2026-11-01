// Tile-sized props: the ? block, the Mushroom, the flags and the Echo sign. All 16 px wide.

import type { Keys, Mask } from './mask.ts'

export const BLOCK_KEYS: Keys = {
  o: 'outline',
  a: 'brass',
  h: 'brassLight',
  s: 'brassDark',
  q: 'steel',
  Q: 'steelLight',
  r: 'copper',
  w: 'white',
  k: 'copperDark',
}

/** A brass ? block with rivets; the shimmer sweeps across over 3 frames. */
export const QBLOCK_FULL: readonly Mask[] = [
  [
    'oooooooooooooooo',
    'ohhhhhhhhhhhhhao',
    'ohraaaaaaaaaarso',
    'ohaaaaqqqqaaaaso',
    'ohaaaqqQQqqaaaso',
    'ohaaaqqaaqqaaaso',
    'ohaaaaaaaqqaaaso',
    'ohaaaaaaqqaaaaso',
    'ohaaaaaqqaaaaaso',
    'ohaaaaaqqaaaaaso',
    'ohaaaaaaaaaaaaso',
    'ohaaaaaqqaaaaaso',
    'ohaaaaaqqaaaaaso',
    'ohraaaaaaaaaarso',
    'oassssssssssssso',
    'oooooooooooooooo',
  ],
  [
    'oooooooooooooooo',
    'ohhhhhhhhhhhhhao',
    'ohrahaaaaaaaarso',
    'ohahhaqqqqaaaaso',
    'ohhhaqqQQqqaaaso',
    'ohhaaqqaaqqaaaso',
    'ohaaaaaaaqqaaaso',
    'ohaaaaaaqqaaaaso',
    'ohaaaaaqqaaaaaso',
    'ohaaaaaqqaaaaaso',
    'ohaaaaaaaaaaaaso',
    'ohaaaaaqqaaaaaso',
    'ohaaaaaqqaaaaaso',
    'ohraaaaaaaaaarso',
    'oassssssssssssso',
    'oooooooooooooooo',
  ],
  [
    'oooooooooooooooo',
    'ohhhhhhhhhhhhhao',
    'ohraaaaaaaaaarso',
    'ohaaaaqqqqaaaaso',
    'ohaaaqqQQqqaaaso',
    'ohaaaqqaaqqaaaso',
    'ohaaaaaaaqqaaaso',
    'ohaaaaaaqqaahaso',
    'ohaaaaaqqaahhaso',
    'ohaaaaaqqahhaaso',
    'ohaaaaaaahhaaaso',
    'ohaaaaaqqhaaaaso',
    'ohaaaaaqqaaaaaso',
    'ohraaaaaaaaaarso',
    'oassssssssssssso',
    'oooooooooooooooo',
  ],
]

/** An emptied block: dark bronze, rivets, no glyph. */
export const QBLOCK_USED: Mask = [
  'oooooooooooooooo',
  'osssssssssssssko',
  'osaksssssssskako',
  'oskssssssssssko',
  'osssssssssssssko',
  'osssssssssssssko',
  'osssssssssssssko',
  'osssssssssssssko',
  'osssssssssssssko',
  'osssssssssssssko',
  'osssssssssssssko',
  'osssssssssssssko',
  'oskssssssssssko',
  'osaksssssssskako',
  'okkkkkkkkkkkkkko',
  'oooooooooooooooo',
].map((row) => row.padEnd(16, 'o'))

export const MUSHROOM_KEYS: Keys = {
  o: 'outline',
  r: 'capRed',
  k: 'copperDark',
  w: 'cream',
  W: 'white',
  e: 'outline',
}

/** The Mushroom: a red cap with cream spots on a cream stem. */
export const MUSHROOM: Mask = [
  '................',
  '.....oooooo.....',
  '...oorrrWWrroo..',
  '..orrrrrWWrrrro.',
  '.orWWrrrrrrrWWro',
  '.orWWrrrrrrrWWro',
  'orrrrrrrrrrrrrro',
  'orrrrWWrrrWWrrro',
  'okrrrWWrrrWWrrko',
  '.okkkkkkkkkkkko.',
  '..oowwwwwwwwoo..',
  '...owweewwewo...',
  '...owweewwewo...',
  '...owwwwwwwwo...',
  '....owwwwwwo....',
  '.....oooooo.....',
].map((row) => row.replace(/e/g, 'o'))

export const FLAG_KEYS: Keys = {
  o: 'outline',
  a: 'brass',
  h: 'brassLight',
  s: 'brassDark',
  g: 'grass',
  G: 'grassLit',
  w: 'cream',
  b: 'fur',
  f: 'steel',
  F: 'steelLight',
}

/**
 * The checkpoint: a brass pole with a pennant, 16×48 (three tiles, its base tile at the bottom).
 * Grey until claimed, green after; the pennant waves over 3 frames.
 */
function checkpoint(pennant: readonly string[]): Mask {
  const pole = '.......oho......'
  const rows: string[] = [
    '......oooo......',
    '.....ohhaao.....',
    '.....ohaaso.....',
    '......osso......',
    ...pennant,
  ]
  while (rows.length < 45) rows.push(pole)
  rows.push('.....oaaaso.....', '....oassssso....', '....ooooooo.....')
  return rows.map((r) => r.slice(0, 16).padEnd(16, '.'))
}

const PENNANT_CLAIMED: readonly (readonly string[])[] = [
  ['.......ohoooo...', '.......ohgGGgoo.', '.......ohgGggggo', '.......ohggggoo.', '.......ohoooo...'],
  ['.......ohooo....', '.......ohgGGooo.', '.......ohgGggggo', '.......ohgggggo.', '.......ohooooo..'],
  ['.......ohoooo...', '.......ohgGggoo.', '.......ohgGgggo.', '.......ohggggggo', '.......ohoooooo.'],
]

const PENNANT_OPEN: readonly (readonly string[])[] = PENNANT_CLAIMED.map((p) =>
  p.map((row) => row.replace(/g/g, 'f').replace(/G/g, 'F')),
)

export const CHECKPOINT_OPEN: readonly Mask[] = PENNANT_OPEN.map(checkpoint)
export const CHECKPOINT_CLAIMED: readonly Mask[] = PENNANT_CLAIMED.map(checkpoint)

/** The goal: a taller pole with a gear finial and a cream banner bearing Pip's orange mark. 16×48. */
function goal(banner: readonly string[]): Mask {
  const pole = '.......oho......'
  const rows: string[] = [
    '.....o.oo.o.....',
    '....ohoahoao....',
    '.....oaoosao....',
    '....oaao.oaso...',
    '.....oaoosao....',
    '....ohoasoao....',
    '.....o.oo.o.....',
    ...banner,
  ]
  while (rows.length < 45) rows.push(pole)
  rows.push('.....oaaaso.....', '....oassssso....', '....ooooooo.....')
  return rows.map((r) => r.slice(0, 16).padEnd(16, '.'))
}

const BANNERS: readonly (readonly string[])[] = [
  [
    '.......ohooooooo',
    '.......ohwbwwbwo',
    '.......ohwbbbbwo',
    '.......ohwaaaawo',
    '.......ohwwbbwwo',
    '.......ohooooooo',
  ],
  [
    '.......ohoooooo.',
    '.......ohwbwwbwo',
    '.......ohwbbbbwo',
    '.......ohwaaaawo',
    '.......ohwwbbwo.',
    '.......ohoooooo.',
  ],
  [
    '.......ohooooo..',
    '.......ohwbwwboo',
    '.......ohwbbbbwo',
    '.......ohwaaaawo',
    '.......ohwwbbwwo',
    '.......ohwwwwwwo',
    '.......ohooooooo',
  ],
]

export const GOAL_FLAG: readonly Mask[] = BANNERS.map(goal)

export const SIGN_KEYS: Keys = {
  o: 'outline',
  p: 'earthLight',
  P: 'pebble',
  d: 'earthDark',
  a: 'brass',
  c: 'cream',
  q: 'steel',
}

/**
 * The Echo sign: a wooden plate on a post, showing C / Y (keyboard and pad). 16×32, the post's foot
 * on the sign's own tile. The letters are 3×5 glyphs stamped into the plate.
 */
export const SIGN: Mask = [
  '................',
  'oooooooooooooooo',
  'oaPPPPPPPPPPPPao',
  'oPpppppppppppppo',
  'oPpqqqppqpqpqppo',
  'oPpqpppqppqpqppo',
  'oPpqppqpppqqqppo',
  'oPpqppqppppqpppo',
  'oPpqqqqppppqpppo'.slice(0, 16),
  'oPpppppppppppppo',
  'oaddddddddddddao',
  'oooooooooooooooo',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '......opPo......',
  '.....oppPPo.....',
  '....oppppPPo....',
  '....odddddddo...'.slice(0, 16),
  '....ooooooooo...'.slice(0, 16),
]
