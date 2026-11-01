import { describe, expect, it } from 'vitest'
import { CORNER_CORRECTION_PX, TILE } from './constants.ts'
import { createPlayer, NO_INPUT, stepPlayer, type PlayerState } from './player.ts'
import { parseLevel, type TileMap } from './tilemap.ts'

/**
 * A floor at row 4 and a ceiling block at row 1 spanning columns 5..7 (x 80..128). Pip stands on the
 * floor with his head at y = 48, so a jump meets the ceiling's underside at y = 32.
 */
const CEILING_RIGHT_EDGE = 8 * TILE

const MAP: TileMap = parseLevel([
  '................',
  '.....###........',
  '................',
  '................',
  '################',
])

/** Put Pip on the floor at `x`, settle one frame, then jump with the key held for `frames`. */
function jump(x: number, frames = 40): PlayerState {
  const s = createPlayer(x, 4 * TILE - 16)
  stepPlayer(s, NO_INPUT, MAP) // settle: a jump only fires once the ground is established
  for (let i = 0; i < frames; i++) {
    stepPlayer(s, { ...NO_INPUT, jump: true, jumpPressed: i === 0 }, MAP)
  }
  return s
}

/** The highest point Pip's head reached, tracked frame by frame. */
function apexY(x: number, frames = 40): number {
  const s = createPlayer(x, 4 * TILE - 16)
  stepPlayer(s, NO_INPUT, MAP)
  let top = s.y
  for (let i = 0; i < frames; i++) {
    stepPlayer(s, { ...NO_INPUT, jump: true, jumpPressed: i === 0 }, MAP)
    top = Math.min(top, s.y)
  }
  return top
}

describe('ceiling corner correction', () => {
  it('slips past a corner clipped by a pixel or two', () => {
    // Player spans 126..138, so it overlaps the ceiling's last column (112..128) by 2 px.
    const s = jump(CEILING_RIGHT_EDGE - 2)
    expect(s.x).toBeGreaterThanOrEqual(CEILING_RIGHT_EDGE)
    expect(apexY(CEILING_RIGHT_EDGE - 2)).toBeLessThan(2 * TILE)
  })

  it('never nudges further than the 4 px budget', () => {
    const s = jump(CEILING_RIGHT_EDGE - 2)
    expect(s.x - (CEILING_RIGHT_EDGE - 2)).toBeLessThanOrEqual(CORNER_CORRECTION_PX)
  })

  it('still stops a real head bump', () => {
    // A 6 px overlap is beyond the budget: the ceiling is a ceiling, not a corner.
    const startX = CEILING_RIGHT_EDGE - 6
    const s = jump(startX)
    expect(s.x).toBe(startX)
    // Flush under the ceiling: the head sits at the block's underside, y = 32.
    expect(apexY(startX)).toBe(2 * TILE)
  })

  it('does not fire when falling into a corner', () => {
    // A downward move that clips a corner must not teleport Pip sideways — the nudge is for rising.
    const s = createPlayer(CEILING_RIGHT_EDGE - 2, 0)
    for (let i = 0; i < 30; i++) stepPlayer(s, NO_INPUT, MAP)
    expect(s.x).toBe(CEILING_RIGHT_EDGE - 2)
  })
})
