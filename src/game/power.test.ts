import { describe, expect, it } from 'vitest'
import { SMALL_H, SUPER_H } from '../physics/constants.ts'
import { parseLevel } from '../physics/tilemap.ts'
import {
  applyHit,
  collectMushrooms,
  createPowerField,
  heightOf,
  MUSHROOM_SPEED,
  spawnMushroom,
  stepMushrooms,
  yAfterResize,
} from './power.ts'

const FLOOR = parseLevel(['..........', '..........', '##########'])

describe('tiers', () => {
  it('Small is 12x14 and Super is 12x26', () => {
    expect(heightOf('small')).toBe(SMALL_H)
    expect(heightOf('super')).toBe(SUPER_H)
    expect(SMALL_H).toBe(14)
    expect(SUPER_H).toBe(26)
  })

  it('a hit while Super drops to Small and survives', () => {
    expect(applyHit('super')).toEqual({ tier: 'small', died: false })
  })

  it('a hit while Small is death', () => {
    expect(applyHit('small')).toEqual({ tier: 'small', died: true })
  })
})

describe('resize', () => {
  it('keeps the feet planted when Pip grows', () => {
    // Standing on the floor at y=32 with the small box: feet at 32 + 14 = 46.
    const y = 32
    const grown = yAfterResize(y, SMALL_H, SUPER_H)
    expect(grown + SUPER_H).toBe(y + SMALL_H)
  })

  it('keeps the feet planted when Pip shrinks', () => {
    const y = 20
    const shrunk = yAfterResize(y, SUPER_H, SMALL_H)
    expect(shrunk + SMALL_H).toBe(y + SUPER_H)
  })
})

describe('mushroom', () => {
  it('walks at 1 px/f', () => {
    const field = createPowerField()
    const m = spawnMushroom(32, 0)
    field.mushrooms.push(m)
    expect(m.vx).toBe(MUSHROOM_SPEED)

    const before = m.x
    stepMushrooms(field, FLOOR)
    expect(m.x - before).toBeCloseTo(MUSHROOM_SPEED, 6)
  })

  it('turns around at a wall', () => {
    const WALLED = parseLevel(['#........#', '#........#', '##########'])
    const field = createPowerField()
    const m = spawnMushroom(16, 0, -1)
    field.mushrooms.push(m)

    for (let i = 0; i < 40; i++) stepMushrooms(field, WALLED)

    expect(m.vx).toBeGreaterThan(0)
  })

  it('falls onto the floor and stays there', () => {
    const field = createPowerField()
    const m = spawnMushroom(32, 0)
    field.mushrooms.push(m)

    for (let i = 0; i < 60; i++) stepMushrooms(field, FLOOR)

    // The floor's top is y=32, so a 16-tall mushroom rests with its top at 16.
    expect(m.y).toBe(16)
  })
})

describe('collect', () => {
  it('removes a mushroom Pip is standing in and counts it', () => {
    const field = createPowerField()
    field.mushrooms.push(spawnMushroom(32, 16))

    const collected = collectMushrooms(field, { x: 32, y: 16, w: 12, h: 14 })

    expect(collected).toBe(1)
    expect(field.mushrooms).toHaveLength(0)
  })

  it('leaves a mushroom across the level alone', () => {
    const field = createPowerField()
    field.mushrooms.push(spawnMushroom(32, 16))

    expect(collectMushrooms(field, { x: 200, y: 16, w: 12, h: 14 })).toBe(0)
    expect(field.mushrooms).toHaveLength(1)
  })
})
