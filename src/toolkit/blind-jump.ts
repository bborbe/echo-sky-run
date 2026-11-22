/**
 * The blind-jump check: a jump is blind when the spot it lands on is outside the view the player had
 * when he took off. He cannot see where he is going, so the jump is luck rather than a read — the
 * named failure for level design ([[Exceptional Platformer Design Guide]] dimension 4).
 *
 * Measured against the real `Camera` and the real view width, at the smallest viewport an agent
 * drives: a wider window shows more of the level, so 960×540 is the worst case.
 */

import { PLAYER_W, TILE } from '../physics/constants.ts'
import type { Takeoff } from './autopilot.ts'

export interface BlindJump {
  readonly frame: number
  readonly takeoffX: number
  readonly landingX: number
  /** The view the jump was made from, in world pixels. */
  readonly viewLeft: number
  readonly viewRight: number
}

/**
 * Every jump in `takeoffs` whose landing sits outside the view at take-off. A jump that never landed
 * is not a blind jump — it is a death, and the autopilot's own zero-death assertion owns that.
 */
export function blindJumps(takeoffs: readonly Takeoff[], viewWidth: number): BlindJump[] {
  const found: BlindJump[] = []
  for (const takeoff of takeoffs) {
    if (takeoff.landingX === null) continue
    const viewLeft = takeoff.viewLeft
    const viewRight = viewLeft + viewWidth
    const visible = takeoff.landingX >= viewLeft && takeoff.landingX + PLAYER_W <= viewRight
    if (visible) continue
    found.push({
      frame: takeoff.frame,
      takeoffX: takeoff.x,
      landingX: takeoff.landingX,
      viewLeft,
      viewRight,
    })
  }
  return found
}

/** A fall of at least this many tiles from the apex is "long" — a drop the player has to read. */
export const LONG_FALL_TILES = 5
/** On a long fall, this many tiles below the landing must be visible before touchdown. */
export const FALL_VISIBLE_TILES = 5

export interface UnseenFall {
  readonly frame: number
  readonly takeoffY: number
  readonly landingY: number
  /** The lowest world y the view showed at take-off. */
  readonly viewBottom: number
  /** The world y the check required the view to reach. */
  readonly requiredBottom: number
}

/**
 * The second half of check E: a long fall must show at least five tiles below the landing before the
 * player commits to it, so a drop is a read rather than a guess. A landing near the level floor has
 * fewer than five tiles below it in the world; there the bar is the floor itself, which is the
 * deepest thing there is to see.
 *
 * `levelBottom` is the level's own bottom edge (`rows × TILE`), so the requirement never asks for
 * space the world does not have.
 */
export function unseenFalls(
  takeoffs: readonly Takeoff[],
  viewHeight: number,
  levelBottom: number,
): UnseenFall[] {
  const found: UnseenFall[] = []
  for (const takeoff of takeoffs) {
    if (takeoff.landingY === null) continue
    // The drop starts at the apex, not the take-off point: a jump that rises first falls further
    // than its net displacement. But a normal jump also rises and falls, and it lands back on the
    // ground it left — that is a hop, not a fall into lower ground. Requiring a net descent keeps
    // the check on drops and off every ordinary jump on a tall level.
    const apexDrop = takeoff.landingY - takeoff.apexY
    const netDrop = takeoff.landingY - takeoff.y
    if (apexDrop < LONG_FALL_TILES * TILE || netDrop < TILE) continue
    const requiredBottom = Math.min(takeoff.landingY + FALL_VISIBLE_TILES * TILE, levelBottom)
    const viewBottom = takeoff.viewTop + viewHeight
    if (viewBottom >= requiredBottom) continue
    found.push({
      frame: takeoff.frame,
      takeoffY: takeoff.y,
      landingY: takeoff.landingY,
      viewBottom,
      requiredBottom,
    })
  }
  return found
}
