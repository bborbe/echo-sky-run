import { describe, expect, it } from 'vitest'
import { groundUnder, moveBox, type Box } from '../physics/collision.ts'
import { PLAYER_H, PLAYER_W } from '../physics/constants.ts'
import { createPlayer, NO_INPUT, stepPlayer } from '../physics/player.ts'
import { parseLevel } from '../physics/tilemap.ts'
import {
  canPlaceEcho,
  createEchoField,
  ECHO_AIR_CHARGES,
  ECHO_LIFE_F,
  echoBoxAt,
  echoPlatforms,
  isBlinking,
  placeEcho,
  refreshAirCharges,
  tickEchoes,
} from './echo.ts'

const OPEN = parseLevel([
  '................',
  '................',
  '................',
  '................',
  '################',
])

const WALL_AT_ROW_3 = parseLevel([
  '................',
  '................',
  '................',
  '....#...........',
  '################',
])

/** A player box in mid-air, well clear of the floor at y = 64. */
function airborne(x = 32, y = 20): Box {
  return { x, y, w: PLAYER_W, h: PLAYER_H }
}

describe('placement', () => {
  it('places an Echo mid-air and spends the charge', () => {
    const field = createEchoField()
    expect(field.airCharges).toBe(ECHO_AIR_CHARGES)

    expect(placeEcho(field, airborne(), OPEN)).toBe(true)
    expect(field.echoes).toHaveLength(1)
    expect(field.airCharges).toBe(0)
    expect(field.echoes[0].life).toBe(ECHO_LIFE_F)
  })

  it('lands the Echo as a thin top at the player feet', () => {
    const box = echoBoxAt(airborne(32, 20))
    expect(box.y).toBe(20 + PLAYER_H)
    expect(box.x).toBe(32)
    expect(box.w).toBe(PLAYER_W)
    expect(box.h).toBe(4)
  })

  it('allows only one mid-air Echo per airtime', () => {
    const field = createEchoField()
    expect(placeEcho(field, airborne(32, 20), OPEN)).toBe(true)
    expect(canPlaceEcho(field, airborne(80, 20), OPEN)).toBe(false)
    expect(placeEcho(field, airborne(80, 20), OPEN)).toBe(false)
    expect(field.echoes).toHaveLength(1)
  })

  it('refuses a placement inside a wall', () => {
    const field = createEchoField()
    // Feet at y = 60, so the Echo top would sit inside the wall at row 3 (y 48..63).
    const inWall: Box = { x: 64, y: 44, w: PLAYER_W, h: PLAYER_H }
    expect(canPlaceEcho(field, inWall, WALL_AT_ROW_3)).toBe(false)
    expect(placeEcho(field, inWall, WALL_AT_ROW_3)).toBe(false)
    expect(field.echoes).toHaveLength(0)
    expect(field.airCharges).toBe(ECHO_AIR_CHARGES)
  })
})

describe('air charge', () => {
  it('refreshes on solid ground', () => {
    const field = createEchoField()
    placeEcho(field, airborne(), OPEN)
    expect(field.airCharges).toBe(0)

    const onGround: Box = { x: 32, y: 48, w: PLAYER_W, h: PLAYER_H }
    refreshAirCharges(field, onGround, OPEN, [])
    expect(field.airCharges).toBe(ECHO_AIR_CHARGES)
  })

  it('does not refresh while standing on an Echo', () => {
    const field = createEchoField()
    placeEcho(field, airborne(), OPEN)

    const platforms = echoPlatforms(field)
    const onEcho: Box = { x: 32, y: platforms[0].y - PLAYER_H, w: PLAYER_W, h: PLAYER_H }
    expect(groundUnder(onEcho, OPEN, platforms)).toBe('platform')

    refreshAirCharges(field, onEcho, OPEN, platforms)
    expect(field.airCharges).toBe(0)
  })
})

describe('lifetime', () => {
  it('is removed after 240 frames', () => {
    const field = createEchoField()
    placeEcho(field, airborne(), OPEN)

    for (let i = 0; i < ECHO_LIFE_F - 1; i++) tickEchoes(field)
    expect(field.echoes).toHaveLength(1)
    expect(field.echoes[0].life).toBe(1)

    tickEchoes(field)
    expect(field.echoes).toHaveLength(0)
  })

  it('blinks only for its last 60 frames', () => {
    const field = createEchoField()
    placeEcho(field, airborne(), OPEN)
    expect(isBlinking(field.echoes[0])).toBe(false)

    for (let i = 0; i < ECHO_LIFE_F - 60; i++) tickEchoes(field)
    expect(isBlinking(field.echoes[0])).toBe(true)
  })
})

describe('one-way top', () => {
  it('is solid when the player falls onto it', () => {
    const field = createEchoField()
    placeEcho(field, airborne(), OPEN)
    const platforms = echoPlatforms(field)

    const s = createPlayer(32, 0)
    for (let i = 0; i < 60; i++) stepPlayer(s, NO_INPUT, OPEN, platforms)

    expect(s.grounded).toBe(true)
    expect(s.y + PLAYER_H).toBe(platforms[0].y)
    expect(s.y + PLAYER_H).toBeLessThan(4 * 16) // landed on the Echo, not the floor
  })

  it('is passed through when the player rises into it', () => {
    const field = createEchoField()
    placeEcho(field, airborne(32, 20), OPEN)
    const platforms = echoPlatforms(field)

    const fromBelow: Box = { x: 32, y: 40, w: PLAYER_W, h: PLAYER_H }
    const r = moveBox(fromBelow, 0, -40, OPEN, platforms)
    expect(r.hitTop).toBe(false)
    expect(r.y).toBe(0)
  })
})
