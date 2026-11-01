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
  readonly goal: { x: number; y: number } | null
  player: PlayerState
  field: EchoField
  goalReached: boolean
}

function playerBox(p: PlayerState): Box {
  return { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H }
}

function overlapsGoal(p: PlayerState, goal: { x: number; y: number } | null): boolean {
  if (goal === null) return false
  return (
    p.x + PLAYER_W > goal.x &&
    p.x < goal.x + TILE &&
    p.y + PLAYER_H > goal.y &&
    p.y < goal.y + TILE
  )
}

export function createSim(map: TileMap): SimState {
  const spawn = findTile(map, SPAWN) ?? { x: TILE, y: 0 }
  const player = createPlayer(spawn.x, spawn.y)
  return { map, goal: findTile(map, GOAL), player, field: createEchoField(), goalReached: false }
}

/**
 * One fixed step of the whole game. Pure: same state plus same input sequence gives the same result,
 * which is what lets the level's own test and the browser drive the identical simulation.
 */
export function stepSim(sim: SimState, input: SimInput, map: TileMap = sim.map): void {
  // Place before the step, so a mid-air Echo can catch the player on the very frame it appears.
  if (input.echoPressed) placeEcho(sim.field, playerBox(sim.player), map)

  stepPlayer(sim.player, input, map, echoPlatforms(sim.field))

  tickEchoes(sim.field)
  refreshAirCharges(sim.field, playerBox(sim.player), map, echoPlatforms(sim.field))

  if (overlapsGoal(sim.player, sim.goal)) sim.goalReached = true
}
