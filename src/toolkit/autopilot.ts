/**
 * The autopilot: a scripted player that clears a level through the real `stepSim`, so "the level can
 * be finished" is a test rather than a claim. It runs on the *populated* level — enemies, ? blocks
 * and the checkpoint included — because a map with those stripped out is a different level, and that
 * is exactly where G1's two regressions hid.
 *
 * It also records every take-off with the view it was made from and the spot it landed on, which is
 * what the blind-jump check reads. One run, two checks, and no second driver to drift out of step.
 */

import { createSim, stepSim, type SimInput, type SimState } from '../game/sim.ts'
import { PLAYER_W, TILE } from '../physics/constants.ts'
import { tileAt } from '../physics/tilemap.ts'
import { Camera, logicalViewWidth } from '../render/camera.ts'
import { profileMap, requireEchoAnswer, type LevelToolkitProfile } from './level.ts'

/** One jump: where it started, the view it started from, and where it came down. */
export interface Takeoff {
  readonly frame: number
  readonly x: number
  readonly y: number
  /** Left edge of the view when the jump started. */
  readonly viewLeft: number
  /** The frame the jump landed, or null when it never did. */
  readonly landingFrame: number | null
  readonly landingX: number | null
}

export interface AutopilotRun {
  readonly won: boolean
  readonly died: boolean
  readonly frames: number
  readonly deaths: number
  readonly echoesPlaced: number
  readonly takeoffs: readonly Takeoff[]
}

export interface AutopilotOptions {
  /** Overrides the profile's answer; null never places an Echo. */
  readonly echoAtX?: number | null
  readonly maxFrames?: number
  /** The window the view is measured against. 960×540 is the smallest viewport agents drive. */
  readonly viewport?: { readonly width: number; readonly height: number }
}

/** The viewport the toolkit rates at, and the worst case: a smaller window shows less of the level. */
export const TOOLKIT_VIEWPORT = { width: 960, height: 540 } as const

const MAX_FRAMES = 3000
/** How close an enemy has to be before the autopilot jumps it rather than walking into it. */
const ENEMY_LOOKAHEAD = 40

/** The floor under Pip's leading edge is gone — the bot's jump trigger. */
function lipMissingAhead(sim: SimState): boolean {
  const p = sim.player
  const feetRow = Math.floor((p.y + p.h) / TILE)
  const col = Math.floor((p.x + PLAYER_W) / TILE)
  return tileAt(sim.map, col, feetRow) !== '#'
}

/** A live enemy close enough ahead that holding right would walk into it. */
function enemyAhead(sim: SimState): boolean {
  for (const enemy of sim.enemies.enemies) {
    if (enemy.mode === 'carried' || enemy.dead) continue
    if (enemy.x > sim.player.x && enemy.x - sim.player.x < ENEMY_LOOKAHEAD) return true
  }
  return false
}

/**
 * Play a level to the goal. Deterministic: the same level and options give the same run, so a
 * failure is reproducible from the profile alone.
 */
export function runAutopilot(profile: LevelToolkitProfile, options: AutopilotOptions = {}): AutopilotRun {
  requireEchoAnswer(profile)

  const map = profileMap(profile)
  const sim = createSim(map)
  const viewport = options.viewport ?? TOOLKIT_VIEWPORT
  const echoAtX = options.echoAtX !== undefined ? options.echoAtX : profile.echoAtX
  const maxFrames = options.maxFrames ?? MAX_FRAMES

  const camera = new Camera()
  camera.setViewWidth(logicalViewWidth(viewport.width, viewport.height))
  const worldW = map.cols * TILE
  const worldH = map.rows * TILE

  const takeoffs: Takeoff[] = []
  let open: Takeoff | null = null
  let echoesPlaced = 0
  let previousEchoes = 0
  let echoUsed = false

  const finish = (won: boolean, died: boolean, frames: number): AutopilotRun => {
    if (open !== null) takeoffs.push(open)
    return { won, died, frames, deaths: sim.deaths, echoesPlaced, takeoffs }
  }

  for (let frame = 0; frame < maxFrames; frame++) {
    const p = sim.player
    // The view the player is looking at as he decides, which is the view a jump is made from.
    camera.update(p.x, p.y, p.h, worldW, worldH)

    const jumpPressed = p.grounded && (lipMissingAhead(sim) || enemyAhead(sim))
    const wantEcho =
      !echoUsed && echoAtX !== null && !p.grounded && p.x >= echoAtX && sim.field.airCharges > 0
    if (wantEcho) echoUsed = true

    const wasGrounded = p.grounded
    const takeoffX = p.x
    const takeoffY = p.y
    const viewLeft = camera.x

    const input: SimInput = {
      left: false,
      right: true,
      jump: true,
      jumpPressed,
      sprint: true,
      echoPressed: wantEcho,
    }
    stepSim(sim, input)

    if (sim.field.echoes.length > previousEchoes) echoesPlaced += 1
    previousEchoes = sim.field.echoes.length

    // Close a landing before opening the next jump: a landing frame can also be a take-off frame.
    if (open !== null && sim.player.grounded) {
      takeoffs.push({ ...open, landingFrame: frame, landingX: sim.player.x })
      open = null
    }
    if (jumpPressed && wasGrounded) {
      open = { frame, x: takeoffX, y: takeoffY, viewLeft, landingFrame: null, landingX: null }
    }

    if (sim.goalReached) return finish(true, false, frame + 1)
    if (sim.deaths > 0) return finish(false, true, frame + 1)
  }

  return finish(false, false, maxFrames)
}
