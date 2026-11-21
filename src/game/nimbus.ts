// Nimbus, the companion mount, from the game description § 4. Pure: it reads only boxes and frames,
// so the same rules run in a unit test and in the browser.

import type { Box } from '../physics/collision.ts'
import { EPS } from '../physics/constants.ts'
import { enemyBox, overlaps, STOMP_TOLERANCE, type EnemyField, type EnemyKind } from './enemies.ts'

export const NIMBUS_W = 16
export const NIMBUS_H = 16
/** While mounted and holding jump, the fall speed is capped at 1 px/f. */
export const NIMBUS_GLIDE_FALL = 1
/** A throw-off sends Nimbus away for 3 s. */
export const NIMBUS_FLEE_F = 180
/** A peck reaches 24 px in front of Pip. */
export const NIMBUS_PECK_PX = 24
/** Frames the peck's hitbox stays live, so a single press can land. */
export const NIMBUS_PECK_F = 8

export interface Nimbus {
  x: number
  y: number
  w: number
  h: number
  /** Frames left out of play; > 0 means it has fled. */
  flee: number
}

export interface NimbusField {
  /** The companion in the level, or null when the level has none. */
  nimbus: Nimbus | null
  /** True while Pip is riding it. */
  mounted: boolean
  /** Frames the peck hitbox stays live. */
  peck: number
}

export function createNimbusField(): NimbusField {
  return { nimbus: null, mounted: false, peck: 0 }
}

export function createNimbus(x: number, y: number): Nimbus {
  return { x, y, w: NIMBUS_W, h: NIMBUS_H, flee: 0 }
}

/**
 * A landing on Nimbus mounts it: a downward move whose feet land in its top band, the same shape a
 * stomp uses. Nimbus is not a hazard, so there is no damage on the way in.
 */
export function canMount(field: NimbusField, player: Box, playerVy: number): boolean {
  const n = field.nimbus
  if (field.mounted || n === null || n.flee > 0 || playerVy <= 0) return false
  const feet = player.y + player.h
  if (feet < n.y || feet > n.y + STOMP_TOLERANCE) return false
  return player.x + player.w > n.x + EPS && player.x < n.x + n.w - EPS
}

export function mountNimbus(field: NimbusField, player: Box, playerVy: number): boolean {
  if (!canMount(field, player, playerVy)) return false
  field.mounted = true
  return true
}

/** A spin jump (or any dismount) lets go. */
export function dismountNimbus(field: NimbusField): boolean {
  if (!field.mounted) return false
  field.mounted = false
  return true
}

/** Cap the fall at the glide speed while mounted and holding jump; otherwise leave it alone. */
export function glideFall(field: NimbusField, jumpHeld: boolean, vy: number): number {
  if (field.mounted && jumpHeld && vy > NIMBUS_GLIDE_FALL) return NIMBUS_GLIDE_FALL
  return vy
}

/** The peck's hitbox, 24 px in front of Pip at his own height. */
export function peckBox(player: Box, facing: -1 | 1): Box {
  return facing === 1
    ? { x: player.x + player.w, y: player.y + 4, w: NIMBUS_PECK_PX, h: player.h - 8 }
    : { x: player.x - NIMBUS_PECK_PX, y: player.y + 4, w: NIMBUS_PECK_PX, h: player.h - 8 }
}

export function startPeck(field: NimbusField): boolean {
  if (!field.mounted) return false
  field.peck = NIMBUS_PECK_F
  return true
}

/** Gear-Goombas and Gust-Wings are the enemies a peck defeats. */
export function peckDefeats(kind: EnemyKind): boolean {
  return kind === 'gear-goomba' || kind === 'gust-wing'
}

/** Run the live peck hitbox against the enemies; returns true when it defeated one. */
export function stepPeck(field: NimbusField, player: Box, facing: -1 | 1, enemies: EnemyField): boolean {
  if (field.peck <= 0) return false
  field.peck -= 1
  const box = peckBox(player, facing)
  let hit = false
  for (const e of enemies.enemies) {
    if (e.dead || e.mode === 'carried') continue
    if (!peckDefeats(e.kind)) continue
    if (overlaps(box, enemyBox(e))) {
      e.dead = true
      hit = true
    }
  }
  return hit
}

/** A hit while mounted throws Pip off and sends Nimbus fleeing; Pip takes no damage. */
export function throwOff(field: NimbusField): void {
  if (!field.mounted) return
  field.mounted = false
  if (field.nimbus !== null) field.nimbus.flee = NIMBUS_FLEE_F
}

/** Age the flee timer; Nimbus is absent from play until it reaches 0. */
export function stepNimbus(field: NimbusField): void {
  const n = field.nimbus
  if (n !== null && n.flee > 0) n.flee -= 1
}
