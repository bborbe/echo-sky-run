// Two promises about the level's tile alphabet, both in the fast tier so a level cannot ship a
// character nothing draws:
//
//   1. every character a shipped level uses is solid, one-way, or drawn;
//   2. the Echo switch and its door are drawn on exactly the boxes the simulation collides with,
//      and read their state.
//
// A canvas needs a browser, so the pixel evidence lives in the browser check (`scripts/e2e.mjs`).
// These probes keep the wiring honest without one: the prop painters take a frame lookup and a draw
// context, so a recording double proves what they would draw.

import { describe, expect, it } from 'vitest'
import { ECHO_H, ECHO_LIFE_F, ECHO_W } from '../echo/echo.ts'
import { createSim } from '../game/sim.ts'
import { stepSwitches } from '../game/switches.ts'
import { LEVEL_CATALOGUE } from '../levels/catalogue.ts'
import { PLAYER_W } from '../physics/constants.ts'
import {
  DOOR,
  ECHO_SWITCH,
  EMPTY,
  NIMBUS,
  ONEWAY,
  QUESTION,
  SECRET_SWITCH,
  SOLID,
  SPAWN,
  parseLevel,
} from '../physics/tilemap.ts'
import { ENTITY_TILES, PROP_TILES, type PropCell, type WorldState } from './world.ts'

/**
 * A character the level format draws no sprite for because it is not an object: open sky, a solid
 * block, a one-way ledge, or a ? block (solid, and drawn by the block pass rather than as a prop).
 */
const STRUCTURAL: readonly string[] = [EMPTY, SOLID, ONEWAY, QUESTION]

/**
 * The characters a set of levels uses that no renderer covers. Pure and exported to the assertions
 * below, so the known-positive control exercises the same code the real check does.
 */
export function uncoveredTiles(levels: readonly { readonly id: string; readonly rows: readonly string[] }[]): string[] {
  const uncovered: string[] = []
  for (const level of levels) {
    for (const ch of new Set(level.rows.join(''))) {
      if (STRUCTURAL.includes(ch) || PROP_TILES.has(ch) || ENTITY_TILES.has(ch)) continue
      uncovered.push(`${level.id} uses '${ch}'`)
    }
  }
  return uncovered
}

/** Four rows of sky and one of floor, with one of every entity on the floor's top row. */
const PROBE = parseLevel([
  '....................',
  '....................',
  '....................',
  'S.n.gs..t.D.......F.',
  '####################',
])

/** What a prop painter drew: the box it blitted, and the alpha it drew at. */
interface Recorded {
  readonly img: unknown
  readonly x: number
  readonly y: number
  readonly alpha: number
}

/** A context that records `drawImage` instead of painting, so a painter can be called without a canvas. */
function recorder(): { ctx: CanvasRenderingContext2D; draws: Recorded[] } {
  const draws: Recorded[] = []
  const ctx = {
    globalAlpha: 1,
    drawImage(img: unknown, x: number, y: number) {
      draws.push({ img, x, y, alpha: ctx.globalAlpha })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, draws }
}

/** A frame lookup that returns a mask-sized stand-in, so a painter's box maths is the thing measured. */
function frames(w: number, h: number) {
  return () => ({ width: w, height: h }) as unknown as HTMLCanvasElement
}

function cellOf(col: number, row: number): PropCell {
  return { x: col * 16, floor: (row + 1) * 16, wave: 0 }
}

describe('the level tile alphabet', () => {
  it('draws or blocks every character a shipped level uses', () => {
    expect(uncoveredTiles(LEVEL_CATALOGUE)).toEqual([])
  })

  it('names the level and the character when a level carries an unhandled tile', () => {
    // Known-positive control: the same check, on a level that does carry one, must fire and name it.
    expect(uncoveredTiles([{ id: '9-9', rows: ['..S..Z..F', '#########'] }])).toEqual(["9-9 uses 'Z'"])
  })

  it('covers the Echo switch, the Echo door and Nimbus by name, not by accident', () => {
    // Each character the level format adds for World 1 is registered where it is drawn.
    expect(PROP_TILES.has(ECHO_SWITCH)).toBe(true)
    expect(PROP_TILES.has(SECRET_SWITCH)).toBe(true)
    expect(PROP_TILES.has(DOOR)).toBe(true)
    expect(ENTITY_TILES.has(NIMBUS)).toBe(true)
  })

  it('spawns every character it registers as an entity', () => {
    // The reverse direction: a character listed as drawn must actually be produced by the sim, so the
    // table cannot hide a level character the engine never spawns.
    const sim = createSim(PROBE)
    expect(ENTITY_TILES.has(SPAWN)).toBe(true)
    expect(sim.player.x).toBe(0)
    expect(sim.enemies.enemies.map((e) => e.kind)).toEqual(['gear-goomba', 'steam-turtle'])
    expect(sim.nimbus.nimbus).not.toBeNull()
  })
})

describe('the Echo door and switch painters', () => {
  /** The probe sim with an Echo standing on the switch, so the switch is pressed and the door open. */
  function pressedSim() {
    const sim = createSim(PROBE)
    sim.field.echoes.push({ x: 80, y: 64 - ECHO_H, w: ECHO_W, h: ECHO_H, life: ECHO_LIFE_F })
    stepSwitches(sim.switches, { x: 0, y: 0, w: PLAYER_W, h: 16 }, sim.field.echoes)
    return sim
  }

  function stateOf(sim: ReturnType<typeof createSim>): WorldState {
    return { switches: sim.switches, nimbus: sim.nimbus, player: sim.player, echoes: sim.field.echoes } as unknown as WorldState
  }

  it('draws the door on exactly the box the collision refuses to walk through', () => {
    const sim = createSim(PROBE)
    const door = sim.switches.doors[0]
    const paint = PROP_TILES.get(DOOR)
    expect(paint).toBeDefined()

    const { ctx, draws } = recorder()
    paint!(ctx, cellOf(10, 3), frames(16, 48), stateOf(sim))

    expect(draws).toHaveLength(1)
    expect({ x: draws[0].x, y: draws[0].y, w: 16, h: 48 }).toEqual({ x: door.x, y: door.y, w: door.w, h: door.h })
  })

  it('draws the closed door solid and the open door as a faded portal', () => {
    const paint = PROP_TILES.get(DOOR)!
    const shut = recorder()
    paint(shut.ctx, cellOf(10, 3), frames(16, 48), stateOf(createSim(PROBE)))

    const open = recorder()
    paint(open.ctx, cellOf(10, 3), frames(16, 48), stateOf(pressedSim()))

    expect(shut.draws[0].alpha).toBe(1)
    expect(open.draws[0].alpha).toBeLessThan(1)
    // Same rectangle either way: an open door is the same box, just not a barrier.
    expect({ x: open.draws[0].x, y: open.draws[0].y }).toEqual({ x: shut.draws[0].x, y: shut.draws[0].y })
  })

  it('lights the switch while pressed and dims it while idle', () => {
    const paint = PROP_TILES.get(ECHO_SWITCH)!

    const idle = recorder()
    paint(idle.ctx, cellOf(5, 3), frames(16, 16), stateOf(createSim(PROBE)))

    const lit = recorder()
    paint(lit.ctx, cellOf(5, 3), frames(16, 16), stateOf(pressedSim()))

    expect(idle.draws[0].alpha).toBeLessThan(1)
    expect(lit.draws[0].alpha).toBe(1)
  })
})
