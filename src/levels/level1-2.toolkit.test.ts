/**
 * The level toolkit, applied to level 1-2. Same checks as 1-1, with one difference the level itself
 * forces: 1-2's Echo use is the switch holding a door, not a mid-air Echo over a gap, so the level
 * has no pit-based Echo beat and `sweepNoEcho` — which sweeps pits — has nothing to sweep. The Echo
 * requirement lives in the door instead, and the door and seal tests below carry it.
 *
 *   A. the autopilot clears the *populated* level, with no deaths
 *   D. every respawn gap is ≤ 45 s, and a respawn returns control within 18 frames
 *   E. no jump on the critical path lands outside the view it was made from, and a long fall shows
 *      five tiles below the landing
 *   H. the critical path clears with every jump up to 3 frames late, with a safe spot every ≤ 20 s
 *   K. random input finds no soft-lock, no solid overlap and no crash
 *   L. every mechanic is met safely before its first lethal use
 *
 * The browser playthrough is the required check that cannot run in vitest — it lives in
 * `scripts/e2e.mjs` and `make test` runs it beside this file.
 */

import { describe, expect, it } from 'vitest'
import { LEVEL_1_2_CEILING, LEVEL_1_2_COLS, LEVEL_1_2_DOOR_COL, LEVEL_1_2_LEDGE, LEVEL_1_2_PITS, LEVEL_1_2_ROWS, LEVEL_1_2_SWITCH_COL } from './level1-2.level.ts'
import { createSim, stepSim } from '../game/sim.ts'
import { stepSwitches } from '../game/switches.ts'
import { WINDUP_F, WINDUP_RANGE_PX } from '../game/enemies.ts'
import { TILE } from '../physics/constants.ts'
import { CHECKPOINT } from '../physics/tilemap.ts'
import { runAutopilot, TOOLKIT_VIEWPORT, type Takeoff } from '../toolkit/autopilot.ts'
import { blindJumps, unseenFalls } from '../toolkit/blind-jump.ts'
import { checkpointReport } from '../toolkit/checkpoints.ts'
import { encounterList, firstLethalBeforeSafe } from '../toolkit/encounters.ts'
import { fuzzLevel } from '../toolkit/fuzz.ts'
import { jitterClear, safeSpotReport } from '../toolkit/jitter.ts'
import { echoBeats, profileMap, type LevelToolkitProfile } from '../toolkit/level.ts'
import { logicalViewWidth, VIEW_H } from '../render/camera.ts'
import { WALK_MAX } from '../physics/constants.ts'
import { findTile, GOAL, SPAWN } from '../physics/tilemap.ts'

const LEVEL: LevelToolkitProfile = {
  id: '1-2',
  rows: LEVEL_1_2_ROWS,
  // 1-2's Echo use is the switch, not a mid-air Echo over a pit: the level has no Echo beat, so it
  // declares no answer. `requireEchoAnswer` refuses a level that has a beat and no answer, which is
  // what keeps this honest once the switch stretch is laid out.
  echoAtX: null,
}

const MAP = profileMap(LEVEL)

/** 960×540 is the smallest viewport an agent drives, so it is the worst case for a blind landing. */
const VIEW_W = logicalViewWidth(TOOLKIT_VIEWPORT.width, TOOLKIT_VIEWPORT.height)

describe('level 1-2 passes the level toolkit', () => {
  it('is cleared by the autopilot on the populated level, with no deaths', () => {
    const run = runAutopilot(LEVEL)

    const summary = JSON.stringify({
      won: run.won,
      died: run.died,
      frames: run.frames,
      deaths: run.deaths,
    })
    expect(run.won, summary).toBe(true)
    expect(run.died).toBe(false)
    expect(run.deaths).toBe(0)
  })

  it('has no pit-based Echo beat: the Echo requirement is the door, not a gap', () => {
    // `sweepNoEcho` sweeps pits, and this level has none wide enough to be a beat. The Echo is
    // required by the door instead — the seal and door tests below carry that claim.
    expect(echoBeats(MAP)).toEqual([])
  })

  it('keeps every jump on the critical path inside the view it was made from', () => {
    const run = runAutopilot(LEVEL)
    expect(run.takeoffs.length).toBeGreaterThan(2)

    expect(blindJumps(run.takeoffs, VIEW_W)).toEqual([])
  })

  it('has a blind-jump check that actually fires: a planted off-screen landing is flagged', () => {
    // A check that cannot fire is worse than no check. This is the known-positive control.
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
    const spawn = findTile(MAP, SPAWN)
    const goal = findTile(MAP, GOAL)
    expect(spawn).not.toBeNull()
    expect(goal).not.toBeNull()

    // The guide's sanctioned fallback when no designer run exists yet: path pixels ÷ WALK_MAX.
    const estSeconds = ((goal?.x ?? 0) - (spawn?.x ?? 0)) / (WALK_MAX * 60)
    expect(estSeconds).toBeGreaterThanOrEqual(60)
    expect(estSeconds).toBeLessThanOrEqual(90)
  })

  it('measures the view the renderer actually draws at 960x540', () => {
    expect(VIEW_W).toBe(398)
  })

  it('is the width and pit set its own metadata claims', () => {
    expect(MAP.cols).toBe(LEVEL_1_2_COLS)
    expect(LEVEL_1_2_PITS).toHaveLength(2)
  })

  it('places one Echo switch and one door on the ledge, and the door starts closed', () => {
    const sim = createSim(MAP)
    expect(sim.switches.switches).toHaveLength(1)
    expect(sim.switches.doors).toHaveLength(1)

    const sw = sim.switches.switches[0]
    const door = sim.switches.doors[0]
    expect(sw.x).toBe(LEVEL_1_2_SWITCH_COL * TILE)
    expect(door.x).toBe(LEVEL_1_2_DOOR_COL * TILE)
    expect(door.open).toBe(false)
    // Three tiles tall and feet-anchored: its bottom edge is the ledge's floor.
    expect(door.h).toBe(48)
    expect(door.y + door.h).toBe(LEVEL_1_2_LEDGE.row * TILE)
  })

  it('opens the door only while the switch is pressed, so an Echo is what holds it', () => {
    const sim = createSim(MAP)
    const sw = sim.switches.switches[0]
    const door = sim.switches.doors[0]
    const onSwitch = { x: sw.x, y: sw.y, w: 12, h: 14 }
    const away = { x: sw.x + 200, y: sw.y, w: 12, h: 14 }

    stepSwitches(sim.switches, away, [])
    expect(door.open).toBe(false)

    stepSwitches(sim.switches, onSwitch, [])
    expect(door.open).toBe(true)

    // Pip walks off; the Echo left on the switch keeps pressing, which is the level's whole lesson.
    stepSwitches(sim.switches, away, [onSwitch])
    expect(door.open).toBe(true)

    stepSwitches(sim.switches, away, [])
    expect(door.open).toBe(false)
  })

  it('keeps the switch lesson off the running line', () => {
    // The ledge is above the floor the autopilot runs on, so a player who never climbs still
    // finishes, and a player who climbs meets the mechanic with nothing to fall from.
    expect(LEVEL_1_2_LEDGE.row).toBeLessThan(11)
    expect(LEVEL_1_2_LEDGE.firstCol).toBeLessThan(LEVEL_1_2_SWITCH_COL)
    expect(LEVEL_1_2_SWITCH_COL).toBeLessThan(LEVEL_1_2_DOOR_COL)
  })

  it('seals the door across the corridor, so it cannot be jumped over or walked around', () => {
    const sim = createSim(MAP)
    const door = sim.switches.doors[0]

    // The roof sits directly on the door's top edge. A jump peaks at about 67 px, which would clear
    // a free-standing 48 px door — the roof caps the rise at the door's own top, so it cannot.
    expect(door.y).toBe((LEVEL_1_2_CEILING.row + 1) * TILE)

    // The corridor is the ledge's full span, so there is no side route around the door either.
    expect(LEVEL_1_2_CEILING.firstCol).toBe(LEVEL_1_2_LEDGE.firstCol)
    expect(LEVEL_1_2_CEILING.lastCol).toBe(LEVEL_1_2_LEDGE.lastCol)
  })

  it('walls the corridor far end, leaving only the near mouth as an entrance', () => {
    const far = LEVEL_1_2_LEDGE.lastCol
    const near = LEVEL_1_2_LEDGE.firstCol
    for (const row of LEVEL_1_2_ROWS.slice(LEVEL_1_2_CEILING.row + 1, LEVEL_1_2_LEDGE.row)) {
      // Solid at the far end, open at the near end: the door is the only way through.
      expect(row[far]).toBe('#')
      expect(row[near]).toBe('.')
    }
  })

  it('claims the midpoint checkpoint, so a death past it does not send Pip back to the spawn', () => {
    const sim = createSim(MAP)
    const spawn = findTile(MAP, SPAWN)
    const cp = findTile(MAP, CHECKPOINT)
    expect(spawn).not.toBeNull()
    expect(cp).not.toBeNull()

    // The claim is an overlap with the checkpoint tile, so standing Pip on it claims it.
    sim.player.x = cp?.x ?? 0
    sim.player.y = cp?.y ?? 0
    stepSim(sim, {
      left: false,
      right: false,
      jump: false,
      jumpPressed: false,
      sprint: false,
      echoPressed: false,
    })

    expect(sim.respawn.x).toBe(cp?.x)
    expect(sim.respawn.x).not.toBe(spawn?.x)
  })

  it('gives every attack at least 18 frames of wind-up', () => {
    // The engine's wind-up is an approach trigger: the hit lands WINDUP_F frames after the enemy
    // notices Pip. The criterion's 18-frame floor is read off this constant, not guessed.
    expect(WINDUP_F).toBeGreaterThanOrEqual(18)
    expect(WINDUP_RANGE_PX).toBeGreaterThan(0)
  })

  it('passes the checkpoint-gap check (D): both respawn gaps ≤ 45 s and control within 18 f', () => {
    const report = checkpointReport(MAP)
    expect(report.passes, JSON.stringify(report)).toBe(true)
    for (const gap of report.gaps) expect(gap.seconds).toBeLessThanOrEqual(45)
    expect(report.respawnToControlFrames).toBeLessThanOrEqual(18)
  })

  it('passes the long-fall half of the blind-jump check (E): five tiles below every landing', () => {
    const run = runAutopilot(LEVEL)
    expect(unseenFalls(run.takeoffs, VIEW_H, MAP.rows * TILE)).toEqual([])
  })

  it('clears with every jump up to 3 frames late, and keeps a safe spot every ≤ 20 s (H)', () => {
    const jitter = jitterClear(LEVEL)
    expect(jitter.passes, JSON.stringify(jitter.runs)).toBe(true)
    expect(jitter.perturbationReal).toBe(true)

    const safe = safeSpotReport(LEVEL)
    expect(safe.applicable).toBe(true)
    expect(safe.passes, JSON.stringify(safe)).toBe(true)
  })

  it('survives random input with no soft-lock, solid overlap or crash (K)', () => {
    const findings = fuzzLevel(LEVEL_1_2_ROWS, { runs: 12, frames: 2400 })
    expect(findings, JSON.stringify(findings)).toEqual([])
  })

  it('meets every mechanic safely before its first lethal use (L)', () => {
    const encounters = encounterList(MAP)
    expect(encounters.length).toBeGreaterThan(0)
    expect(firstLethalBeforeSafe(encounters)).toEqual([])
  })
})
