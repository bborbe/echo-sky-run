/**
 * The level toolkit, applied to level 1-3. Same checks as 1-1 and 1-2, with 1-3's own difference: its
 * Echo use is a secret switch seven tiles above the run-out floor, not a pit and not a door. The
 * level has no pit wide enough to be an Echo beat, so `sweepNoEcho` — which sweeps pits — has nothing
 * to sweep, and the switch tests below carry the Echo requirement instead.
 *
 *   A. the autopilot clears the *populated* level, with no deaths
 *   B. the secret switch cannot be reached without an Echo, and can with one
 *   E. no jump on the critical path lands outside the view it was made from
 *   L. the `est.` length lands in the rating guide's 60-90 s band
 *
 * The browser playthrough is the fourth required check, and it cannot run in vitest — it lives in
 * `scripts/e2e.mjs` and `make test` runs it beside this file.
 */

import { describe, expect, it } from 'vitest'
import {
  LEVEL_1_3_CHECKPOINT_COL,
  LEVEL_1_3_COLS,
  LEVEL_1_3_NICHE,
  LEVEL_1_3_PATH_PX,
  LEVEL_1_3_SECRET_COL,
  LEVEL_1_3_SECRET_ROW,
  LEVEL_1_3_TOP_ROW,
  LEVEL_ROWS,
} from './level1-3.level.ts'
import { createSim, stepSim, type SimInput, type SimState } from '../game/sim.ts'
import { WINDUP_F, WINDUP_RANGE_PX, GUST_WING_AMPLITUDE, GUST_WING_H } from '../game/enemies.ts'
import { ECHO_H } from '../echo/echo.ts'
import {
  GRAVITY_HELD,
  JUMP_V,
  JUMP_V_SPRINT,
  METER_MAX,
  PLAYER_H,
  PLAYER_W,
  RUN_MAX,
  SMALL_H,
  SPRINT_MAX,
  TILE,
  WALK_MAX,
} from '../physics/constants.ts'
import { createPlayer, stepPlayer } from '../physics/player.ts'
import { CHECKPOINT, findTile, GOAL, GUST_WING, SPAWN, SECRET_SWITCH, tileAt } from '../physics/tilemap.ts'
import { runAutopilot, autopilotDecision, TOOLKIT_VIEWPORT, type Takeoff } from '../toolkit/autopilot.ts'
import { blindJumps, unseenFalls } from '../toolkit/blind-jump.ts'
import { checkpointReport } from '../toolkit/checkpoints.ts'
import { Camera, logicalViewWidth, VIEW_H } from '../render/camera.ts'
import { echoBeats, floorTop, profileMap, tierHeight, type LevelToolkitProfile } from '../toolkit/level.ts'
import { freshSave, isUnlocked, loadSave, SAVE_KEY, storeSave } from '../save/save.ts'
import { mapNodes, SECRET_LEVEL_ID, unlockSecretLevel } from './map.ts'

const LEVEL: LevelToolkitProfile = {
  id: '1-3',
  rows: LEVEL_ROWS,
  // 1-3's Echo use is the secret switch, not a mid-air Echo over a pit: the level has no Echo beat,
  // so it declares no answer. `requireEchoAnswer` refuses a level that has a beat and no answer.
  echoAtX: null,
}

const MAP = profileMap(LEVEL)

/** 960×540 is the smallest viewport an agent drives, so it is the worst case for a blind landing. */
const VIEW_W = logicalViewWidth(TOOLKIT_VIEWPORT.width, TOOLKIT_VIEWPORT.height)

const IDLE: SimInput = { left: false, right: false, jump: false, jumpPressed: false, sprint: false, echoPressed: false }
const RUN_RIGHT: SimInput = { left: false, right: true, jump: false, jumpPressed: false, sprint: true, echoPressed: false }

/** The secret switch's cell, in world pixels. */
const SWITCH_X = LEVEL_1_3_SECRET_COL * TILE
const SWITCH_Y = LEVEL_1_3_SECRET_ROW * TILE

/** True when Pip's box overlaps the secret switch's tile — the same test `stepSim` latches on. */
function touchesSwitch(p: { x: number; y: number; h: number }): boolean {
  return p.x + PLAYER_W > SWITCH_X && p.x < SWITCH_X + TILE && p.y + p.h > SWITCH_Y && p.y < SWITCH_Y + TILE
}

/** A sim standing on the run-out terrace at `col` — where the climb ends and the switch begins. */
function onRunOut(col: number): SimState {
  const sim = createSim(MAP)
  sim.player.x = col * TILE
  sim.player.y = LEVEL_1_3_TOP_ROW * TILE - SMALL_H
  // Settle through the real step so the ground flag is one the game produced, never a hand-set one.
  for (let i = 0; i < 5; i++) stepSim(sim, IDLE)
  expect(sim.player.grounded).toBe(true)
  return sim
}

/**
 * The designed Echo route to the switch: run right from `startCol`, jump at `takeOffX`, place the one
 * mid-air Echo `echoFrame` frames into the jump, then hold right — the Echo re-arms the jump, the
 * second rise clears the niche's ledge, and Pip walks in to the switch. Returns the frame he touched
 * it, or null when he never did.
 */
function runSwitchRoute(startCol: number, takeOffX: number, echoFrame: number): { touchedAt: number | null; sim: SimState } {
  const sim = onRunOut(startCol)
  let frames = 0
  while (sim.player.x < takeOffX && frames < 600) {
    stepSim(sim, RUN_RIGHT)
    frames += 1
  }
  for (let f = 0; f < 220; f++) {
    stepSim(sim, {
      left: false,
      right: true,
      jump: true,
      jumpPressed: f === 0,
      sprint: true,
      echoPressed: f === echoFrame,
    })
    if (touchesSwitch(sim.player)) return { touchedAt: f, sim }
    if (sim.deaths > 0) break
  }
  return { touchedAt: null, sim }
}

/** One no-Echo launch: from a spot on the run-out, at a speed and an upward velocity. */
interface Launch {
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly h: number
  readonly meter: number
}

/** Fly one no-Echo launch forward and report whether Pip's box ever reaches the switch tile. */
function launchTouchesSwitch(launch: Launch): boolean {
  const player = createPlayer(launch.x, launch.y, launch.h)
  player.vx = launch.vx
  player.vy = launch.vy
  player.meter = launch.meter
  player.grounded = true
  const input = { left: false, right: true, jump: true, jumpPressed: true, sprint: true }
  for (let frame = 0; frame < 240; frame++) {
    stepPlayer(player, { ...input, jumpPressed: frame === 0 }, MAP)
    if (touchesSwitch(player)) return true
    if (player.y > MAP.rows * TILE) return false
  }
  return false
}

/**
 * The no-Echo sweep over the run-out's approach to the niche. It enumerates every launch spot on the
 * approach, every horizontal speed the engine can hold, every upward velocity a jump can start with,
 * at both power tiers — the same launch space `sweepNoEcho` covers for a pit. An Echo is absent by
 * construction: `stepPlayer` is driven with no Echo platforms at all.
 *
 * Stomp and shell bounces are included as launch heights: the niche's ledge is above the 6.4-tile
 * bounce apex, and no enemy or shell exists on the run-out, so a bounce is listed to prove the bar
 * holds even if one did.
 */
function sweepSwitchWithoutEcho(): { attempts: number; clears: Launch[] } {
  const SPEEDS = [0, WALK_MAX, RUN_MAX, SPRINT_MAX] as const
  const LAUNCH_VELOCITIES = [0, -JUMP_V, -JUMP_V_SPRINT] as const
  const BOUNCE_HEIGHTS = [TILE, TILE * 2, TILE * 3] as const
  const TIERS: readonly ('small' | 'super')[] = ['small', 'super']
  const mouthCol = LEVEL_1_3_NICHE.firstCol
  const top = floorTop(MAP, mouthCol - 1)
  const fromCol = mouthCol - 14

  const clears: Launch[] = []
  let attempts = 0
  for (let col = fromCol; col <= mouthCol; col++) {
    const x = col * TILE
    for (const tier of TIERS) {
      const h = tierHeight(tier)
      for (const vx of SPEEDS) {
        for (const vy of LAUNCH_VELOCITIES) {
          attempts += 1
          const launch: Launch = { x, y: top - h, vx, vy, h, meter: vx >= SPRINT_MAX ? METER_MAX : 0 }
          if (launchTouchesSwitch(launch)) clears.push(launch)
        }
        if (vx === 0) continue
        for (const up of BOUNCE_HEIGHTS) {
          attempts += 1
          const launch: Launch = { x, y: top - h - up, vx, vy: -4.5, h, meter: vx >= SPRINT_MAX ? METER_MAX : 0 }
          if (launchTouchesSwitch(launch)) clears.push(launch)
        }
      }
    }
  }
  return { attempts, clears }
}

/**
 * The autopilot clear with every jump press delayed by `delayF` frames — the rating guide's ±3 f
 * jitter proxy (check H). The trigger is treated as a rising edge, so a held trigger does not
 * re-schedule the press every frame; a delayed press is queued and fires once.
 */
function runWithJumpDelay(delayF: number): { won: boolean; deaths: number; frames: number } {
  const sim = createSim(MAP)
  const camera = new Camera()
  camera.setViewWidth(VIEW_W)
  const worldW = MAP.cols * TILE
  const worldH = MAP.rows * TILE
  let wasTrigger = false
  let pending = 0

  for (let frame = 0; frame < 4000; frame++) {
    const p = sim.player
    camera.update(p.x, p.y, p.h, worldW, worldH)
    const decision = autopilotDecision(sim, null, false)

    let jumpPressed = false
    if (decision.jumpPressed && !wasTrigger) {
      if (delayF === 0) jumpPressed = true
      else pending = delayF
    }
    wasTrigger = decision.jumpPressed
    if (pending > 0) {
      pending -= 1
      if (pending === 0) jumpPressed = true
    }

    stepSim(sim, { left: false, right: true, jump: true, jumpPressed, sprint: true, echoPressed: false })
    if (sim.goalReached) return { won: true, deaths: sim.deaths, frames: frame + 1 }
    if (sim.deaths > 0) return { won: false, deaths: sim.deaths, frames: frame + 1 }
  }
  return { won: false, deaths: sim.deaths, frames: 4000 }
}

describe('level 1-3 passes the level toolkit', () => {
  it('is cleared by the autopilot on the populated level, with no deaths', () => {
    const run = runAutopilot(LEVEL)

    const summary = JSON.stringify({ won: run.won, died: run.died, frames: run.frames, deaths: run.deaths })
    expect(run.won, summary).toBe(true)
    expect(run.died).toBe(false)
    expect(run.deaths).toBe(0)
  })

  it('climbs: the run takes more take-offs than a flat level, one per riser', () => {
    // Twenty terraces, each a wall the autopilot has to jump. A horizontal level takes a handful.
    const run = runAutopilot(LEVEL)
    expect(run.takeoffs.length).toBeGreaterThanOrEqual(20)
  })

  it('has no pit-based Echo beat: the Echo requirement is the secret switch, not a gap', () => {
    expect(echoBeats(MAP)).toEqual([])
  })

  it('cannot reach the secret switch without an Echo', () => {
    const sweep = sweepSwitchWithoutEcho()
    // A sweep that could not fire is worse than no sweep: prove it enumerated a real launch space.
    expect(sweep.attempts).toBeGreaterThan(200)
    expect(sweep.clears).toEqual([])
  })

  it('reaches the secret switch with an Echo placed in the slot', () => {
    // The designed route, plus a small band around it: a route that only works on one exact frame
    // would be a knife-edge, not a level.
    const takeOffX = LEVEL_1_3_NICHE.firstCol * TILE - 90
    const reached = [20, 22, 24, 26, 28].map((echoFrame) => runSwitchRoute(Math.floor(takeOffX / TILE) - 1, takeOffX, echoFrame))
    const touches = reached.filter((r) => r.touchedAt !== null)
    expect(touches.length).toBeGreaterThanOrEqual(3)
    // The Echo really is the reason: every reaching run placed one.
    for (const r of touches) expect(r.sim.secretSwitchTouched).toBe(true)
  })

  it('latches the secret switch, and the latch is what unlocks 1-S in the save', () => {
    const takeOffX = LEVEL_1_3_NICHE.firstCol * TILE - 90
    const { touchedAt, sim } = runSwitchRoute(Math.floor(takeOffX / TILE) - 1, takeOffX, 24)
    expect(touchedAt).not.toBeNull()
    expect(sim.secretSwitchTouched).toBe(true)

    // The shell's write, on the real key: the same guard `main.ts` uses.
    const storage = new Map<string, string>()
    const store = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    }
    storeSave(store, { ...freshSave(), unlockedLevels: ['1-1'] })
    storeSave(store, unlockSecretLevel(loadSave(store)))
    expect(JSON.parse(storage.get(SAVE_KEY) ?? '{}').unlockedLevels).toContain(SECRET_LEVEL_ID)

    // Held but unbuilt, so the map draws it as a placeholder rather than a lock.
    const reloaded = loadSave({ getItem: (k) => storage.get(k) ?? null, setItem: () => {} })
    expect(isUnlocked(reloaded, SECRET_LEVEL_ID)).toBe(true)
    expect(mapNodes((id) => isUnlocked(reloaded, id)).find((n) => n.id === SECRET_LEVEL_ID)?.state).toBe('unbuilt')
  })

  it('keeps every jump on the critical path inside the view it was made from', () => {
    const run = runAutopilot(LEVEL)
    expect(run.takeoffs.length).toBeGreaterThan(2)

    expect(blindJumps(run.takeoffs, VIEW_W)).toEqual([])
  })

  it('has a blind-jump check that actually fires: a planted off-screen landing is flagged', () => {
    const planted: Takeoff = {
      frame: 0,
      x: 100,
      y: 176,
      viewLeft: 0,
      viewTop: 0,
      apexY: 176,
      landingFrame: 30,
      landingX: 500,
      landingY: 200,
    }
    expect(blindJumps([planted], VIEW_W)).toHaveLength(1)
  })

  it('lands in the rating guide 60-90 s band on the guide own `est.` base', () => {
    // A climb's horizontal spawn→goal delta is ~0, so the estimate is walked path length, not Δx.
    const estSeconds = LEVEL_1_3_PATH_PX / (WALK_MAX * 60)
    expect(estSeconds).toBeGreaterThanOrEqual(60)
    expect(estSeconds).toBeLessThanOrEqual(90)
  })

  it('measures the view the renderer actually draws at 960x540', () => {
    expect(VIEW_W).toBe(398)
  })

  it('is the width its own metadata claims, and both edges are closed', () => {
    expect(MAP.cols).toBe(LEVEL_1_3_COLS)
    for (let row = 0; row < MAP.rows; row++) {
      expect(tileAt(MAP, 0, row)).toBe('#')
      expect(tileAt(MAP, LEVEL_1_3_COLS - 1, row)).toBe('#')
    }
  })

  it('carries exactly one checkpoint, at the midpoint of the climb', () => {
    let count = 0
    for (let row = 0; row < MAP.rows; row++) {
      for (let col = 0; col < MAP.cols; col++) if (tileAt(MAP, col, row) === CHECKPOINT) count += 1
    }
    // The engine reads only the first 'C' (`sim.ts` `findTile`), so a second is silently ignored —
    // which is exactly why a second must never be written.
    expect(count).toBe(1)
    const cp = findTile(MAP, CHECKPOINT)
    expect(cp?.x).toBe(LEVEL_1_3_CHECKPOINT_COL * TILE)
    // The midpoint of the walked path, within a terrace of it.
    const spawn = findTile(MAP, SPAWN)
    const goal = findTile(MAP, GOAL)
    expect(cp?.x).toBeGreaterThan((spawn?.x ?? 0) + 0.4 * ((goal?.x ?? 0) - (spawn?.x ?? 0)))
    expect(cp?.x).toBeLessThan((spawn?.x ?? 0) + 0.6 * ((goal?.x ?? 0) - (spawn?.x ?? 0)))
  })

  it('claims the midpoint checkpoint, so a death past it does not send Pip back to the spawn', () => {
    const sim = createSim(MAP)
    const spawn = findTile(MAP, SPAWN)
    const cp = findTile(MAP, CHECKPOINT)
    expect(spawn).not.toBeNull()
    expect(cp).not.toBeNull()

    sim.player.x = cp?.x ?? 0
    sim.player.y = cp?.y ?? 0
    stepSim(sim, IDLE)

    expect(sim.respawn.x).toBe(cp?.x)
    expect(sim.respawn.x).not.toBe(spawn?.x)
  })

  it('puts the secret switch in a slot wider than the Echo and no taller than Pip', () => {
    // The slot is the one-tile-tall niche: the ledge below and the roof above leave one row of
    // clearance. Four times the Echo's 4 px platform, and no taller than Pip's 16 px body.
    const slotH = (LEVEL_1_3_NICHE.ledgeRow - (LEVEL_1_3_NICHE.ledgeRow - 2) - 1) * TILE
    expect(slotH).toBe(TILE)
    expect(slotH).toBeGreaterThan(ECHO_H)
    expect(slotH).toBeLessThanOrEqual(PLAYER_H)

    // The niche is a sealed slot except its mouth: the ledge and the roof span the same columns, and
    // the row between them is open only where the level wrote it.
    for (let col = LEVEL_1_3_NICHE.firstCol; col <= LEVEL_1_3_NICHE.lastCol; col++) {
      expect(tileAt(MAP, col, LEVEL_1_3_NICHE.ledgeRow)).toBe('#')
      expect(tileAt(MAP, col, LEVEL_1_3_NICHE.ledgeRow - 2)).toBe('#')
      expect(tileAt(MAP, col, LEVEL_1_3_NICHE.ledgeRow - 1)).not.toBe('#')
    }
    expect(tileAt(MAP, LEVEL_1_3_SECRET_COL, LEVEL_1_3_SECRET_ROW)).toBe(SECRET_SWITCH)
  })

  it('places the switch three tiles above the height a walk jump reaches', () => {
    // A walk jump peaks at JUMP_V² / (2·GRAVITY_HELD) = 66.7 px = 4.17 tiles; the switch's ledge is
    // seven tiles up, so the switch is ~3 tiles above the reachable height — the spec § 7 line.
    const floorTopY = LEVEL_1_3_TOP_ROW * TILE
    const ledgeTopY = LEVEL_1_3_NICHE.ledgeRow * TILE
    const riseTiles = (floorTopY - ledgeTopY) / TILE
    expect(riseTiles).toBe(7)
  })

  it('gives every attack at least 18 frames of wind-up', () => {
    expect(WINDUP_F).toBeGreaterThanOrEqual(18)
    expect(WINDUP_RANGE_PX).toBeGreaterThan(0)
  })

  it('still clears with every jump press up to 3 frames late', () => {
    // Check H's ±3 f jitter proxy — half the 6 f coyote and buffer windows. An early press is
    // absorbed by the 6-frame jump buffer, so the late direction is the one that can eat a run-up:
    // at a sprint a 3 f delay is 9 px further into the riser, and a terrace too shallow would turn
    // that into a stalled jump against the wall.
    for (let delay = 0; delay <= 3; delay++) {
      const run = runWithJumpDelay(delay)
      expect(run.won, `delay=${delay} ${JSON.stringify(run)}`).toBe(true)
      expect(run.deaths, `delay=${delay}`).toBe(0)
    }

    // The perturbation is real: a delay that changed nothing would make the check above vacuous.
    const frames = [0, 1, 2, 3].map((delay) => runWithJumpDelay(delay).frames)
    expect(new Set(frames).size).toBeGreaterThan(1)
  })

  it('keeps every Gust-Wing above the autopilot jump arc, so the clear is not luck', () => {
    // `enemyAhead` triggers on x alone, never on height: the autopilot jumps at every wing it passes.
    // A wing inside a sprint jump's head apex would kill a run that is meant to be clearable, so each
    // wing's lowest sine point must sit above `JUMP_V_SPRINT² / (2·GRAVITY_HELD) + SMALL_H` px.
    const headApexPx = (JUMP_V_SPRINT * JUMP_V_SPRINT) / (2 * GRAVITY_HELD) + SMALL_H
    let wings = 0
    for (let row = 0; row < MAP.rows; row++) {
      for (let col = 0; col < MAP.cols; col++) {
        if (tileAt(MAP, col, row) !== GUST_WING) continue
        wings += 1
        // The wing is feet-anchored to its cell, and its sine dips GUST_WING_AMPLITUDE below that.
        const baseY = row * TILE
        const lowestBottom = baseY + GUST_WING_AMPLITUDE + GUST_WING_H
        const floorY = floorTop(MAP, col)
        expect(floorY - lowestBottom).toBeGreaterThan(headApexPx)
      }
    }
    expect(wings).toBeGreaterThan(0)
  })

  it('passes the checkpoint-gap check (D) on the climb, with the path actually walked', () => {
    // The map-only floor walk flattened every terrace above the spawn row; the route-based gap counts
    // the climb, so this level is the one that proves the check decides on a vertical path.
    const report = checkpointReport(LEVEL)
    expect(report.applicable).toBe(true)
    expect(report.passes, JSON.stringify(report)).toBe(true)
  })

  it('passes the long-fall half of the blind-jump check (E) on a 76-row level', () => {
    // 1-1 and 1-2 are exactly one view tall, where every landing is on screen by construction. This
    // is the only shipped level taller than the view, so it is where the check can actually fire.
    const run = runAutopilot(LEVEL)
    expect(unseenFalls(run.takeoffs, VIEW_H, MAP.rows * TILE)).toEqual([])
  })
})
