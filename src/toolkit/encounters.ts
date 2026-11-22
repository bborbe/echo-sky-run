/**
 * Check L: the encounter list behind criterion 6 (teaching before testing).
 *
 * The guide's proxy: list each mechanic's encounters in level order, mark each safe or lethal, and
 * flag a lethal encounter that comes before any safe one. A mechanic introduced by a lethal use has
 * not been taught — the player meets it for the first time with something to lose.
 *
 * The safe/lethal mark is a geometric proxy, not a reachability proof: an enemy is lethal when it
 * stands within two tiles of a pit (a jump over it can end in the pit) and safe otherwise; the Echo
 * is safe where it is taught — the tutorial sign, and a switch met on a ledge with a fall-back floor
 * — and lethal at a gap that only the Echo crosses, where a missed Echo is death.
 *
 * A level with no mechanics has nothing to teach; the caller treats an empty list as n/r, never as a
 * pass.
 */

import { TILE } from '../physics/constants.ts'
import { echoBeats, findPits } from './level.ts'
import {
  ECHO_SWITCH,
  findTiles,
  GEAR_GOOMBA,
  SIGN,
  STEAM_TURTLE,
  type TileMap,
} from '../physics/tilemap.ts'

export type EncounterMechanic = 'gear-goomba' | 'steam-turtle' | 'echo'

export interface Encounter {
  readonly mechanic: EncounterMechanic
  readonly x: number
  readonly safe: boolean
  readonly reason: string
}

/** An enemy this close to a pit is a lethal encounter: a jump over it can land in the pit. */
export const ENEMY_PIT_RADIUS_COLS = 2

/** Every mechanic's encounters, in level order. */
export function encounterList(map: TileMap): Encounter[] {
  const pits = findPits(map)
  const nearPit = (col: number): boolean =>
    pits.some(
      (pit) =>
        col >= pit.firstCol - ENEMY_PIT_RADIUS_COLS && col <= pit.lastCol + ENEMY_PIT_RADIUS_COLS,
    )

  const encounters: Encounter[] = []

  for (const cell of findTiles(map, GEAR_GOOMBA)) {
    const col = Math.floor(cell.x / TILE)
    const lethal = nearPit(col)
    encounters.push({
      mechanic: 'gear-goomba',
      x: cell.x,
      safe: !lethal,
      reason: lethal
        ? 'stands within two tiles of a pit, so a jump over it can end in the pit'
        : 'stands on solid ground with room to stop',
    })
  }

  for (const cell of findTiles(map, STEAM_TURTLE)) {
    const col = Math.floor(cell.x / TILE)
    const lethal = nearPit(col)
    encounters.push({
      mechanic: 'steam-turtle',
      x: cell.x,
      safe: !lethal,
      reason: lethal
        ? 'stands within two tiles of a pit, so a jump over it can end in the pit'
        : 'stands on solid ground with room to stop',
    })
  }

  // The Echo is taught by the sign and by a switch met on a ledge with a fall-back floor; a gap that
  // only the Echo crosses is the lethal use.
  for (const cell of findTiles(map, SIGN)) {
    encounters.push({
      mechanic: 'echo',
      x: cell.x,
      safe: true,
      reason: 'the sign teaches the Echo before any gap',
    })
  }
  for (const cell of findTiles(map, ECHO_SWITCH)) {
    encounters.push({
      mechanic: 'echo',
      x: cell.x,
      safe: true,
      reason: 'the switch is met on a ledge with a safe floor',
    })
  }
  for (const beat of echoBeats(map)) {
    encounters.push({
      mechanic: 'echo',
      x: beat.firstCol * TILE,
      safe: false,
      reason: 'a missed Echo in the beat is death',
    })
  }

  // Level order; at the same x a safe encounter sorts first, so a teaching beat beside a lethal one
  // still counts as the introduction.
  return encounters.sort((a, b) => a.x - b.x || Number(a.safe) - Number(b.safe))
}

/**
 * Every lethal encounter that comes before its mechanic's first safe encounter. A mechanic with no
 * safe encounter at all is introduced lethally, so all of its encounters are violations.
 */
export function firstLethalBeforeSafe(encounters: readonly Encounter[]): Encounter[] {
  const violations: Encounter[] = []
  const mechanics = new Set(encounters.map((encounter) => encounter.mechanic))

  for (const mechanic of mechanics) {
    const own = encounters
      .filter((encounter) => encounter.mechanic === mechanic)
      .sort((a, b) => a.x - b.x)
    const firstSafe = own.find((encounter) => encounter.safe)
    const limit = firstSafe === undefined ? Number.POSITIVE_INFINITY : firstSafe.x
    for (const encounter of own) {
      if (!encounter.safe && encounter.x < limit) violations.push(encounter)
    }
  }

  return violations
}
