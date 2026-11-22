import { describe, expect, it } from 'vitest'
import { ECHO_H, ECHO_LIFE_F, ECHO_W } from '../echo/echo.ts'
import { PLAYER_W } from '../physics/constants.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { createSim, stepSim, type SimInput } from './sim.ts'

/**
 * Four rows of sky and one of floor. Every entity is written in the row whose bottom is the floor
 * top, so each spawn is anchored by its feet exactly the way a level author writes it.
 *
 * S spawn (0) · n Nimbus (2) · s switch (5) · D door (10) · F goal (18)
 */
const LEVEL = parseLevel([
  '....................',
  '....................',
  '....................',
  'S.n..s....D.......F.',
  '####################',
])

const FLOOR_TOP = 64

const IDLE: SimInput = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  sprint: false,
  echoPressed: false,
}

/** Put Pip on the floor at `x`, as a walk would have left him. */
function standAt(sim: ReturnType<typeof createSim>, x: number): void {
  sim.player.x = x
  sim.player.y = FLOOR_TOP - sim.player.h
  sim.player.vx = 0
  sim.player.vy = 0
}

describe('level wiring', () => {
  it('builds nimbus, switches and doors from the parsed level', () => {
    const sim = createSim(LEVEL)

    expect(sim.nimbus.nimbus).not.toBeNull()
    expect(sim.nimbus.nimbus?.x).toBe(32)

    expect(sim.switches.switches).toHaveLength(1)
    expect(sim.switches.switches[0]).toMatchObject({ x: 80, y: 48 })

    // A three-tile door anchored by its feet: the cell's bottom is the floor top.
    expect(sim.switches.doors).toHaveLength(1)
    expect(sim.switches.doors[0]).toMatchObject({ x: 160, y: 16, w: 16, h: 48 })
  })

  it('leaves all three empty on a level that has none', () => {
    const bare = createSim(parseLevel(['S........F', '##########']))

    expect(bare.nimbus.nimbus).toBeNull()
    expect(bare.switches.switches).toHaveLength(0)
    expect(bare.switches.doors).toHaveLength(0)
  })
})

describe('Echo switch and door in a real level', () => {
  it('a closed door refuses passage', () => {
    const sim = createSim(LEVEL)
    const door = sim.switches.doors[0]

    // Standing between the switch and the door with nothing pressing: the door is shut.
    standAt(sim, 120)
    for (let i = 0; i < 40; i++) stepSim(sim, { ...IDLE, right: true })

    expect(sim.switches.doors[0].open).toBe(false)
    expect(sim.player.x + PLAYER_W).toBeLessThanOrEqual(door.x + 1e-6)
  })

  it('an Echo on the switch holds the door open and lets Pip through', () => {
    const sim = createSim(LEVEL)
    const door = sim.switches.doors[0]

    // The Echo rests on the switch, so the press outlives Pip walking away from it.
    sim.field.echoes.push({ x: 80, y: FLOOR_TOP - ECHO_H, w: ECHO_W, h: ECHO_H, life: ECHO_LIFE_F })

    standAt(sim, 120)
    for (let i = 0; i < 40; i++) stepSim(sim, { ...IDLE, right: true })

    expect(sim.switches.doors[0].open).toBe(true)
    expect(sim.player.x).toBeGreaterThan(door.x + door.w)
  })

  it('the door closes again once the Echo is gone', () => {
    const sim = createSim(LEVEL)
    const door = sim.switches.doors[0]

    // Two frames of Echo life: it presses this step, and is gone from the next.
    sim.field.echoes.push({ x: 80, y: FLOOR_TOP - ECHO_H, w: ECHO_W, h: ECHO_H, life: 2 })

    stepSim(sim, IDLE)
    expect(sim.switches.doors[0].open).toBe(true)

    stepSim(sim, IDLE)
    expect(sim.field.echoes).toHaveLength(0)
    expect(sim.switches.doors[0].open).toBe(false)
    expect(door.open).toBe(false)
  })
})
