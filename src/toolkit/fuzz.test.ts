import { describe, expect, it } from 'vitest'
import { createSim, stepSim } from '../game/sim.ts'
import { LEVEL_1_1_ROWS } from '../levels/level1-1.level.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { WELL_FIXTURE, fuzzLevel, randomInput } from './fuzz.ts'

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

  it('resolves an input holding left and right together deterministically', () => {
    // Independent draws can produce `left` and `right` on the same frame. The engine's direction is
    // `right - left`, so the two cancel and Pip does not accelerate sideways — two identical runs
    // must agree, or the fuzz would be exploring a non-deterministic input.
    const input = { ...randomInput(() => 0), left: true, right: true }
    const first = createSim(parseLevel(LEVEL_1_1_ROWS))
    const second = createSim(parseLevel(LEVEL_1_1_ROWS))
    for (let frame = 0; frame < 60; frame++) {
      stepSim(first, input)
      stepSim(second, input)
    }

    expect(first.player.x).toBe(second.player.x)
    expect(first.player.y).toBe(second.player.y)
    expect(first.player.vx).toBe(0)
  })
})
