// Level 1-1 "Meadow Ledge": a meadow shelf, a 13-tile gap, and the goal flag against the closing
// wall. The gap is the level's one lesson. A held sprint jump covers about 171 px (~10.7 tiles), so
// the gap must be wider than that to be genuinely unjumpable — it is crossed only by placing an Echo
// in mid-air and jumping off it.
//
// One character per tile: '.' empty, '#' solid, '=' one-way, 'S' spawn, 'F' goal.
// Both edges are closed full height at column 0 and column 63: an open edge lets the player walk out
// of the world, and a wall shorter than the jump arc is not a wall.

import { TILE } from '../physics/constants.ts'

export const LEVEL_1_1_ROWS: readonly string[] = [
  '#..............................................................#',
  '#..............................................................#',
  '#..............................................................#',
  '#..............................................................#',
  '#..............................................................#',
  '#..............................................................#',
  '#..............................................................#',
  '#..............................................................#',
  '#..............................................................#',
  '#.......====...................................................#',
  '#..............................................................#',
  '#.S...........................................................F#',
  '#####################.............##############################',
  '#####################.............##############################',
]

/** Width of the level in tiles, asserted by the level's own test. */
export const LEVEL_1_1_COLS = 64

/** The gap's first and last solid-free column, used by the level's own tests. */
export const LEVEL_1_1_GAP = { firstCol: 21, lastCol: 33 } as const

/**
 * Past this x the gap needs an Echo — mid-gap, so the second jump from the Echo reaches the far
 * ledge. It is the one shared answer to "where does the Echo go", so the level's test and the
 * browser check cannot drift apart.
 */
export const LEVEL_1_1_ECHO_AT_X = (LEVEL_1_1_GAP.firstCol + 6) * TILE

