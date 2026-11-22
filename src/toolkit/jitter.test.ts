import { describe, expect, it } from 'vitest'
import { LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_ROWS } from '../levels/level1-1.level.ts'
import type { LevelToolkitProfile } from './level.ts'
import {
  SAFE_SPOT_MAX_S,
  jitterClear,
  runWithJumpDelay,
  safeSpotGaps,
  safeSpotReport,
} from './jitter.ts'

const LEVEL: LevelToolkitProfile = {
  id: '1-1',
  rows: LEVEL_1_1_ROWS,
  echoAtX: LEVEL_1_1_ECHO_AT_X,
}

describe('the jitter clear', () => {
  it('clears 1-1 with every jump press up to 3 frames late', () => {
    const report = jitterClear(LEVEL)

    expect(report.runs.map((run) => run.delayF)).toEqual([0, 1, 2, 3])
    for (const run of report.runs) {
      expect(run.won, `delay=${run.delayF} ${JSON.stringify(run)}`).toBe(true)
      expect(run.deaths, `delay=${run.delayF}`).toBe(0)
    }
    expect(report.passes).toBe(true)
  })

  it('is a real perturbation: the delays change the run', () => {
    // A check that cannot fire is worse than no check. If every delay produced the same frame count,
    // the clear above would be vacuous.
    expect(jitterClear(LEVEL).perturbationReal).toBe(true)
  })

  it('can fail a run: a delay long enough to miss the jump does not clear', () => {
    // The firing control for the mechanism itself, separate from the ±3 f bar.
    expect(runWithJumpDelay(LEVEL, 20).won).toBe(false)
  })
})

describe('the safe-spot spacing', () => {
  it('passes a route with a safe spot every few seconds', () => {
    const gaps = safeSpotGaps([0, 600, 1200])
    expect(gaps.map((gap) => gap.seconds)).toEqual([10, 10])
  })

  it('has a spacing check that actually fires: a 21.7 s gap is flagged', () => {
    // The known positive: 1300 frames is 21.7 s, past the guide's 20 s bar.
    const gaps = safeSpotGaps([0, 1300, 2000])
    expect(Math.max(...gaps.map((gap) => gap.seconds))).toBeGreaterThan(SAFE_SPOT_MAX_S)
  })

  it('passes 1-1: the autopilot route always has a safe spot within 20 s', () => {
    const report = safeSpotReport(LEVEL)
    expect(report.applicable).toBe(true)
    expect(report.longestSeconds).toBeLessThanOrEqual(SAFE_SPOT_MAX_S)
    expect(report.passes).toBe(true)
  })
})
