import { describe, expect, it } from 'vitest'
import { PLAYER_W } from '../physics/constants.ts'
import type { Takeoff } from './autopilot.ts'
import { blindJumps, unseenFalls } from './blind-jump.ts'

/** The view width the toolkit rates at: 960×540 through the renderer's own arithmetic. */
const VIEW_W = 398
/** The logical view height is fixed at 14 tiles. */
const VIEW_H = 224

function takeoff(over: Partial<Takeoff> = {}): Takeoff {
  return {
    frame: 0,
    x: 100,
    y: 178,
    viewLeft: 0,
    viewTop: 0,
    apexY: 178,
    landingFrame: 30,
    landingX: 200,
    landingY: 200,
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

describe('the long-fall visibility check', () => {
  it('passes a long fall whose landing and five tiles below are in view', () => {
    const fall = takeoff({ y: 0, apexY: 0, landingY: 100, viewTop: 0 })
    expect(unseenFalls([fall], VIEW_H, 400)).toEqual([])
  })

  it('flags a long fall whose landing margin is below the view', () => {
    // The known positive: the landing at 200 needs the view to reach 280, and it stops at 224.
    const fall = takeoff({ y: 0, apexY: 0, landingY: 200, viewTop: 0 })
    const found = unseenFalls([fall], VIEW_H, 400)

    expect(found).toHaveLength(1)
    expect(found[0].viewBottom).toBe(VIEW_H)
    expect(found[0].requiredBottom).toBe(200 + 5 * 16)
  })

  it('clamps the requirement to the level floor, so a low landing is not asked for space below it', () => {
    // The level ends at 224: there are fewer than five tiles below the landing, and the floor itself
    // is the deepest thing to see.
    const fall = takeoff({ y: 0, apexY: 0, landingY: 200, viewTop: 0 })
    expect(unseenFalls([fall], VIEW_H, 224)).toEqual([])
  })

  it('measures the drop from the apex, not the take-off', () => {
    // The jump rises 100 px first, then lands 20 px below take-off: a 120 px fall, which must be
    // judged even though the net displacement is only 20 px.
    const fall = takeoff({ y: 190, apexY: 90, landingY: 210, viewTop: 0 })
    expect(unseenFalls([fall], VIEW_H, 400)).toHaveLength(1)
  })

  it('ignores a short drop: only a long fall is judged', () => {
    const shortFall = takeoff({ y: 190, apexY: 190, landingY: 200, viewTop: 0 })
    expect(unseenFalls([shortFall], VIEW_H, 400)).toEqual([])
  })

  it('ignores a normal jump that rises and lands at the same height', () => {
    // A 6-tile apex rise back onto the same floor is a hop, not a fall into lower ground. Without
    // the net-descent condition this would be flagged on every tall level.
    const hop = takeoff({ y: 190, apexY: 94, landingY: 190, viewTop: 0 })
    expect(unseenFalls([hop], VIEW_H, 400)).toEqual([])
  })
})
