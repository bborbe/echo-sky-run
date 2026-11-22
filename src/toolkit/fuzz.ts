/**
 * Check K: random-input fuzz. Seeded, so a failure is reproducible from the seed alone — the physics
 * is deterministic and this driver adds no clock or `Math.random` of its own.
 *
 * Three invariants, each a way a level can be unshippable while still passing the scripted autopilot:
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
 * assertion, in the level's toolkit test.
 */

import { overlapsSolid } from '../physics/collision.ts'
import { PLAYER_W } from '../physics/constants.ts'
import { createSim, stepSim, type SimInput } from '../game/sim.ts'
import { parseLevel } from '../physics/tilemap.ts'

/** Runs and length. Sixteen runs of 40 s reaches the late stretch on a lucky line. */
export const FUZZ_RUNS = 16
export const FUZZ_FRAMES = 2400
/** A run of frames with no net movement that counts as stuck — 5 s of held input. */
export const FROZEN_LIMIT_F = 300
/**
 * How far Pip may drift and still count as stuck. A 12 px body in a 16 px cell can always jiggle a
 * pixel or two against a wall, so an exact-equality freeze test would never fire on the one shape it
 * exists to catch; a 3 px band is still far short of any real movement.
 */
export const FROZEN_SLACK_PX = 3

export interface FuzzOptions {
  readonly runs?: number
  readonly frames?: number
}

export type FuzzKind = 'inside-solid' | 'frozen' | 'threw'

export interface FuzzFinding {
  readonly seed: number
  readonly frame: number
  readonly kind: FuzzKind
  readonly detail: string
}

/** A tiny seeded PRNG, so a failure is reproducible from `seed` alone. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * One random input. Every flag draws its own value, so the six choices are independent: a single
 * shared draw makes `left` and `right` mutually exclusive and the fuzz never actually moves Pip left,
 * which is exactly the input shape a soft-lock hides in.
 */
export function randomInput(rand: () => number): SimInput {
  return {
    left: rand() < 0.25,
    right: rand() < 0.75,
    jump: rand() < 0.6,
    jumpPressed: rand() < 0.35,
    sprint: rand() < 0.5,
    echoPressed: rand() < 0.1,
  }
}

/** Drive `rows` through seeded random-input sequences and collect every finding. */
export function fuzzLevel(rows: readonly string[], options: FuzzOptions = {}): FuzzFinding[] {
  const runs = options.runs ?? FUZZ_RUNS
  const frames = options.frames ?? FUZZ_FRAMES
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

        // A finished run is frozen by design: `stepSim` stops advancing once the goal is reached, so
        // continuing to step it would report the finish itself as a soft-lock.
        if (sim.goalReached) break

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
 * The positive control: a one-cell well Pip cannot leave. Solid on both sides, a floor below and a
 * ceiling directly above his head, so nothing he presses moves him on either axis — the freeze
 * detector must fire. A check that cannot fire is worse than no check.
 */
export const WELL_FIXTURE: readonly string[] = [
  '##########',
  '#.......F#',
  '#..#.#...#',
  '#..###...#',
  '#..#S#...#',
  '##########',
]
