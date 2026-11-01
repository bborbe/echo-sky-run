import { describe, expect, it } from 'vitest'
import { createEchoField, echoPlatforms, placeEcho, tickEchoes } from '../echo/echo.ts'
import { createEnemy, createEnemyField, stepEnemies } from './enemies.ts'
import { collectMushrooms, createPowerField, spawnMushroom } from './power.ts'
import { moveBox } from '../physics/collision.ts'
import { PLAYER_H, PLAYER_W } from '../physics/constants.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { createSim, stepSim, type SimInput } from './sim.ts'

/**
 * The zero-allocation budget, asserted structurally.
 *
 * A heap or GC-event measurement cannot carry this test: V8 optimises short-lived objects away and
 * scavenges the rest between two `memoryUsage()` samples, so an allocating loop and an allocation-free
 * one both measure ~0 bytes per iteration. (Verified: a control allocating one object per call
 * reported −0.15 bytes/call.) A test built on that number passes whatever the code does.
 *
 * What the refactor actually guarantees is object reuse on the per-frame path, and that is
 * observable and deterministic: every scratch object and every per-frame array keeps its identity
 * across calls. A re-introduced `map`/`filter`/object literal changes an identity, and these
 * assertions fail.
 */

const COLS = 120

/** One row: walls at both ends, `inner` at the left of the open span. */
function row(inner = ''): string {
  return '#' + inner.padEnd(COLS - 2, '.') + '#'
}

/** A flat, empty corridor: no enemies, no ? blocks, no pit, goal tile out of reach in the top row. */
const MAP = parseLevel([
  row('F'),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
  row(),
  row('S'),
  '#'.repeat(COLS),
  '#'.repeat(COLS),
])

const RUN_RIGHT: SimInput = {
  left: false,
  right: true,
  jump: false,
  jumpPressed: false,
  sprint: false,
  echoPressed: false,
}

const OPEN = parseLevel(['....', '....', '....', '....', '####'])

describe('the physics hot path reuses its scratch objects', () => {
  it('moveBox returns one shared result object', () => {
    const a = moveBox({ x: 0, y: 0, w: PLAYER_W, h: PLAYER_H }, 1, 0, OPEN)
    const b = moveBox({ x: 0, y: 0, w: PLAYER_W, h: PLAYER_H }, 0, 1, OPEN)
    expect(a).toBe(b)
  })

  it('echoPlatforms returns the live Echo list rather than a copy', () => {
    const field = createEchoField()
    placeEcho(field, { x: 0, y: 16, w: PLAYER_W, h: PLAYER_H }, OPEN)
    expect(field.echoes).toHaveLength(1)
    expect(echoPlatforms(field)).toBe(field.echoes)
  })

  it('tickEchoes ages the Echo list in place instead of filtering it', () => {
    const field = createEchoField()
    placeEcho(field, { x: 0, y: 16, w: PLAYER_W, h: PLAYER_H }, OPEN)
    const list = field.echoes
    tickEchoes(field)
    expect(field.echoes).toBe(list)
  })

  it('an Echo carries its own collision box, so no platform objects are built', () => {
    const field = createEchoField()
    placeEcho(field, { x: 0, y: 16, w: PLAYER_W, h: PLAYER_H }, OPEN)
    const echo = field.echoes[0]
    expect(echo.w).toBeGreaterThan(0)
    expect(echo.h).toBeGreaterThan(0)
  })

  it('stepEnemies returns one shared events object and array', () => {
    const field = createEnemyField()
    field.enemies.push(createEnemy('gear-goomba', 32, 32))
    const player = { x: 0, y: 0, w: PLAYER_W, h: PLAYER_H }

    const first = stepEnemies(field, player, 0, MAP)
    const stomped = first.stomped
    const second = stepEnemies(field, player, 0, MAP)

    expect(second).toBe(first)
    expect(second.stomped).toBe(stomped)
  })

  it('collectMushrooms compacts in place instead of filtering', () => {
    const field = createPowerField()
    field.mushrooms.push(spawnMushroom(0, 0))
    const list = field.mushrooms
    collectMushrooms(field, { x: 0, y: 0, w: PLAYER_W, h: PLAYER_H })
    expect(field.mushrooms).toBe(list)
  })

  it('a long run keeps every per-frame array and object identity stable', () => {
    const sim = createSim(MAP)
    // One Echo in the air, so its list is live during the run rather than trivially empty.
    stepSim(sim, { ...RUN_RIGHT, jump: true, jumpPressed: true })
    stepSim(sim, { ...RUN_RIGHT, jump: true, echoPressed: true })

    const echoList = sim.field.echoes
    const enemyList = sim.enemies.enemies
    const mushroomList = sim.powers.mushrooms
    const player = sim.player

    for (let i = 0; i < 2000; i++) stepSim(sim, RUN_RIGHT)

    expect(sim.field.echoes).toBe(echoList)
    expect(sim.enemies.enemies).toBe(enemyList)
    expect(sim.powers.mushrooms).toBe(mushroomList)
    expect(sim.player).toBe(player)
  })
})
