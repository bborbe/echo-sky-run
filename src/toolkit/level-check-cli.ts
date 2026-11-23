/**
 * The `make level-check LEVEL=<id>` entry point.
 *
 *   node --experimental-strip-types src/toolkit/level-check-cli.ts 1-2
 *
 * Prints one report for the level and exits non-zero when any check failed. `unverified` lines do not
 * fail the run — they say the search could not decide, which is a different thing from a defect.
 */

import { LEVEL_1_1_SPEC } from '../levels/level1-1.spec.ts'
import { LEVEL_1_2_SPEC } from '../levels/level1-2.spec.ts'
import { levelCheck, renderReport, renderWorldRule } from './level-check.ts'
import type { LevelSpec } from './level-spec.ts'

/** Every level that carries a spec, in catalogue order. */
export const LEVEL_SPECS: readonly LevelSpec[] = [LEVEL_1_1_SPEC, LEVEL_1_2_SPEC]

const id = process.argv[2]
if (id === undefined || id === '') {
  process.stderr.write('usage: level-check <level-id>\n')
  process.exit(2)
}

const spec = LEVEL_SPECS.find((candidate) => candidate.id === id)
if (spec === undefined) {
  process.stderr.write(`no spec for level ${id}; known: ${LEVEL_SPECS.map((s) => s.id).join(', ')}\n`)
  process.exit(2)
}

const report = levelCheck(spec)
process.stdout.write(`${renderReport(report, spec)}\n`)

const index = LEVEL_SPECS.indexOf(spec)
if (index > 0) {
  process.stdout.write(`\n${renderWorldRule(LEVEL_SPECS[index - 1], spec)}\n`)
}

process.exit(report.ok ? 0 : 1)
