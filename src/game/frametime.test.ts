import { describe, expect, it } from 'vitest'
import { LEVEL_1_1_ROWS } from '../levels/level1-1.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { createSim, stepSim, type SimInput } from './sim.ts'

const MAP = parseLevel(LEVEL_1_1_ROWS)

const RUN: SimInput = {
  left: false,
  right: true,
  jump: true,
  jumpPressed: true,
  sprint: true,
  echoPressed: false,
}

const FRAMES = 6000

/**
 * The simulation's share of the frame budget. The design guide's bar is a p99 frame time under
 * 18 ms; this measures the fixed step on its own and leaves generous headroom for the renderer,
 * which the browser check measures for real. A regression here means the physics loop itself got
 * expensive — the kind of thing that hides until the art and parallax arrive.
 */
describe('frame time budget', () => {
  it('keeps the fixed step far inside an 18 ms frame', () => {
    const sim = createSim(MAP)

    const times = new Float64Array(FRAMES)
    for (let i = 0; i < FRAMES; i++) {
      const start = performance.now()
      stepSim(sim, RUN)
      times[i] = performance.now() - start
    }

    const sorted = Array.from(times).sort((a, b) => a - b)
    const p99 = sorted[Math.floor(FRAMES * 0.99)]
    const mean = sorted.reduce((sum, ms) => sum + ms, 0) / FRAMES

    // The step is a few hundred microseconds at worst; 5 ms is a guard against an order-of-magnitude
    // regression, not a tight fit.
    expect(p99, `p99 ${p99.toFixed(3)} ms`).toBeLessThan(5)
    expect(mean, `mean ${mean.toFixed(3)} ms`).toBeLessThan(1)
  })
})
