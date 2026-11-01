import { describe, expect, it } from 'vitest'
import { createSim, stepSim, type SimState } from '../game/sim.ts'
import { TILE } from '../physics/constants.ts'
import { GOAL, parseLevel, SPAWN, tileAt } from '../physics/tilemap.ts'
import { LEVEL_1_1_COLS, LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_GAP, LEVEL_1_1_ROWS } from './level1-1.ts'

const MAP = parseLevel(LEVEL_1_1_ROWS)

/** Past this y the player has left the world: there is no floor below the gap. */
const FELL_Y = MAP.rows * TILE + 80

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
}

/**
 * A scripted run of the level: hold right and sprint, jump whenever the ground allows, and (when
 * allowed) drop one Echo in mid-air part-way across the gap so there is a second launch point.
 */
function play(useEcho: boolean, maxFrames = 3000): Run {
  const sim: SimState = createSim(MAP)
  let placed = false
  let echoesPlaced = 0

  for (let i = 0; i < maxFrames; i++) {
    const p = sim.player
    const wantEcho =
      useEcho && !placed && !p.grounded && p.x >= LEVEL_1_1_ECHO_AT_X && sim.field.airCharges > 0
    if (wantEcho) {
      placed = true
      echoesPlaced += 1
    }

    stepSim(sim, { ...IDLE, right: true, jump: true, jumpPressed: true, sprint: true, echoPressed: wantEcho })

    if (sim.goalReached) return { won: true, fell: false, frames: i + 1, echoesPlaced }
    if (sim.player.y > FELL_Y) return { won: false, fell: true, frames: i + 1, echoesPlaced }
  }

  return { won: false, fell: false, frames: maxFrames, echoesPlaced }
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

  it('has a solid gap no plain jump can clear', () => {
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

  it('cannot be finished without an Echo, and the run falls into the gap', () => {
    const run = play(false)
    expect(run.won).toBe(false)
    expect(run.fell).toBe(true)
    expect(run.echoesPlaced).toBe(0)
    expect(run.frames).toBeLessThan(3000)
  })

  it('is finished by crossing the gap on a mid-air Echo', () => {
    const run = play(true)
    expect(run.won).toBe(true)
    expect(run.echoesPlaced).toBe(1)
    // A plain jump falls short, so a win inside one hop's worth of frames would mean the gap is not
    // actually doing its job.
    expect(run.frames).toBeGreaterThan(60)
  })
})
