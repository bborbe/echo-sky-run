import { describe, expect, it } from 'vitest'
import { PLAYER_W } from '../physics/constants.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { findPits, maxJumpReach } from './level.ts'
import { sweepNoEcho } from './no-echo.ts'

/** A 40-column strip with one gap starting at column 10. */
function stripWithGap(gapCols: number): string[] {
  const cols = 40
  const floor = Array.from({ length: cols }, (_, c) => (c < 10 || c >= 10 + gapCols ? '#' : '.')).join('')
  const top = Array.from({ length: cols }, (_, c) => (c === 2 ? 'S' : '.')).join('')
  return [top, floor]
}

const pitOf = (gapCols: number) => {
  const pits = findPits(parseLevel(stripWithGap(gapCols)))
  expect(pits).toHaveLength(1)
  return pits[0]
}

describe('the no-Echo bypass sweep', () => {
  it('finds the crossing on a gap a sprint jump clears, so a clean sweep means something', () => {
    // The known positive: without it, "zero clears" on the real level could come from a sweep that
    // can never fire, which is the failure mode the whole check exists to avoid.
    const sweep = sweepNoEcho(parseLevel(stripWithGap(3)), pitOf(3))

    expect(sweep.attempts).toBeGreaterThan(100)
    expect(sweep.clears.length).toBeGreaterThan(0)
  })

  it('finds no crossing on a gap wider than a sprint jump', () => {
    const sweep = sweepNoEcho(parseLevel(stripWithGap(14)), pitOf(14))

    expect(sweep.attempts).toBeGreaterThan(100)
    expect(sweep.clears).toEqual([])
  })

  it('searches back exactly as far as a sprint jump carries', () => {
    const sweep = sweepNoEcho(parseLevel(stripWithGap(14)), pitOf(14))
    expect(sweep.reachPx).toBe(maxJumpReach())
  })

  it('covers both power tiers, every speed and a bounce from each height', () => {
    const sweep = sweepNoEcho(parseLevel(stripWithGap(14)), pitOf(14), 32)
    // A 32 px search window back from the lip, less the player's width, inclusive at both ends.
    const columns = 32 - PLAYER_W + 1
    // Per tier: three ground launches at each of four speeds, plus three bounce heights on each of
    // the three moving speeds.
    const perColumn = 2 * (4 * 3 + 3 * 3)
    expect(sweep.attempts).toBe(columns * perColumn)
  })
})
