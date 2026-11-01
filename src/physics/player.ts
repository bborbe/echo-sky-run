import { isGrounded, moveBox, type Box } from './collision.ts'
import {
  ACCEL,
  COYOTE_F,
  FRICTION,
  GRAVITY_FALL,
  GRAVITY_HELD,
  JUMP_BUFFER_F,
  JUMP_V,
  JUMP_V_SPRINT,
  MAX_FALL,
  METER_GAIN,
  METER_MAX,
  PLAYER_H,
  PLAYER_W,
  RUN_MAX,
  SPRINT_MAX,
} from './constants.ts'
import type { TileMap } from './tilemap.ts'

export interface PlayerInput {
  readonly left: boolean
  readonly right: boolean
  /** Jump held this frame — the variable jump reads the hold, not the press. */
  readonly jump: boolean
  /** Jump went down this frame only. */
  readonly jumpPressed: boolean
  readonly sprint: boolean
}

export interface PlayerState {
  x: number
  y: number
  vx: number
  vy: number
  /** Hitbox height, which depends on the power tier: 14 small, 26 super. */
  h: number
  /** P-meter, 0..METER_MAX. Full unlocks the sprint speed. */
  meter: number
  grounded: boolean
  /** Frames of jump grace left after leaving the ground. */
  coyote: number
  /** Frames a jump press stays remembered while airborne. */
  jumpBuffer: number
  /** Set the frame the head met a ceiling — the caller uses it to trigger a ? block. */
  hitCeiling: boolean
}

/**
 * A player box. `h` defaults to PLAYER_H so the physics tests keep a fixed box; the game passes the
 * current tier's height instead.
 */
export function createPlayer(x: number, y: number, h: number = PLAYER_H): PlayerState {
  return { x, y, vx: 0, vy: 0, h, meter: 0, grounded: false, coyote: 0, jumpBuffer: 0, hitCeiling: false }
}

export const NO_INPUT: PlayerInput = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  sprint: false,
}

/**
 * Advance the player one fixed step. Mutates and returns `state`; the simulation is a plain fold over
 * this function, which is what makes it deterministic for identical input sequences.
 */
export function stepPlayer(
  s: PlayerState,
  input: PlayerInput,
  map: TileMap,
  platforms: readonly Box[] = [],
): PlayerState {
  if (input.jumpPressed) s.jumpBuffer = JUMP_BUFFER_F

  // --- horizontal: accelerate toward the cap, or friction down to a stop
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const sprinting = input.sprint && s.meter >= METER_MAX
  const maxSpeed = sprinting ? SPRINT_MAX : RUN_MAX

  if (dir !== 0) {
    s.vx += dir * ACCEL
    if (Math.abs(s.vx) > maxSpeed) s.vx = Math.sign(s.vx) * maxSpeed
  } else if (Math.abs(s.vx) <= FRICTION) {
    s.vx = 0
  } else {
    s.vx -= Math.sign(s.vx) * FRICTION
  }

  // --- the P-meter fills only while running at max speed
  if (Math.abs(s.vx) >= RUN_MAX) {
    s.meter = Math.min(METER_MAX, s.meter + METER_GAIN)
  }

  // --- jump: a buffered press fires on the ground or inside the coyote window
  if (s.jumpBuffer > 0 && (s.grounded || s.coyote > 0)) {
    s.vy = -(sprinting ? JUMP_V_SPRINT : JUMP_V)
    s.grounded = false
    s.coyote = 0
    s.jumpBuffer = 0
  }

  // --- gravity: holding jump while rising halves it, which is the whole variable jump
  const gravity = s.vy < 0 && input.jump ? GRAVITY_HELD : GRAVITY_FALL
  s.vy = Math.min(s.vy + gravity, MAX_FALL)

  // --- move, resolving each axis against the tile grid
  const moved = moveBox({ x: s.x, y: s.y, w: PLAYER_W, h: s.h }, s.vx, s.vy, map, platforms)
  s.x = moved.x
  s.y = moved.y
  s.hitCeiling = moved.hitTop
  if (moved.hitLeft || moved.hitRight) s.vx = 0
  if (moved.hitTop || moved.hitBottom) s.vy = 0

  // --- ground state and the two timers
  s.grounded = isGrounded({ x: s.x, y: s.y, w: PLAYER_W, h: s.h }, map, platforms)
  if (s.grounded) s.coyote = COYOTE_F
  else if (s.coyote > 0) s.coyote -= 1

  if (s.jumpBuffer > 0) s.jumpBuffer -= 1

  return s
}
