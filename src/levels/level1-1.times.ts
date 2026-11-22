import { medalTimes, type MedalTimes } from '../game/medals.ts'

/**
 * The autopilot's no-sprint clear of 1-1 — the base the medal thresholds multiply by the measured
 * human factor. The casual baseline is the operator's recorded designer run (17.0 s = 1020 f, owned
 * by [[Calibrate the Echo Sky Run 1-1 Medal Times From Operator Runs]]), and `MEDAL_FACTOR` already
 * encodes it (1020 f ÷ 540 f). Passing the designer frames here as well would apply the factor
 * twice, so the base stays this autopilot reference.
 */
export const LEVEL_1_1_AUTOPILOT_FRAMES = 540

/**
 * The operator's recorded casual designer run: 17.0 s at 60 Hz. It is the baseline the fast route is
 * measured against (40–50 % below it) and the clear `MEDAL_FACTOR` was measured from — 1020 f ÷ the
 * 540 f autopilot reference. The recording itself is owned by
 * [[Calibrate the Echo Sky Run 1-1 Medal Times From Operator Runs]].
 */
export const LEVEL_1_1_CASUAL_FRAMES = 1020

/**
 * The four stored 1-1 medal thresholds, in frames — author 612, gold 816, silver 1020, bronze 1224
 * (10.2 s, 13.6 s, 17.0 s, 20.4 s at 60 Hz). Silver is the operator's casual pace.
 */
export const LEVEL_1_1_MEDAL_TIMES: MedalTimes = medalTimes(LEVEL_1_1_AUTOPILOT_FRAMES)
