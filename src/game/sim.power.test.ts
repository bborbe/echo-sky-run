import { describe, expect, it } from 'vitest'
import { SMALL_H, SUPER_H } from '../physics/constants.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { INVULN_F } from './power.ts'
import { createSim, stepSim, type SimInput } from './sim.ts'

const IDLE: SimInput = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  sprint: false,
  echoPressed: false,
}

/**
 * Pip spawns directly under a ? block, with open floor either side. The mushroom that drops out
 * walks right, so a player who then walks right meets it.
 */
const BLOCK_MAP = parseLevel([
  '..........',
  '..?.......',
  '..........',
  '..S......F',
  '##########',
])

describe('? block', () => {
  it('releases a Mushroom when the head hits it from below', () => {
    const sim = createSim(BLOCK_MAP)
    expect(sim.powers.mushrooms).toHaveLength(0)

    for (let i = 0; i < 90 && sim.powers.mushrooms.length === 0; i++) {
      stepSim(sim, { ...IDLE, jump: true, jumpPressed: i === 0 })
    }

    expect(sim.powers.mushrooms).toHaveLength(1)
    expect(sim.usedBlocks.size).toBe(1)
  })

  it('empties only once', () => {
    const sim = createSim(BLOCK_MAP)
    for (let i = 0; i < 90 && sim.powers.mushrooms.length === 0; i++) {
      stepSim(sim, { ...IDLE, jump: true, jumpPressed: i === 0 })
    }
    const afterFirst = sim.powers.mushrooms.length

    // Keep jumping into the same block; it must not produce a second mushroom.
    for (let i = 0; i < 180; i++) {
      stepSim(sim, { ...IDLE, jump: true, jumpPressed: i % 20 === 0 })
    }

    expect(afterFirst).toBe(1)
    expect(sim.usedBlocks.size).toBe(1)
  })
})

describe('tier transitions', () => {
  it('collecting the Mushroom makes Pip Super, growing upward from his feet', () => {
    const sim = createSim(BLOCK_MAP)
    expect(sim.power).toBe('small')
    expect(sim.player.h).toBe(SMALL_H)

    for (let i = 0; i < 90 && sim.powers.mushrooms.length === 0; i++) {
      stepSim(sim, { ...IDLE, jump: true, jumpPressed: i === 0 })
    }
    const feetBefore = sim.player.y + sim.player.h

    for (let i = 0; i < 400 && sim.power === 'small'; i++) {
      stepSim(sim, { ...IDLE, right: true })
    }

    expect(sim.power).toBe('super')
    expect(sim.player.h).toBe(SUPER_H)
    // Growing must not drop him through the floor: his feet stay on the same surface.
    expect(sim.player.y + sim.player.h).toBeGreaterThanOrEqual(feetBefore - 1)
  })

  it('a hit while Super drops Pip to Small and starts the invincibility window', () => {
    const sim = createSim(BLOCK_MAP)
    // Take the mushroom first, so he is Super when the hit lands.
    for (let i = 0; i < 90 && sim.powers.mushrooms.length === 0; i++) {
      stepSim(sim, { ...IDLE, jump: true, jumpPressed: i === 0 })
    }
    for (let i = 0; i < 400 && sim.power === 'small'; i++) {
      stepSim(sim, { ...IDLE, right: true })
    }
    expect(sim.power).toBe('super')

    // Drop an enemy right on top of him and let it touch his side.
    sim.enemies.enemies.push({
      kind: 'gear-goomba',
      x: sim.player.x,
      y: sim.player.y + sim.player.h - 16,
      vx: 0,
      vy: 0,
      w: 16,
      h: 16,
      mode: 'walk',
      dead: false,
    })

    stepSim(sim, IDLE)

    expect(sim.power).toBe('small')
    expect(sim.player.h).toBe(SMALL_H)
    expect(sim.deaths).toBe(0)
    expect(sim.invuln).toBeGreaterThan(0)
    expect(sim.invuln).toBeLessThanOrEqual(INVULN_F)
  })

  it('a hit while Small is death and respawns Pip at the level start', () => {
    const sim = createSim(BLOCK_MAP)
    expect(sim.power).toBe('small')
    const startX = sim.player.x
    const startY = sim.player.y

    sim.enemies.enemies.push({
      kind: 'gear-goomba',
      x: sim.player.x,
      y: sim.player.y + sim.player.h - 16,
      vx: 0,
      vy: 0,
      w: 16,
      h: 16,
      mode: 'walk',
      dead: false,
    })

    stepSim(sim, IDLE)

    expect(sim.deaths).toBe(1)
    expect(sim.player.x).toBe(startX)
    expect(sim.player.y).toBe(startY)
    expect(sim.power).toBe('small')
  })
})
