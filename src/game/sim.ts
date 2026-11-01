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
import { findEnemySpawns, findTile, GOAL, SPAWN, type TileMap } from '../physics/tilemap.ts'
import { createEnemy, createEnemyField, STOMP_BOUNCE, stepEnemies, type EnemyField } from './enemies.ts'

export interface SimInput extends PlayerInput {
  /** The Echo key went down this frame. */
  readonly echoPressed: boolean
}

export interface SimState {
  readonly map: TileMap
  readonly goal: { x: number; y: number }
  player: PlayerState
  field: EchoField
  enemies: EnemyField
  goalReached: boolean
  /** Consecutive stomps without landing. Resets on any landing, including on an Echo. */
  combo: number
  score: number
}

/**
 * The score a stomp chain is worth. The first stomp is 100 and each further one doubles, capped at
 * 1000 — the spec's 100, 200, 400, 800, 1000… sequence.
 */
export function comboValue(chain: number): number {
  if (chain <= 0) return 0
  return Math.min(100 * 2 ** (chain - 1), 1000)
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

  const enemies = createEnemyField()
  for (const spawnPoint of findEnemySpawns(map)) {
    enemies.enemies.push(createEnemy(spawnPoint.kind, spawnPoint.x, spawnPoint.y))
  }

  return {
    map,
    goal,
    player: createPlayer(spawn.x, spawn.y),
    field: createEchoField(),
    enemies,
    goalReached: false,
    combo: 0,
    score: 0,
  }
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

  // Enemies move after the player, so a stomp is tested against the position he actually reached.
  const events = stepEnemies(sim.enemies, playerBox(sim.player), sim.player.vy, map)

  for (const _ of events.stomped) {
    sim.combo += 1
    sim.score += comboValue(sim.combo)
    sim.player.vy = -STOMP_BOUNCE
    sim.player.grounded = false
  }

  // A stomp chain is broken by landing, and an Echo landing counts as landing.
  if (sim.player.grounded) sim.combo = 0

  tickEchoes(sim.field)
  refreshAirCharges(sim.field, playerBox(sim.player), map, echoPlatforms(sim.field))

  if (overlapsGoal(sim.player, sim.goal)) sim.goalReached = true
}
