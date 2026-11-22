import { describe, expect, it } from 'vitest'
import { ECHO_H, ECHO_LIFE_F, ECHO_W } from '../echo/echo.ts'
import { PLAYER_W, TILE } from '../physics/constants.ts'
import { parseLevel } from '../physics/tilemap.ts'
import {
  CHASER_BOT_H,
  GUST_WING_AMPLITUDE,
  GUST_WING_H,
  GUST_WING_PERIOD_F,
  SPIKE_BEETLE_H,
  stepEnemies,
  WINDUP_F,
} from './enemies.ts'
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

describe('enemy tiles in a real level', () => {
  // The three new kinds, written in the row whose bottom is the floor (row 2's top = 32 px):
  //   spike-beetle b @ col 4 · gust-wing w @ col 10 · chaser-bot r @ col 16
  const ENEMY_LEVEL = parseLevel([
    '......................',
    'S...b.....w.....r....F',
    '######################',
  ])
  const ENEMY_FLOOR_TOP = 2 * TILE
  /** A player box parked far from every enemy, for the behaviour tests that do not involve him. */
  const AWAY = { x: 1000, y: 0, w: 12, h: 14 }

  const find = (sim: ReturnType<typeof createSim>, kind: string) =>
    sim.enemies.enemies.find((e) => e.kind === kind)!

  it('builds one of each new kind from the loaded level, feet-anchored', () => {
    const sim = createSim(ENEMY_LEVEL)

    expect(find(sim, 'spike-beetle')).toMatchObject({ x: 4 * TILE, y: ENEMY_FLOOR_TOP - SPIKE_BEETLE_H })
    expect(find(sim, 'gust-wing')).toMatchObject({ x: 10 * TILE, y: ENEMY_FLOOR_TOP - GUST_WING_H })
    expect(find(sim, 'chaser-bot')).toMatchObject({ x: 16 * TILE, y: ENEMY_FLOOR_TOP - CHASER_BOT_H })
  })

  it('holds none of them on a level that has none', () => {
    const bare = createSim(parseLevel(['S....................F', '######################']))

    expect(bare.enemies.enemies).toHaveLength(0)
  })

  it('flies the loaded Gust-Wing on its sine path and returns to baseY', () => {
    const sim = createSim(ENEMY_LEVEL)
    const wing = find(sim, 'gust-wing')
    const baseY = wing.baseY
    let min = Infinity
    let max = -Infinity

    for (let i = 0; i < GUST_WING_PERIOD_F; i++) {
      stepEnemies(sim.enemies, AWAY, 0, sim.map)
      min = Math.min(min, wing.y)
      max = Math.max(max, wing.y)
    }

    expect(baseY - min).toBeLessThanOrEqual(GUST_WING_AMPLITUDE + 1e-6)
    expect(max - baseY).toBeLessThanOrEqual(GUST_WING_AMPLITUDE + 1e-6)
    expect(wing.y).toBeCloseTo(baseY, 6)
  })

  it('drives the loaded Chaser-Bot toward Pip', () => {
    const sim = createSim(ENEMY_LEVEL)
    const bot = find(sim, 'chaser-bot')
    const before = bot.x

    // Pip stands just to the bot's right, inside its 96 px lock range.
    stepEnemies(sim.enemies, { x: bot.x + 40, y: bot.y, w: 12, h: 14 }, 0, sim.map)

    expect(bot.x).toBeGreaterThan(before)
  })

  it('keeps the loaded Spike-Beetle spiked on top and slow to hurt on the side', () => {
    // A landing on its top hurts at once — the spikes are the telegraph, so no wind-up.
    const landingSim = createSim(ENEMY_LEVEL)
    const beetle = find(landingSim, 'spike-beetle')
    const landing = { x: beetle.x, y: beetle.y - 14, w: 12, h: 14 }
    expect(stepEnemies(landingSim.enemies, landing, 1, landingSim.map).hit).toBe(true)

    // A side contact waits out the full WINDUP_F. A fresh level, since the first step moved the beetle.
    const sideSim = createSim(ENEMY_LEVEL)
    const beetle2 = find(sideSim, 'spike-beetle')
    const side = () => ({ x: beetle2.x + 8, y: beetle2.y, w: 12, h: 14 })
    for (let i = 0; i < WINDUP_F - 1; i++) {
      expect(stepEnemies(sideSim.enemies, side(), 0, sideSim.map).hit).toBe(false)
    }
    expect(stepEnemies(sideSim.enemies, side(), 0, sideSim.map).hit).toBe(true)
  })
})
