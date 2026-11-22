// Pistons and windmills, from the game description § 4 and § 5. Both move on the fixed 60 Hz step
// from a fixed per-level phase, so the same frame number always yields the same extension or angle —
// that determinism is what the headless sim test asserts.

import type { Box } from '../physics/collision.ts'

export const PISTON_W = 32
export const PISTON_H = 32
/** A piston extends 48 px at full reach. */
export const PISTON_EXTEND_PX = 48
/** One 2 s cycle: 1 s out, 1 s in. */
export const PISTON_CYCLE_F = 120
export const PISTON_HALF_F = 60

export const WINDMILL_W = 48
export const WINDMILL_H = 48
/** Blades turn once per 3 s. */
export const WINDMILL_CYCLE_F = 180
/** The solid hub radius, in px. */
export const WINDMILL_HUB_R = 8
/** A blade reaches this far from the centre. */
export const WINDMILL_BLADE_R = 24
/** Half-width of a blade's hazard wedge. */
export const WINDMILL_BLADE_HALF_ANGLE = Math.PI / 12

export type PropKind = 'piston' | 'windmill'

export interface Prop {
  readonly kind: PropKind
  x: number
  y: number
  w: number
  h: number
  /** Fixed per-level phase offset, in frames. */
  readonly phase: number
}

export interface PropField {
  props: Prop[]
}

export function createPropField(): PropField {
  return { props: [] }
}

export function createPiston(x: number, y: number, phase = 0): Prop {
  return { kind: 'piston', x, y, w: PISTON_W, h: PISTON_H, phase }
}

export function createWindmill(x: number, y: number, phase = 0): Prop {
  return { kind: 'windmill', x, y, w: WINDMILL_W, h: WINDMILL_H, phase }
}

/** The frame's position in the prop's own cycle, always in [0, period). */
function cycle(frame: number, phase: number, period: number): number {
  return (((frame + phase) % period) + period) % period
}

/** Piston extension in px: 0→48 over the first second, 48→0 over the second. */
export function pistonExtension(p: Prop, frame: number): number {
  const t = cycle(frame, p.phase, PISTON_CYCLE_F)
  return t <= PISTON_HALF_F
    ? (t / PISTON_HALF_F) * PISTON_EXTEND_PX
    : ((PISTON_CYCLE_F - t) / PISTON_HALF_F) * PISTON_EXTEND_PX
}

/** Solid only when fully extended. */
export function pistonSolid(p: Prop, frame: number): boolean {
  return pistonExtension(p, frame) >= PISTON_EXTEND_PX - 1e-9
}

/** Crushes while extending, before it reaches full reach. */
export function pistonCrushing(p: Prop, frame: number): boolean {
  const t = cycle(frame, p.phase, PISTON_CYCLE_F)
  return t > 0 && t < PISTON_HALF_F
}

/** The piston's collision box: its base grown by however far it has extended. */
export function pistonBox(p: Prop, frame: number): Box {
  return { x: p.x, y: p.y, w: p.w, h: p.h + pistonExtension(p, frame) }
}

/** Blade angle in radians, one full turn per 3 s. */
export function windmillAngle(p: Prop, frame: number): number {
  return (2 * Math.PI * cycle(frame, p.phase, WINDMILL_CYCLE_F)) / WINDMILL_CYCLE_F
}

/** The hub, which is solid ground. */
export function windmillHubBox(p: Prop): Box {
  return {
    x: p.x + p.w / 2 - WINDMILL_HUB_R,
    y: p.y + p.h / 2 - WINDMILL_HUB_R,
    w: WINDMILL_HUB_R * 2,
    h: WINDMILL_HUB_R * 2,
  }
}

/**
 * True when `box` touches a spinning blade: outside the hub, inside the blade radius, and within a
 * blade's wedge. The hub is solid ground, not a hazard, so a box inside it is not hit.
 */
export function windmillBladeHits(p: Prop, frame: number, box: Box): boolean {
  const cx = p.x + p.w / 2
  const cy = p.y + p.h / 2
  const dx = box.x + box.w / 2 - cx
  const dy = box.y + box.h / 2 - cy
  const dist = Math.hypot(dx, dy)
  if (dist <= WINDMILL_HUB_R || dist > WINDMILL_BLADE_R) return false

  const angle = Math.atan2(dy, dx)
  const blade = windmillAngle(p, frame)
  for (let k = 0; k < 4; k++) {
    const a = blade + (k * Math.PI) / 2
    const diff = Math.abs(((angle - a + Math.PI) % (2 * Math.PI)) - Math.PI)
    if (diff <= WINDMILL_BLADE_HALF_ANGLE) return true
  }
  return false
}
