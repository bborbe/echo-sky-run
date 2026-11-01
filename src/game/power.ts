// Power tiers and the Mushroom, from the game description § 4 and § 5. Pure: no DOM, no clock.

import { moveBox, type Box } from '../physics/collision.ts'
import { EPS, GRAVITY_FALL, MAX_FALL, SMALL_H, SMALL_W, SUPER_H, SUPER_W } from '../physics/constants.ts'
import type { TileMap } from '../physics/tilemap.ts'

export type PowerTier = 'small' | 'super'

export const MUSHROOM_W = 16
export const MUSHROOM_H = 16
/** A mushroom walks at 1 px/f — twice an enemy's walk, so it gets away from the block it came from. */
export const MUSHROOM_SPEED = 1
/** Frames of invincibility after a hit. */
export const INVULN_F = 90

/** Pip's hitbox height for a tier. */
export function heightOf(tier: PowerTier): number {
  return tier === 'super' ? SUPER_H : SMALL_H
}

/** Pip's hitbox width for a tier. Both tiers are 12 px wide; the constant exists so callers never
 *  reach for a literal. */
export function widthOf(tier: PowerTier): number {
  return tier === 'super' ? SUPER_W : SMALL_W
}

/**
 * The y that keeps Pip's feet planted when his box changes height. Growing has to move him *up* by
 * the difference, or he would grow into the floor and be pushed out of it.
 */
export function yAfterResize(y: number, oldH: number, newH: number): number {
  return y + oldH - newH
}

/**
 * What a hit does. Super drops to Small and survives; Small is death. The caller owns what death
 * means — respawn, score, and ending the run's Echoes.
 */
export function applyHit(tier: PowerTier): { tier: PowerTier; died: boolean } {
  if (tier === 'super') return { tier: 'small', died: false }
  return { tier: 'small', died: true }
}

export interface Mushroom {
  x: number
  y: number
  vx: number
  vy: number
}

export interface PowerField {
  mushrooms: Mushroom[]
}

export function createPowerField(): PowerField {
  return { mushrooms: [] }
}

/** A mushroom that has just popped out of a block. It starts moving away from the block. */
export function spawnMushroom(x: number, y: number, dir: -1 | 1 = 1): Mushroom {
  return { x, y, vx: dir * MUSHROOM_SPEED, vy: 0 }
}

/** True when the two boxes overlap on both axes. Touching exactly does not count. */
function overlaps(a: Box, b: Box): boolean {
  return a.x + a.w > b.x + EPS && a.x < b.x + b.w - EPS && a.y + a.h > b.y + EPS && a.y < b.y + b.h - EPS
}

/** Walk every mushroom one fixed step: gravity, tile collision, and a turn at each wall. */
export function stepMushrooms(field: PowerField, map: TileMap): void {
  for (const m of field.mushrooms) {
    m.vy = Math.min(m.vy + GRAVITY_FALL, MAX_FALL)
    const moved = moveBox({ x: m.x, y: m.y, w: MUSHROOM_W, h: MUSHROOM_H }, m.vx, m.vy, map)
    m.x = moved.x
    m.y = moved.y
    if (moved.hitLeft || moved.hitRight) m.vx = -m.vx
    if (moved.hitTop || moved.hitBottom) m.vy = 0
  }
}

/** Remove and count the mushrooms Pip is standing in. */
export function collectMushrooms(field: PowerField, player: Box): number {
  const before = field.mushrooms.length
  field.mushrooms = field.mushrooms.filter((m) => !overlaps(player, { x: m.x, y: m.y, w: MUSHROOM_W, h: MUSHROOM_H }))
  return before - field.mushrooms.length
}
