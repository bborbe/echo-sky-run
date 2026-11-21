import { describe, expect, it } from 'vitest'
import { PLAYER_H, PLAYER_W } from '../physics/constants.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { createEnemy, createEnemyField } from './enemies.ts'
import {
  canMount,
  createNimbus,
  createNimbusField,
  dismountNimbus,
  glideFall,
  mountNimbus,
  NIMBUS_FLEE_F,
  NIMBUS_GLIDE_FALL,
  NIMBUS_PECK_PX,
  peckBox,
  startPeck,
  stepNimbus,
  stepPeck,
  throwOff,
} from './nimbus.ts'
import { createSim, stepSim, type SimInput } from './sim.ts'

const FLOOR_Y = 32

function playerAt(x: number, feet = FLOOR_Y) {
  return { x, y: feet - PLAYER_H, w: PLAYER_W, h: PLAYER_H }
}

const STILL: SimInput = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  sprint: false,
  echoPressed: false,
}

describe('Nimbus mount and dismount', () => {
  it('mounts when a falling Pip lands in its top band', () => {
    const field = createNimbusField()
    field.nimbus = createNimbus(32, FLOOR_Y - 16)
    const landing = playerAt(32, FLOOR_Y - 16 + 4) // feet 4 px into the top band

    expect(canMount(field, landing, 1)).toBe(true)
    expect(mountNimbus(field, landing, 1)).toBe(true)
    expect(field.mounted).toBe(true)
  })

  it('does not mount on a rising move', () => {
    const field = createNimbusField()
    field.nimbus = createNimbus(32, FLOOR_Y - 16)
    const landing = playerAt(32, FLOOR_Y - 16 + 4)
    expect(canMount(field, landing, -1)).toBe(false)
  })

  it('dismounts', () => {
    const field = createNimbusField()
    field.nimbus = createNimbus(32, FLOOR_Y - 16)
    mountNimbus(field, playerAt(32, FLOOR_Y - 16 + 4), 1)

    expect(dismountNimbus(field)).toBe(true)
    expect(field.mounted).toBe(false)
  })
})

describe('Nimbus glide', () => {
  it('caps the fall at 1 px/f while mounted and holding jump', () => {
    const field = createNimbusField()
    field.nimbus = createNimbus(0, 0)
    field.mounted = true

    expect(glideFall(field, true, 4)).toBe(NIMBUS_GLIDE_FALL)
    expect(glideFall(field, false, 4)).toBe(4)
  })

  it('leaves the fall alone when not mounted', () => {
    const field = createNimbusField()
    expect(glideFall(field, true, 4)).toBe(4)
  })

  it('holds the fall to 1 px/f through the simulation while jump is held', () => {
    // A tall, floorless shaft with the goal far to the right, so the glide is the only thing acting.
    const MAP = parseLevel(['S........F', '..........', '..........', '..........', '..........'])
    const sim = createSim(MAP)
    sim.nimbus.nimbus = createNimbus(sim.player.x, sim.player.y)
    sim.nimbus.mounted = true
    sim.player.vy = 3
    sim.player.grounded = false

    for (let i = 0; i < 12; i++) {
      stepSim(sim, { ...STILL, jump: true })
      expect(sim.player.vy).toBeLessThanOrEqual(NIMBUS_GLIDE_FALL)
    }
  })
})

describe('Nimbus peck', () => {
  it('reaches exactly 24 px in front of Pip', () => {
    const p = playerAt(32)
    expect(peckBox(p, 1).w).toBe(NIMBUS_PECK_PX)
    expect(peckBox(p, 1).x).toBe(p.x + p.w)
    expect(peckBox(p, -1).x).toBe(p.x - NIMBUS_PECK_PX)
  })

  it('defeats a Gear-Goomba and a Gust-Wing in reach', () => {
    const field = createNimbusField()
    field.nimbus = createNimbus(0, 0)
    field.mounted = true
    startPeck(field)

    const enemies = createEnemyField()
    const goomba = createEnemy('gear-goomba', 32 + PLAYER_W + 2, FLOOR_Y - 16)
    const wing = createEnemy('gust-wing', 32 + PLAYER_W + 2, FLOOR_Y - 16)
    enemies.enemies.push(goomba, wing)

    expect(stepPeck(field, playerAt(32), 1, enemies)).toBe(true)
    expect(goomba.dead).toBe(true)
    expect(wing.dead).toBe(true)
  })

  it('leaves a Chaser-Bot alive', () => {
    const field = createNimbusField()
    field.nimbus = createNimbus(0, 0)
    field.mounted = true
    startPeck(field)

    const enemies = createEnemyField()
    const bot = createEnemy('chaser-bot', 32 + PLAYER_W + 2, FLOOR_Y - 16)
    enemies.enemies.push(bot)

    expect(stepPeck(field, playerAt(32), 1, enemies)).toBe(false)
    expect(bot.dead).toBe(false)
  })
})

describe('Nimbus throw-off', () => {
  it('throws Pip off and sends Nimbus fleeing for 3 s', () => {
    const field = createNimbusField()
    field.nimbus = createNimbus(0, 0)
    field.mounted = true

    throwOff(field)

    expect(field.mounted).toBe(false)
    expect(field.nimbus.flee).toBe(NIMBUS_FLEE_F)
  })

  it('runs the flee timer down', () => {
    const field = createNimbusField()
    field.nimbus = createNimbus(0, 0)
    field.nimbus.flee = 2

    stepNimbus(field)
    expect(field.nimbus.flee).toBe(1)
    stepNimbus(field)
    expect(field.nimbus.flee).toBe(0)
  })

  it('costs Pip no damage when a hit lands while mounted', () => {
    const MAP = parseLevel(['S........F', '..........', '##########'])
    const sim = createSim(MAP)
    sim.nimbus.nimbus = createNimbus(sim.player.x, sim.player.y)
    sim.nimbus.mounted = true
    sim.enemies.enemies.push(createEnemy('gear-goomba', sim.player.x, sim.player.y))
    const deathsBefore = sim.deaths

    stepSim(sim, STILL)

    expect(sim.deaths).toBe(deathsBefore)
    expect(sim.nimbus.mounted).toBe(false)
    expect(sim.nimbus.nimbus.flee).toBeGreaterThan(0)
  })
})
