import { describe, expect, it } from 'vitest'
import { LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_ROWS } from './level1-1.level.ts'
import { LEVEL_1_1_AUTOPILOT_FRAMES } from './level1-1.times.ts'
import { runAutopilot } from '../toolkit/autopilot.ts'
import type { LevelToolkitProfile } from '../toolkit/level.ts'

const LEVEL: LevelToolkitProfile = {
  id: '1-1',
  rows: LEVEL_1_1_ROWS,
  echoAtX: LEVEL_1_1_ECHO_AT_X,
}

/**
 * The autopilot's no-sprint clear — the reference for the sprint/route side, NOT the casual baseline
 * (that is a recorded designer run). The sprint boost is never engaged, so the top speed is `RUN_MAX`;
 * the P-meter still fills from running at `RUN_MAX`, but nothing unlocks `SPRINT_MAX` without the key.
 */
describe('level 1-1 autopilot reference', () => {
  it('clears with no deaths and matches the recorded frame count', () => {
    const run = runAutopilot(LEVEL, { sprint: false })

    expect(run.won).toBe(true)
    expect(run.died).toBe(false)
    expect(run.deaths).toBe(0)
    expect(run.echoesPlaced).toBe(1)
    expect(run.frames).toBe(LEVEL_1_1_AUTOPILOT_FRAMES)
  })
})
