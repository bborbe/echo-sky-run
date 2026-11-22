import { describe, expect, it } from 'vitest'
import { parseLevel } from '../physics/tilemap.ts'
import { LEVEL_1_1_ROWS } from '../levels/level1-1.level.ts'
import {
  CHECKPOINT_GAP_MAX_S,
  checkpointGaps,
  checkpointReport,
  respawnToControlFrames,
  walkPathPx,
} from './checkpoints.ts'

/** A flat strip: spawn at column 2, the goal at `goalCol`, solid floor all the way. */
function flatStrip(goalCol: number): ReturnType<typeof parseLevel> {
  const cols = goalCol + 2
  const top = Array.from({ length: cols }, (_, col) => (col === 2 ? 'S' : col === goalCol ? 'F' : '.')).join('')
  return parseLevel([top, '#'.repeat(cols)])
}

describe('the checkpoint-gap check', () => {
  it('measures a walked path as one tile per column on flat ground', () => {
    expect(walkPathPx(flatStrip(12), 2, 12)).toBe(10 * 16)
  })

  it('passes 1-1: both respawn gaps are well under 45 s', () => {
    const map = parseLevel(LEVEL_1_1_ROWS)
    const gaps = checkpointGaps(map)

    expect(gaps).toHaveLength(2)
    for (const gap of gaps) {
      expect(gap.seconds).toBeGreaterThan(0)
      expect(gap.seconds).toBeLessThanOrEqual(CHECKPOINT_GAP_MAX_S)
    }
  })

  it('puts the player back in control within 18 frames of a pit death', () => {
    const frames = respawnToControlFrames(parseLevel(LEVEL_1_1_ROWS))
    expect(frames).toBeLessThanOrEqual(18)
  })

  it('reports 1-1 passing both halves', () => {
    expect(checkpointReport(parseLevel(LEVEL_1_1_ROWS)).passes).toBe(true)
  })

  it('has a gap check that actually fires: a 60 s respawn gap is flagged', () => {
    // The known positive. A 290-column walk at WALK_MAX is 61.9 s, past the guide's 45 s gate.
    const report = checkpointReport(flatStrip(290))

    expect(report.gaps).toHaveLength(1)
    expect(report.gaps[0].seconds).toBeGreaterThan(CHECKPOINT_GAP_MAX_S)
    expect(report.passes).toBe(false)
  })
})
