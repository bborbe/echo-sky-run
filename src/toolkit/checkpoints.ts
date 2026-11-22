/**
 * Check D: checkpoint gaps and respawn-to-control.
 *
 * The rating guide asks two things of a level's respawn points: no stretch longer than 45 s between
 * them, and a respawn that puts the player back in control within 300 ms (18 frames at 60 Hz). Both
 * are measured, not asserted:
 *
 *   - the gap is the walked distance between consecutive respawn points (spawn, the midpoint
 *     checkpoint, the goal) on the guide's own time base — path pixels ÷ (`WALK_MAX` × 60), marked
 *     `est.`. The path is the autopilot's route, summed frame by frame, so a climb adds its rises
 *     instead of reading as a flat run — a map-only floor walk silently flattens every terrace above
 *     the spawn row;
 *   - respawn-to-control is counted by driving a real pit death through `stepSim` and waiting for the
 *     first frame a held direction moves the player. The respawn itself is verified first: if the
 *     death did not put Pip back at the respawn point, the measurement is of a falling body and the
 *     check fails rather than reporting a vacuous 1.
 *
 * A route that never finishes cannot be judged: the report is `applicable: false` (n/r), never a
 * guessed pass.
 */

import { createSim, stepSim, type SimInput } from '../game/sim.ts'
import { PLAYER_W, TILE, WALK_MAX } from '../physics/constants.ts'
import { CHECKPOINT, findTile, GOAL, SPAWN, type TileMap } from '../physics/tilemap.ts'
import { autopilotDecision } from './autopilot.ts'
import { profileMap, requireEchoAnswer, type LevelToolkitProfile } from './level.ts'

/** The guide's gate: no stretch of play longer than this between respawn points. */
export const CHECKPOINT_GAP_MAX_S = 45
/** The guide's gate: back in control within 300 ms — 18 frames at the fixed 60 Hz step. */
export const RESPAWN_TO_CONTROL_MAX_F = 18

/** The guide's time base when no designer run exists: the slowest way through, so it overstates. */
export const WALK_PX_PER_SECOND = WALK_MAX * 60

/** The frames one route simulation may take before it is treated as not finishing. */
const MAX_ROUTE_FRAMES = 4000

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
  /** False when the route never finished: the gaps cannot be judged, so the check is n/r. */
  readonly applicable: boolean
  /** True only when the check decided and both halves passed. */
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

/** The autopilot's route, with the cumulative walked distance at each respawn column. */
interface Route {
  readonly won: boolean
  readonly distanceAtCol: readonly number[]
}

/**
 * Walk the autopilot's route once, summing the distance actually travelled and recording the
 * cumulative distance when Pip's x first reaches each respawn column. Using the route (not a
 * map-only floor walk) is what makes a climb count: a vertical level's terraces sit above the spawn
 * row, and a floor walk from the spawn row down reads them as pits and flattens the path.
 */
function route(profile: LevelToolkitProfile, cols: readonly number[]): Route {
  requireEchoAnswer(profile)
  const sim = createSim(profileMap(profile))
  const distanceAtCol: number[] = []
  let next = 0
  let cumulative = 0
  let echoUsed = false
  let prevX = sim.player.x
  let prevY = sim.player.y

  // A respawn column at or behind the spawn is reached at distance 0.
  while (next < cols.length && cols[next] * TILE <= sim.player.x + PLAYER_W) {
    distanceAtCol.push(0)
    next += 1
  }

  for (let frame = 0; frame < MAX_ROUTE_FRAMES; frame++) {
    const decision = autopilotDecision(sim, profile.echoAtX, echoUsed)
    echoUsed = decision.echoUsed
    stepSim(sim, {
      left: false,
      right: true,
      jump: true,
      jumpPressed: decision.jumpPressed,
      sprint: true,
      echoPressed: decision.echoPressed,
    })

    const player = sim.player
    cumulative += Math.hypot(player.x - prevX, player.y - prevY)
    prevX = player.x
    prevY = player.y

    // A respawn tile is reached when Pip's box touches its left edge — the same overlap the engine
    // uses to claim the checkpoint and the goal. Comparing the bare x would miss the goal, whose
    // trigger is the leading edge and whose tile the player's left edge never reaches.
    while (next < cols.length && player.x + PLAYER_W >= cols[next] * TILE) {
      distanceAtCol.push(cumulative)
      next += 1
    }

    if (sim.goalReached) {
      // The goal's own trigger is the authority: a level can reach the goal column without touching
      // the flag (a jump over it), so record any remaining respawn point at the finish.
      while (next < cols.length) {
        distanceAtCol.push(cumulative)
        next += 1
      }
      break
    }
    if (sim.deaths > 0) break
  }

  return { won: sim.goalReached, distanceAtCol }
}

/**
 * Every gap between consecutive respawn points, on the guide's estimated time base. `applicable` is
 * false when the route did not finish, so a caller cannot read an unmeasured level as a pass.
 */
export function checkpointGaps(profile: LevelToolkitProfile): {
  readonly gaps: readonly CheckpointGap[]
  readonly applicable: boolean
} {
  const cols = respawnCols(profileMap(profile))
  const walked = route(profile, cols)
  if (!walked.won || walked.distanceAtCol.length !== cols.length) {
    return { gaps: [], applicable: false }
  }

  const gaps: CheckpointGap[] = []
  for (let i = 1; i < cols.length; i++) {
    const pathPx = walked.distanceAtCol[i] - walked.distanceAtCol[i - 1]
    gaps.push({
      fromCol: cols[i - 1],
      toCol: cols[i],
      pathPx,
      seconds: pathPx / WALK_PX_PER_SECOND,
    })
  }
  return { gaps, applicable: true }
}

/**
 * Frames from a death to the first frame the player can move. The respawn is verified before the
 * count: a pit death that failed to respawn leaves Pip falling, and counting his next frame of
 * drift as "control" is exactly the vacuous pass this check exists to prevent.
 */
export function respawnToControlFrames(map: TileMap): number {
  const sim = createSim(map)
  const deathsBefore = sim.deaths
  // A pit death: below the world's bottom edge, the same rule `stepSim` uses.
  sim.player.y = map.rows * TILE + 80
  stepSim(sim, IDLE)

  if (sim.deaths !== deathsBefore + 1) return Number.POSITIVE_INFINITY
  if (sim.player.x !== sim.respawn.x || sim.player.y !== sim.respawn.y) {
    return Number.POSITIVE_INFINITY
  }

  const startX = sim.player.x
  for (let frame = 0; frame < 60; frame++) {
    stepSim(sim, { ...IDLE, right: true })
    if (sim.player.x !== startX) return frame + 1
  }
  return Number.POSITIVE_INFINITY
}

/** The whole check: gaps plus respawn-to-control, and the verdict both produce together. */
export function checkpointReport(profile: LevelToolkitProfile): CheckpointReport {
  const { gaps, applicable } = checkpointGaps(profile)
  const respawnToControl = respawnToControlFrames(profileMap(profile))
  return {
    gaps,
    respawnToControlFrames: respawnToControl,
    applicable,
    passes:
      applicable &&
      gaps.every((gap) => gap.seconds <= CHECKPOINT_GAP_MAX_S) &&
      respawnToControl <= RESPAWN_TO_CONTROL_MAX_F,
  }
}
