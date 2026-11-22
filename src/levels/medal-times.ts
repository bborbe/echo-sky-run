/**
 * The medal table a level's results screen reads, keyed by level id.
 *
 * A level ships a medal table only when its times are calibrated; a level without one shows no medal
 * line rather than a misleading empty one. Today that is 1-1 alone — the later World 1 levels land
 * their own tables with their own fast routes.
 */

import type { MedalTimes } from '../game/medals.ts'
import { LEVEL_1_1_MEDAL_TIMES } from './level1-1.times.ts'

const MEDAL_TIMES_BY_LEVEL: Readonly<Record<string, MedalTimes>> = {
  '1-1': LEVEL_1_1_MEDAL_TIMES,
}

/** The medal thresholds for a level, or null when the level has no calibrated table. */
export function medalTimesFor(levelId: string): MedalTimes | null {
  return MEDAL_TIMES_BY_LEVEL[levelId] ?? null
}
