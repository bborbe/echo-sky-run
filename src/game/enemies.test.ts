import { describe, expect, it } from 'vitest'
import { PLAYER_H, PLAYER_W } from '../physics/constants.ts'
import { parseLevel } from '../physics/tilemap.ts'
import {
  chaserTarget,
  createEnemy,
  createEnemyField,
  dropShell,
  ENEMY_WALK_SPEED,
  enemyBox,
  GEAR_GOOMBA_H,
  GEAR_GOOMBA_W,
  GUST_WING_PERIOD_F,
  SHELL_H,
  SHELL_SPEED,
  STEAM_TURTLE_H,
  STEAM_TURTLE_W,
  stepEnemies,
  stomps,
  touchShell,
  type EnemyField,
} from './enemies.ts'

/** Ten columns wide, with the floor on row 2 (y = 32) and open sky above it. */
const FLOOR = parseLevel(['..........', '..........', '##########'])
const FLOOR_Y = 32

/** A player box whose feet are exactly on the floor at `x`. */
function playerAt(x: number) {
  return { x, y: FLOOR_Y - PLAYER_H, w: PLAYER_W, h: PLAYER_H }
}

/** A player box whose feet are `dy` below the top of a box that starts at `top`. */
function playerAbove(x: number, top: number, dy = 0) {
  const feet = top + dy
  return { x, y: feet - PLAYER_H, w: PLAYER_W, h: PLAYER_H }
}

function goombaOnFloor(x: number, dir: -1 | 1 = -1) {
  return createEnemy('gear-goomba', x, FLOOR_Y - GEAR_GOOMBA_H, dir)
}

function turtleOnFloor(x: number, dir: -1 | 1 = -1) {
  return createEnemy('steam-turtle', x, FLOOR_Y - STEAM_TURTLE_H, dir)
}

function fieldWith(...enemies: ReturnType<typeof createEnemy>[]): EnemyField {
  const field = createEnemyField()
  field.enemies.push(...enemies)
  return field
}

describe('enemy sizes and speed', () => {
  it('a Gear-Goomba is 16x16 and walks at 0.5 px/f', () => {
    const g = goombaOnFloor(32)
    expect([g.w, g.h]).toEqual([GEAR_GOOMBA_W, GEAR_GOOMBA_H])
    expect(Math.abs(g.vx)).toBe(ENEMY_WALK_SPEED)
  })

  it('a Steam-Turtle is 16x24 and walks at 0.5 px/f', () => {
    const t = turtleOnFloor(32)
    expect([t.w, t.h]).toEqual([STEAM_TURTLE_W, STEAM_TURTLE_H])
    expect(Math.abs(t.vx)).toBe(ENEMY_WALK_SPEED)
  })

  it('a walker keeps its half-pixel step over one frame', () => {
    const field = fieldWith(goombaOnFloor(32, 1))
    const before = field.enemies[0].x
    stepEnemies(field, playerAt(200), 0, FLOOR)
    expect(field.enemies[0].x - before).toBeCloseTo(ENEMY_WALK_SPEED, 6)
  })
})

describe('walls', () => {
  it('a Gear-Goomba turns around at a wall instead of walking through it', () => {
    const WALLED = parseLevel(['#........#', '#........#', '##########'])
    const field = fieldWith(goombaOnFloor(16, -1))

    for (let i = 0; i < 60; i++) stepEnemies(field, playerAt(200), 0, WALLED)

    expect(field.enemies[0].vx).toBeGreaterThan(0)
    expect(field.enemies[0].x).toBeGreaterThanOrEqual(16)
  })
})

describe('stomp', () => {
  it('counts a downward landing whose feet are in the top band', () => {
    const g = goombaOnFloor(32)
    expect(stomps(playerAbove(32, g.y, 4), 1, g)).toBe(true)
  })

  it('does not count a player moving upward through the enemy', () => {
    const g = goombaOnFloor(32)
    expect(stomps(playerAbove(32, g.y, 4), -1, g)).toBe(false)
  })

  it('does not count a landing that is too far into the enemy', () => {
    const g = goombaOnFloor(32)
    expect(stomps(playerAbove(32, g.y, 12), 1, g)).toBe(false)
  })

  it('kills a Gear-Goomba and reports it', () => {
    const g = goombaOnFloor(32)
    const field = fieldWith(g)
    const events = stepEnemies(field, playerAbove(32, g.y, 2), 1, FLOOR)

    expect(events.stomped).toHaveLength(1)
    expect(field.enemies).toHaveLength(0)
  })

  it('turns a Steam-Turtle into a resting shell without moving it', () => {
    const t = turtleOnFloor(32)
    const field = fieldWith(t)
    const events = stepEnemies(field, playerAbove(32, t.y, 2), 1, FLOOR)

    expect(events.stomped).toHaveLength(1)
    expect(field.enemies).toHaveLength(1)
    expect(field.enemies[0].mode).toBe('shell')
    expect(field.enemies[0].vx).toBe(0)
    expect(field.enemies[0].h).toBe(SHELL_H)
  })
})

describe('shell', () => {
  it('a kicked shell slides at 3 px/f', () => {
    const t = turtleOnFloor(32)
    const field = fieldWith(t)
    stepEnemies(field, playerAbove(32, t.y, 2), 1, FLOOR)

    const shell = field.enemies[0]
    const before = shell.x
    touchShell(field, playerAt(32), 1, false)

    expect(shell.mode).toBe('sliding')
    expect(shell.vx).toBe(SHELL_SPEED)

    stepEnemies(field, playerAt(200), 0, FLOOR)
    expect(shell.x - before).toBeCloseTo(SHELL_SPEED, 6)
  })

  it('carries the shell when the run key is held', () => {
    const t = turtleOnFloor(32)
    const field = fieldWith(t)
    stepEnemies(field, playerAbove(32, t.y, 2), 1, FLOOR)

    expect(touchShell(field, playerAt(32), 1, true)).toBe(true)
    expect(field.enemies[0].mode).toBe('carried')
    expect(field.carried).toBe(field.enemies[0])
  })

  it('a carried shell follows Pip instead of falling', () => {
    const t = turtleOnFloor(32)
    const field = fieldWith(t)
    stepEnemies(field, playerAbove(32, t.y, 2), 1, FLOOR)
    touchShell(field, playerAt(32), 1, true)

    const moved = playerAt(120)
    stepEnemies(field, moved, 0, FLOOR)

    expect(field.enemies[0].x).toBe(moved.x)
    expect(field.enemies[0].y).toBe(moved.y - SHELL_H)
  })

  it('drops the shell sliding the way Pip faces', () => {
    const t = turtleOnFloor(32)
    const field = fieldWith(t)
    stepEnemies(field, playerAbove(32, t.y, 2), 1, FLOOR)
    touchShell(field, playerAt(32), 1, true)

    dropShell(field, -1)

    expect(field.carried).toBeNull()
    expect(field.enemies[0].mode).toBe('sliding')
    expect(field.enemies[0].vx).toBe(-SHELL_SPEED)
  })

  it('a sliding shell kills a walker it runs into', () => {
    const t = turtleOnFloor(32)
    const g = goombaOnFloor(32 + 20, 1)
    const field = fieldWith(t, g)
    stepEnemies(field, playerAbove(32, t.y, 2), 1, FLOOR)
    touchShell(field, playerAt(32), 1, false)

    for (let i = 0; i < 20; i++) stepEnemies(field, playerAt(200), 0, FLOOR)

    expect(field.enemies.some((e) => e.kind === 'gear-goomba')).toBe(false)
  })
})

describe('damage', () => {
  it('reports a side touch as a hit, not a stomp', () => {
    const g = goombaOnFloor(32)
    const field = fieldWith(g)

    // Level with the enemy, not above it: feet are far below its top band.
    const events = stepEnemies(field, playerAt(32), 0, FLOOR)

    expect(events.stomped).toHaveLength(0)
    expect(events.hit).toBe(true)
    expect(enemyBox(g).w).toBe(GEAR_GOOMBA_W)
  })

  it('does not report a hit for an enemy across the level', () => {
    const field = fieldWith(goombaOnFloor(32))
    const events = stepEnemies(field, playerAt(140), 0, FLOOR)
    expect(events.hit).toBe(false)
  })
})

describe('Spike-Beetle', () => {
  it('is 16x16 and walks at 0.5 px/f', () => {
    const s = createEnemy('spike-beetle', 32, FLOOR_Y - 16)
    expect([s.w, s.h]).toEqual([16, 16])
    expect(Math.abs(s.vx)).toBe(ENEMY_WALK_SPEED)
  })

  it('is spiked on top, so a landing is a hit, not a stomp', () => {
    const s = createEnemy('spike-beetle', 32, FLOOR_Y - 16)
    const field = fieldWith(s)

    const events = stepEnemies(field, playerAbove(32, s.y, 2), 1, FLOOR)

    expect(events.stomped).toHaveLength(0)
    expect(events.hit).toBe(true)
    expect(field.enemies).toHaveLength(1)
  })
})

describe('Gust-Wing', () => {
  it('is 16x16 and flies at 1 px/f', () => {
    const g = createEnemy('gust-wing', 32, 16)
    expect([g.w, g.h]).toEqual([16, 16])
    expect(Math.abs(g.vx)).toBe(1)
  })

  it('follows a sine path of amplitude 24 px', () => {
    const g = createEnemy('gust-wing', 32, 16, 1)
    const field = fieldWith(g)
    let min = Infinity
    let max = -Infinity

    for (let i = 0; i < GUST_WING_PERIOD_F; i++) {
      stepEnemies(field, playerAt(400), 0, FLOOR)
      if (g.y < min) min = g.y
      if (g.y > max) max = g.y
    }

    expect(min).toBeCloseTo(16 - 24, 6)
    expect(max).toBeCloseTo(16 + 24, 6)
    expect(max - min).toBeCloseTo(48, 6)
  })

  it('is defeated by a stomp', () => {
    const g = createEnemy('gust-wing', 32, 16)
    const field = fieldWith(g)

    const events = stepEnemies(field, playerAbove(32, 16, 2), 1, FLOOR)

    expect(events.stomped).toHaveLength(1)
    expect(field.enemies).toHaveLength(0)
  })
})

describe('Chaser-Bot', () => {
  it('is 16x16 and closes at 1.25 px/f', () => {
    const c = createEnemy('chaser-bot', 32, FLOOR_Y - 16)
    expect([c.w, c.h]).toEqual([16, 16])
    expect(Math.abs(c.vx)).toBe(1.25)
  })

  it('locks the Echo when it is nearer than Pip', () => {
    const bot = createEnemy('chaser-bot', 100, 100)
    const pip = { x: 180, y: 100, w: 12, h: 14 }
    const echo = { x: 120, y: 100, w: 32, h: 4 }
    expect(chaserTarget(bot, pip, [echo])).toBe(echo)
  })

  it('locks Pip when Pip is nearer than the Echo', () => {
    const bot = createEnemy('chaser-bot', 100, 100)
    const pip = { x: 120, y: 100, w: 12, h: 14 }
    const echo = { x: 180, y: 100, w: 32, h: 4 }
    expect(chaserTarget(bot, pip, [echo])).toBe(pip)
  })

  it('locks nothing when both are beyond 96 px', () => {
    const bot = createEnemy('chaser-bot', 0, 0)
    const pip = { x: 200, y: 0, w: 12, h: 14 }
    const echo = { x: 300, y: 0, w: 32, h: 4 }
    expect(chaserTarget(bot, pip, [echo])).toBeNull()
  })

  it('moves toward the target it locked', () => {
    const c = createEnemy('chaser-bot', 32, FLOOR_Y - 16)
    const field = fieldWith(c)
    const before = c.x

    stepEnemies(field, playerAt(100), 0, FLOOR)

    expect(c.x).toBeGreaterThan(before)
  })

  it('takes two stomps to defeat', () => {
    const c = createEnemy('chaser-bot', 32, FLOOR_Y - 16)
    const field = fieldWith(c)

    const first = stepEnemies(field, playerAbove(32, c.y, 2), 1, FLOOR)
    expect(first.stomped).toHaveLength(1)
    expect(field.enemies).toHaveLength(1)

    const second = stepEnemies(field, playerAbove(32, field.enemies[0].y, 2), 1, FLOOR)
    expect(second.stomped).toHaveLength(1)
    expect(field.enemies).toHaveLength(0)
  })
})
