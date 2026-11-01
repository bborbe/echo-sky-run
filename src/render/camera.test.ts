import { describe, expect, it } from 'vitest'
import { SPRINT_MAX, TILE } from '../physics/constants.ts'
import { aheadFraction, Camera, CAMERA_LOOKAHEAD } from './camera.ts'

/** The view widths the game actually produces: 540x540 up to an ultrawide window. */
const VIEW_WIDTHS = [224, 398, 800, 1200]

const WORLD_COLS = 400
const WORLD_W = WORLD_COLS * TILE
const WORLD_H = 14 * TILE

/**
 * Run the camera at a steady speed until it settles, then report how much of the view lies ahead of
 * Pip's leading edge. The player starts mid-world so neither clamp is in play.
 */
function settledAheadFraction(viewW: number, speed: number): number {
  const camera = new Camera()
  camera.setViewWidth(viewW)
  let playerX = 40 * TILE
  for (let i = 0; i < 400; i++) {
    playerX += speed
    camera.update(playerX, 100, 14, speed, WORLD_W, WORLD_H)
  }
  return aheadFraction(viewW, playerX, camera.x)
}

describe('camera look-ahead', () => {
  it('keeps at least 60% of the view ahead above 75% of max speed', () => {
    // The budget from the platformer design guide: a fast run must show what it is running into.
    for (const viewW of VIEW_WIDTHS) {
      for (const speed of [0.75 * SPRINT_MAX, 0.9 * SPRINT_MAX, SPRINT_MAX]) {
        const ahead = settledAheadFraction(viewW, speed)
        expect(ahead, `viewW=${viewW} speed=${speed.toFixed(2)}`).toBeGreaterThanOrEqual(0.6)
      }
    }
  })

  it('leads by a fraction of the view, so the budget holds at every aspect', () => {
    // A fixed pixel look-ahead would pass at one window size and fail at another; a fraction cannot.
    const wide = settledAheadFraction(1200, SPRINT_MAX)
    const narrow = settledAheadFraction(224, SPRINT_MAX)
    expect(Math.abs(wide - narrow)).toBeLessThan(0.12)
  })

  it('looks behind when running left', () => {
    const camera = new Camera()
    camera.setViewWidth(398)
    let playerX = 200 * TILE
    for (let i = 0; i < 400; i++) {
      playerX -= SPRINT_MAX
      camera.update(playerX, 100, 14, -SPRINT_MAX, WORLD_W, WORLD_H)
    }
    // Behind = the space to Pip's right, i.e. the opposite of the direction of travel.
    expect(aheadFraction(398, playerX, camera.x)).toBeLessThan(0.4)
  })

  it('does not scroll past the level edges', () => {
    const camera = new Camera()
    camera.setViewWidth(398)
    camera.update(0, 100, 14, -SPRINT_MAX, WORLD_W, WORLD_H)
    expect(camera.x).toBe(0)

    for (let i = 0; i < 4000; i++) camera.update(WORLD_W - 1, 100, 14, SPRINT_MAX, WORLD_W, WORLD_H)
    expect(camera.x).toBe(WORLD_W - 398)
  })

  it('uses a look-ahead constant large enough for the budget', () => {
    // Guards against a silent retune: shrinking this below ~0.2 breaks the 60% bar at 224 px wide.
    expect(CAMERA_LOOKAHEAD).toBeGreaterThanOrEqual(0.2)
  })
})
