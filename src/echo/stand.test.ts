import { describe, expect, it } from 'vitest'
import { PLAYER_W } from '../physics/constants.ts'
import { createPlayer, stepPlayer, NO_INPUT } from '../physics/player.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { createEchoField, echoPlatforms, placeEcho } from './echo.ts'

// An empty shaft: no floor, no walls, so the only thing that can hold Pip up is the Echo.
const SKY = parseLevel(['..........', '..........', '..........', '..........'])

describe('standing on an Echo', () => {
  it('holds Pip still for 60 frames when he presses nothing', () => {
    const field = createEchoField()
    const map = SKY

    // Place an Echo from a player in mid-air, then put Pip on top of it with no horizontal speed.
    const spawn = createPlayer(32, 16)
    expect(placeEcho(field, { x: spawn.x, y: spawn.y, w: PLAYER_W, h: spawn.h }, map)).toBe(true)

    const platforms = echoPlatforms(field)
    expect(platforms).toHaveLength(1)

    const landed = createPlayer(platforms[0].x, platforms[0].y - spawn.h)
    for (let i = 0; i < 60; i++) stepPlayer(landed, NO_INPUT, map, echoPlatforms(field))

    expect(landed.grounded).toBe(true)
    expect(landed.x).toBe(platforms[0].x)
    expect(landed.y).toBe(platforms[0].y - landed.h)
  })

  it('gives the platform margin either side of Pip, so a landing is not a knife-edge', () => {
    const field = createEchoField()
    placeEcho(field, { x: 32, y: 16, w: PLAYER_W, h: 14 }, SKY)
    const p = echoPlatforms(field)[0]

    // The spec spawns the Echo at Pip's hitbox; a 12 px platform under a 12 px player leaves no room
    // to land, so the platform is deliberately wider than he is.
    expect(p.w).toBeGreaterThan(PLAYER_W)
  })
})
