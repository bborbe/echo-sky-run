import { describe, expect, it } from 'vitest'
import { LEVEL_1_1_ROWS } from '../levels/level1-1.level.ts'
import { WELL_FIXTURE, fuzzLevel } from './fuzz.ts'

describe('the fuzz check', () => {
  it('finds no soft-lock, no overlap with a solid, and no crash on 1-1', () => {
    const findings = fuzzLevel(LEVEL_1_1_ROWS)
    expect(findings, JSON.stringify(findings)).toEqual([])
  })

  it('has a fuzz check that actually fires: a capped well is reported as a freeze', () => {
    // The known positive. Without it, a clean run on a real level could come from a detector that
    // never fires.
    const findings = fuzzLevel(WELL_FIXTURE, { runs: 1, frames: 800 })
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].kind).toBe('frozen')
  })
})
