import { describe, expect, it } from 'vitest'
import { isGrounded, moveBox, overlapsSolid } from './collision.ts'
import { MAX_FALL, PLAYER_H, PLAYER_W, TILE } from './constants.ts'
import { createPlayer, NO_INPUT, stepPlayer } from './player.ts'
import { parseLevel } from './tilemap.ts'

const FLOOR_AT_ROW_4 = parseLevel([
  '................',
  '................',
  '................',
  '................',
  '################',
])

const ONE_WAY_AT_ROW_2 = parseLevel([
  '................',
  '................',
  '..==............',
  '................',
  '################',
])

const WALL_AT_COL_4 = parseLevel([
  '................',
  '................',
  '................',
  '....#...........',
  '################',
])

const CEILING_AT_ROW_1 = parseLevel([
  '................',
  '....####........',
  '................',
  '................',
  '################',
])

describe('floor', () => {
  it('stops a falling box and reports the bottom hit', () => {
    const r = moveBox({ x: 32, y: 0, w: PLAYER_W, h: PLAYER_H }, 0, 100, FLOOR_AT_ROW_4)
    expect(r.hitBottom).toBe(true)
    expect(r.y + PLAYER_H).toBe(4 * TILE)
  })

  it('zeroes the player vertical velocity on landing', () => {
    const s = createPlayer(32, 32)
    for (let i = 0; i < 60; i++) stepPlayer(s, NO_INPUT, FLOOR_AT_ROW_4)
    expect(s.grounded).toBe(true)
    expect(s.vy).toBe(0)
    expect(s.y + PLAYER_H).toBe(4 * TILE)
  })
})

describe('wall', () => {
  it('stops a box moving sideways and reports the hit', () => {
    const r = moveBox({ x: 0, y: 48, w: PLAYER_W, h: PLAYER_H }, 200, 0, WALL_AT_COL_4)
    expect(r.hitRight).toBe(true)
    expect(r.x + PLAYER_W).toBe(4 * TILE)
  })

  it('zeroes the player horizontal velocity against a wall', () => {
    const s = createPlayer(32, 48)
    const right = { ...NO_INPUT, right: true }
    for (let i = 0; i < 120; i++) stepPlayer(s, right, WALL_AT_COL_4)
    expect(s.vx).toBe(0)
    expect(s.x + PLAYER_W).toBe(4 * TILE)
  })
})

describe('ceiling', () => {
  it('stops upward motion and reports the top hit', () => {
    // Standing on the floor (row 4) and rising into the ceiling at row 1.
    const r = moveBox({ x: 72, y: 48, w: PLAYER_W, h: PLAYER_H }, 0, -200, CEILING_AT_ROW_1)
    expect(r.hitTop).toBe(true)
    expect(r.y).toBe(2 * TILE)
  })

  it('zeroes the player vertical velocity on a head bump', () => {
    const s = createPlayer(72, 48)
    stepPlayer(s, NO_INPUT, CEILING_AT_ROW_1) // settle: establishes grounded
    stepPlayer(s, { ...NO_INPUT, jump: true, jumpPressed: true }, CEILING_AT_ROW_1)
    expect(s.vy).toBeLessThan(0)

    let top = s.y
    let vyAtTop = s.vy
    for (let i = 0; i < 60; i++) {
      stepPlayer(s, { ...NO_INPUT, jump: true }, CEILING_AT_ROW_1)
      if (s.y < top) {
        top = s.y
        vyAtTop = s.vy
      }
    }
    expect(top).toBe(2 * TILE)
    expect(vyAtTop).toBeGreaterThanOrEqual(0)
  })
})

describe('one-way top', () => {
  it('is solid when falling onto it from above', () => {
    const r = moveBox({ x: 32, y: 0, w: PLAYER_W, h: PLAYER_H }, 0, 60, ONE_WAY_AT_ROW_2)
    expect(r.hitBottom).toBe(true)
    expect(r.y + PLAYER_H).toBe(2 * TILE)
  })

  it('is ignored when rising through it', () => {
    const r = moveBox({ x: 32, y: 40, w: PLAYER_W, h: PLAYER_H }, 0, -30, ONE_WAY_AT_ROW_2)
    expect(r.hitTop).toBe(false)
    expect(r.y).toBe(10)
  })

  it('is ignored when moving sideways through it', () => {
    const r = moveBox({ x: 0, y: 36, w: PLAYER_W, h: PLAYER_H }, 48, 0, ONE_WAY_AT_ROW_2)
    expect(r.hitRight).toBe(false)
    expect(r.hitLeft).toBe(false)
    expect(r.x).toBe(48)
  })

  it('holds a box that is already standing on it', () => {
    const box = { x: 32, y: 2 * TILE - PLAYER_H, w: PLAYER_W, h: PLAYER_H }
    expect(isGrounded(box, ONE_WAY_AT_ROW_2)).toBe(true)
    const r = moveBox(box, 0, 1, ONE_WAY_AT_ROW_2)
    expect(r.hitBottom).toBe(true)
    expect(r.y).toBe(box.y)
  })
})

describe('tunnelling', () => {
  it('never crosses a tile at max fall speed', () => {
    const s = createPlayer(32, 0)
    for (let i = 0; i < 200; i++) {
      stepPlayer(s, NO_INPUT, FLOOR_AT_ROW_4)
      expect(s.vy).toBeLessThanOrEqual(MAX_FALL)
    }
    expect(s.y + PLAYER_H).toBe(4 * TILE)
  })

  it('sub-steps a displacement far larger than a tile', () => {
    const r = moveBox({ x: 32, y: 0, w: PLAYER_W, h: PLAYER_H }, 0, 200, FLOOR_AT_ROW_4)
    expect(r.hitBottom).toBe(true)
    expect(r.y + PLAYER_H).toBe(4 * TILE)
  })

  it('sub-steps a horizontal displacement far larger than a tile', () => {
    const r = moveBox({ x: 0, y: 48, w: PLAYER_W, h: PLAYER_H }, 500, 0, WALL_AT_COL_4)
    expect(r.hitRight).toBe(true)
    expect(r.x + PLAYER_W).toBe(4 * TILE)
  })
})

describe('overlap probe', () => {
  it('reports a box inside a wall', () => {
    expect(overlapsSolid({ x: 64, y: 48, w: PLAYER_W, h: PLAYER_H }, WALL_AT_COL_4)).toBe(true)
  })

  it('reports a box in open air', () => {
    expect(overlapsSolid({ x: 0, y: 0, w: PLAYER_W, h: PLAYER_H }, WALL_AT_COL_4)).toBe(false)
  })
})
