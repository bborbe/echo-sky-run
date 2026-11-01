import { describe, expect, it } from 'vitest'
import { createSim, stepSim, type SimState } from '../game/sim.ts'
import { TILE } from '../physics/constants.ts'
import { parseLevel, SOLID, tileAt } from '../physics/tilemap.ts'
import { LEVEL_1_1_COLS, LEVEL_1_1_GAP, LEVEL_1_1_ROWS } from './level1-1.ts'

const MAP = parseLevel(LEVEL_1_1_ROWS)

interface Run {
  won: boolean
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
    // Mid-gap, airborne, and past the point where a plain hop would come up short.
    const wantEcho = useEcho && !placed && !p.grounded && p.x >= 370 && sim.field.airCharges > 0
    if (wantEcho) {
      placed = true
      echoesPlaced += 1
    }

    stepSim(sim, {
      left: false,
      right: true,
      jump: true,
      jumpPressed: true,
      sprint: true,
      echoPressed: wantEcho,
    })

    if (sim.goalReached) return { won: true, frames: i + 1, echoesPlaced }
    if (sim.player.y > MAP.rows * TILE + 80) break // fell out of the world
  }

  return { won: false, frames: maxFrames, echoesPlaced }
}

describe('level 1-1', () => {
  it('is a rectangular tile grid', () => {
    for (const row of LEVEL_1_1_ROWS) expect(row).toHaveLength(LEVEL_1_1_COLS)
  })

  it('has a solid gap no plain jump can clear', () => {
    for (let col = LEVEL_1_1_GAP.firstCol; col <= LEVEL_1_1_GAP.lastCol; col++) {
      for (let row = 0; row < MAP.rows; row++) {
        expect(tileAt(MAP, col, row)).not.toBe(SOLID)
      }
    }
  })

  it('cannot be finished without an Echo', () => {
    const run = play(false)
    expect(run.won).toBe(false)
    expect(run.echoesPlaced).toBe(0)
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
