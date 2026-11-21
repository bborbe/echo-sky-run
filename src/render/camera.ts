// The camera, as a pure value: it reads a player position and produces a scroll offset. Nothing here
// touches the DOM, so the framing is a unit test rather than a browser measurement.
//
// The camera FOLLOWS, and leans into the direction of travel. An earlier look-ahead pushed the view
// up to 30% of the screen ahead of a sprinting Pip and the operator rejected it ("the screen does now
// annoying things ... move in direction of the movement"); he later asked for a dialable version and
// chose 64 px by playing on 2026-11-21. The lean is `CAMERA_LEAD_X` scaled by speed and added to the
// focus the dead zone is measured against: full at a sprint, a fraction of it at a walk, and nothing
// once Pip stops — so the view shifts with Pip's speed rather than snapping when he turns.
import { PLAYER_W, SPRINT_MAX, TILE } from '../physics/constants.ts'

/** The logical view height is fixed at 14 tiles. */
export const VIEW_H = 224

/**
 * The logical view width for a window: the height is fixed at `VIEW_H`, so the width follows the
 * window's aspect and rounds to whole pixels. It lives beside `VIEW_H` rather than inside the
 * renderer so the level toolkit's blind-jump check measures the view the game actually draws,
 * instead of re-deriving the arithmetic and measuring a viewport that does not exist.
 */
export function logicalViewWidth(innerWidth: number, innerHeight: number): number {
  const scale = Math.max(innerHeight, 1) / VIEW_H
  return Math.max(TILE, Math.round(innerWidth / scale))
}

/**
 * The dead zone: Pip may drift this far either side of the view's centre before the camera follows.
 * It is the only thing that lets the camera rest, and it is symmetric — the camera stops at the same
 * place whether Pip walked into the edge from the left or the right.
 */
export const CAMERA_DEADZONE_X = 16

/** The camera scrolls vertically once Pip is this close to the top or bottom edge. */
export const CAMERA_MARGIN_Y = 48

/**
 * How far the camera leans into the direction of travel at a full sprint, in pixels. The operator
 * chose 64 by playing on 2026-11-21: the dead zone takes 16 of it, so the view reaches 48 px ahead of
 * its centre at a sprint — 12% of the 398 px view, well short of the 30%-of-screen version he
 * rejected, and visibly more than the 16 px that made "even 32" feel like nothing.
 * `?lead=<px>` dials it on a running build, and the debug overlay's LEAD row shows the live value.
 */
export const CAMERA_LEAD_X = 64

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high))
}

export class Camera {
  private viewW = VIEW_H
  /** The look-ahead at a full sprint, in pixels — `CAMERA_LEAD_X` unless a URL dialled it. */
  private readonly leadPx: number
  /** Left edge of the view, in world pixels. */
  x = 0
  /** Top edge of the view, in world pixels. */
  y = 0

  constructor(leadPx: number = CAMERA_LEAD_X) {
    this.leadPx = leadPx
  }

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
   * Follow Pip: a horizontal deadzone around the view centre, plus a vertical edge margin. Both axes
   * are clamped to the level so the view never shows past its edge.
   *
   * The horizontal focus is shifted by the look-ahead, scaled by `vx` against a sprint so it ramps in
   * with speed and fades out as Pip stops. `vx` defaults to 0 — no lean — which is what a still frame
   * (a preview, a spawn URL) and the toolkit's own framing want.
   */
  update(playerX: number, playerY: number, playerH: number, worldW: number, worldH: number, vx = 0): void {
    const lean = this.leadPx * clamp(vx / SPRINT_MAX, -1, 1)
    const focus = playerX + PLAYER_W / 2 + lean
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
