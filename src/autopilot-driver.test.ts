/**
 * The `?autopilot=1` driver, tested where a browser cannot be reached: the decision path it shares
 * with the toolkit run, its level-agnosticism, and the fact that its input comes from the shared
 * decision rather than from a baked array.
 *
 * The two-fixture clear is the level-agnosticism proof. The second fixture is deliberately not a
 * copy of 1-1: it is narrower, its gap sits elsewhere and its `echoAtX` differs, so a decision that
 * hardcodes 1-1 geometry cannot clear it.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createAutopilotDriver } from './autopilot-driver.ts'
import { createSim, stepSim } from './game/sim.ts'
import { LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_ROWS } from './levels/level1-1.level.ts'
import { TILE } from './physics/constants.ts'
import { autopilotDecision } from './toolkit/autopilot.ts'
import { profileMap, type LevelToolkitProfile } from './toolkit/level.ts'

// The driver is expected to derive its input from this function, so a test can replace what it
// returns and see the driver follow. The real implementation stays the default for every other test.
vi.mock('./toolkit/autopilot.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./toolkit/autopilot.ts')>()
  return { ...actual, autopilotDecision: vi.fn(actual.autopilotDecision) }
})

const LEVEL_1_1: LevelToolkitProfile = {
  id: '1-1',
  rows: LEVEL_1_1_ROWS,
  echoAtX: LEVEL_1_1_ECHO_AT_X,
}

/**
 * A flat level of its own shape: one enemy, one spawn, one goal, and a gap wider than a sprint jump
 * so the Echo has to be placed. Built rather than hand-drawn so the columns stay countable.
 */
function syntheticRows(cols: number, gapFirst: number, gapLast: number, enemyCol: number): string[] {
  const blank = (): string => '#' + '.'.repeat(cols - 2) + '#'
  const rows: string[] = []
  for (let row = 0; row < 6; row++) rows.push(blank())

  const play = Array.from({ length: cols }, () => '.')
  play[0] = '#'
  play[1] = 'S'
  play[enemyCol] = 'g'
  play[cols - 3] = 'F'
  play[cols - 1] = '#'
  rows.push(play.join(''))

  const ground = Array.from({ length: cols }, () => '#')
  for (let col = gapFirst; col <= gapLast; col++) ground[col] = '.'
  rows.push(ground.join(''))
  rows.push(ground.join(''))
  return rows
}

const SYNTHETIC_GAP = { firstCol: 26, lastCol: 39 } as const
const SYNTHETIC: LevelToolkitProfile = {
  id: 'synthetic',
  rows: syntheticRows(48, SYNTHETIC_GAP.firstCol, SYNTHETIC_GAP.lastCol, 8),
  echoAtX: (SYNTHETIC_GAP.firstCol + 6) * TILE,
}

/** Drive a level through the driver, the way the frame loop does. */
function drive(profile: LevelToolkitProfile): { won: boolean; frames: number; echoPlaced: boolean } {
  const sim = createSim(profileMap(profile))
  const driver = createAutopilotDriver(profile.echoAtX)
  for (let frame = 0; frame < 3000; frame++) {
    stepSim(sim, driver.input(sim))
    if (sim.goalReached) return { won: true, frames: frame + 1, echoPlaced: driver.echoPlaced }
    if (sim.deaths > 0) return { won: false, frames: frame + 1, echoPlaced: driver.echoPlaced }
  }
  return { won: false, frames: 3000, echoPlaced: driver.echoPlaced }
}

describe('the autopilot driver', () => {
  it('clears 1-1 through the shared decision', () => {
    const run = drive(LEVEL_1_1)

    expect(run.won).toBe(true)
    expect(run.echoPlaced).toBe(true)
  })

  it('clears a second, differently shaped level through the same driver', () => {
    expect(SYNTHETIC.echoAtX).not.toBe(LEVEL_1_1.echoAtX)

    const run = drive(SYNTHETIC)

    expect(run.won).toBe(true)
    expect(run.echoPlaced).toBe(true)
  })

  it('takes its input from the shared decision, not from a baked array', () => {
    const sim = createSim(profileMap(LEVEL_1_1))
    const driver = createAutopilotDriver(LEVEL_1_1.echoAtX)

    // On a fresh sim the real decision says "walk right, do not jump". A driver replaying a baked
    // array would keep saying that; one that asks the decision follows the stub.
    vi.mocked(autopilotDecision).mockReturnValueOnce({ jumpPressed: true, echoPressed: true, echoUsed: true })
    const input = driver.input(sim)

    expect(input.jumpPressed).toBe(true)
    expect(input.echoPressed).toBe(true)
    expect(driver.echoPlaced).toBe(true)
  })

  it('starts a new run with the Echo unplaced', () => {
    const sim = createSim(profileMap(LEVEL_1_1))
    const driver = createAutopilotDriver(LEVEL_1_1.echoAtX)
    vi.mocked(autopilotDecision).mockReturnValueOnce({ jumpPressed: false, echoPressed: true, echoUsed: true })
    driver.input(sim)
    expect(driver.echoPlaced).toBe(true)

    driver.reset()

    expect(driver.echoPlaced).toBe(false)
  })

  it('carries no per-level data', () => {
    // A copy of the level import would make this fail, which is the drift the shared decision and
    // this module exist to prevent.
    const source = readFileSync(new URL('./autopilot-driver.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/LEVEL_1_1/)
  })
})
