import { describe, expect, it } from 'vitest'
import { LEVEL_1_1_ROWS } from '../levels/level1-1.ts'
import { NO_INPUT } from '../physics/player.ts'
import { findTile, GOAL, parseLevel } from '../physics/tilemap.ts'
import { createSim, stepSim, type SimInput } from './sim.ts'

const IDLE: SimInput = { ...NO_INPUT, echoPressed: false }

// Operator playtest of the local build, 2026-11-01: "level finishs ... but i can still move and the
// time did not stop". Touching the goal has to end the run: the tally shows the time it was touched,
// and nothing after that frame changes it.

const map = parseLevel(LEVEL_1_1_ROWS)

/** Put Pip on the goal tile and run one step, so the run is finished. */
function finishedRun() {
  const sim = createSim(map)
  const goal = findTile(map, GOAL)
  if (goal === null) throw new Error('level has no goal')
  sim.player.x = goal.x
  sim.player.y = goal.y
  stepSim(sim, IDLE)
  expect(sim.goalReached).toBe(true)
  return sim
}

const HOLD_RIGHT_AND_JUMP: SimInput = {
  ...IDLE,
  right: true,
  jump: true,
  jumpPressed: true,
  sprint: true,
}

describe('a finished run', () => {
  it('stops the clock and ignores held input', () => {
    const sim = finishedRun()
    const frames = sim.frames
    const x = sim.player.x
    const y = sim.player.y

    for (let i = 0; i < 120; i++) stepSim(sim, HOLD_RIGHT_AND_JUMP)

    expect(sim.frames).toBe(frames)
    expect(sim.player.x).toBe(x)
    expect(sim.player.y).toBe(y)
  })

  it('leaves the velocity alone, so nothing carries him on', () => {
    const sim = finishedRun()
    const vx = sim.player.vx
    const vy = sim.player.vy
    for (let i = 0; i < 120; i++) stepSim(sim, HOLD_RIGHT_AND_JUMP)

    expect(sim.player.vx).toBe(vx)
    expect(sim.player.vy).toBe(vy)
  })
})
