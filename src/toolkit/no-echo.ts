/**
 * The no-Echo bypass search. "One bot falling proves only that this bot falls" — a single scripted
 * run that comes up short says nothing about the launch it never tried. This sweeps the launch
 * space instead: every position on the approach to a pit, every speed the player can reach, every
 * upward velocity he can leave the ground with (a jump, a sprint jump, and a stomp or shell bounce
 * from four heights), at both power tiers. Zero clears is then a property of the level, not of one
 * driver's reflexes.
 *
 * The Echo is absent by construction: the sweep drives `stepPlayer` with no Echo platforms at all,
 * so nothing here can stand on one.
 */

import { STOMP_BOUNCE } from '../game/enemies.ts'
import type { PowerTier } from '../game/power.ts'
import {
  JUMP_V,
  JUMP_V_SPRINT,
  METER_MAX,
  PLAYER_W,
  RUN_MAX,
  SPRINT_MAX,
  TILE,
  WALK_MAX,
} from '../physics/constants.ts'
import { createPlayer, stepPlayer } from '../physics/player.ts'
import type { TileMap } from '../physics/tilemap.ts'
import { floorTop, maxJumpReach, tierHeight, type Pit } from './level.ts'

/** How the player left the ground. */
export type LaunchKind = 'ground' | 'bounce'

export interface LaunchState {
  readonly kind: LaunchKind
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly tier: PowerTier
}

export interface BypassSweep {
  /** How many launch states the sweep simulated. */
  readonly attempts: number
  /** The launches that reached the far side. Empty is the pass. */
  readonly clears: readonly LaunchState[]
  /** How far back from the lip the sweep enumerated, in pixels. */
  readonly reachPx: number
}

/** Every horizontal speed the engine can hold: standing, walking, running, sprinting. */
const SPEEDS = [0, WALK_MAX, RUN_MAX, SPRINT_MAX] as const
/** Every upward velocity the player can start a flight with, without an Echo. */
const LAUNCH_VELOCITIES = [0, -JUMP_V, -JUMP_V_SPRINT] as const
/** Heights a stomp or shell bounce can happen at, above the ground it bounces off. */
const BOUNCE_HEIGHTS = [TILE, TILE * 2, TILE * 3] as const
const TIERS: readonly PowerTier[] = ['small', 'super']
/** A flight is over long before this: the longest is a sprint jump at ~55 frames. */
const MAX_FLIGHT_F = 200

/** Run one launch forward and report whether it reaches the far side of the pit. */
function crosses(map: TileMap, launch: LaunchState, farLeft: number): boolean {
  const player = createPlayer(launch.x, launch.y, tierHeight(launch.tier))
  player.vx = launch.vx
  // A sprint launch needs a full meter, or `stepPlayer` clamps the speed back down to a run.
  player.meter = Math.abs(launch.vx) >= SPRINT_MAX ? METER_MAX : 0
  player.vy = launch.vy
  player.grounded = launch.kind === 'ground' && launch.vy === 0

  const input = { left: false, right: true, jump: true, jumpPressed: false, sprint: true }
  for (let frame = 0; frame < MAX_FLIGHT_F; frame++) {
    stepPlayer(player, input, map)
    if (player.y > map.rows * TILE) return false
    // Standing on solid ground past the pit's far lip: the pit has been crossed.
    if (player.grounded && player.x + PLAYER_W > farLeft) return true
  }
  return false
}

/**
 * Sweep every launch state on the approach to `pit`. `reachPx` bounds how far back the sweep looks:
 * a launch further from the far lip than a sprint jump carries cannot reach it, so nothing beyond
 * that radius can be a bypass.
 */
export function sweepNoEcho(map: TileMap, pit: Pit, reachPx: number = maxJumpReach()): BypassSweep {
  const nearCol = pit.firstCol - 1
  const lipX = (nearCol + 1) * TILE
  const farLeft = (pit.lastCol + 1) * TILE
  const top = floorTop(map, nearCol)
  const fromX = Math.max(0, Math.round(lipX - reachPx))

  const clears: LaunchState[] = []
  let attempts = 0

  for (let x = fromX; x <= lipX - PLAYER_W; x++) {
    for (const tier of TIERS) {
      const h = tierHeight(tier)
      for (const vx of SPEEDS) {
        for (const vy of LAUNCH_VELOCITIES) {
          attempts += 1
          const launch: LaunchState = { kind: 'ground', x, y: top - h, vx, vy, tier }
          if (crosses(map, launch, farLeft)) clears.push(launch)
        }
        // A bounce needs horizontal speed to be worth simulating; standing still gains nothing.
        if (vx === 0) continue
        for (const up of BOUNCE_HEIGHTS) {
          attempts += 1
          const launch: LaunchState = { kind: 'bounce', x, y: top - h - up, vx, vy: -STOMP_BOUNCE, tier }
          if (crosses(map, launch, farLeft)) clears.push(launch)
        }
      }
    }
  }

  return { attempts, clears, reachPx }
}
