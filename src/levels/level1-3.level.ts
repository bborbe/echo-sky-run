// Level 1-3 "Windmill Rise". The spec's § 7 shape: a vertical climb of Gust-Wings and a secret
// switch three tiles above the reachable height that unlocks 1-S on the map.
//
// One character per tile: '.' empty, '#' solid, '=' one-way, 'S' spawn, 'F' goal, 'g' Gear-Goomba,
// 't' Steam-Turtle, 'b' Spike-Beetle, 'w' Gust-Wing, 'r' Chaser-Bot, '?' ? block, 'C' checkpoint,
// 'i' sign, 'n' Nimbus, 's' Echo switch, 'D' Echo door (feet-anchored, three tiles tall), 'X' secret
// switch.
//
// The climb is built from a terrace list rather than typed as 76 hand-written strings: the tower is
// 264 columns by 76 rows, and a literal grid that size hides the one thing a reader needs — the
// terrace rhythm. Each terrace is a flat run, then a three-tile riser to the next. The autopilot
// climbs it by jumping at each riser (`wallAhead`), which is the shape `Teach the Echo Sky Run
// Autopilot to Climb` proved.
//
// The secret switch sits in a one-tile-tall niche at the top of the climb, seven tiles above the
// run-out terrace's floor. A plain jump peaks at 5.5 tiles and a stomp bounce at 6.4, so neither can
// put Pip's feet on the niche's ledge; a jump off a mid-air Echo reaches 11 tiles, which is the only
// way in. The niche is one tile tall — 16 px, four times the Echo's 4 px platform and no taller than
// Pip's 16 px body — so it reads as an Echo-sized slot.

import { TILE } from '../physics/constants.ts'

/** One flat run of the tower, then a riser of `rise` tiles to the next terrace. */
interface Terrace {
  readonly cols: number
  readonly rise: number
}

/** The climb: twenty terraces of twelve columns, each three tiles higher than the last. */
const CLIMB: readonly Terrace[] = Array.from({ length: 20 }, () => ({ cols: 12, rise: 3 }))
/** The run-out at the top: flat ground for the goal, the niche and the last Gust-Wing chamber. */
const RUN_OUT_COLS = 24

/** Rows in the level. Row 75 is the bottom floor; the top terrace's floor is row 15. */
export const LEVEL_1_3_ROWS_TOTAL = 76
/** The bottom floor's row — the terrace every other one is measured up from. */
export const LEVEL_1_3_BOTTOM_ROW = 75

/** The terrace layout flattened to one entry per column: the floor row under that column. */
function floorRows(): number[] {
  const rows: number[] = []
  let row = LEVEL_1_3_BOTTOM_ROW
  for (const terrace of CLIMB) {
    for (let c = 0; c < terrace.cols; c++) rows.push(row)
    row -= terrace.rise
  }
  for (let c = 0; c < RUN_OUT_COLS; c++) rows.push(row)
  return rows
}

const FLOOR_ROWS = floorRows()
/** The level's width in tiles, asserted by the level's own test. */
export const LEVEL_1_3_COLS = FLOOR_ROWS.length

/** A mutable grid the builder writes into, then freezes into rows. */
function blankGrid(): string[][] {
  return Array.from({ length: LEVEL_1_3_ROWS_TOTAL }, () => Array.from({ length: LEVEL_1_3_COLS }, () => '.'))
}

function fillSolid(grid: string[][], firstCol: number, lastCol: number, firstRow: number, lastRow: number): void {
  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = firstCol; col <= lastCol; col++) grid[row][col] = '#'
  }
}

function put(grid: string[][], col: number, row: number, ch: string): void {
  grid[row][col] = ch
}

/** The column a terrace starts at, given its index in `CLIMB`. */
export function terraceFirstCol(index: number): number {
  return CLIMB.slice(0, index).reduce((n, t) => n + t.cols, 0)
}

/** The floor row of the terrace at `index`; `index === CLIMB.length` is the run-out. */
export function terraceFloorRow(index: number): number {
  return LEVEL_1_3_BOTTOM_ROW - CLIMB.slice(0, index).reduce((n, t) => n + t.rise, 0)
}

/** Where the spawn sits: the first terrace, two columns in. */
export const LEVEL_1_3_SPAWN_COL = 2

/** The run-out terrace's floor row — the top of the climb. */
export const LEVEL_1_3_TOP_ROW = terraceFloorRow(CLIMB.length)

/**
 * The secret-switch niche. Its ledge is solid at `row`, its interior is the row above, and its roof
 * is solid one row above that — a one-tile-tall slot. The ledge top is seven tiles above the run-out
 * floor: three tiles above a walk jump's 4.2-tile reach, and past the 6.4-tile stomp bounce.
 */
export const LEVEL_1_3_NICHE = {
  firstCol: LEVEL_1_3_COLS - 14,
  lastCol: LEVEL_1_3_COLS - 5,
  ledgeRow: LEVEL_1_3_TOP_ROW - 7,
} as const

/** The secret switch's column, three tiles in from the niche's mouth. */
export const LEVEL_1_3_SECRET_COL = LEVEL_1_3_NICHE.firstCol + 3
/** The secret switch's row — the niche's interior, one row above its ledge. */
export const LEVEL_1_3_SECRET_ROW = LEVEL_1_3_NICHE.ledgeRow - 1

/** The goal's column: the far end of the run-out. */
export const LEVEL_1_3_GOAL_COL = LEVEL_1_3_COLS - 2

/**
 * The midpoint checkpoint. The engine reads only the first 'C', so the level carries exactly one, on
 * the tenth terrace — the midpoint of the twenty-terrace climb.
 */
export const LEVEL_1_3_CHECKPOINT_TERRACE = 10
export const LEVEL_1_3_CHECKPOINT_COL = terraceFirstCol(LEVEL_1_3_CHECKPOINT_TERRACE) + 6

/** A Gust-Wing chamber: a walled room the climb passes through, with doorways at floor level. */
interface Chamber {
  readonly firstCol: number
  readonly lastCol: number
  readonly heightTiles: number
}

/**
 * The Gust-Wing chambers, one per third of the climb. Each is a walled room with a two-tile doorway
 * on both sides, so the wing bounces between the side walls instead of flying out of the level, and
 * Pip runs through the doorway underneath it.
 */
const CHAMBERS: readonly Chamber[] = [4, 11, 17].map((terrace) => ({
  firstCol: terraceFirstCol(terrace) + 2,
  lastCol: terraceFirstCol(terrace) + 10,
  heightTiles: 12,
}))

/**
 * The wing's height above its chamber's floor, in tiles. Ten tiles keeps its lowest sine point
 * (baseY + 24, bottom at +40) above a sprint jump's head apex — 102 px above the floor — so a player
 * running under it is safe and only a deliberate jump into it is a hazard. The autopilot jumps at
 * every enemy it sees ahead (`enemyAhead` reads x only, never height), so anything inside its jump
 * arc would kill it on a level that is meant to be clearable.
 */
const WING_HEIGHT_TILES = 10

function buildRows(): readonly string[] {
  const grid = blankGrid()

  // The terraces: solid from each column's floor row to the bottom.
  for (let col = 0; col < LEVEL_1_3_COLS; col++) {
    fillSolid(grid, col, col, FLOOR_ROWS[col], LEVEL_1_3_ROWS_TOTAL - 1)
  }

  // Both edges are closed full height: an open edge lets the player walk out of the world.
  fillSolid(grid, 0, 0, 0, LEVEL_1_3_ROWS_TOTAL - 1)
  fillSolid(grid, LEVEL_1_3_COLS - 1, LEVEL_1_3_COLS - 1, 0, LEVEL_1_3_ROWS_TOTAL - 1)

  // The Gust-Wing chambers: walls on both sides, a roof, and a two-tile doorway at floor level.
  for (const chamber of CHAMBERS) {
    const floor = FLOOR_ROWS[chamber.firstCol]
    fillSolid(grid, chamber.firstCol, chamber.firstCol, floor - chamber.heightTiles, floor - 1)
    fillSolid(grid, chamber.lastCol, chamber.lastCol, floor - chamber.heightTiles, floor - 1)
    fillSolid(grid, chamber.firstCol, chamber.lastCol, floor - chamber.heightTiles, floor - chamber.heightTiles)
    // The doorways are the two tiles directly above the floor at each wall, so the run passes under
    // the wing. Carve them back out of the walls.
    for (const col of [chamber.firstCol, chamber.lastCol]) {
      for (let row = floor - 2; row <= floor - 1; row++) grid[row][col] = '.'
    }
    // One Gust-Wing per chamber, centred and clear of the doorway line.
    const mid = Math.floor((chamber.firstCol + chamber.lastCol) / 2)
    put(grid, mid, floor - WING_HEIGHT_TILES, 'w')
  }

  // The secret-switch niche: a solid ledge, an open interior row, a solid roof.
  const niche = LEVEL_1_3_NICHE
  fillSolid(grid, niche.firstCol, niche.lastCol, niche.ledgeRow, niche.ledgeRow)
  fillSolid(grid, niche.firstCol, niche.lastCol, niche.ledgeRow - 2, niche.ledgeRow - 2)
  put(grid, LEVEL_1_3_SECRET_COL, LEVEL_1_3_SECRET_ROW, 'X')

  // The spawn, the checkpoint and the goal.
  put(grid, LEVEL_1_3_SPAWN_COL, FLOOR_ROWS[LEVEL_1_3_SPAWN_COL] - 1, 'S')
  put(grid, LEVEL_1_3_CHECKPOINT_COL, FLOOR_ROWS[LEVEL_1_3_CHECKPOINT_COL] - 1, 'C')
  put(grid, LEVEL_1_3_GOAL_COL, FLOOR_ROWS[LEVEL_1_3_GOAL_COL] - 1, 'F')

  return grid.map((row) => row.join(''))
}

/** The rows the catalogue loads. Every level module exports this name, so the loader is uniform. */
export const LEVEL_ROWS: readonly string[] = buildRows()

/**
 * The walked path length in pixels: every terrace's flat run plus every riser, which is what a
 * climbing player actually traverses. A spawn-to-goal horizontal delta would read ~0 for a tower.
 */
export const LEVEL_1_3_PATH_PX: number = (() => {
  let px = 0
  for (const terrace of CLIMB) px += terrace.cols * TILE + terrace.rise * TILE
  px += RUN_OUT_COLS * TILE
  return px
})()

/**
 * The spot the tile view's thumbnail is framed on: the secret-switch niche, so a tile shows the
 * level's own question rather than the patch of ground every level opens on.
 */
export const LEVEL_1_3_HERO = {
  x: LEVEL_1_3_SECRET_COL * TILE,
  y: LEVEL_1_3_NICHE.ledgeRow * TILE,
} as const

/** Catalogue metadata: the level's id, the name the tile view draws and the set it is grouped under. */
export const LEVEL_META = { id: '1-3', name: 'WINDMILL RISE', set: 'WORLD 1', hero: LEVEL_1_3_HERO } as const
