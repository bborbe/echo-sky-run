/**
 * A level's declarative spec: what the level is for, which Echo use it teaches, how hard it is, and
 * which solutions it forbids. The solver reads it — the spec is an input to `make level-check`, not
 * documentation that drifts.
 *
 * The vocabulary comes from [[Platformer World Design Guide]] § Echo Vocabulary and § Difficulty
 * Profile; the forbidden-solution list is what the reachability search turns into a proof.
 */

import type { ReachTarget } from './reachability.ts'

/** How much the level depends on the Echo. */
export type EchoRole = 'optional' | 'required' | 'central'

/** The Echo's uses, from the World Design Guide's vocabulary table. */
export type EchoUse =
  | 'platform'
  | 'switch-holder'
  | 'out-of-reach-weight'
  | 'bait'
  | 'shield'
  | 'grip-surface'
  | 'momentum-carrier'
  | 'warp'
  | 'forces'

/**
 * The six difficulty dimensions, 0–4. Design estimates: the guide says to recalibrate them from the
 * section sheets and median attempts after each play gate.
 */
export interface DifficultyProfile {
  readonly precision: number
  readonly timing: number
  readonly movement: number
  readonly echoPlanning: number
  readonly spatialReasoning: number
  readonly enemyPressure: number
}

/**
 * A solution the level must not have. `expect` is what the search should find: `blocked` means the
 * solution must not exist (a pass), `found` records an intended, documented skip.
 */
export interface ForbiddenSolution {
  readonly id: string
  readonly description: string
  readonly target: ReachTarget
  /** True when the search may use the Echo; false is the no-Echo search. */
  readonly echo: boolean
  readonly expect: 'blocked' | 'found'
}

/**
 * A section the level is built around the Echo for: reachable with it, and not without it. This is the
 * per-beat form of the rating guide's criterion 1 ("the no-Echo search finds no clear of any Echo beat").
 */
export interface EchoBeat {
  readonly id: string
  readonly description: string
  readonly target: ReachTarget
  /**
   * Intermediate targets solved in order before `target`. A beat is often a route — climb the ledge,
   * stand on the switch, then hold the door — and declaring its legs is what keeps the search local.
   */
  readonly via?: readonly ReachTarget[]
}

export interface LevelStructure {
  readonly cols: number
  readonly rows: number
}

export interface LevelSpec {
  readonly id: string
  readonly name: string
  /** The level's one question, in one sentence (rating guide criterion 12). */
  readonly primaryProblem: string
  readonly echoRole: EchoRole
  readonly echoUses: readonly EchoUse[]
  readonly difficulty: DifficultyProfile
  /** What the level must look like. The structure check reads it against the parsed map. */
  readonly structure: LevelStructure
  /** True when the goal itself must be unreachable without the Echo. False when the goal is on the
   * running line and only the beats need the Echo (1-2's design). */
  readonly goalNeedsEcho: boolean
  readonly beats: readonly EchoBeat[]
  readonly forbiddenSolutions: readonly ForbiddenSolution[]
  /** Free-text notes the report prints verbatim — intended skips, known design decisions. */
  readonly notes: readonly string[]
  /** The level's tile rows, so the checker needs nothing but the spec. */
  readonly rows: readonly string[]
}

/** The difficulty dimensions, in report order. */
export const DIFFICULTY_DIMENSIONS = [
  'precision',
  'timing',
  'movement',
  'echoPlanning',
  'spatialReasoning',
  'enemyPressure',
] as const

/**
 * The world rule from the World Design Guide: between consecutive main-path levels at most one
 * difficulty dimension may rise, and by at most 1. Returns the violations, empty when the pair is legal.
 */
export function difficultyViolations(previous: DifficultyProfile, next: DifficultyProfile): string[] {
  const violations: string[] = []
  let risen = 0
  for (const dimension of DIFFICULTY_DIMENSIONS) {
    const delta = next[dimension] - previous[dimension]
    if (delta > 1) violations.push(`${dimension} rises ${delta} (max 1)`)
    if (delta > 0) risen += 1
  }
  if (risen > 1) violations.push(`${risen} dimensions rise at once (max 1)`)
  return violations
}
