/**
 * Level 1-1 "Meadow Ledge" — its declarative spec, read by `make level-check`.
 *
 * The values are design estimates (World Design Guide § Difficulty Profile: recalibrate from section
 * sheets and median attempts after each play gate), not measurements.
 */

import { TILE } from '../physics/constants.ts'
import { LEVEL_1_1_COLS, LEVEL_1_1_ROWS } from './level1-1.level.ts'
import type { LevelSpec } from '../toolkit/level-spec.ts'

/** The far side of the 13-tile Echo gap: past it, the level is crossable to the goal. */
const GAP_FAR_SIDE = { kind: 'rect', x: 63 * TILE, y: 10 * TILE, w: 12 * TILE, h: 3 * TILE } as const

export const LEVEL_1_1_SPEC: LevelSpec = {
  id: '1-1',
  name: 'MEADOW LEDGE',
  primaryProblem: 'Cross a gap wider than a sprint jump by placing an Echo in mid-air and jumping off it.',
  echoRole: 'central',
  echoUses: ['platform'],
  difficulty: {
    precision: 1,
    timing: 1,
    movement: 2,
    echoPlanning: 1,
    spatialReasoning: 1,
    enemyPressure: 1,
  },
  structure: { cols: LEVEL_1_1_COLS, rows: LEVEL_1_1_ROWS.length },
  goalNeedsEcho: true,
  beats: [
    {
      id: 'echo-gap',
      description: 'the 13-tile gap at cols 50-62, crossed only from an Echo placed in mid-air',
      target: GAP_FAR_SIDE,
    },
  ],
  forbiddenSolutions: [
    {
      id: 'cross-the-gap-without-echo',
      description: 'reach the far side of the Echo gap with the Echo key never pressed',
      target: GAP_FAR_SIDE,
      echo: false,
      expect: 'blocked',
    },
  ],
  notes: [
    'The 3-tile gap at cols 28-30 is jumpable by design; only the 13-tile gap is the Echo beat.',
  ],
  rows: LEVEL_1_1_ROWS,
}
