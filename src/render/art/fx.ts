// The Echo's look and the small effects: dust, sparks, the fizzle of a refused Echo, the spawn ring
// and the timer ring. The rings are generated rather than drawn, so their geometry is exact and the
// timer ring is a pure function of the Echo's life.

import { ECHO_LIFE_F } from '../../echo/echo.ts'
import { CLEAR, type Keys, type Mask } from './mask.ts'

export const ECHO_KEYS: Keys = {
  e: 'echoEdge',
  r: 'echoRim',
  c: 'echo',
  k: 'echoDeep',
  w: 'white',
}

/** How each Pip pixel turns to glass: lines and brass deepen, fur goes cyan, the lit parts go bright. */
const GLASS: Readonly<Record<string, string>> = {
  o: 'k',
  x: 'k',
  a: 'k',
  d: 'k',
  f: 'k',
  F: 'k',
  r: 'k',
  k: 'k',
  b: 'c',
  s: 'c',
  h: 'r',
  w: 'r',
  l: 'r',
  g: 'w',
}

/**
 * The Echo platform, exactly its 32×4 collision box: a dark edge top and bottom so it reads over a
 * light sky, a bright rim and a cyan core so it reads over darker ground. The corners are cut so it
 * does not look like a tile.
 */
export const ECHO_PLATFORM: Mask = [
  '.eeeeeeeeeeeeeeeeeeeeeeeeeeeeee.',
  'errrrrrrrrrrrrrrrrrrrrrrrrrrrrre',
  'eccccccccccccccccccccccccccccce'.padEnd(31, 'c') + 'e',
  '.eeeeeeeeeeeeeeeeeeeeeeeeeeeeee.',
]

/**
 * The ghost: a Pip frame in Echo glass. His lines and goggle band turn deep cyan, his fur pale cyan,
 * his lenses and muzzle bright — so it reads as Pip, not a blob — and a dark edge is grown one pixel
 * around the whole silhouette. The edge is what keeps a pale ghost visible against a pale sky (play
 * gate 2, "i can no see them").
 */
export function ghostMask(pip: Mask): Mask {
  const h = pip.length
  const w = pip[0].length
  const at = (x: number, y: number): boolean => y >= 0 && y < h && x >= 0 && x < w && pip[y][x] !== CLEAR
  const rows: string[] = []
  for (let y = -1; y <= h; y++) {
    let row = ''
    for (let x = -1; x <= w; x++) {
      if (at(x, y)) {
        row += GLASS[pip[y][x]] ?? 'c'
      } else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
        row += 'e'
      } else {
        row += CLEAR
      }
    }
    rows.push(row)
  }
  return rows
}

/** Segments in the timer ring. */
export const RING_SEGMENTS = 8

/** How much of the Echo's life is left, 1 at placement and 0 when it vanishes. */
export function ringFraction(life: number): number {
  return Math.max(0, Math.min(1, life / ECHO_LIFE_F))
}

/** Segments still lit for a life value — the ring empties clockwise from the top. */
export function litSegments(life: number): number {
  return Math.max(0, Math.ceil(ringFraction(life) * RING_SEGMENTS - 1e-9))
}

/** The ring's size: a 13×13 clock face, a dark rim around lit (bright) and spent (deep cyan) segments. */
export const RING_SIZE = 13

/**
 * The timer ring with `lit` of its segments bright. Each ring pixel belongs to the segment its angle
 * falls in, measured clockwise from 12 o'clock; lit segments are the first `lit` of them.
 */
export function timerRingMask(lit: number): Mask {
  const c = (RING_SIZE - 1) / 2
  const rows: string[] = []
  for (let y = 0; y < RING_SIZE; y++) {
    let row = ''
    for (let x = 0; x < RING_SIZE; x++) {
      const dx = x - c
      const dy = y - c
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > 6.3) {
        row += CLEAR
      } else if (d > 5.2) {
        row += 'e'
      } else if (d > 2.9) {
        const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI)
        const segment = Math.floor((angle / (2 * Math.PI)) * RING_SEGMENTS)
        row += segment < lit ? 'r' : 'k'
      } else if (d > 1.9) {
        row += 'e'
      } else {
        row += 'c'
      }
    }
    rows.push(row)
  }
  return rows
}

/** The spawn ring at radius `r`: a one-pixel bright circle with a dark ring outside it. */
export function spawnRingMask(r: number): Mask {
  const size = r * 2 + 5
  const c = (size - 1) / 2
  const rows: string[] = []
  for (let y = 0; y < size; y++) {
    let row = ''
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - c) ** 2 + (y - c) ** 2)
      if (Math.abs(d - r) <= 0.5) row += 'r'
      else if (Math.abs(d - (r + 1)) <= 0.5) row += 'e'
      else row += CLEAR
    }
    rows.push(row)
  }
  return rows
}

/** Radii of the spawn ring, one per frame: it grows fast and slows (12 frames). */
export const SPAWN_RING_RADII: readonly number[] = [3, 5, 7, 9, 10, 11, 12, 13, 14, 14, 15, 15]

export const DUST_KEYS: Keys = {
  w: 'cream',
  p: 'pebble',
  P: 'earthLight',
}

/** A dust puff: 8×8, swelling and thinning over 4 frames. */
export const DUST: readonly Mask[] = [
  ['........', '........', '........', '...ww...', '..wwwp..', '..wwpp..', '........', '........'],
  ['........', '........', '..www...', '.wwwwwp.', '.wwwwpp.', '..wppp..', '........', '........'],
  ['........', '..w.ww..', '.wwwwww.', 'ww..wwpp', '.ww..pp.', '..wp.p..', '........', '........'],
  ['........', '..w..w..', '.w....w.', 'w......p', '.w....p.', '..w..p..', '........', '........'],
]

export const SPARK_KEYS: Keys = { r: 'echoRim', c: 'echo', w: 'white' }

/** A spark for the Echo spawn: 3×3, a plus that fades to a dot. */
export const SPARK: readonly Mask[] = [
  ['.r.', 'rwr', '.r.'],
  ['.c.', 'crc', '.c.'],
  ['...', '.c.', '...'],
]

export const FIZZLE_KEYS: Keys = { e: 'echoEdge', q: 'steel', Q: 'steelLight', c: 'echo' }

/** A refused Echo: a crossed-out glint that breaks into grey smoke. 12×12, 3 frames. */
export const FIZZLE: readonly Mask[] = [
  [
    '............',
    '.ee......ee.',
    '.ecee..eece.',
    '..eccecce...',
    '...ecccce...',
    '....ecce....',
    '...ecccce...',
    '..eccecce...',
    '.ecee..eece.',
    '.ee......ee.',
    '............',
    '............',
  ],
  [
    '............',
    '..Q......Q..',
    '.QqQ....QqQ.',
    '..QqQ..QqQ..',
    '...Qq..qQ...',
    '............',
    '...Qq..qQ...',
    '..QqQ..QqQ..',
    '.QqQ....QqQ.',
    '..Q......Q..',
    '............',
    '............',
  ],
  [
    '............',
    '............',
    '..Q.....Q...',
    '...Q...Q....',
    '............',
    '.....Q......',
    '............',
    '...Q...Q....',
    '..Q.....Q...',
    '............',
    '............',
    '............',
  ],
]
