import { groundUnder, moveBox, type Box } from './collision.ts'
import {
  ACCEL,
  CORNER_CORRECTION_PX,
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
  PLATFORM_FRICTION,
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
  /** True when the ground under Pip is a ghost Echo rather than the level's tiles. */
  onPlatform: boolean
}

/**
 * A player box. `h` defaults to PLAYER_H so the physics tests keep a fixed box; the game passes the
 * current tier's height instead.
 */
export function createPlayer(x: number, y: number, h: number = PLAYER_H): PlayerState {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    h,
    meter: 0,
    grounded: false,
    coyote: 0,
    jumpBuffer: 0,
    hitCeiling: false,
    onPlatform: false,
  }
}

export const NO_INPUT: PlayerInput = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  sprint: false,
}

/** One shared box for the player's own move and ground probe, so the 60 Hz step allocates nothing. */
const PLAYER_BOX = { x: 0, y: 0, w: PLAYER_W, h: PLAYER_H }

interface CornerFix {
  readonly x: number
  readonly y: number
  readonly hitLeft: boolean
  readonly hitRight: boolean
}

/**
 * Slip a rising Pip past a ceiling corner: try a sideways nudge of 1..CORNER_CORRECTION_PX in each
 * direction and take the first that lets the head rise. Null when nothing within the budget frees
 * it, so a real head bump stays a bump. The nudge is bounded by the platformer guide's 4 px, which
 * is why this cannot tunnel through a gap the level meant to be solid.
 */
function ceilingCornerFix(
  startX: number,
  startY: number,
  vx: number,
  vy: number,
  h: number,
  map: TileMap,
  platforms: readonly Box[],
): CornerFix | null {
  const probe = { x: startX, y: startY, w: PLAYER_W, h }
  for (let k = 1; k <= CORNER_CORRECTION_PX; k++) {
    for (const dx of [k, -k]) {
      const moved = moveBox(probe, vx + dx, vy, map, platforms)
      // `moved` is reused, so copy the fields out before the next probe overwrites them.
      if (!moved.hitTop) return { x: moved.x, y: moved.y, hitLeft: moved.hitLeft, hitRight: moved.hitRight }
    }
  }
  return null
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

  // An Echo grips harder than the level's tiles, so a landing at speed stops on the platform instead
  // of sliding off the end of it.
  const friction = s.onPlatform ? PLATFORM_FRICTION : FRICTION

  if (dir !== 0) {
    s.vx += dir * ACCEL
    if (Math.abs(s.vx) > maxSpeed) s.vx = Math.sign(s.vx) * maxSpeed
  } else if (Math.abs(s.vx) <= friction) {
    s.vx = 0
  } else {
    s.vx -= Math.sign(s.vx) * friction
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
  const startX = s.x
  const startY = s.y
  PLAYER_BOX.x = startX
  PLAYER_BOX.y = startY
  PLAYER_BOX.h = s.h
  const moved = moveBox(PLAYER_BOX, s.vx, s.vy, map, platforms)
  let nextX = moved.x
  let nextY = moved.y
  let hitLeft = moved.hitLeft
  let hitRight = moved.hitRight
  let hitTop = moved.hitTop
  const hitBottom = moved.hitBottom

  // --- corner correction: a rising jump that clips a ceiling corner by a few pixels slips past it
  if (hitTop && s.vy < 0) {
    const fix = ceilingCornerFix(startX, startY, s.vx, s.vy, s.h, map, platforms)
    if (fix !== null) {
      nextX = fix.x
      nextY = fix.y
      hitLeft = fix.hitLeft
      hitRight = fix.hitRight
      hitTop = false
    }
  }

  s.x = nextX
  s.y = nextY
  s.hitCeiling = hitTop
  if (hitLeft || hitRight) s.vx = 0
  if (hitTop || hitBottom) s.vy = 0

  // --- ground state and the two timers
  PLAYER_BOX.x = s.x
  PLAYER_BOX.y = s.y
  PLAYER_BOX.h = s.h
  const ground = groundUnder(PLAYER_BOX, map, platforms)
  s.grounded = ground !== 'none'
  s.onPlatform = ground === 'platform'
  if (s.grounded) s.coyote = COYOTE_F
  else if (s.coyote > 0) s.coyote -= 1

  if (s.jumpBuffer > 0) s.jumpBuffer -= 1

  return s
}
