import { describe, expect, it } from 'vitest'
import { LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_ROWS } from './level1-1.level.ts'
import { runAutopilot } from '../toolkit/autopilot.ts'
import type { LevelToolkitProfile } from '../toolkit/level.ts'

const LEVEL: LevelToolkitProfile = {
  id: '1-1',
  rows: LEVEL_1_1_ROWS,
  echoAtX: LEVEL_1_1_ECHO_AT_X,
}

/**
 * The casual baseline: the autopilot holds no sprint key, so the sprint boost is never engaged and
 * the top speed is `RUN_MAX`. (The P-meter still fills from running at `RUN_MAX` — the level's own
 * speed cap — but nothing unlocks `SPRINT_MAX` without the key.) 540 frames is the recorded
 * measurement; any drift in physics or geometry moves it, which is the point of recording it.
 *
 * The fastest in-bounds sprint route measures 426 frames (21.1% faster). That is the level's floor:
 * a 1200 px run at `SPRINT_MAX` is ~400 frames, and acceleration plus the P-meter fill add ~26 more.
 * A 40% margin (324 frames) is below that floor, so the task's 40–50% target is not reachable on
 * 1-1's current geometry — see the task's `# Progress` for the finding.
 */
export const CASUAL_BASELINE_FRAMES = 540

describe('level 1-1 casual baseline', () => {
  it('clears the casual route with no deaths and matches the recorded frame count', () => {
    const run = runAutopilot(LEVEL, { sprint: false })

    expect(run.won).toBe(true)
    expect(run.died).toBe(false)
    expect(run.deaths).toBe(0)
    expect(run.echoesPlaced).toBe(1)
    expect(run.frames).toBe(CASUAL_BASELINE_FRAMES)
  })
})
