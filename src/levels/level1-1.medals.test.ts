import { describe, expect, it } from 'vitest'
import { medalTimes } from '../game/medals.ts'

describe('medal thresholds', () => {
  it('derives the four thresholds from a casual clear by the recorded formula (golden values)', () => {
    // A synthetic base, not a pinned casual: the real base is the recorded designer run the
    // calibration task supplies. These literals prove the formula and the rounding, not a stored
    // value for 1-1.
    expect(medalTimes(1000)).toEqual({ author: 750, gold: 1000, silver: 1250, bronze: 1500 })
  })

  it('is strictly ordered author < gold < silver < bronze for any realistic base', () => {
    // Realistic clear lengths (a level is hundreds of frames). Tiny bases collapse under rounding.
    for (const base of [200, 540, 1000, 3000]) {
      const m = medalTimes(base)
      expect(m.author).toBeLessThan(m.gold)
      expect(m.gold).toBeLessThan(m.silver)
      expect(m.silver).toBeLessThan(m.bronze)
    }
  })
})
