import { describe, expect, it } from 'vitest'
import { TILE } from '../physics/constants.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { echoBeats, findPits, maxJumpReach, requireEchoAnswer } from './level.ts'

/**
 * A 40-column strip with one gap starting at column 10. The spawn sits on the floor two columns in,
 * so `findPits` has the row to search from.
 */
function stripWithGap(gapCols: number): string[] {
  const cols = 40
  const floor = Array.from({ length: cols }, (_, c) => (c < 10 || c >= 10 + gapCols ? '#' : '.')).join('')
  const top = Array.from({ length: cols }, (_, c) => (c === 2 ? 'S' : '.')).join('')
  return [top, floor]
}

describe('the level grammar', () => {
  it('measures a sprint jump from the real step, not from a copied constant', () => {
    const reach = maxJumpReach()
    // A sprint jump clears roughly ten tiles. The exact number is the engine's; the bounds only have
    // to be tight enough to catch a measurement that silently returned zero or ran away.
    expect(reach).toBeGreaterThan(TILE * 8)
    expect(reach).toBeLessThan(TILE * 12)
  })

  it('finds the pit in a level, in tiles', () => {
    const pits = findPits(parseLevel(stripWithGap(3)))
    expect(pits).toHaveLength(1)
    expect(pits[0]).toEqual({ firstCol: 10, lastCol: 12, widthPx: 3 * TILE })
  })

  it('counts a pit as an Echo beat only when it is wider than a sprint jump', () => {
    const narrow = parseLevel(stripWithGap(3))
    const wide = parseLevel(stripWithGap(14))

    expect(echoBeats(narrow)).toEqual([])
    expect(echoBeats(wide)).toHaveLength(1)
  })

  it('refuses a level that has an Echo beat but no declared Echo spot', () => {
    expect(() =>
      requireEchoAnswer({ id: 'synthetic', rows: stripWithGap(14), echoAtX: null }),
    ).toThrow(/has an Echo beat but declares no echoAtX/)
    expect(() =>
      requireEchoAnswer({ id: 'synthetic', rows: stripWithGap(14), echoAtX: 200 }),
    ).not.toThrow()
  })
})
