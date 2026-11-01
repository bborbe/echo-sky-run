// Physics tuning, from the Echo Sky Run game description § 5 (Super Mario World derived).
// Every value is per frame at the fixed 60 Hz step: time enters the simulation only as DT, and no
// module under src/physics/ may read a clock, a random source or the DOM.

/** The fixed simulation step, in seconds. */
export const DT = 1 / 60

/** Tile edge in logical pixels. The canvas is 256x224, i.e. 16x14 tiles. */
export const TILE = 16

/** Player hitbox in logical pixels. */
export const PLAYER_W = 12
export const PLAYER_H = 16

export const WALK_MAX = 1.25
export const RUN_MAX = 2.25
export const SPRINT_MAX = 3.0

/** The P-meter: 0..112, +2 per frame while running at max speed. */
export const METER_MAX = 112
export const METER_GAIN = 2

export const ACCEL = 0.09375
export const FRICTION = 0.0625

/** Gravity while rising with jump held, and in every other case. The pair is the variable jump. */
export const GRAVITY_HELD = 0.1875
export const GRAVITY_FALL = 0.375
export const MAX_FALL = 4

export const JUMP_V = 5.0
export const JUMP_V_SPRINT = 5.75

/** Frames after leaving the ground in which a jump still counts. */
export const COYOTE_F = 6
/** Frames a jump press is remembered while airborne, waiting for the ground. */
export const JUMP_BUFFER_F = 6

/** Float tolerance for tile-edge comparisons. */
export const EPS = 1e-9
