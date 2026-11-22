/**
 * The autopilot's jump decision: a forward gap and an enemy were its only triggers, so a level whose
 * route climbs — a wall or a one-tile step-up — could not be cleared at all. These tests pin the new
 * trigger beside the two old ones, and the fixture level is the positive control: a wall the bot has
 * to climb, which the lip-only rule holds right into forever.
 */

import { describe, expect, it } from 'vitest'
import { createSim, stepSim, type SimInput, type SimState } from '../game/sim.ts'
import { TILE } from '../physics/constants.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { autopilotDecision, runAutopilot } from './autopilot.ts'
import type { LevelToolkitProfile } from './level.ts'

/** One idle fixed step — the same shape the keyboard produces when no key is held. */
const IDLE: SimInput = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  sprint: false,
  echoPressed: false,
}

/**
 * A sim with Pip settled on the floor through the real step, then moved to `col`. The ground flag is
 * whatever `stepSim` produced, never a hand-set `grounded` — a flag the game does not produce would
 * let the decision read a state the run cannot reach.
 */
function settledAt(rows: readonly string[], col: number): SimState {
  const sim = createSim(parseLevel(rows))
  for (let frame = 0; frame < 10; frame++) stepSim(sim, IDLE)
  expect(sim.player.grounded).toBe(true)
  sim.player.x = col * TILE
  return sim
}

/** Flat floor with a one-tile step-up four columns ahead of the spawn. */
const STEP_UP_ROWS: readonly string[] = [
  '........',
  '........',
  '........',
  'S...#..F',
  '########',
]

/** Flat floor with a two-column gap. */
const LIP_ROWS: readonly string[] = [
  '........',
  '........',
  '........',
  'S......F',
  '####..##',
]

/** Flat floor with one Gear-Goomba four columns ahead of the spawn. */
const ENEMY_ROWS: readonly string[] = [
  '........',
  '........',
  '........',
  'S...g..F',
  '########',
]

/**
 * The positive control: a level whose only route is a climb. A two-tile wall stands between the
 * spawn and the goal, with the goal on the ledge above it, so a driver that only jumps at a missing
 * lip holds right into the wall and never finishes. It is a fixture, not a shipped level — no
 * enemies, no Echo, no rating-guide claims.
 */
const CLIMB_FIXTURE: LevelToolkitProfile = {
  id: 'fixture-climb',
  rows: [
    '......................',
    '......................',
    '......................',
    '...................F..',
    '.......##############.',
    'S......##############.',
    '######################',
  ],
  echoAtX: null,
}

describe('the autopilot decision', () => {
  it('jumps at a one-tile step-up while grounded', () => {
    const sim = settledAt(STEP_UP_ROWS, 3)

    expect(autopilotDecision(sim, null, false).jumpPressed).toBe(true)
  })

  it('does not jump on flat ground', () => {
    const sim = settledAt(STEP_UP_ROWS, 1)

    expect(autopilotDecision(sim, null, false).jumpPressed).toBe(false)
  })

  it('still jumps at a missing lip', () => {
    // The leading edge sits in the gap column, the state the old rule already read.
    const sim = settledAt(LIP_ROWS, 4)

    expect(autopilotDecision(sim, null, false).jumpPressed).toBe(true)
  })

  it('still jumps at an enemy ahead', () => {
    const sim = settledAt(ENEMY_ROWS, 1)
    const enemy = sim.enemies.enemies[0]
    expect(enemy).toBeDefined()
    sim.player.x = enemy.x - 32

    expect(autopilotDecision(sim, null, false).jumpPressed).toBe(true)
  })
})

describe('the autopilot climbs a wall', () => {
  it('clears a level whose only route is a climb, with no deaths', () => {
    const run = runAutopilot(CLIMB_FIXTURE)

    expect(run.won).toBe(true)
    expect(run.died).toBe(false)
    expect(run.deaths).toBe(0)
  })
})
