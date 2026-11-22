/**
 * Level 1-1's fast route: the designed expert line, and the frame count it measures.
 *
 * The casual baseline is the operator's recorded designer run (1020 f, 17.0 s — see
 * `level1-1.times.ts`). The fast route is a *route*, not "hold the sprint key": it names one sprint
 * window — the flat opening, where the ground is even and nothing punishes the speed — and runs the
 * technical middle (the Gear-Goomba, the small gap, the checkpoint and the Echo gap) at `RUN_MAX`.
 * That plan clears in 524 f, 48.6 % below the casual run, inside the 40–50 % band the level's replay
 * goal asks for.
 *
 * Measured for context, not as the target: the no-sprint autopilot clears in 540 f (47.1 % below)
 * and a bot that holds sprint from the first frame clears in 426 f (58.2 % below). The held-sprint
 * clear sits below the band's lower edge; the band is the route's design target, not a claim about
 * the engine's fastest possible clear.
 */

import type { AutopilotRun } from '../toolkit/autopilot.ts'
import { runAutopilot } from '../toolkit/autopilot.ts'
import type { LevelToolkitProfile } from '../toolkit/level.ts'
import { TILE } from '../physics/constants.ts'
import { LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_ROWS } from './level1-1.level.ts'

/**
 * The tile the route stops sprinting at: the flat opening runs to here, and the line runs from the
 * Gear-Goomba onward. 20 tiles is past the first enemy, so the sprint window ends on flat ground.
 */
export const LEVEL_1_1_FAST_ROUTE_SPRINT_UNTIL_TILE = 20

/** The route's sprint plan: sprint the opening, run the rest. */
export function level11FastRouteSprintAt(x: number): boolean {
  return x < LEVEL_1_1_FAST_ROUTE_SPRINT_UNTIL_TILE * TILE
}

/** The toolkit profile the route and its test run. */
export const LEVEL_1_1_PROFILE: LevelToolkitProfile = {
  id: '1-1',
  rows: LEVEL_1_1_ROWS,
  echoAtX: LEVEL_1_1_ECHO_AT_X,
}

/** Play 1-1 along the fast route through the real `stepSim`, exactly as the autopilot plays it. */
export function runLevel11FastRoute(): AutopilotRun {
  return runAutopilot(LEVEL_1_1_PROFILE, { sprintPlan: level11FastRouteSprintAt })
}

/**
 * The route's measured clear, in frames. Pinned so a level or physics change that moves the line is
 * a failing test rather than a silent drift, and so the results screen's medal comparison has one
 * number to check against.
 */
export const LEVEL_1_1_FAST_FRAMES = 524
