import {
  createEchoField,
  echoPlatforms,
  placeEcho,
  refreshAirCharges,
  tickEchoes,
  type EchoField,
} from '../echo/echo.ts'
import type { Box } from '../physics/collision.ts'
import { PLAYER_H, PLAYER_W, TILE } from '../physics/constants.ts'
import { createPlayer, stepPlayer, type PlayerInput, type PlayerState } from '../physics/player.ts'
import { findTile, GOAL, SPAWN, type TileMap } from '../physics/tilemap.ts'

export interface SimInput extends PlayerInput {
  /** The Echo key went down this frame. */
  readonly echoPressed: boolean
}

export interface SimState {
  readonly map: TileMap
  readonly goal: { x: number; y: number }
  player: PlayerState
  field: EchoField
  goalReached: boolean
}

function playerBox(p: PlayerState): Box {
  return { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H }
}

function overlapsGoal(p: PlayerState, goal: { x: number; y: number }): boolean {
  return p.x + PLAYER_W > goal.x && p.x < goal.x + TILE && p.y + PLAYER_H > goal.y && p.y < goal.y + TILE
}

/**
 * Build the state for a level. Throws when the level has no spawn or no goal tile — a silent
 * fallback spawn would present an authoring mistake as a physics bug.
 */
export function createSim(map: TileMap): SimState {
  const spawn = findTile(map, SPAWN)
  if (spawn === null) throw new Error('level has no spawn tile')
  const goal = findTile(map, GOAL)
  if (goal === null) throw new Error('level has no goal tile')

  return { map, goal, player: createPlayer(spawn.x, spawn.y), field: createEchoField(), goalReached: false }
}

/**
 * One fixed step of the whole game. Deterministic, not pure: it mutates `sim` in place. Same state
 * plus the same input sequence gives the same result, which is what lets the level's own test and
 * the browser drive the identical simulation.
 */
export function stepSim(sim: SimState, input: SimInput): void {
  const map = sim.map

  // Place before the step, so a mid-air Echo can catch the player on the very frame it appears.
  if (input.echoPressed) placeEcho(sim.field, playerBox(sim.player), map)

  stepPlayer(sim.player, input, map, echoPlatforms(sim.field))

  tickEchoes(sim.field)
  refreshAirCharges(sim.field, playerBox(sim.player), map, echoPlatforms(sim.field))

  if (overlapsGoal(sim.player, sim.goal)) sim.goalReached = true
}
