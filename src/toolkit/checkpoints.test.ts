import { describe, expect, it } from 'vitest'
import { LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_ROWS } from '../levels/level1-1.level.ts'
import { parseLevel } from '../physics/tilemap.ts'
import type { LevelToolkitProfile } from './level.ts'
import {
  CHECKPOINT_GAP_MAX_S,
  checkpointReport,
  respawnToControlFrames,
} from './checkpoints.ts'

const LEVEL_1_1: LevelToolkitProfile = {
  id: '1-1',
  rows: LEVEL_1_1_ROWS,
  echoAtX: LEVEL_1_1_ECHO_AT_X,
}

/** A flat strip: spawn at column 2, the goal at `goalCol`, solid floor all the way. */
function flatStrip(goalCol: number): LevelToolkitProfile {
  const cols = goalCol + 2
  const top = Array.from({ length: cols }, (_, col) =>
    col === 2 ? 'S' : col === goalCol ? 'F' : '.',
  ).join('')
  return { id: 'flat', rows: [top, '#'.repeat(cols)], echoAtX: null }
}

/** The goal behind a wall taller than a sprint jump, so the route can never finish. */
function walledGoal(): LevelToolkitProfile {
  const cols = 30
  const top = Array.from({ length: cols }, (_, col) =>
    col === 0 ? 'S' : col === 25 ? 'F' : '.',
  ).join('')
  const wall = Array.from({ length: cols }, (_, col) => (col === 10 ? '#' : '.')).join('')
  return {
    id: 'walled',
    rows: [top, wall, wall, wall, wall, wall, wall, '#'.repeat(cols)],
    echoAtX: null,
  }
}

describe('the checkpoint-gap check', () => {
  it('passes 1-1: both respawn gaps are under 45 s', () => {
    const report = checkpointReport(LEVEL_1_1)

    expect(report.applicable).toBe(true)
    expect(report.gaps).toHaveLength(2)
    for (const gap of report.gaps) {
      expect(gap.seconds).toBeGreaterThan(0)
      expect(gap.seconds).toBeLessThanOrEqual(CHECKPOINT_GAP_MAX_S)
    }
    expect(report.passes).toBe(true)
  })

  it('puts the player back in control within 18 frames of a pit death', () => {
    const frames = respawnToControlFrames(parseLevel(LEVEL_1_1_ROWS))
    expect(frames).toBeLessThanOrEqual(18)
  })

  it('has a gap check that actually fires: a 60 s respawn gap is flagged', () => {
    // A 288-column walk at WALK_MAX is 61.4 s, past the guide's 45 s gate.
    const report = checkpointReport(flatStrip(290))

    expect(report.applicable).toBe(true)
    expect(report.gaps).toHaveLength(1)
    expect(report.gaps[0].seconds).toBeGreaterThan(CHECKPOINT_GAP_MAX_S)
    expect(report.passes).toBe(false)
  })

  it('returns n/r, never a pass, when the route cannot finish', () => {
    const report = checkpointReport(walledGoal())

    expect(report.applicable).toBe(false)
    expect(report.passes).toBe(false)
  })
})
