// Level 1-1 "Meadow Ledge": a meadow shelf, a 10-tile gap that no single jump clears, and the goal
// flag against the closing wall. The gap is the level's one lesson — a plain hop covers about 7
// tiles, so it is crossable only by placing an Echo in mid-air and jumping off it.
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
  '#####################..........#################################',
  '#####################..........#################################',
]

/** Width of the level in tiles, asserted by the level's own test. */
export const LEVEL_1_1_COLS = 64

/** The gap's first and last solid-free column, used by the level's own tests. */
export const LEVEL_1_1_GAP = { firstCol: 21, lastCol: 30 } as const

/**
 * Past this x the gap needs an Echo. It is the one shared answer to "when does a plain hop stop
 * being enough", so the level's test and the browser check cannot drift apart.
 */
export const LEVEL_1_1_ECHO_AT_X = (LEVEL_1_1_GAP.firstCol + 2) * TILE
