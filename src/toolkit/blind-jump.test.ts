import { describe, expect, it } from 'vitest'
import { PLAYER_W } from '../physics/constants.ts'
import type { Takeoff } from './autopilot.ts'
import { blindJumps } from './blind-jump.ts'

/** The view width the toolkit rates at: 960×540 through the renderer's own arithmetic. */
const VIEW_W = 398

function takeoff(over: Partial<Takeoff> = {}): Takeoff {
  return {
    frame: 0,
    x: 100,
    y: 178,
    viewLeft: 0,
    landingFrame: 30,
    landingX: 200,
    ...over,
  }
}

describe('the blind-jump check', () => {
  it('passes a jump whose landing is inside the view it was made from', () => {
    expect(blindJumps([takeoff()], VIEW_W)).toEqual([])
  })

  it('flags a jump whose landing is past the right edge of the view', () => {
    // The known positive: without a fixture that must fire, a clean report on a real level could
    // come from a checker that never runs.
    const found = blindJumps([takeoff({ viewLeft: 0, landingX: VIEW_W + 40 })], VIEW_W)

    expect(found).toHaveLength(1)
    expect(found[0].landingX).toBe(VIEW_W + 40)
    expect(found[0].viewRight).toBe(VIEW_W)
  })

  it('flags a landing that is behind the left edge of the view', () => {
    const found = blindJumps([takeoff({ viewLeft: 500, landingX: 400 })], VIEW_W)
    expect(found).toHaveLength(1)
  })

  it('flags a landing whose trailing edge only just leaves the view', () => {
    // The player is 12 px wide, so a landing at exactly the right edge is half off-screen.
    const landingX = VIEW_W - PLAYER_W + 1
    expect(blindJumps([takeoff({ viewLeft: 0, landingX })], VIEW_W)).toHaveLength(1)
  })

  it('ignores a jump that never landed: that is a death, not a blind jump', () => {
    expect(blindJumps([takeoff({ landingFrame: null, landingX: null })], VIEW_W)).toEqual([])
  })
})
