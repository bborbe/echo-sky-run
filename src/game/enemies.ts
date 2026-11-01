// Ground enemies for level 1-1, from the game description § 4 and § 5. Pure: nothing here reads the
// DOM, a clock or a random source, so the level's own test and the browser drive the same rules.

import { moveBox, type Box } from '../physics/collision.ts'
import { EPS, GRAVITY_FALL, MAX_FALL, TILE } from '../physics/constants.ts'
import type { TileMap } from '../physics/tilemap.ts'

/** Gear-Goomba is one tile square. */
export const GEAR_GOOMBA_W = 16
export const GEAR_GOOMBA_H = 16
/** Steam-Turtle is a tile wide and a tile and a half tall. */
export const STEAM_TURTLE_W = 16
export const STEAM_TURTLE_H = 24
/** A stomped turtle shrinks to a shell, which sits on the same ground. */
export const SHELL_W = 16
export const SHELL_H = 16

/** Every ground enemy in 1-1 walks at half a pixel per frame. */
export const ENEMY_WALK_SPEED = 0.5
/** A kicked shell slides at 3 px/f — six times its owner's walk, so it is a projectile, not a walker. */
export const SHELL_SPEED = 3

/**
 * Feet inside this band below an enemy's top edge count as a stomp rather than a side hit. Without
 * the band a player who lands a frame late reads as a side collision and takes the damage instead.
 */
export const STOMP_TOLERANCE = 8
/** The upward velocity a stomp gives Pip. */
export const STOMP_BOUNCE = 4.5

export type EnemyKind = 'gear-goomba' | 'steam-turtle'
/**
 * `walk` is a live enemy, `shell` a stomped turtle at rest, `sliding` a shell kicked into motion, and
 * `carried` a shell in Pip's hands — which follows him and collides with nothing.
 */
export type EnemyMode = 'walk' | 'shell' | 'sliding' | 'carried'

export interface Enemy {
  readonly kind: EnemyKind
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  mode: EnemyMode
  /** Set the frame the enemy leaves play; the field drops it before returning. */
  dead: boolean
}

export interface EnemyField {
  enemies: Enemy[]
  /** The shell Pip carries, or null. A reference, not an index: the list is filtered every frame. */
  carried: Enemy | null
}

/** What a frame of enemy movement did to Pip, so the caller can apply the player's own rules. */
export interface EnemyEvents {
  /** Enemies stomped this frame — the caller bounces Pip and scores them. */
  readonly stomped: Enemy[]
  /** True when a live enemy touched Pip anywhere but its top. The caller applies the damage rule. */
  readonly hit: boolean
}

/**
 * The frame's enemy events, reused. The performance budget allows no per-frame allocation, and the
 * caller reads the events before the next step overwrites them.
 */
const STOMPED: Enemy[] = []
const EVENTS: { stomped: Enemy[]; hit: boolean } = { stomped: STOMPED, hit: false }

export function createEnemyField(): EnemyField {
  return { enemies: [], carried: null }
}

/** A live enemy of this kind, with its top-left at (x, y). It starts walking toward `dir`. */
export function createEnemy(kind: EnemyKind, x: number, y: number, dir: -1 | 1 = -1): Enemy {
  const w = kind === 'gear-goomba' ? GEAR_GOOMBA_W : STEAM_TURTLE_W
  const h = kind === 'gear-goomba' ? GEAR_GOOMBA_H : STEAM_TURTLE_H
  return { kind, x, y, vx: dir * ENEMY_WALK_SPEED, vy: 0, w, h, mode: 'walk', dead: false }
}

/** The enemy's collision box. */
export function enemyBox(e: Enemy): Box {
  return { x: e.x, y: e.y, w: e.w, h: e.h }
}

/** True when the two boxes overlap on both axes. Touching exactly does not count. */
export function overlaps(a: Box, b: Box): boolean {
  return a.x + a.w > b.x + EPS && a.x < b.x + b.w - EPS && a.y + a.h > b.y + EPS && a.y < b.y + b.h - EPS
}

/**
 * A stomp is a downward move whose feet land in the top band of the enemy. The downward check is
 * load-bearing: without it a player rising through an enemy from below would count as a stomp.
 */
export function stomps(player: Box, playerVy: number, e: Enemy): boolean {
  if (playerVy <= 0) return false
  if (e.mode === 'carried' || e.dead) return false
  const feet = player.y + player.h
  if (feet < e.y || feet > e.y + STOMP_TOLERANCE) return false
  return player.x + player.w > e.x + EPS && player.x < e.x + e.w - EPS
}

/** Turn a stomped turtle into a resting shell, keeping its feet on the ground it already stood on. */
function toShell(e: Enemy): void {
  e.y += e.h - SHELL_H
  e.w = SHELL_W
  e.h = SHELL_H
  e.mode = 'shell'
  e.vx = 0
}

/**
 * Advance every enemy one fixed step and resolve what each did to Pip. Mutates the field.
 *
 * A carried shell is pinned above Pip's head and touches nothing. A sliding shell kills the walkers
 * it runs into and reverses off a wall. A stomp flattens a Gear-Goomba and turns a Steam-Turtle into
 * a resting shell; stomping a shell stops it dead.
 */
export function stepEnemies(field: EnemyField, player: Box, playerVy: number, map: TileMap): EnemyEvents {
  // --- 1. move everything that moves on its own
  for (const e of field.enemies) {
    if (e.mode === 'carried') {
      e.x = player.x
      e.y = player.y - e.h
      e.vx = 0
      e.vy = 0
      continue
    }

    e.vy = Math.min(e.vy + GRAVITY_FALL, MAX_FALL)
    const moved = moveBox(enemyBox(e), e.vx, e.vy, map)
    e.x = moved.x
    e.y = moved.y

    if (moved.hitLeft || moved.hitRight) {
      // A walker turns at a wall; a sliding shell keeps its speed and reverses.
      e.vx = e.mode === 'sliding' ? -e.vx : -Math.sign(e.vx) * ENEMY_WALK_SPEED
    }
    if (moved.hitTop || moved.hitBottom) e.vy = 0

    // An enemy that walks off a ledge would otherwise fall forever and be iterated every frame as
    // an invisible body. The same bound that kills Pip kills it.
    if (e.y > map.rows * TILE) e.dead = true
  }

  // --- 2. a sliding shell is a projectile: it kills the walkers it runs into
  for (const shell of field.enemies) {
    if (shell.mode !== 'sliding' || shell.dead) continue
    for (const other of field.enemies) {
      if (other === shell || other.dead) continue
      if (other.mode === 'carried' || other.mode === 'sliding') continue
      if (overlaps(enemyBox(shell), enemyBox(other))) other.dead = true
    }
  }

  // --- 3. what each surviving enemy does to Pip, tested against its position this frame
  STOMPED.length = 0
  let hit = false

  for (const e of field.enemies) {
    if (e.dead || e.mode === 'carried') continue

    if (stomps(player, playerVy, e)) {
      STOMPED.push(e)
      if (e.kind === 'gear-goomba') e.dead = true
      else toShell(e)
      continue
    }

    // A resting shell is an object to pick up or kick, not a hazard — the caller handles it through
    // touchShell. Only a sliding shell hurts on contact.
    if (e.mode === 'shell') continue

    if (overlaps(player, enemyBox(e))) hit = true
  }

  // Compact in place rather than filtering: `filter` builds a new array every frame, and the
  // performance budget allows no per-frame allocation.
  let live = 0
  for (const e of field.enemies) if (!e.dead) field.enemies[live++] = e
  field.enemies.length = live

  EVENTS.hit = hit
  return EVENTS
}

/**
 * Handle Pip touching a resting shell. With the run key held he picks it up; without it he kicks it
 * away from the side he is standing on. Returns true when a shell was taken, so the caller can skip
 * the damage rule for that frame.
 */
export function touchShell(field: EnemyField, player: Box, facing: -1 | 1, carryHeld: boolean): boolean {
  if (field.carried !== null) return false
  for (const e of field.enemies) {
    if (e.mode !== 'shell' || !overlaps(player, enemyBox(e))) continue
    if (carryHeld) {
      e.mode = 'carried'
      field.carried = e
    } else {
      e.mode = 'sliding'
      e.vx = facing * SHELL_SPEED
    }
    return true
  }
  return false
}

/** Let go of the carried shell: it keeps sliding the way Pip faces. */
export function dropShell(field: EnemyField, facing: -1 | 1): void {
  const e = field.carried
  if (e === null) return
  e.mode = 'sliding'
  e.vx = facing * SHELL_SPEED
  field.carried = null
}
