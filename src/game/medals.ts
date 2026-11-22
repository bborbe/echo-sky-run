/**
 * Medal thresholds, derived from the casual clear so no threshold is picked by hand. The results
 * screen reads this module and a test pins the four values; there are no magic numbers at the call
 * site. `MEDAL_FACTOR` is the measured human factor from
 * [[Calibrate the Echo Sky Run 1-1 Medal Times From Operator Runs]]: the operator's casual 1-1 clear
 * (17.0 s = 1020 f) divided by the autopilot's casual clear (540 f). Changing it re-derives all four
 * thresholds.
 *
 * Each threshold is `round(autopilotFrames × MEDAL_FACTOR × multiplier)`, in frames. The ordering is
 * author < gold < silver < bronze (author is the fastest time, bronze the slowest).
 */
export const MEDAL_FACTOR = 1020 / 540

/** The author (best) time — the fastest threshold. */
export const MEDAL_AUTHOR_MULTIPLIER = 0.6
/** Gold — a clean run of the level. */
export const MEDAL_GOLD_MULTIPLIER = 0.8
/** Silver — the casual pace. */
export const MEDAL_SILVER_MULTIPLIER = 1.0
/** Bronze — a slow but finished run. */
export const MEDAL_BRONZE_MULTIPLIER = 1.2

export interface MedalTimes {
  /** Fastest: the author time. */
  readonly author: number
  readonly gold: number
  readonly silver: number
  /** Slowest: the bronze time. */
  readonly bronze: number
}

/** The medal a clear earns, fastest first. */
export type Medal = 'author' | 'gold' | 'silver' | 'bronze'

/**
 * The medal a clear of `frames` earns against `times`, or null when it misses bronze. A threshold is
 * inclusive: finishing exactly on the author time earns the author medal.
 */
export function medalFor(frames: number, times: MedalTimes): Medal | null {
  if (frames <= times.author) return 'author'
  if (frames <= times.gold) return 'gold'
  if (frames <= times.silver) return 'silver'
  if (frames <= times.bronze) return 'bronze'
  return null
}

/**
 * The four medal times, in frames, from the casual clear. Strictly ordered
 * author < gold < silver < bronze.
 */
export function medalTimes(casualFrames: number): MedalTimes {
  const at = (multiplier: number): number => Math.round(casualFrames * MEDAL_FACTOR * multiplier)
  return {
    author: at(MEDAL_AUTHOR_MULTIPLIER),
    gold: at(MEDAL_GOLD_MULTIPLIER),
    silver: at(MEDAL_SILVER_MULTIPLIER),
    bronze: at(MEDAL_BRONZE_MULTIPLIER),
  }
}
