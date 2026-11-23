/**
 * Level 1-2 "Gear Garden" — its declarative spec, read by `make level-check`.
 *
 * 1-2's Echo beat is NOT the goal. The goal sits on the running line and the level deliberately keeps
 * it reachable without the Echo (`level1-2.toolkit.test.ts`: "a player who never climbs still
 * finishes"). The Echo requirement is the sealed corridor behind the door: the switch holds the door
 * open, and only an Echo left on the switch can hold it while Pip walks through.
 *
 * The values are design estimates (World Design Guide § Difficulty Profile), not measurements.
 */

import { TILE } from '../physics/constants.ts'
import { LEVEL_1_2_COLS, LEVEL_1_2_DOOR_COL, LEVEL_1_2_ROWS, LEVEL_1_2_SWITCH_COL } from './level1-2.level.ts'
import type { LevelSpec } from '../toolkit/level-spec.ts'

/** Standing on the switch, on the corridor ledge — the first leg of the beat's route. */
const ON_THE_SWITCH = {
  kind: 'rect',
  x: LEVEL_1_2_SWITCH_COL * TILE,
  y: 8 * TILE,
  w: TILE,
  h: TILE,
} as const

/** The sealed corridor behind the door: cols 18-25, rows 6-8 — the reward area only the Echo reaches. */
const ALCOVE = {
  kind: 'rect',
  x: (LEVEL_1_2_DOOR_COL + 1) * TILE,
  y: 6 * TILE,
  w: 8 * TILE,
  h: 3 * TILE,
} as const

export const LEVEL_1_2_SPEC: LevelSpec = {
  id: '1-2',
  name: 'GEAR GARDEN',
  primaryProblem: 'Hold the Echo door open with an Echo on its switch while Pip walks through.',
  echoRole: 'required',
  echoUses: ['switch-holder'],
  difficulty: {
    precision: 1,
    timing: 1,
    movement: 2,
    echoPlanning: 2,
    spatialReasoning: 1,
    enemyPressure: 1,
  },
  structure: { cols: LEVEL_1_2_COLS, rows: LEVEL_1_2_ROWS.length },
  goalNeedsEcho: false,
  beats: [
    {
      id: 'door-alcove',
      description: `the sealed corridor behind the door at col ${LEVEL_1_2_DOOR_COL}, entered only while an Echo holds the switch`,
      target: ALCOVE,
      via: [ON_THE_SWITCH],
    },
  ],
  forbiddenSolutions: [
    {
      id: 'pass-the-door-without-echo',
      description: 'reach the corridor behind the door with the Echo key never pressed',
      target: ALCOVE,
      echo: false,
      expect: 'blocked',
    },
  ],
  notes: [
    'The goal is reachable without the Echo by design: the ledge sits above the running line, so a player who never climbs still finishes. Echo necessity is claimed for the beat, not the flag.',
    'The Echo must be placed MID-AIR over the switch: a placement while standing on the corridor floor is refused (the Echo box would sit inside the floor tile), so the switch cannot be held by a ground placement.',
  ],
  rows: LEVEL_1_2_ROWS,
}
