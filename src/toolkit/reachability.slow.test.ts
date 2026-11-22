/**
 * The reachability solver's own checks — deliberately NOT in `make test`.
 *
 * The solver is slow by nature (the exact search runs to its cap on every level whose space it cannot
 * exhaust), so it lives in the slow tier: `npm run test:slow`, `make test-all`, the nightly job and the
 * release job. `make test` — the gate on every PR — never runs it.
 *
 * What is asserted here is the trust contract, not a snapshot:
 *   - a completion must replay through `stepSim` to the goal (a solver whose answer cannot be replayed is
 *     not a solver);
 *   - an unreachable claim must come from an exhausted space or a proof, never from a cap;
 *   - a capped run must say `inconclusive` and name the cap.
 */

import { describe, expect, it } from 'vitest'
import { LEVEL_1_1_SPEC } from '../levels/level1-1.spec.ts'
import { LEVEL_1_2_SPEC } from '../levels/level1-2.spec.ts'
import { createSim, stepSim } from '../game/sim.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { replay, solve, stateKey, stripEnemiesAndItems, type ReachTarget } from './reachability.ts'

const GOAL: ReachTarget = { kind: 'goal' }
const BEAT = LEVEL_1_2_SPEC.beats[0]

/** A cheap cap for the cases whose point is the cap behaviour, not the space size. */
const SMALL_CAP = { maxStates: 40_000 }

/**
 * A goal sealed behind a solid wall, with Pip in a one-tile cell so the reachable space really is tiny.
 * A bigger "walled-off" room is not enough: velocity and the P-meter still multiply into millions of
 * states even in a three-tile room, and the run would be inconclusive rather than exhausted.
 */
const WALLED_OFF_ROWS: readonly string[] = [
  '#####',
  '#S#F#',
  '#####',
]

describe('the solver drives the real simulation', () => {
  it('replays a found completion through stepSim to the goal', () => {
    const result = solve({ rows: LEVEL_1_1_SPEC.rows, target: GOAL, echo: true, strip: true })
    expect(result.verdict).toBe('reachable')
    expect(result.inputs).not.toBeNull()

    // Independent replay: a fresh sim, the emitted inputs, the real stepSim, and nothing else.
    const map = parseLevel(stripEnemiesAndItems(LEVEL_1_1_SPEC.rows))
    const sim = createSim(map)
    let frames = 0
    for (const input of result.inputs ?? []) {
      stepSim(sim, input)
      frames += 1
    }
    expect(sim.goalReached).toBe(true)
    expect(frames).toBe(result.frames)
  })

  it('replays the 1-2 completion to the goal', () => {
    const result = solve({ rows: LEVEL_1_2_SPEC.rows, target: GOAL, echo: true, strip: true })
    expect(result.verdict).toBe('reachable')
    const map = parseLevel(stripEnemiesAndItems(LEVEL_1_2_SPEC.rows))
    expect(replay(map, result.inputs ?? [], GOAL).won).toBe(true)
  })
})

describe('Echo necessity', () => {
  it('reaches 1-2’s Echo beat with the Echo', () => {
    const result = solve({ rows: LEVEL_1_2_SPEC.rows, target: BEAT.target, echo: true, strip: true, via: BEAT.via })
    expect(result.verdict).toBe('reachable')
    const map = parseLevel(stripEnemiesAndItems(LEVEL_1_2_SPEC.rows))
    expect(replay(map, result.inputs ?? [], BEAT.target).won).toBe(true)
  })

  it('cannot reach 1-2’s Echo beat without the Echo, and says how it knows', () => {
    const result = solve({
      rows: LEVEL_1_2_SPEC.rows,
      target: BEAT.target,
      echo: false,
      strip: true,
      via: BEAT.via,
      caps: SMALL_CAP,
    })
    expect(result.verdict).toBe('unreachable')
    expect(result.reason).toContain('static proof')
  })

  it('records 1-2’s goal as reachable without the Echo — the running line is by design', () => {
    // The level's own toolkit test says "a player who never climbs still finishes". A solver that
    // reported this unreachable would be sending someone to redesign a level that is fine.
    const result = solve({ rows: LEVEL_1_2_SPEC.rows, target: GOAL, echo: false, strip: true })
    expect(result.verdict).toBe('reachable')
    const map = parseLevel(stripEnemiesAndItems(LEVEL_1_2_SPEC.rows))
    expect(replay(map, result.inputs ?? [], GOAL).won).toBe(true)
  })

  it('records 1-1 without the Echo honestly — inconclusive, never a guessed unreachable', () => {
    const result = solve({ rows: LEVEL_1_1_SPEC.rows, target: GOAL, echo: false, strip: true, caps: SMALL_CAP })
    expect(result.verdict).toBe('inconclusive')
    expect(result.cap).toBe('states')
    expect(result.reason).toContain('states cap')
  })
})

describe('the three-valued contract', () => {
  it('reports a walled-off goal as unreachable, by exhausting the space', () => {
    const result = solve({ rows: WALLED_OFF_ROWS, target: GOAL, echo: true, strip: true })
    expect(result.verdict).toBe('unreachable')
    expect(result.stats.engine).toBe('exact')
    expect(result.reason).toContain('exhausted')
  })

  it('reports a capped run as inconclusive and names the cap, never unreachable', () => {
    const result = solve({
      rows: LEVEL_1_1_SPEC.rows,
      target: GOAL,
      echo: false,
      strip: true,
      caps: { maxStates: 5_000 },
    })
    expect(result.verdict).toBe('inconclusive')
    expect(result.cap).toBe('states')
    expect(result.frames).toBeNull()
    expect(result.inputs).toBeNull()
  })
})

describe('the state key', () => {
  it('strips enemies and items and leaves the geometry alone', () => {
    expect(stripEnemiesAndItems(['S.g?tF#=Cn'])).toEqual(['S....F#=C.'])
  })

  it('throws rather than rounding a value that is off the 1/32 lattice', () => {
    const sim = createSim(parseLevel(WALLED_OFF_ROWS))
    sim.player.x = 1 / 3 // not a multiple of 1/32
    expect(() => stateKey(sim)).toThrow(/off the 1\/32 lattice/)
  })
})

/**
 * Held-out cases: the verdict must follow the GEOMETRY, not the level id.
 *
 * Every other test here names a shipped level and a known expected value, which a lookup table keyed
 * on the level id could satisfy without searching at all. These two change one cell of the map and
 * require the opposite verdict from the same code, so a table cannot pass them:
 *
 *   - the sealed room, opened by one tile, flips `unreachable` -> `reachable`;
 *   - 1-2's corridor, sealed at its only mouth, stops being `reachable` for the Echo beat.
 */
describe('held-out: the verdict follows the geometry', () => {
  /** Replace one character of one row. */
  const withCell = (rows: readonly string[], col: number, row: number, ch: string): readonly string[] =>
    rows.map((r, i) => (i === row ? r.slice(0, col) + ch + r.slice(col + 1) : r))

  it('flips the sealed room to reachable when the wall is opened', () => {
    const sealed = solve({ rows: WALLED_OFF_ROWS, target: GOAL, echo: true, strip: true })
    expect(sealed.verdict).toBe('unreachable')

    // Row 1 is `#S#F#`; open the wall at col 2 and the same goal becomes reachable.
    const opened = withCell(WALLED_OFF_ROWS, 2, 1, '.')
    const result = solve({ rows: opened, target: GOAL, echo: true, strip: true })
    expect(result.verdict).toBe('reachable')
    expect(replay(parseLevel(stripEnemiesAndItems(opened)), result.inputs ?? [], GOAL).won).toBe(true)
  })

  it('stops reaching 1-2’s Echo beat when the corridor mouth is sealed', () => {
    // The corridor is open only at its near end (cols 5-6, rows 6-8). Wall that mouth and the alcove
    // has no entrance at all — the beat must stop being reachable, though the level id is unchanged.
    let sealed = LEVEL_1_2_SPEC.rows
    for (const row of [6, 7, 8]) sealed = withCell(sealed, 5, row, '#')

    const before = solve({ rows: LEVEL_1_2_SPEC.rows, target: BEAT.target, echo: true, strip: true, via: BEAT.via })
    expect(before.verdict).toBe('reachable')

    const after = solve({ rows: sealed, target: BEAT.target, echo: true, strip: true, via: BEAT.via, caps: SMALL_CAP })
    expect(after.verdict).not.toBe('reachable')
  })
})
