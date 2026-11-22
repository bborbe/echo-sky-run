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

// ---- World 1's Echo switch, Echo door, pistons and windmills (spec § 4) --------------------------

export const ECHO_SWITCH_KEYS: Keys = {
  o: 'outline',
  s: 'steelMid',
  S: 'steelPale',
  e: 'echo',
  c: 'copper',
}

/** The Echo switch: a blue-geared plate that lights while pressed. 16×16, tile-sized. */
export const ECHO_SWITCH: Mask = [
  '..oo........oo..',
  '..oso......oso..',
  '..ossoooooosso..',
  '..osssssssssso..',
  '.osssSeeeesssso.',
  '.osssSeeeesssso.',
  'osssseeeeeesssso',
  'osssseeeeeesssso',
  '.osssSeeeesssso.',
  '.osssSeeeesssso.',
  '..osssssssssso..',
  '..ossoooooosso..',
  '..oso......oso..',
  '..oo........oo..',
  '................',
  '................',
]

export const ECHO_DOOR_KEYS: Keys = ECHO_SWITCH_KEYS

/** The Echo door: a steel portal banded in cyan light, three tiles tall. 16×48. */
function echoDoorMask(): Mask {
  const rows: string[] = []
  rows.push('oooooooooooooooo')
  rows.push('oSSSSSSSSSSSSSSo')
  rows.push('oSssssssssssssSo')
  for (let panel = 0; panel < 3; panel++) {
    rows.push('oSseeeeeeeeeeSSo')
    for (let i = 0; i < 12; i++) rows.push('oSssssssssssssSo')
    rows.push('oSseeeeeeeeeeSSo')
  }
  rows.push('oSssssssssssssSo')
  rows.push('oSSSSSSSSSSSSSSo')
  rows.push('oooooooooooooooo')
  return rows
}

export const ECHO_DOOR: Mask = echoDoorMask()

export const PISTON_KEYS: Keys = {
  o: 'outline',
  b: 'brass',
  h: 'brassLight',
  s: 'brassDark',
  S: 'steel',
  c: 'copper',
}

/** One row of the piston's 36-wide body: an outlined brass block with steel bands. */
function pistonBodyRow(y: number, h: number): string {
  const W = 36
  if (y === 0 || y === h - 1) return 'o'.repeat(W)
  if (y === 1) return 'o' + 'h'.repeat(W - 2) + 'o'
  if (y === h - 2) return 'o' + 's'.repeat(W - 2) + 'o'
  const inner = y % 6 === 0 ? 'S'.repeat(W - 2) : 'b'.repeat(W - 2)
  return 'o' + inner + 'o'
}

/** The piston: a 36×36 brass block, plus an 8-wide steel rod out the top when extended. */
function pistonMask(bodyH: number, rodH: number): Mask {
  const W = 36
  const rows: string[] = []
  if (rodH > 0) {
    const rodW = 8
    const pad = (W - rodW) / 2
    for (let y = 0; y < rodH; y++) rows.push('.'.repeat(pad) + 'o' + 'S'.repeat(rodW - 2) + 'o' + '.'.repeat(pad))
  }
  for (let y = 0; y < bodyH; y++) rows.push(pistonBodyRow(y, bodyH))
  return rows
}

export const PISTON_RETRACTED: Mask = pistonMask(36, 0)
export const PISTON_EXTENDED: Mask = pistonMask(36, 12)

export const WINDMILL_KEYS: Keys = {
  o: 'outline',
  s: 'steelDeep',
  S: 'steel',
  b: 'copperDark',
  c: 'copperDark',
}

/**
 * A 54×54 windmill: a brass hub with four steel blades. The blades sit on the axes for one frame and
 * on the diagonals for the next, so the two frames read as a 45° turn of the same wheel.
 */
function windmillMask(diagonal: boolean): Mask {
  const N = 54
  const c = 26
  const grid: string[][] = Array.from({ length: N }, () => Array<string>(N).fill('.'))
  const put = (x: number, y: number, ch: string): void => {
    if (x >= 0 && x < N && y >= 0 && y < N) grid[y][x] = ch
  }
  const dirs = diagonal
    ? [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]
    : [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
  // Seven pixels across each blade: the SC4 readability probe averages the sprite's whole 54×54 box,
  // so a hairline wheel sits close to the background however dark its few pixels are. Each step
  // stamps a square rather than a perpendicular stroke, so the blade has interior pixels — a
  // one-pixel-thin diagonal is all boundary, and the outline pass would recolour every blade pixel.
  const halfWidth = 3
  for (const [dx, dy] of dirs) {
    for (let r = 5; r <= c + 1; r++) {
      const x = c + dx * r
      const y = c + dy * r
      for (let oy = -halfWidth; oy <= halfWidth; oy++) {
        for (let ox = -halfWidth; ox <= halfWidth; ox++) put(x + ox, y + oy, 's')
      }
    }
  }
  for (let y = c - 5; y <= c + 5; y++) {
    for (let x = c - 5; x <= c + 5; x++) {
      const edge = x === c - 5 || x === c + 5 || y === c - 5 || y === c + 5
      put(x, y, edge ? 'c' : 'b')
    }
  }
  put(c, c, 'S')
  return grid.map((row) => row.join(''))
}

export const WINDMILL_SPIN: readonly Mask[] = [windmillMask(false), windmillMask(true)]
