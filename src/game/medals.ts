/**
 * Medal thresholds, derived from the casual clear so no threshold is picked by hand. The results
 * screen reads this module and a test pins the four values; there are no magic numbers at the call
 * site. `MEDAL_FACTOR` is the calibration knob and ships provisional at 1.25 — the factor measured
 * from the operator's own runs is [[Calibrate the Echo Sky Run 1-1 Medal Times From Operator Runs]]'s
 * job, and swapping it here re-derives all four thresholds.
 *
 * Each threshold is `round(casualFrames × MEDAL_FACTOR × multiplier)`, in frames. The ordering is
 * author < gold < silver < bronze (author is the fastest time, bronze the slowest).
 */
export const MEDAL_FACTOR = 1.25

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
