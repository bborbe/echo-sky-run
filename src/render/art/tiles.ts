// Ground tiles. A solid cell is drawn from one of two bases — a grass top when the cell above is
// open, earth fill otherwise — with its open sides turned into edges. The choice is a pure function
// of the map, so the auto-tiling is a unit test and the renderer bakes the level once.

import { isSolid, tileAt, type TileMap } from '../../physics/tilemap.ts'
import type { Keys, Mask } from './mask.ts'

export const TILE_KEYS: Keys = {
  L: 'grassLip',
  G: 'grassLit',
  g: 'grass',
  d: 'earth',
  D: 'earthDark',
  p: 'pebble',
  P: 'earthLight',
  o: 'outline',
}

/** A cell whose upper neighbour is open: a dark grass lip, lit grass, roots into the earth. */
export const GROUND_TOP: Mask = [
  'LLLLLLLLLLLLLLLL',
  'GGGGGgGGGGGGgGGG',
  'gGggggggggGggggg',
  'gggggggggggggggg',
  'dgggdggggdgggggd',
  'ddgddddgdddddgdd',
  'dddddddddddddddd',
  'ddddpddddddddddd',
  'dddddddddddPdddd',
  'ddPddddddddddddd',
  'dddddddddpdddddd',
  'ddddddDddddddddd',
  'dddddddddddddddd',
  'dpddddddddddDddd',
  'dddddDdddddddddd',
  'dddddddddddddddd',
]

/** Two earth fills, alternated so a wide ground does not show a repeating stamp. */
export const GROUND_FILL: readonly Mask[] = [
  [
    'dddddddddddddddd',
    'ddddDddddddddpdd',
    'dddddddddddddddd',
    'dpdddddddDdddddd',
    'dddddddddddddddd',
    'ddddddddpddddddd',
    'ddDddddddddddDdd',
    'dddddddddddddddd',
    'dddddddDdddddddd',
    'dddpdddddddddddd',
    'dddddddddddddDdd',
    'dDdddddddddddddd',
    'dddddddddpdddddd',
    'dddddddddddddddd',
    'ddddDddddddddddd',
    'dddddddddddddpdd',
  ],
  [
    'dddddddddddddddd',
    'dddddddPdddddddd',
    'dDdddddddddddddd',
    'dddddddddddDdddd',
    'ddddpddddddddddd',
    'dddddddddddddddd',
    'dddddddddDdddpdd',
    'dPdddddddddddddd',
    'dddddddddddddddd',
    'ddddddDddddddddd',
    'dddddddddddddddd',
    'ddddpdddddddDddd',
    'dddddddddddddddd',
    'dDdddddddddpdddd',
    'dddddddddddddddd',
    'dddddddDdddddddd',
  ],
]

export interface TileShape {
  /** The cell above is open: draw grass. */
  readonly top: boolean
  readonly left: boolean
  readonly right: boolean
  /** The cell below is open (inside the map): draw an underside. */
  readonly bottom: boolean
  /** Which earth fill, picked by position so neighbours differ. */
  readonly variant: number
}

/**
 * The edges of a solid cell. An edge is drawn where the neighbour is open; the map's own border
 * counts as open above and to the sides but not below, because the ground runs off the bottom of the
 * view and an underside there would read as a floating slab.
 */
export function tileShape(map: TileMap, col: number, row: number): TileShape {
  const open = (c: number, r: number): boolean => !isSolid(tileAt(map, c, r))
  return {
    top: open(col, row - 1),
    left: open(col - 1, row),
    right: open(col + 1, row),
    bottom: row + 1 < map.rows && open(col, row + 1),
    variant: (col * 7 + row * 3) % GROUND_FILL.length,
  }
}

/** The mask for a cell of that shape: the base with its open sides rounded into edges. */
export function tileMask(shape: TileShape): Mask {
  const base = shape.top ? GROUND_TOP : GROUND_FILL[shape.variant]
  return base.map((row, y) => {
    const chars = row.split('')
    const last = chars.length - 1
    if (shape.left) {
      chars[0] = edgeOf(chars[0])
      if (shape.top && y === 0) chars[0] = '.'
      if (shape.top && y === 1) chars[0] = 'L'
    }
    if (shape.right) {
      chars[last] = edgeOf(chars[last])
      if (shape.top && y === 0) chars[last] = '.'
      if (shape.top && y === 1) chars[last] = 'L'
    }
    if (shape.bottom && y === base.length - 1) return chars.map((ch) => (ch === '.' ? ch : 'o')).join('')
    if (shape.bottom && y === base.length - 2) return chars.map((ch) => (ch === '.' ? ch : 'D')).join('')
    return chars.join('')
  })
}

/** An open side darkens: grass to the lip colour, earth to dark earth. */
function edgeOf(ch: string): string {
  if (ch === 'G' || ch === 'g' || ch === 'L') return 'L'
  return 'D'
}
