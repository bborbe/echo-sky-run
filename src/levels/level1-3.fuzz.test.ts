/**
 * The fuzz check (the rating guide's check K), applied to level 1-3: random-input runs find zero
 * soft-locks or stuck states.
 *
 * It is seeded, so a failure is reproducible from the seed alone — the physics is deterministic and
 * this driver adds no clock or `Math.random` of its own. Three invariants, each a way a level can be
 * unshippable while still passing the scripted autopilot:
 *
 *   1. Pip never overlaps a solid tile — a collision resolution that can push him inside the level
 *      would strand a player the autopilot's single route never visits.
 *   2. He is never position-frozen for a long window while input is applied — the soft-lock shape,
 *      where a chamber or a corner traps him and nothing he presses moves him.
 *   3. A run never throws — a level that crashes the fixed step on one input sequence is a crash a
 *      scripted route can miss.
 *
 * It does NOT assert that every random run finishes: random input is not a player, and a level where
 * a coin-flip reaches the goal would be trivial. "The level can be finished" is the autopilot's
 * assertion, in `level1-3.toolkit.test.ts`.
 */

import { describe, expect, it } from 'vitest'
import { LEVEL_ROWS } from './level1-3.level.ts'
import { createSim, stepSim, type SimInput } from '../game/sim.ts'
import { overlapsSolid } from '../physics/collision.ts'
import { PLAYER_W } from '../physics/constants.ts'
import { parseLevel } from '../physics/tilemap.ts'

/** Runs and length. Twenty-four runs of 50 s is enough to reach the late terraces on a lucky line. */
const RUNS = 24
const FRAMES = 3000
/** A run of frames with no net movement that counts as stuck — 5 s of held input. */
const FROZEN_LIMIT_F = 300
/**
 * How far Pip may drift and still count as stuck. A 14 px body in a 16 px cell can always jiggle a
 * pixel or two against a wall, so an exact-equality freeze test would never fire on the one shape it
 * exists to catch; a 3 px band is still far short of any real movement.
 */
const FROZEN_SLACK_PX = 3

/** A tiny seeded PRNG, so a failure is reproducible from `seed` alone. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One random input, from a uniform draw. */
function randomInput(rand: () => number): SimInput {
  const r = rand()
  return {
    left: r < 0.25,
    right: r < 0.75,
    jump: r < 0.6,
    jumpPressed: r < 0.35,
    sprint: r < 0.5,
    echoPressed: r < 0.1,
  }
}

interface FuzzFinding {
  readonly seed: number
  readonly frame: number
  readonly kind: 'inside-solid' | 'frozen' | 'threw'
  readonly detail: string
}

/** Drive `rows` through `runs` seeded random-input sequences and collect every finding. */
function fuzz(rows: readonly string[], runs: number = RUNS, frames: number = FRAMES): FuzzFinding[] {
  const map = parseLevel(rows)
  const findings: FuzzFinding[] = []

  for (let run = 0; run < runs; run++) {
    const seed = 0x13 + run * 7919
    const rand = mulberry32(seed)
    let input = randomInput(rand)
    let framesSinceChange = 0
    // The window's anchor: the spot Pip has to leave to prove he is not stuck.
    let anchorX = Number.NaN
    let anchorY = Number.NaN
    let frozenF = 0

    try {
      const sim = createSim(map)
      for (let frame = 0; frame < frames; frame++) {
        // Hold an input for a stretch, then pick a new one: frame-by-frame noise is not a player.
        if (framesSinceChange >= 8 + Math.floor(rand() * 12)) {
          input = randomInput(rand)
          framesSinceChange = 0
        }
        framesSinceChange += 1

        stepSim(sim, input)

        const p = sim.player
        if (overlapsSolid({ x: p.x, y: p.y, w: PLAYER_W, h: p.h }, map)) {
          findings.push({ seed, frame, kind: 'inside-solid', detail: `x=${p.x} y=${p.y} h=${p.h}` })
          break
        }

        // A pit death respawns Pip to a new spot; that is movement, not a freeze. A body in a
        // one-cell cage can still jiggle against its walls, so the test is net displacement, not
        // frame-to-frame equality.
        if (
          Number.isNaN(anchorX) ||
          Math.abs(p.x - anchorX) > FROZEN_SLACK_PX ||
          Math.abs(p.y - anchorY) > FROZEN_SLACK_PX
        ) {
          anchorX = p.x
          anchorY = p.y
          frozenF = 0
        } else {
          frozenF += 1
        }
        if (frozenF > FROZEN_LIMIT_F) {
          findings.push({ seed, frame, kind: 'frozen', detail: `x=${p.x} y=${p.y} for ${frozenF} f` })
          break
        }
      }
    } catch (err) {
      findings.push({ seed, frame: -1, kind: 'threw', detail: String(err) })
    }
  }
  return findings
}

/**
 * The positive control: a one-cell cell Pip cannot leave. Solid on both sides, a floor below and a
 * ceiling directly above his head, so nothing he presses moves him on either axis — the freeze
 * detector must fire. A check that cannot fire is worse than no check.
 */
const WELL_FIXTURE: readonly string[] = [
  '##########',
  '#.......F#',
  '#..#.#...#',
  '#..###...#',
  '#..#S#...#',
  '##########',
]

describe('level 1-3 survives random input', () => {
  it('finds no soft-lock, no overlap with a solid, and no crash across seeded runs', () => {
    const findings = fuzz(LEVEL_ROWS)
    expect(findings, JSON.stringify(findings)).toEqual([])
  })

  it('has a fuzz check that actually fires: a capped well is reported as a freeze', () => {
    const findings = fuzz(WELL_FIXTURE, 1, 800)
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].kind).toBe('frozen')
  })
})
