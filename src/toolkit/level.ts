/**
 * What the level toolkit reads off a level's tile grid before any check runs: where the pits are,
 * how far a sprint jump actually carries, and therefore which pits are Echo beats — the gaps wider
 * than a jump, which only a mid-air Echo can cross.
 *
 * Pure and DOM-free, like the physics it measures. Every distance here comes from the real
 * `stepPlayer`, never from a constant copied out of the tuning table: a reach measured against the
 * engine is the only one that stays true when a constant is retuned.
 */

import {
  METER_MAX,
  PLAYER_H,
  SMALL_H,
  SPRINT_MAX,
  SUPER_H,
  TILE,
} from '../physics/constants.ts'
import { createPlayer, stepPlayer } from '../physics/player.ts'
import { findTile, isSolid, parseLevel, SPAWN, tileAt, type TileMap } from '../physics/tilemap.ts'

/** A run of columns the player can fall out of. */
export interface Pit {
  readonly firstCol: number
  readonly lastCol: number
  /** Width in pixels: how far the player must carry himself to cross it. */
  readonly widthPx: number
}

/** What the toolkit needs from a level before it can check it. */
export interface LevelToolkitProfile {
  readonly id: string
  readonly rows: readonly string[]
  /**
   * Where this level's autopilot places its one Echo. Required when the level has an Echo beat —
   * `requireEchoAnswer` enforces that, so a later level cannot quietly ship without an answer to
   * its own gap.
   */
  readonly echoAtX: number | null
}

/** Pip's hitbox height for a power tier. */
export function tierHeight(tier: 'small' | 'super'): number {
  return tier === 'super' ? SUPER_H : SMALL_H
}

/** The row the player stands on in `col`, searching from `fromRow` down; null when there is none. */
function floorRow(map: TileMap, col: number, fromRow: number): number | null {
  for (let row = fromRow; row < map.rows; row++) if (isSolid(tileAt(map, col, row))) return row
  return null
}

/**
 * Every contiguous run of columns with no floor, from the spawn row to the bottom of the map. A
 * ledge above the spawn row does not count as floor: standing on it is optional, falling past it is
 * not.
 */
export function findPits(map: TileMap): Pit[] {
  const spawn = findTile(map, SPAWN)
  const fromRow = spawn === null ? 0 : Math.floor(spawn.y / TILE)

  const pits: Pit[] = []
  let first = -1
  for (let col = 0; col <= map.cols; col++) {
    const open = col < map.cols && floorRow(map, col, fromRow) === null
    if (open && first < 0) first = col
    if (!open && first >= 0) {
      pits.push({ firstCol: first, lastCol: col - 1, widthPx: (col - first) * TILE })
      first = -1
    }
  }
  return pits
}

/** The y of the floor's top edge in `col` — where a player standing there has his feet. */
export function floorTop(map: TileMap, col: number): number {
  const spawn = findTile(map, SPAWN)
  const fromRow = spawn === null ? 0 : Math.floor(spawn.y / TILE)
  const row = floorRow(map, col, fromRow)
  return row === null ? map.rows * TILE : row * TILE
}

/** A wide, flat floor for measuring a jump: one empty row above one solid row. */
const FLAT_COLS = 400
function flatMap(): TileMap {
  return parseLevel(['.'.repeat(FLAT_COLS), '#'.repeat(FLAT_COLS)])
}

/** The frames a measured jump may take before the measurement gives up. */
const MEASURE_FRAMES = 600

/**
 * The horizontal distance a sprint jump carries from flat ground, measured through `stepPlayer`.
 * This is the bar a pit must beat to be an Echo beat, and the sweep's own search radius.
 */
export function maxJumpReach(): number {
  const map = flatMap()
  const player = createPlayer(TILE, TILE - PLAYER_H)
  player.vx = SPRINT_MAX
  player.meter = METER_MAX
  player.grounded = true

  const startX = player.x
  let best = 0
  for (let frame = 0; frame < MEASURE_FRAMES; frame++) {
    stepPlayer(
      player,
      { left: false, right: true, jump: true, jumpPressed: frame === 0, sprint: true },
      map,
    )
    best = Math.max(best, player.x - startX)
    if (frame > 0 && player.grounded) break
  }
  return best
}

/** The pits wider than a sprint jump: the gaps only a mid-air Echo can cross. */
export function echoBeats(map: TileMap): Pit[] {
  const reach = maxJumpReach()
  return findPits(map).filter((pit) => pit.widthPx > reach)
}

/** The level's map, parsed once. */
export function profileMap(profile: LevelToolkitProfile): TileMap {
  return parseLevel(profile.rows)
}

/**
 * Refuse a level that has an Echo beat and no declared answer for it. The toolkit cannot invent the
 * spot, and an autopilot that silently never places an Echo would report the level unclearable for
 * a reason that is the profile's fault, not the level's.
 */
export function requireEchoAnswer(profile: LevelToolkitProfile): void {
  if (echoBeats(profileMap(profile)).length > 0 && profile.echoAtX === null) {
    throw new Error(`level ${profile.id} has an Echo beat but declares no echoAtX`)
  }
}
