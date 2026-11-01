import { describe, expect, it } from 'vitest'
import { PLAYER_W, SPRINT_MAX, TILE } from '../physics/constants.ts'
import { Camera, CAMERA_DEADZONE_X } from './camera.ts'

const WORLD_W = 400 * TILE
const WORLD_H = 14 * TILE

/** Where Pip's centre sits on screen, in logical pixels. */
function playerScreenX(playerX: number, cameraX: number): number {
  return playerX + PLAYER_W / 2 - cameraX
}

/** Walk the camera along a straight line of player positions and report where it ended up. */
function sweep(viewW: number, fromX: number, toX: number, step: number): { cameraX: number; playerX: number } {
  const camera = new Camera()
  camera.setViewWidth(viewW)
  let last = fromX
  for (let x = fromX; step > 0 ? x <= toX : x >= toX; x += step) {
    last = x
    camera.update(x, 100, 14, WORLD_W, WORLD_H)
  }
  return { cameraX: camera.x, playerX: last }
}

describe('camera framing', () => {
  it('does not shift the view ahead of the direction of travel', () => {
    // The operator rejected a look-ahead that pushed the view up to 30% of the screen ahead of a
    // sprint. The offset must come from Pip's POSITION only, so arriving from the left and arriving
    // from the right land in the same dead-zone band around the view centre.
    for (const viewW of [224, 398, 800]) {
      for (const step of [1, SPRINT_MAX]) {
        const fromLeft = sweep(viewW, 40 * TILE, 200 * TILE, step)
        const fromRight = sweep(viewW, 360 * TILE, 200 * TILE, -step)

        for (const { cameraX, playerX } of [fromLeft, fromRight]) {
          const screen = playerScreenX(playerX, cameraX)
          // The camera follows in whole frames, so Pip can sit up to one step past the dead-zone
          // edge — but never anywhere near the leading edge of the view.
          expect(Math.abs(screen - viewW / 2)).toBeLessThanOrEqual(CAMERA_DEADZONE_X + step + 1e-6)
        }

        // The two histories differ by at most the dead-zone band — never by a fraction of the view.
        expect(Math.abs(fromLeft.cameraX - fromRight.cameraX)).toBeLessThanOrEqual(
          2 * CAMERA_DEADZONE_X + 2 * step + 1e-6,
        )
      }
    }
  })

  it('holds still while Pip is inside the dead zone', () => {
    const camera = new Camera()
    camera.setViewWidth(398)
    // Both positions sit inside the dead zone around the view centre, so neither may scroll.
    camera.update(190, 100, 14, WORLD_W, WORLD_H)
    expect(camera.x).toBe(0)
    camera.update(200, 100, 14, WORLD_W, WORLD_H)
    expect(camera.x).toBe(0)
  })

  it('does not lurch when Pip turns around', () => {
    const camera = new Camera()
    camera.setViewWidth(398)

    let x = 200 * TILE
    for (let i = 0; i < 200; i++) camera.update((x += SPRINT_MAX), 100, 14, WORLD_W, WORLD_H)
    const before = camera.x

    for (let i = 0; i < 10; i++) camera.update((x -= SPRINT_MAX), 100, 14, WORLD_W, WORLD_H)

    // Ten frames at 3 px/f move Pip 30 px; the camera may follow that, never jump past it.
    expect(Math.abs(camera.x - before)).toBeLessThanOrEqual(10 * SPRINT_MAX)
  })

  it('does not scroll past the level edges', () => {
    const camera = new Camera()
    camera.setViewWidth(398)
    camera.update(0, 100, 14, WORLD_W, WORLD_H)
    expect(camera.x).toBe(0)

    for (let i = 0; i < 4000; i++) camera.update(WORLD_W - 1, 100, 14, WORLD_W, WORLD_H)
    expect(camera.x).toBe(WORLD_W - 398)
  })
})
