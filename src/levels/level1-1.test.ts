import { describe, expect, it } from 'vitest'
import { echoPlatforms } from '../echo/echo.ts'
import { createSim, stepSim, type SimState } from '../game/sim.ts'
import { groundUnder } from '../physics/collision.ts'
import { GRAVITY_HELD, JUMP_V_SPRINT, PLAYER_W, SMALL_H, TILE } from '../physics/constants.ts'
import { GOAL, parseLevel, SPAWN, tileAt } from '../physics/tilemap.ts'
import { LEVEL_1_1_COLS, LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_GAP, LEVEL_1_1_ROWS } from './level1-1.ts'

/**
 * The level stripped of the things that change a run's shape: enemies (a hit while Small is now
 * death) and the ? block (its Mushroom makes Pip Super mid-run, which changes the jump geometry the
 * gap crossing depends on). These tests are about the two gaps and the checkpoint. Enemy behaviour
 * is covered by `src/game/enemies.test.ts`, the block by `src/game/sim.power.test.ts`, and the
 * populated level by the browser playthrough.
 */
const MAP = parseLevel(LEVEL_1_1_ROWS.map((row) => row.replace(/[gt?]/g, '.')))

/** Past this y the player has left the world: there is no floor below the gap. */
const FELL_Y = MAP.rows * TILE + 80

const GAP_FIRST_X = LEVEL_1_1_GAP.firstCol * TILE

const IDLE = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  sprint: false,
  echoPressed: false,
} as const

interface Run {
  won: boolean
  /** The run died in a pit rather than merely running out of frames. */
  died: boolean
  frames: number
  echoesPlaced: number
  /** The player stood on an Echo after leaving the near ledge — the crossing the level is about. */
  stoodOnEchoInGap: boolean
}

function stoodOnEcho(sim: SimState): boolean {
  if (sim.player.x <= GAP_FIRST_X) return false
  const box = { x: sim.player.x, y: sim.player.y, w: PLAYER_W, h: sim.player.h }
  return groundUnder(box, MAP, echoPlatforms(sim.field)) === 'platform'
}

/**
 * A scripted run of the level: hold right and sprint, jump whenever the ground allows, and (when
 * allowed) drop one Echo in mid-air part-way across the gap so there is a second launch point.
 */
function play(useEcho: boolean, maxFrames = 3000): Run {
  const sim = createSim(MAP)
  let placed = false
  let echoesPlaced = 0
  let onEcho = false

  for (let i = 0; i < maxFrames; i++) {
    const p = sim.player
    const wantEcho =
      useEcho && !placed && !p.grounded && p.x >= LEVEL_1_1_ECHO_AT_X && sim.field.airCharges > 0
    if (wantEcho) {
      placed = true
      echoesPlaced += 1
    }

    stepSim(sim, { ...IDLE, right: true, jump: true, jumpPressed: true, sprint: true, echoPressed: wantEcho })

    if (stoodOnEcho(sim)) onEcho = true

    const result = { echoesPlaced, stoodOnEchoInGap: onEcho }
    if (sim.goalReached) return { won: true, died: false, frames: i + 1, ...result }
    if (sim.deaths > 0) return { won: false, died: true, frames: i + 1, ...result }
  }

  return { won: false, died: false, frames: maxFrames, echoesPlaced, stoodOnEchoInGap: onEcho }
}

describe('level 1-1', () => {
  it('is a rectangular tile grid', () => {
    for (const row of LEVEL_1_1_ROWS) expect(row).toHaveLength(LEVEL_1_1_COLS)
  })

  it('has both the spawn and the goal tile', () => {
    const chars = LEVEL_1_1_ROWS.join('')
    expect(chars).toContain(SPAWN)
    expect(chars).toContain(GOAL)
  })

  it('has no solid tile inside the gap', () => {
    for (let col = LEVEL_1_1_GAP.firstCol; col <= LEVEL_1_1_GAP.lastCol; col++) {
      for (let row = 0; row < MAP.rows; row++) {
        expect(tileAt(MAP, col, row)).not.toBe('#')
      }
    }
  })

  it('is closed on the left, so holding left cannot leave the world', () => {
    const sim = createSim(MAP)
    for (let i = 0; i < 600; i++) {
      stepSim(sim, { ...IDLE, left: true, sprint: true })
      expect(sim.player.x).toBeGreaterThanOrEqual(0)
      expect(sim.player.y).toBeLessThan(FELL_Y)
    }
  })

  it('cannot be cleared by a plain sprint jump from the pit edge', () => {
    // The best a player can do without an Echo: full sprint, jumping from the last frame the feet
    // are still on the near ledge. The bot jumps when the floor under its leading edge is gone, so
    // it clears the small gap and then launches from the Echo gap's lip rather than mid-run. If
    // this clears, the gap is not doing its job.
    const sim = createSim(MAP)
    let jumped = false
    let fell = false

    const lipMissing = (): boolean => {
      const p = sim.player
      const feetRow = Math.floor((p.y + p.h) / TILE)
      const col = Math.floor((p.x + PLAYER_W) / TILE)
      return tileAt(sim.map, col, feetRow) !== '#'
    }

    for (let i = 0; i < 600 && !fell && !sim.goalReached; i++) {
      const p = sim.player
      const jumpPressed = p.grounded && lipMissing()
      if (jumpPressed && p.x + PLAYER_W >= GAP_FIRST_X) jumped = true

      stepSim(sim, { ...IDLE, right: true, jump: true, jumpPressed, sprint: true })

      if (sim.deaths > 0) fell = true
    }

    expect(jumped).toBe(true)
    expect(sim.goalReached).toBe(false)
    expect(fell).toBe(true)
  })

  it('cannot be finished by the bouncing run either', () => {
    const run = play(false)
    expect(run.won).toBe(false)
    expect(run.died).toBe(true)
    expect(run.echoesPlaced).toBe(0)
    expect(run.stoodOnEchoInGap).toBe(false)
  })

  it('is finished by crossing the gap on a mid-air Echo', () => {
    const run = play(true)
    expect(run.won).toBe(true)
    expect(run.echoesPlaced).toBe(1)
    // The win must come from standing on the Echo in the gap, not from a lucky trajectory.
    expect(run.stoodOnEchoInGap).toBe(true)
  })

  it('puts the practice ledge above what a plain jump can reach', () => {
    // The ledge is the spot the Echo is practised on. If a plain jump reaches it, it teaches nothing.
    const ledgeRow = LEVEL_1_1_ROWS.findIndex((row) => row.slice(39, 42) === '###')
    expect(ledgeRow).toBeGreaterThanOrEqual(0)

    const apex = (JUMP_V_SPRINT * JUMP_V_SPRINT) / (2 * GRAVITY_HELD)
    const floorTop = 12 * TILE
    const headAtApex = floorTop - SMALL_H - apex
    const ledgeUnderside = ledgeRow * TILE + TILE

    // Larger y is lower: the head must still be below the ledge at the top of the jump.
    expect(headAtApex).toBeGreaterThan(ledgeUnderside)
  })

  it('moves the respawn point to the checkpoint once Pip reaches it', () => {
    const sim = createSim(MAP)
    const checkpoint = sim.checkpoint
    expect(checkpoint).not.toBeNull()
    expect(sim.respawn.x).toBeLessThan(checkpoint!.x)

    const lipMissing = (): boolean => {
      const p = sim.player
      const feetRow = Math.floor((p.y + p.h) / TILE)
      const col = Math.floor((p.x + PLAYER_W) / TILE)
      return tileAt(sim.map, col, feetRow) !== '#'
    }

    for (let i = 0; i < 900 && sim.respawn.x < checkpoint!.x && sim.deaths === 0; i++) {
      const jumpPressed = sim.player.grounded && lipMissing()
      stepSim(sim, { ...IDLE, right: true, jump: true, jumpPressed, sprint: true })
    }

    expect(sim.deaths).toBe(0)
    expect(sim.respawn.x).toBe(checkpoint!.x)
    // The flag also grants Super, so the second half is played with the tier the first half earned.
    expect(sim.power).toBe('super')
  })

  it('respawns at the level start after a pit death, on the same frame and with no key press', () => {
    const sim = createSim(MAP)
    const startX = sim.player.x
    const startY = sim.player.y

    for (let i = 0; i < 900 && sim.deaths === 0; i++) {
      stepSim(sim, { ...IDLE, right: true, jump: true, jumpPressed: true, sprint: true })
    }

    expect(sim.deaths).toBe(1)
    // Back in control immediately: the respawn happens inside the death frame, not on a later key.
    expect(sim.player.x).toBe(startX)
    expect(sim.player.y).toBe(startY)
    expect(sim.field.echoes).toHaveLength(0)
  })
})
