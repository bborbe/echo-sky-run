/**
 * The blind-jump check: a jump is blind when the spot it lands on is outside the view the player had
 * when he took off. He cannot see where he is going, so the jump is luck rather than a read — the
 * named failure for level design ([[Exceptional Platformer Design Guide]] dimension 4).
 *
 * Measured against the real `Camera` and the real view width, at the smallest viewport an agent
 * drives: a wider window shows more of the level, so 960×540 is the worst case.
 */

import { PLAYER_W } from '../physics/constants.ts'
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
