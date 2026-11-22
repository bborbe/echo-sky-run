// Level 1-2 "Gear Garden". The spec's § 7 shape: a flat, enemy-free opening that teaches the
// Echo-switch use with nothing to fall from, then Gear-Goombas and Steam-Turtles separated by two
// narrow pits, a midpoint checkpoint and the goal.
//
// One character per tile: '.' empty, '#' solid, '=' one-way, 'S' spawn, 'F' goal, 'g' Gear-Goomba,
// 't' Steam-Turtle, '?' ? block, 'C' checkpoint, 'i' sign, 'n' Nimbus, 's' Echo switch, 'D' Echo
// door (feet-anchored, three tiles tall).
// Both edges are closed full height at column 0 and the last column: an open edge lets the player
// walk out of the world, and a wall shorter than the jump arc is not a wall.
//
// The Echo-switch lesson sits on a raised ledge at columns 6-26, in the enemy-free opening: the
// switch at 10 and the door at 18 are three rows above the floor, so the first thing the level asks
// is the new mechanic, with nothing to fall from and nothing hunting Pip. A player who never looks
// up still finishes, because the running line stays clear. The door is solid while no switch is
// pressed and opens on the frame one is, which is why standing on the switch is not enough — the
// door is eight tiles away and closes the moment Pip steps off. The Echo is what holds it: placed
// at Pip's feet on the switch it keeps pressing for its 240-frame life, long enough to walk
// through. A ? block and Nimbus wait behind the door as the reward — the mount the level then
// teaches.

import { TILE } from '../physics/constants.ts'

export const LEVEL_1_2_ROWS: readonly string[] = [
  '#..........................................................................................................................................................................................................................................................................................................#',
  '#..........................................................................................................................................................................................................................................................................................................#',
  '#..........................................................................................................................................................................................................................................................................................................#',
  '#..........................................................................................................................................................................................................................................................................................................#',
  '#..........................................................................................................................................................................................................................................................................................................#',
  '#..........................................................................................................................................................................................................................................................................................................#',
  '#..........................................................................................................................................................................................................................................................................................................#',
  '#..........................................................................................................................................................................................................................................................................................................#',
  '#.........s.......D....?n..................................................................................................................................................................................................................................................................................#',
  '#.....#####################.......?.................................................................................................................................................................................................................?......................................................#',
  '#..........................................................................................................................................................................................................................................................................................................#',
  '#S..........................................g.t.......................g.......................................t...................g...................C.........i...................t.............................g...................t...................g.........i....................................F.#',
  '##########################################################################################...#################################################################################################...###########################################################################################################',
  '##########################################################################################...#################################################################################################...###########################################################################################################',
]

/** Width of the level in tiles, asserted by the level's own test. */
export const LEVEL_1_2_COLS = 300

/** The two narrow pits. Both are well inside a sprint jump's reach, so neither is an Echo beat. */
export const LEVEL_1_2_PITS = [
  { firstCol: 90, lastCol: 92 },
  { firstCol: 190, lastCol: 192 },
] as const

/** The midpoint checkpoint's column: the engine honours only the first 'C' tile it finds. */
export const LEVEL_1_2_CHECKPOINT_COL = 150

/** The raised ledge carrying the Echo-switch lesson, its switch and its door. */
export const LEVEL_1_2_LEDGE = { firstCol: 6, lastCol: 26, row: 9 } as const
export const LEVEL_1_2_SWITCH_COL = 10
export const LEVEL_1_2_DOOR_COL = 18

/**
 * The spot the tile view's thumbnail is framed on: the switch ledge, so a tile shows the level's
 * lesson rather than the patch of ground every level opens on.
 */
export const LEVEL_1_2_HERO = {
  x: LEVEL_1_2_SWITCH_COL * TILE,
  y: LEVEL_1_2_LEDGE.row * TILE,
} as const

/** Catalogue metadata: the level's id, the name the tile view draws and the set it is grouped under. */
export const LEVEL_META = { id: '1-2', name: 'GEAR GARDEN', set: 'WORLD 1', hero: LEVEL_1_2_HERO } as const

/** The rows the catalogue loads. Every level module exports this name, so the loader is uniform. */
export const LEVEL_ROWS = LEVEL_1_2_ROWS
