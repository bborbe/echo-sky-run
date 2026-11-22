/**
 * Check H: the difficulty-curve proxies the rating guide uses until recorder data exists.
 *
 *   1. Jitter clear — the autopilot's critical path with every jump press up to 3 frames late. The
 *      guide's ±3 f is half the 6 f coyote and jump-buffer windows. An early press is absorbed by the
 *      buffer, so the late direction is the one that can eat a run-up: at a sprint a 3 f delay is 9 px
 *      further into the next riser, and a section that only clears on the exact frame is flagged.
 *   2. Safe-spot spacing — a hazard-free spot every ≤ 20 s of continuous platforming. Measured on the
 *      autopilot's route: a frame is safe when Pip is grounded on a tile, no live enemy is within the
 *      enemy wind-up range, and no pit is within two tiles ahead. The gaps between safe frames are the
 *      stretches with nowhere to breathe.
 *
 * Both are proxies, and the guide says so. Neither guesses a pass: a route that never finishes is
 * `applicable: false` (n/r), never a pass.
 */

import { groundUnder } from '../physics/collision.ts'
import { PLAYER_W, TILE } from '../physics/constants.ts'
import { createSim, stepSim } from '../game/sim.ts'
import { Camera, logicalViewWidth } from '../render/camera.ts'
import { autopilotDecision, TOOLKIT_VIEWPORT } from './autopilot.ts'
import { floorTop, profileMap, requireEchoAnswer, type LevelToolkitProfile } from './level.ts'

/** Half the 6 f coyote and jump-buffer windows: the guide's jitter tolerance. */
export const JITTER_F = 3
/** The delays the clear must survive: 0 through 3 frames late. */
export const JUMP_DELAYS: readonly number[] = [0, 1, 2, 3]
/** A safe, hazard-free spot every ≤ 20 s of continuous platforming. */
export const SAFE_SPOT_MAX_S = 20
/** An enemy inside this range is winding up; a spot there is not a breather. */
export const SAFE_ENEMY_RADIUS_PX = 64
/** How far ahead the route must be floor for a stop to be safe. */
export const SAFE_PIT_LOOKAHEAD_PX = 2 * TILE

export interface JitterRun {
  readonly delayF: number
  readonly won: boolean
  readonly deaths: number
  readonly frames: number
  /** The first frame a jump press actually fired — the evidence the delay was applied. */
  readonly firstJumpFrame: number | null
}

export interface SafeSpotGap {
  readonly fromFrame: number
  readonly toFrame: number
  readonly seconds: number
}

export interface SafeSpotReport {
  /** False when the route never finished: the spacing cannot be judged, so it is n/r. */
  readonly applicable: boolean
  readonly gaps: readonly SafeSpotGap[]
  readonly longestSeconds: number
  readonly passes: boolean
}

/** True when Pip could stop here and be out of every hazard's reach. */
function isSafeFrame(
  player: { x: number; y: number; h: number; grounded: boolean },
  map: ReturnType<typeof profileMap>,
  enemies: readonly { x: number; dead: boolean; mode: string }[],
): boolean {
  if (!player.grounded) return false
  const box = { x: player.x, y: player.y, w: PLAYER_W, h: player.h }
  if (groundUnder(box, map) !== 'tile') return false
  for (const enemy of enemies) {
    if (enemy.dead || enemy.mode === 'carried') continue
    if (Math.abs(enemy.x - player.x) < SAFE_ENEMY_RADIUS_PX) return false
  }
  const bottom = map.rows * TILE
  for (const ahead of [TILE, SAFE_PIT_LOOKAHEAD_PX]) {
    const col = Math.floor((player.x + PLAYER_W + ahead) / TILE)
    if (floorTop(map, col) >= bottom) return false
  }
  return true
}

interface Drive {
  readonly won: boolean
  readonly deaths: number
  readonly frames: number
  readonly safeFrames: readonly number[]
  readonly firstJumpFrame: number | null
}

/**
 * Play the autopilot's route with every jump press delayed by `delayF` frames. The trigger is a
 * rising edge, so a held trigger does not re-schedule the press every frame; a delayed press is
 * queued and fires once. `collectSafe` records the frames that pass `isSafeFrame`.
 */
function drive(profile: LevelToolkitProfile, delayF: number, collectSafe: boolean, maxFrames: number): Drive {
  requireEchoAnswer(profile)
  const map = profileMap(profile)
  const sim = createSim(map)
  const camera = new Camera()
  camera.setViewWidth(logicalViewWidth(TOOLKIT_VIEWPORT.width, TOOLKIT_VIEWPORT.height))
  const worldW = map.cols * TILE
  const worldH = map.rows * TILE

  const safeFrames: number[] = []
  let wasTrigger = false
  let pending = 0
  let echoUsed = false
  let firstJumpFrame: number | null = null

  for (let frame = 0; frame < maxFrames; frame++) {
    const p = sim.player
    camera.update(p.x, p.y, p.h, worldW, worldH)
    const decision = autopilotDecision(sim, profile.echoAtX, echoUsed)
    echoUsed = decision.echoUsed

    let jumpPressed = false
    if (decision.jumpPressed && !wasTrigger) {
      if (delayF <= 0) jumpPressed = true
      // `+ 1` because the countdown below also runs on this frame: `delayF = 1` must fire on the
      // next frame, not this one.
      else pending = delayF + 1
    }
    wasTrigger = decision.jumpPressed
    if (pending > 0) {
      pending -= 1
      if (pending === 0) jumpPressed = true
    }
    if (jumpPressed && firstJumpFrame === null) firstJumpFrame = frame

    stepSim(sim, {
      left: false,
      right: true,
      jump: true,
      jumpPressed,
      sprint: true,
      echoPressed: decision.echoPressed,
    })
    if (collectSafe && isSafeFrame(sim.player, map, sim.enemies.enemies)) safeFrames.push(frame)

    if (sim.goalReached) {
      return { won: true, deaths: sim.deaths, frames: frame + 1, safeFrames, firstJumpFrame }
    }
    if (sim.deaths > 0) {
      return { won: false, deaths: sim.deaths, frames: frame + 1, safeFrames, firstJumpFrame }
    }
  }
  return { won: false, deaths: sim.deaths, frames: maxFrames, safeFrames, firstJumpFrame }
}

/** One jitter run: the route with every jump press `delayF` frames late. */
export function runWithJumpDelay(profile: LevelToolkitProfile, delayF: number): JitterRun {
  const run = drive(profile, delayF, false, 4000)
  return {
    delayF,
    won: run.won,
    deaths: run.deaths,
    frames: run.frames,
    firstJumpFrame: run.firstJumpFrame,
  }
}

export interface JitterReport {
  readonly runs: readonly JitterRun[]
  /** True when every run clears with zero deaths. */
  readonly passes: boolean
  /** True when the delays actually changed the run — otherwise the check is vacuous. */
  readonly perturbationReal: boolean
}

/** The whole jitter check over the guide's 0–3 frame delays. */
export function jitterClear(profile: LevelToolkitProfile): JitterReport {
  const runs = JUMP_DELAYS.map((delay) => runWithJumpDelay(profile, delay))
  return {
    runs,
    passes: runs.every((run) => run.won && run.deaths === 0),
    // The delays must actually move the first jump. Total frames can coincide when a level absorbs
    // the shift later, so comparing frame counts would call a real perturbation vacuous.
    perturbationReal: new Set(runs.map((run) => run.firstJumpFrame)).size > 1,
  }
}

/** Gaps between safe frames, in seconds. The start and the finish are anchors of their own. */
export function safeSpotGaps(anchors: readonly number[]): SafeSpotGap[] {
  const gaps: SafeSpotGap[] = []
  for (let i = 1; i < anchors.length; i++) {
    gaps.push({
      fromFrame: anchors[i - 1],
      toFrame: anchors[i],
      seconds: (anchors[i] - anchors[i - 1]) / 60,
    })
  }
  return gaps
}

/** The safe-spot spacing over the autopilot's route, or n/r when the route does not finish. */
export function safeSpotReport(profile: LevelToolkitProfile): SafeSpotReport {
  const run = drive(profile, 0, true, 4000)
  if (!run.won) {
    return { applicable: false, gaps: [], longestSeconds: 0, passes: false }
  }
  // Anchor the spacing at the start and the finish, so a breather-free opening or ending is measured
  // rather than hidden by only looking between safe frames.
  const anchors = [0, ...run.safeFrames.filter((frame) => frame > 0 && frame < run.frames), run.frames]
  const gaps = safeSpotGaps(anchors)
  const longestSeconds = gaps.reduce((longest, gap) => Math.max(longest, gap.seconds), 0)
  return {
    applicable: true,
    gaps,
    longestSeconds,
    passes: longestSeconds <= SAFE_SPOT_MAX_S,
  }
}
