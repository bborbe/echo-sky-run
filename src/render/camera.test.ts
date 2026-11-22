import { describe, expect, it } from 'vitest'
import { ACCEL, PLAYER_W, SPRINT_MAX, TILE } from '../physics/constants.ts'
import { Camera, CAMERA_DEADZONE_X, CAMERA_LEAD_X, VIEW_H } from './camera.ts'

const WORLD_W = 400 * TILE
const WORLD_H = 14 * TILE

/** Where Pip's centre sits on screen, in logical pixels. */
function playerScreenX(playerX: number, cameraX: number): number {
  return playerX + PLAYER_W / 2 - cameraX
}

/**
 * Walk the camera along a straight line of player positions at a constant speed and report where it
 * ended up. The step is also the velocity each frame sees, so the look-ahead ramps with the speed.
 */
function sweep(
  viewW: number,
  fromX: number,
  toX: number,
  step: number,
  lead: number = CAMERA_LEAD_X,
): { cameraX: number; playerX: number } {
  const camera = new Camera(lead)
  camera.setViewWidth(viewW)
  let last = fromX
  for (let x = fromX; step > 0 ? x <= toX : x >= toX; x += step) {
    last = x
    camera.update(x, 100, 14, WORLD_W, WORLD_H, step)
  }
  return { cameraX: camera.x, playerX: last }
}

describe('camera framing', () => {
  it('leans into the direction of travel by default', () => {
    // The operator rejected a look-ahead that pushed the view up to 30% of the screen ahead of a
    // sprint, then chose 64 px by playing. So the default stays under that rejected ceiling, and at a
    // sprint Pip sits that far nearer the centre than the dead zone alone would leave him.
    expect(CAMERA_LEAD_X).toBeGreaterThan(0)
    expect(CAMERA_LEAD_X).toBeLessThan(0.3 * VIEW_H)

    for (const viewW of [224, 398, 800]) {
      const right = sweep(viewW, 40 * TILE, 200 * TILE, SPRINT_MAX)
      expect(playerScreenX(right.playerX, right.cameraX)).toBeCloseTo(
        viewW / 2 + CAMERA_DEADZONE_X - CAMERA_LEAD_X,
        6,
      )

      const left = sweep(viewW, 360 * TILE, 200 * TILE, -SPRINT_MAX)
      expect(playerScreenX(left.playerX, left.cameraX)).toBeCloseTo(
        viewW / 2 - CAMERA_DEADZONE_X + CAMERA_LEAD_X,
        6,
      )

      // The original guard, kept: arriving from the left and arriving from the right land in the same
      // dead-zone band — offset by the lead, never by a fraction of the view — and Pip stays inside
      // that band plus the lead and one follow step.
      expect(Math.abs(right.cameraX - left.cameraX)).toBeLessThanOrEqual(
        2 * Math.abs(CAMERA_DEADZONE_X - CAMERA_LEAD_X) + 2 * SPRINT_MAX,
      )
      for (const { cameraX, playerX } of [right, left]) {
        expect(Math.abs(playerScreenX(playerX, cameraX) - viewW / 2)).toBeLessThanOrEqual(
          CAMERA_DEADZONE_X + CAMERA_LEAD_X + SPRINT_MAX + 1e-6,
        )
      }
    }
  })

  it('takes a configured lead from the camera', () => {
    // `?lead=<px>` reaches the camera as its constructor value, so the framing has to follow it —
    // that is what lets the operator pick the number by playing rather than reading a test.
    const configured = CAMERA_LEAD_X / 2
    for (const viewW of [224, 398, 800]) {
      const right = sweep(viewW, 40 * TILE, 200 * TILE, SPRINT_MAX, configured)
      expect(playerScreenX(right.playerX, right.cameraX)).toBeCloseTo(
        viewW / 2 + CAMERA_DEADZONE_X - configured,
        6,
      )
    }
  })

  it('holds still while Pip is inside the dead zone', () => {
    const camera = new Camera()
    camera.setViewWidth(398)
    // Both positions sit inside the dead zone around the view centre, so neither may scroll. A
    // stopped Pip passes no velocity, so the look-ahead is zero and the band stays symmetric.
    camera.update(190, 100, 14, WORLD_W, WORLD_H)
    expect(camera.x).toBe(0)
    camera.update(200, 100, 14, WORLD_W, WORLD_H)
    expect(camera.x).toBe(0)
  })

  it('does not lurch when Pip turns around', () => {
    const camera = new Camera()
    camera.setViewWidth(398)

    // The speed ramps the way the simulation's does, not an instant sign flip: that is what makes a
    // turn safe at a large lead — the lean follows `vx` down through zero instead of jumping.
    let x = 200 * TILE
    let vx = SPRINT_MAX
    for (let i = 0; i < 200; i++) camera.update((x += SPRINT_MAX), 100, 14, WORLD_W, WORLD_H, (vx = Math.min(SPRINT_MAX, vx + ACCEL)))
    const before = camera.x

    for (let i = 0; i < 10; i++) camera.update((x -= SPRINT_MAX), 100, 14, WORLD_W, WORLD_H, (vx = Math.max(-SPRINT_MAX, vx - ACCEL)))

    // Ten frames at 3 px/f move Pip 30 px, and the lead eases down with the speed rather than
    // flipping; half the lead is the most it may add. A sign-flip implementation moves ~2× the lead
    // here and fails.
    expect(Math.abs(camera.x - before)).toBeLessThanOrEqual(10 * SPRINT_MAX + CAMERA_LEAD_X / 2)
  })

  it('does not scroll past the level edges', () => {
    const camera = new Camera()
    camera.setViewWidth(398)
    camera.update(0, 100, 14, WORLD_W, WORLD_H)
    expect(camera.x).toBe(0)

    for (let i = 0; i < 4000; i++) camera.update(WORLD_W - 1, 100, 14, WORLD_W, WORLD_H, SPRINT_MAX)
    expect(camera.x).toBe(WORLD_W - 398)
  })
})
