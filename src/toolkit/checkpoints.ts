/**
 * Check D: checkpoint gaps and respawn-to-control.
 *
 * The rating guide asks two things of a level's respawn points: no stretch longer than 45 s between
 * them, and a respawn that puts the player back in control within 300 ms (18 frames at 60 Hz). Both
 * are measured, not asserted:
 *
 *   - the gap is the walked path between consecutive respawn points (spawn, the midpoint checkpoint,
 *     the goal) on the guide's own time base — path pixels ÷ (`WALK_MAX` × 60), marked `est.`;
 *   - respawn-to-control is counted by driving a real pit death through `stepSim` and waiting for the
 *     first frame a held direction moves the player.
 *
 * The path is summed column by column along the floor, so a climb adds its rises instead of reading
 * as a flat run. A pit has no floor; the previous column's floor is carried across it, so a jump is
 * horizontal travel rather than a fall to the bottom of the world.
 */

import { createSim, stepSim, type SimInput } from '../game/sim.ts'
import { TILE, WALK_MAX } from '../physics/constants.ts'
import { CHECKPOINT, findTile, GOAL, SPAWN, type TileMap } from '../physics/tilemap.ts'
import { floorTop } from './level.ts'

/** The guide's gate: no stretch of play longer than this between respawn points. */
export const CHECKPOINT_GAP_MAX_S = 45
/** The guide's gate: back in control within 300 ms — 18 frames at the fixed 60 Hz step. */
export const RESPAWN_TO_CONTROL_MAX_F = 18

/** The guide's time base when no designer run exists: the slowest way through, so it overstates. */
export const WALK_PX_PER_SECOND = WALK_MAX * 60

export interface CheckpointGap {
  /** Columns of the two respawn points, in level order. */
  readonly fromCol: number
  readonly toCol: number
  /** Walked path length between them, in pixels. */
  readonly pathPx: number
  /** Estimated seconds on the guide's time base. */
  readonly seconds: number
}

export interface CheckpointReport {
  readonly gaps: readonly CheckpointGap[]
  readonly respawnToControlFrames: number
  /** True when every gap is ≤ 45 s and respawn-to-control is ≤ 18 f. */
  readonly passes: boolean
}

const IDLE: SimInput = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  sprint: false,
  echoPressed: false,
}

/** The respawn points a level has, in level order: spawn, the checkpoint (if any), the goal. */
export function respawnCols(map: TileMap): number[] {
  const cols: number[] = []
  for (const tile of [SPAWN, CHECKPOINT, GOAL]) {
    const found = findTile(map, tile)
    if (found !== null) cols.push(Math.floor(found.x / TILE))
  }
  // `findTile` returns the first tile of each kind, which for these three is the only one the engine
  // honours. Sorting keeps level order when a level writes its checkpoint before the spawn column.
  return cols.sort((a, b) => a - b)
}

/**
 * Walked path length between two columns, in pixels: one tile of horizontal travel per column plus
 * every rise or drop between adjacent floor tops. A pit is crossed at the previous column's floor
 * level, so the jump reads as horizontal travel.
 */
export function walkPathPx(map: TileMap, fromCol: number, toCol: number): number {
  if (toCol <= fromCol) return 0
  const bottom = map.rows * TILE
  let px = 0
  let prev = floorTop(map, fromCol)
  for (let col = fromCol + 1; col <= toCol; col++) {
    let top = floorTop(map, col)
    if (top >= bottom) top = prev
    px += TILE + Math.abs(top - prev)
    prev = top
  }
  return px
}

/** Every gap between consecutive respawn points, on the guide's estimated time base. */
export function checkpointGaps(map: TileMap): CheckpointGap[] {
  const cols = respawnCols(map)
  const gaps: CheckpointGap[] = []
  for (let i = 1; i < cols.length; i++) {
    const pathPx = walkPathPx(map, cols[i - 1], cols[i])
    gaps.push({
      fromCol: cols[i - 1],
      toCol: cols[i],
      pathPx,
      seconds: pathPx / WALK_PX_PER_SECOND,
    })
  }
  return gaps
}

/**
 * Frames from a death to the first frame the player can move. A pit death respawns on the death
 * frame itself, so this is the next frame that accepts input — 1 by construction, which is what makes
 * the 300 ms bound trivially true. It is measured anyway, because "by construction" is the claim
 * under test.
 */
export function respawnToControlFrames(map: TileMap): number {
  const sim = createSim(map)
  // A pit death: below the world's bottom edge, the same rule `stepSim` uses.
  sim.player.y = map.rows * TILE + 80
  stepSim(sim, IDLE)
  const startX = sim.player.x

  for (let frame = 0; frame < 60; frame++) {
    stepSim(sim, { ...IDLE, right: true })
    if (sim.player.x !== startX) return frame + 1
  }
  return Number.POSITIVE_INFINITY
}

/** The whole check: gaps plus respawn-to-control, and the verdict both produce together. */
export function checkpointReport(map: TileMap): CheckpointReport {
  const gaps = checkpointGaps(map)
  const respawnToControl = respawnToControlFrames(map)
  return {
    gaps,
    respawnToControlFrames: respawnToControl,
    passes:
      gaps.every((gap) => gap.seconds <= CHECKPOINT_GAP_MAX_S) &&
      respawnToControl <= RESPAWN_TO_CONTROL_MAX_F,
  }
}
