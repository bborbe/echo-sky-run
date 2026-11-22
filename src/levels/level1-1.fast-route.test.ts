/**
 * Level 1-1's fast route, measured through the real `stepSim`.
 *
 * The casual baseline is the operator's recorded designer run (1020 f, 17.0 s). The route must clear
 * 40–50 % below it — the band the replay goal's first success criterion sets — and it must do so
 * without breaking the level: every frame stays in bounds and out of a solid tile, and the route adds
 * no blind landing beyond the one the level's Echo jump already has.
 */

import { describe, expect, it } from 'vitest'
import { autopilotDecision, runAutopilot, TOOLKIT_VIEWPORT } from '../toolkit/autopilot.ts'
import { createSim, stepSim } from '../game/sim.ts'
import { MEDAL_FACTOR } from '../game/medals.ts'
import { PLAYER_W, TILE } from '../physics/constants.ts'
import { isSolid, parseLevel, tileAt, type TileMap } from '../physics/tilemap.ts'
import { logicalViewWidth } from '../render/camera.ts'
import { blindJumps } from '../toolkit/blind-jump.ts'
import {
  LEVEL_1_1_CHECKPOINT_COL,
  LEVEL_1_1_ECHO_AT_X,
  LEVEL_1_1_ROWS,
  LEVEL_1_1_SECTION_BOUNDS,
} from './level1-1.level.ts'
import {
  LEVEL_1_1_AUTOPILOT_FRAMES,
  LEVEL_1_1_CASUAL_FRAMES,
  LEVEL_1_1_MEDAL_TIMES,
} from './level1-1.times.ts'
import {
  LEVEL_1_1_FAST_FRAMES,
  LEVEL_1_1_FAST_ROUTE_SPRINT_UNTIL_TILE,
  level11FastRouteSprintAt,
  runLevel11FastRoute,
} from './level1-1.route.ts'

const MAP = parseLevel(LEVEL_1_1_ROWS)
const VIEW_W = logicalViewWidth(TOOLKIT_VIEWPORT.width, TOOLKIT_VIEWPORT.height)

/** A box overlapping a solid tile, with the tile-edge epsilon so a box ending on a boundary is clear. */
function overlapsSolid(map: TileMap, box: { x: number; y: number; w: number; h: number }): boolean {
  const firstCol = Math.floor(box.x / TILE)
  const lastCol = Math.floor((box.x + box.w - 1e-6) / TILE)
  const firstRow = Math.floor(box.y / TILE)
  const lastRow = Math.floor((box.y + box.h - 1e-6) / TILE)
  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = firstCol; col <= lastCol; col++) {
      if (isSolid(tileAt(map, col, row))) return true
    }
  }
  return false
}

/** A box inside the world's bounds. */
function inWorld(map: TileMap, box: { x: number; y: number; w: number; h: number }): boolean {
  return box.x >= 0 && box.x + box.w <= map.cols * TILE && box.y >= 0 && box.y + box.h <= map.rows * TILE
}

describe('level 1-1 fast route', () => {
  it('clears on the populated level with no deaths and exactly one Echo', () => {
    const run = runLevel11FastRoute()

    expect(run.won).toBe(true)
    expect(run.died).toBe(false)
    expect(run.deaths).toBe(0)
    expect(run.echoesPlaced).toBe(1)
    expect(run.frames).toBe(LEVEL_1_1_FAST_FRAMES)
  })

  it('clears 40–50 % below the recorded casual designer run', () => {
    const run = runLevel11FastRoute()
    const ratio = run.frames / LEVEL_1_1_CASUAL_FRAMES

    // 40 % faster is 0.60 of the casual time; 50 % faster is 0.50. Both edges inclusive.
    expect(ratio).toBeGreaterThanOrEqual(0.5)
    expect(ratio).toBeLessThanOrEqual(0.6)
    // The operator's own fast route (11.3 s = 678 f) is the bar this route beats.
    expect(run.frames).toBeLessThan(678)
  })

  it('is fast enough to earn the author medal, so the route and the medal table agree', () => {
    const run = runLevel11FastRoute()
    expect(run.frames).toBeLessThanOrEqual(LEVEL_1_1_MEDAL_TIMES.author)
  })

  it('holds the collision invariants on every frame', () => {
    const sim = createSim(MAP)
    let echoUsed = false
    let frames = 0

    for (let frame = 0; frame < 3000; frame++) {
      const decision = autopilotDecision(sim, LEVEL_1_1_ECHO_AT_X, echoUsed)
      echoUsed = decision.echoUsed
      stepSim(sim, {
        left: false,
        right: true,
        jump: true,
        jumpPressed: decision.jumpPressed,
        sprint: level11FastRouteSprintAt(sim.player.x),
        echoPressed: decision.echoPressed,
      })
      const box = { x: sim.player.x, y: sim.player.y, w: PLAYER_W, h: sim.player.h }
      expect(inWorld(MAP, box)).toBe(true)
      expect(overlapsSolid(MAP, box)).toBe(false)
      frames += 1
      if (sim.goalReached || sim.deaths > 0) break
    }

    expect(sim.goalReached).toBe(true)
    expect(sim.deaths).toBe(0)
    expect(frames).toBe(LEVEL_1_1_FAST_FRAMES)
  })

  it('adds no blind landing beyond the one the Echo jump already has', () => {
    const route = runLevel11FastRoute()
    const sprint = runAutopilot({ id: '1-1', rows: LEVEL_1_1_ROWS, echoAtX: LEVEL_1_1_ECHO_AT_X })

    const routeBlind = blindJumps(route.takeoffs, VIEW_W)
    const sprintBlind = blindJumps(sprint.takeoffs, VIEW_W)

    // The sprint clear's one blind landing is the level's known Echo jump; the route is slower at
    // that beat, so it may have fewer, never more.
    expect(sprintBlind).toHaveLength(1)
    expect(routeBlind.length).toBeLessThanOrEqual(sprintBlind.length)
  })

  it('sprints only the flat opening, so the sprint window is the route and not a held key', () => {
    // The plan is the route: one named window, ending on flat ground past the first enemy.
    expect(level11FastRouteSprintAt(0)).toBe(true)
    expect(level11FastRouteSprintAt((LEVEL_1_1_FAST_ROUTE_SPRINT_UNTIL_TILE - 1) * TILE)).toBe(true)
    expect(level11FastRouteSprintAt(LEVEL_1_1_FAST_ROUTE_SPRINT_UNTIL_TILE * TILE)).toBe(false)
    // A held sprint clears faster than the band's lower edge — which is why the route is a plan.
    expect(runAutopilot({ id: '1-1', rows: LEVEL_1_1_ROWS, echoAtX: LEVEL_1_1_ECHO_AT_X }, { sprint: true }).frames).toBeLessThan(
      LEVEL_1_1_FAST_FRAMES,
    )
  })

  it('splits at the level own beats, in order', () => {
    expect(tileAt(MAP, LEVEL_1_1_CHECKPOINT_COL, 11)).toBe('C')
    expect(LEVEL_1_1_SECTION_BOUNDS.length).toBe(3)
    expect([...LEVEL_1_1_SECTION_BOUNDS].sort((a, b) => a - b)).toEqual([...LEVEL_1_1_SECTION_BOUNDS])
    // The last boundary is the Echo gap's lip, the level's one lesson.
    expect(LEVEL_1_1_SECTION_BOUNDS[2]).toBe(50 * TILE)
  })

  it('keeps the recorded casual run the source of the medal factor', () => {
    // The factor is the casual clear over the autopilot reference; the constants cannot drift apart.
    expect(MEDAL_FACTOR).toBeCloseTo(LEVEL_1_1_CASUAL_FRAMES / LEVEL_1_1_AUTOPILOT_FRAMES, 12)
  })
})
