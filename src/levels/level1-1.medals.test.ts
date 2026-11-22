import { describe, expect, it } from 'vitest'
import { medalFor, medalTimes } from '../game/medals.ts'
import { LEVEL_1_1_MEDAL_TIMES } from './level1-1.times.ts'

describe('medal thresholds', () => {
  it('derives the four thresholds from a base by the recorded formula (golden values)', () => {
    // A synthetic base, not the real one: the stored 1-1 thresholds have their own test below.
    // Recompute these literals from the formula whenever MEDAL_FACTOR changes — never copy whatever
    // the code emits.
    //   1000 × 1.889 × {0.6, 0.8, 1.0, 1.2} = {1133.3, 1511.1, 1888.9, 2266.7} → rounded
    expect(medalTimes(1000)).toEqual({ author: 1133, gold: 1511, silver: 1889, bronze: 2267 })
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

  it('stores 1-1 thresholds from the autopilot base and the measured factor', () => {
    // 540 f × 1.889 × {0.6, 0.8, 1.0, 1.2} = {612, 816, 1020, 1224} f (10.2, 13.6, 17.0, 20.4 s).
    expect(LEVEL_1_1_MEDAL_TIMES).toEqual({ author: 612, gold: 816, silver: 1020, bronze: 1224 })
  })

  it('the operator fast-route clear (678 f) earns gold', () => {
    // 0:11.3 at 60 Hz. It beats gold (816 f) and misses author (612 f), so it lands on gold — the
    // sanity check the calibration task's SC4 asks for.
    expect(LEVEL_1_1_MEDAL_TIMES.author).toBeLessThan(678)
    expect(678).toBeLessThanOrEqual(LEVEL_1_1_MEDAL_TIMES.gold)
  })
})

describe('the medal a clear earns', () => {
  const times = { author: 612, gold: 816, silver: 1020, bronze: 1224 }

  it('awards the fastest threshold the clear reaches, with the threshold inclusive', () => {
    expect(medalFor(612, times)).toBe('author')
    expect(medalFor(613, times)).toBe('gold')
    expect(medalFor(816, times)).toBe('gold')
    expect(medalFor(817, times)).toBe('silver')
    expect(medalFor(1020, times)).toBe('silver')
    expect(medalFor(1021, times)).toBe('bronze')
    expect(medalFor(1224, times)).toBe('bronze')
  })

  it('awards nothing past bronze', () => {
    expect(medalFor(1225, times)).toBeNull()
    expect(medalFor(3000, times)).toBeNull()
  })

  it('maps the stored 1-1 thresholds onto the medals they name', () => {
    expect(medalFor(LEVEL_1_1_MEDAL_TIMES.author, LEVEL_1_1_MEDAL_TIMES)).toBe('author')
    expect(medalFor(LEVEL_1_1_MEDAL_TIMES.gold, LEVEL_1_1_MEDAL_TIMES)).toBe('gold')
    expect(medalFor(LEVEL_1_1_MEDAL_TIMES.silver, LEVEL_1_1_MEDAL_TIMES)).toBe('silver')
    expect(medalFor(LEVEL_1_1_MEDAL_TIMES.bronze, LEVEL_1_1_MEDAL_TIMES)).toBe('bronze')
  })
})
