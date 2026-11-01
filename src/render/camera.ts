// The camera, as a pure value: it reads a player position and velocity and produces a scroll
// offset. Nothing here touches the DOM, so the look-ahead budget is a unit test rather than a
// browser measurement.
import { PLAYER_W, SPRINT_MAX } from '../physics/constants.ts'

/** The logical view height is fixed at 14 tiles. */
export const VIEW_H = 224

/** The camera lets Pip drift this far either side of the view's centre before it follows. */
export const CAMERA_DEADZONE_X = 16
/** The camera scrolls vertically once Pip is this close to the top or bottom edge. */
export const CAMERA_MARGIN_Y = 48

/**
 * How far the camera leads Pip at full sprint, as a fraction of the view width. At 0.30 a sprinting
 * Pip sits about 30% from the left edge, so roughly 70% of the view is ahead of him — the design
 * guide asks for at least 60% above 75% of max speed.
 */
export const CAMERA_LOOKAHEAD = 0.3

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high))
}

export class Camera {
  private viewW = VIEW_H
  /** Left edge of the view, in world pixels. */
  x = 0
  /** Top edge of the view, in world pixels. */
  y = 0

  /** Current logical view width in pixels. */
  get width(): number {
    return this.viewW
  }

  setViewWidth(viewW: number): void {
    this.viewW = viewW
  }

  /** Reset to the level origin — used when a run restarts. */
  reset(): void {
    this.x = 0
    this.y = 0
  }

  /**
   * Follow Pip: a horizontal deadzone around the view centre, shifted by a speed-proportional
   * look-ahead so the player can see what he is running into, plus a vertical edge margin. Both
   * axes are clamped to the level so the view never shows past its edge.
   */
  update(playerX: number, playerY: number, playerH: number, vx: number, worldW: number, worldH: number): void {
    // The look-ahead is a fraction of the view, so the budget holds at every window aspect rather
    // than only the one it was tuned on.
    const lookAhead = clamp(vx / SPRINT_MAX, -1, 1) * this.viewW * CAMERA_LOOKAHEAD
    const focus = playerX + PLAYER_W / 2 + lookAhead
    const viewCentre = this.x + this.viewW / 2

    let wantX = this.x
    if (focus > viewCentre + CAMERA_DEADZONE_X) wantX = focus - CAMERA_DEADZONE_X - this.viewW / 2
    else if (focus < viewCentre - CAMERA_DEADZONE_X) wantX = focus + CAMERA_DEADZONE_X - this.viewW / 2
    this.x = clamp(wantX, 0, Math.max(0, worldW - this.viewW))

    const top = playerY
    const bottom = playerY + playerH
    let wantY = this.y
    if (bottom > this.y + VIEW_H - CAMERA_MARGIN_Y) wantY = bottom - (VIEW_H - CAMERA_MARGIN_Y)
    else if (top < this.y + CAMERA_MARGIN_Y) wantY = top - CAMERA_MARGIN_Y
    this.y = clamp(wantY, 0, Math.max(0, worldH - VIEW_H))
  }
}

/** The fraction of the view width that lies ahead of Pip's front edge. The budget's own quantity. */
export function aheadFraction(viewW: number, playerX: number, cameraX: number): number {
  return (cameraX + viewW - (playerX + PLAYER_W)) / viewW
}
