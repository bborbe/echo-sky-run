import { describe, expect, it } from 'vitest'
import { NO_INPUT } from '../physics/player.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { GEAR_GOOMBA_H, GEAR_GOOMBA_W, STOMP_BOUNCE, type Enemy } from './enemies.ts'
import { comboValue, createSim, stepSim, type SimInput } from './sim.ts'

// The stomp bounce and the combo score are the spec's § 5 numbers: a stomp gives Pip −4.5 px/f, and
// a chain without landing is worth 100, 200, 400, 800, 1000…

const IDLE: SimInput = { ...NO_INPUT, echoPressed: false }

/** A wide, tall, empty room: room to bounce without reaching the floor. */
const MAP = parseLevel([
  'S....................F',
  '......................',
  '......................',
  '......................',
  '......................',
  '######################',
])

function goombaAt(x: number, y: number): Enemy {
  return {
    kind: 'gear-goomba',
    x,
    y,
    vx: 0,
    vy: 0,
    w: GEAR_GOOMBA_W,
    h: GEAR_GOOMBA_H,
    mode: 'walk',
    dead: false,
  }
}

/** Drop a goomba right under Pip's feet, so the next step lands on it. */
function stompNextFrame(sim: ReturnType<typeof createSim>): void {
  sim.enemies.enemies.push(goombaAt(sim.player.x, sim.player.y + sim.player.h))
}

describe('the stomp bounce', () => {
  it('sets the vertical velocity to -4.5 px/f', () => {
    const sim = createSim(MAP)
    sim.player.x = 32
    sim.player.y = 8
    sim.player.vy = 1
    stompNextFrame(sim)

    stepSim(sim, IDLE)

    // Pinned as literals, not read back through the constant: a test that compares the bounce to
    // STOMP_BOUNCE would pass whatever that constant was tuned to.
    expect(STOMP_BOUNCE).toBe(4.5)
    expect(sim.player.vy).toBe(-4.5)
    expect(sim.player.grounded).toBe(false)
    expect(sim.score).toBe(100)
    expect(sim.combo).toBe(1)
  })
})

describe('the combo score', () => {
  it('is worth 100, 200, 400, 800, 1000 across a chain without landing', () => {
    const sim = createSim(MAP)
    sim.player.x = 32
    sim.player.y = 8
    sim.player.vy = 1

    const scored: number[] = []
    let last = sim.score
    for (let i = 0; i < 900 && scored.length < 5; i++) {
      // A chain is consecutive stomps with no landing: the moment he is falling again, put the next
      // walker under him, so the floor is never reached and the chain is never broken.
      if (sim.player.vy > 0 && sim.enemies.enemies.length === 0) stompNextFrame(sim)
      stepSim(sim, IDLE)
      if (sim.score !== last) {
        scored.push(sim.score - last)
        last = sim.score
      }
    }

    expect(scored).toEqual([100, 200, 400, 800, 1000])
    expect(sim.combo).toBe(5)
    expect(sim.deaths).toBe(0)
  })

  it('resets when Pip lands', () => {
    const sim = createSim(MAP)
    sim.player.x = 32
    sim.player.y = 8
    sim.player.vy = 1
    stompNextFrame(sim)
    stepSim(sim, IDLE)
    expect(sim.combo).toBe(1)

    // Let him fall all the way to the floor.
    for (let i = 0; i < 300 && !sim.player.grounded; i++) stepSim(sim, IDLE)

    expect(sim.player.grounded).toBe(true)
    expect(sim.combo).toBe(0)
  })

  it('caps at 1000 and scores nothing for an empty chain', () => {
    expect(comboValue(0)).toBe(0)
    expect(comboValue(1)).toBe(100)
    expect(comboValue(5)).toBe(1000)
    expect(comboValue(6)).toBe(1000)
    expect(comboValue(20)).toBe(1000)
  })
})
