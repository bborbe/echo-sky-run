import { describe, expect, it } from 'vitest'
import { createSim, stepSim } from '../game/sim.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { LEVEL_1_1_ROWS } from './level1-1.ts'
import { LEVEL_1_1_REPLAY } from './level1-1.replay.ts'
import { decodeInputs } from './replay-format.ts'

/** The same enemy-free map the recorder and the level's own tests use. */
const MAP = parseLevel(LEVEL_1_1_ROWS.map((row) => row.replace(/[gt?]/g, '.')))

/**
 * The golden replay. A recorded 1-1 run, frozen as data, must replay to the same frame-exact finish.
 * Any change to gravity, jump height, friction, collision, the Echo or the level geometry moves a
 * frame count or a coordinate here — which is exactly the regression this catches. When a physics
 * change is intended, re-record (see `level1-1.record.test.ts`) and review the fixture diff.
 */
describe('golden replay of level 1-1', () => {
  it('replays the recorded run to the same frame-exact finish', () => {
    const inputs = decodeInputs(LEVEL_1_1_REPLAY.inputs)
    expect(inputs, 'the encoded run must expand to the recorded frame count').toHaveLength(
      LEVEL_1_1_REPLAY.frames,
    )

    const sim = createSim(MAP)
    for (const input of inputs) stepSim(sim, input)

    expect(sim.goalReached).toBe(true)
    expect(sim.frames).toBe(LEVEL_1_1_REPLAY.frames)
    expect(sim.deaths).toBe(LEVEL_1_1_REPLAY.finish.deaths)
    expect(sim.score).toBe(LEVEL_1_1_REPLAY.finish.score)
    // Frame-exact, not approximately: a tolerance here would hide the drift the fixture exists for.
    expect(sim.player.x).toBe(LEVEL_1_1_REPLAY.finish.x)
    expect(sim.player.y).toBe(LEVEL_1_1_REPLAY.finish.y)
    expect(sim.player.vx).toBe(LEVEL_1_1_REPLAY.finish.vx)
    expect(sim.player.vy).toBe(LEVEL_1_1_REPLAY.finish.vy)
  })

  it('is reproducible: a second replay lands on the same frame', () => {
    const inputs = decodeInputs(LEVEL_1_1_REPLAY.inputs)
    const first = createSim(MAP)
    for (const input of inputs) stepSim(first, input)
    const second = createSim(MAP)
    for (const input of inputs) stepSim(second, input)

    expect(second.frames).toBe(first.frames)
    expect(second.player.x).toBe(first.player.x)
    expect(second.player.y).toBe(first.player.y)
  })
})
