// Level 1-1 "Meadow Ledge". The spec's § 7 shape: a flat start with no enemies for the first stretch,
// then a Gear-Goomba, a ? block, a Steam-Turtle, a small gap, the midpoint checkpoint and finally the
// 13-tile Echo gap, which is the level's one lesson. A held sprint jump covers about 171 px (~10.7
// tiles), so the Echo gap is deliberately wider than that and is crossed only by placing an Echo in
// mid-air and jumping off it.
//
// One character per tile: '.' empty, '#' solid, '=' one-way, 'S' spawn, 'F' goal, 'g' Gear-Goomba,
// 't' Steam-Turtle, '?' ? block, 'C' checkpoint.
// Both edges are closed full height at column 0 and the last column: an open edge lets the player walk
// out of the world, and a wall shorter than the jump arc is not a wall.

import { TILE } from '../physics/constants.ts'

export const LEVEL_1_1_ROWS: readonly string[] = [
  '#..............................................................................#',
  '#..............................................................................#',
  '#..............................................................................#',
  '#......................................###.....................................#',
  '#..............................................................................#',
  '#..............................................................................#',
  '#..............................................................................#',
  '#..............................................................................#',
  '#..............................................................................#',
  '#.......................?......................................................#',
  '#..............................................................................#',
  '#S................g................t.......C..i.............................F..#',
  '############################...###################.............#################',
  '############################...###################.............#################',
]

/** Width of the level in tiles, asserted by the level's own test. */
export const LEVEL_1_1_COLS = 80

/** The Echo gap's first and last solid-free column, used by the level's own tests. */
export const LEVEL_1_1_GAP = { firstCol: 50, lastCol: 62 } as const

/**
 * The small gap after the Gear-Goomba: wide enough to matter, narrow enough to jump. It sits far
 * enough before the Echo gap that the landing from it is not already on the Echo gap's lip — 19
 * tiles of floor separate them, against the ~171 px a held sprint jump covers.
 */
export const LEVEL_1_1_SMALL_GAP = { firstCol: 28, lastCol: 30 } as const

/**
 * Past this x the Echo gap needs an Echo — mid-gap, so the second jump from the Echo reaches the far
 * ledge. It is the one shared answer to "where does the Echo go", so the level's test and the
 * browser check cannot drift apart.
 */
export const LEVEL_1_1_ECHO_AT_X = (LEVEL_1_1_GAP.firstCol + 6) * TILE
