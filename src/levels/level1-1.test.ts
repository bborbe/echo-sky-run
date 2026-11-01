import { describe, expect, it } from 'vitest'
import { echoPlatforms } from '../echo/echo.ts'
import { createSim, stepSim, type SimState } from '../game/sim.ts'
import { groundUnder } from '../physics/collision.ts'
import { PLAYER_H, PLAYER_W, TILE } from '../physics/constants.ts'
import { GOAL, parseLevel, SPAWN, tileAt } from '../physics/tilemap.ts'
import { LEVEL_1_1_COLS, LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_GAP, LEVEL_1_1_ROWS } from './level1-1.ts'

const MAP = parseLevel(LEVEL_1_1_ROWS)

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
  /** The run left the world rather than merely running out of frames. */
  fell: boolean
  frames: number
  echoesPlaced: number
  /** The player stood on an Echo after leaving the near ledge — the crossing the level is about. */
  stoodOnEchoInGap: boolean
}

function stoodOnEcho(sim: SimState): boolean {
  if (sim.player.x <= GAP_FIRST_X) return false
  const box = { x: sim.player.x, y: sim.player.y, w: PLAYER_W, h: PLAYER_H }
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
    if (sim.goalReached) return { won: true, fell: false, frames: i + 1, ...result }
    if (sim.player.y > FELL_Y) return { won: false, fell: true, frames: i + 1, ...result }
  }

  return { won: false, fell: false, frames: maxFrames, echoesPlaced, stoodOnEchoInGap: onEcho }
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
      const feetRow = Math.floor((p.y + PLAYER_H) / TILE)
      const col = Math.floor((p.x + PLAYER_W) / TILE)
      return tileAt(sim.map, col, feetRow) !== '#'
    }

    for (let i = 0; i < 600 && !fell && !sim.goalReached; i++) {
      const p = sim.player
      const jumpPressed = p.grounded && lipMissing()
      if (jumpPressed && p.x + PLAYER_W >= GAP_FIRST_X) jumped = true

      stepSim(sim, { ...IDLE, right: true, jump: true, jumpPressed, sprint: true })

      if (sim.player.y > FELL_Y) fell = true
    }

    expect(jumped).toBe(true)
    expect(sim.goalReached).toBe(false)
    expect(fell).toBe(true)
  })

  it('cannot be finished by the bouncing run either', () => {
    const run = play(false)
    expect(run.won).toBe(false)
    expect(run.fell).toBe(true)
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
})
