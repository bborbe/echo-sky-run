/**
 * Level sections and the splits the results screen reads.
 *
 * A section is a stretch of a level between two x boundaries: where the floor ends for a gap, where
 * the checkpoint sits, where the level's lesson begins. A run records the time it reaches each
 * boundary; the results screen turns those cumulative split times into per-section durations and
 * compares them with the best durations the save holds, so a player reads which stretch cost time
 * instead of only a total.
 *
 * Pure and DOM-free: the shell feeds it each fixed step, and the arithmetic is unit-tested.
 */

/**
 * Which section boundaries the player's leading edge passed between two x values, in boundary order.
 * Only a forward crossing counts — a respawn teleports the player back to the checkpoint, and that
 * must not re-record a split the run already took.
 */
export function crossedBoundaries(bounds: readonly number[], fromX: number, toX: number): number[] {
  const out: number[] = []
  for (let i = 0; i < bounds.length; i++) {
    if (fromX < bounds[i] && toX >= bounds[i]) out.push(i)
  }
  return out
}

/**
 * The duration of every section, in seconds, from cumulative split times. `splits[i]` is the time the
 * run reached boundary `i`, or null when it never did; the last section runs from the final split to
 * `finish`. A missing split is treated as reached at `finish`, so a short run still yields one
 * duration per section and the list never changes length between runs.
 */
export function sectionDurations(splits: readonly (number | null)[], finish: number): number[] {
  const durations: number[] = []
  let previous = 0
  for (const split of splits) {
    const reached = split ?? finish
    durations.push(Math.max(0, reached - previous))
    previous = reached
  }
  durations.push(Math.max(0, finish - previous))
  return durations
}

/**
 * The seconds lost (+) or gained (−) per section against the best, or null for a section with no
 * stored best yet. The caller reads the best *before* recording this run, so the deltas describe the
 * run against the best it was trying to beat.
 */
export function sectionDeltas(
  current: readonly number[],
  best: readonly (number | null)[],
): (number | null)[] {
  return current.map((seconds, i) => {
    const previous = best[i]
    return previous === null || previous === undefined ? null : seconds - previous
  })
}

/**
 * The `bestTimes` key a level's section best is stored under. Section bests live in the existing
 * per-level map rather than in a new schema field, so a save needs no version bump: `1-1` keeps the
 * level total, and `1-1#0` … `1-1#3` hold the four section durations.
 */
export function sectionKey(levelId: string, index: number): string {
  return `${levelId}#${index}`
}
