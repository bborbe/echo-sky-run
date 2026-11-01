/**
 * The level toolkit, applied to level 1-1. Every later level runs the same four checks, so this file
 * is the template as much as it is 1-1's gate:
 *
 *   A. the autopilot clears the *populated* level, with no deaths
 *   B. no launch state crosses an Echo beat without the Echo
 *   E. no jump on the critical path lands outside the view it was made from
 *
 * The browser playthrough is the fourth required check, and it cannot run in vitest — it lives in
 * `scripts/e2e.mjs` and `make test` runs it beside this file.
 */

import { describe, expect, it } from 'vitest'
import { LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_GAP, LEVEL_1_1_ROWS } from './level1-1.ts'
import { runAutopilot, TOOLKIT_VIEWPORT } from '../toolkit/autopilot.ts'
import { blindJumps } from '../toolkit/blind-jump.ts'
import { echoBeats, profileMap, type LevelToolkitProfile } from '../toolkit/level.ts'
import { sweepNoEcho } from '../toolkit/no-echo.ts'
import { logicalViewWidth } from '../render/camera.ts'

const LEVEL: LevelToolkitProfile = {
  id: '1-1',
  rows: LEVEL_1_1_ROWS,
  echoAtX: LEVEL_1_1_ECHO_AT_X,
}

const MAP = profileMap(LEVEL)

/** 960×540 is the smallest viewport an agent drives, so it is the worst case for a blind landing. */
const VIEW_W = logicalViewWidth(TOOLKIT_VIEWPORT.width, TOOLKIT_VIEWPORT.height)

describe('level 1-1 passes the level toolkit', () => {
  it('is cleared by the autopilot on the populated level, with no deaths', () => {
    const run = runAutopilot(LEVEL)

    expect(run.won).toBe(true)
    expect(run.died).toBe(false)
    expect(run.deaths).toBe(0)
    // The crossing the level is built around: exactly one Echo, placed mid-gap.
    expect(run.echoesPlaced).toBe(1)
  })

  it('has exactly one Echo beat, and it is the gap the level was built around', () => {
    const beats = echoBeats(MAP)

    expect(beats).toHaveLength(1)
    expect(beats[0].firstCol).toBe(LEVEL_1_1_GAP.firstCol)
    expect(beats[0].lastCol).toBe(LEVEL_1_1_GAP.lastCol)
  })

  it('cannot be crossed without the Echo, from any launch state', () => {
    const beats = echoBeats(MAP)
    expect(beats.length).toBeGreaterThan(0)

    for (const beat of beats) {
      const sweep = sweepNoEcho(MAP, beat)
      expect(sweep.attempts).toBeGreaterThan(1000)
      expect(sweep.clears).toEqual([])
    }
  })

  it('flags the one blind landing on the critical path: the jump off the Echo', () => {
    const run = runAutopilot(LEVEL)
    expect(run.takeoffs.length).toBeGreaterThan(2)

    const blind = blindJumps(run.takeoffs, VIEW_W)

    // The Echo gap is 208 px wide on a 398 px view, and the jump off the Echo carries Pip past the
    // right edge before he comes down — so his landing is off-screen at take-off. The tutorial sign
    // before the gap is what makes it readable, which is why the rating scores criterion 4 at 3
    // rather than 0. The check has to fire for that to be a judgement rather than an assumption.
    expect(blind).toHaveLength(1)
    expect(blind[0].takeoffX).toBeGreaterThanOrEqual(LEVEL_1_1_ECHO_AT_X)
    expect(blind[0].landingX).toBeGreaterThan(blind[0].viewRight)
  })

  it('measures the view the renderer actually draws at 960x540', () => {
    // The blind-jump check is only as good as this number: a re-derived width would measure a
    // viewport the game does not draw.
    expect(VIEW_W).toBe(398)
  })
})
