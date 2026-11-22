/**
 * `make level-check LEVEL=<id>`: one report per level, read against the level's spec.
 *
 * It answers, for the level as shipped:
 *   - structure — does the map parse and match what the spec declares;
 *   - reachability — can the goal be reached at all;
 *   - the no-Echo result — recorded honestly, and checked against what the spec claims;
 *   - each Echo beat — reachable with the Echo, blocked without it;
 *   - each forbidden solution — blocked, or found (a fail);
 *   - the Echo timing margin (rating guide check M) — how much of the Echo's life is left when the
 *     Echo-dependent sequence ends on the found completion.
 *
 * Every line is `pass`, `fail` or `unverified`. `unverified` is not a pass: it means the search could
 * not decide, and it is printed with the cap it hit. Only `fail` fails the run.
 */

import { createSim, stepSim, type SimInput } from '../game/sim.ts'
import { findTile, GOAL, parseLevel, SPAWN, tileAt } from '../physics/tilemap.ts'
import type { LevelSpec } from './level-spec.ts'
import { difficultyViolations } from './level-spec.ts'
import { solve, type ReachResult, type ReachTarget } from './reachability.ts'

export type CheckStatus = 'pass' | 'fail' | 'unverified'

export interface CheckLine {
  readonly check: string
  readonly status: CheckStatus
  readonly detail: string
}

export interface LevelCheckReport {
  readonly id: string
  readonly name: string
  readonly lines: readonly CheckLine[]
  /** True when no line failed. `unverified` does not fail the run. */
  readonly ok: boolean
}

/** Every tile character a shipped level may use. */
const KNOWN_TILES = new Set(['.', '#', '=', 'F', 'S', 'g', 't', 'b', 'w', 'r', '?', 'C', 'i', 'n', 's', 'X', 'D'])

/** The rating guide's check M floor: at least this share of the Echo's life must be left. */
export const ECHO_MARGIN_FLOOR = 0.2

function verdictOf(result: ReachResult): string {
  if (result.verdict !== 'inconclusive') {
    const how = result.stats.engine === 'proof' ? ' (static proof)' : ''
    return result.verdict + how + (result.frames !== null ? ` in ${result.frames} f` : '')
  }
  return `inconclusive (${result.cap} cap) — ${result.reason ?? ''}`
}

/** One Echo placement found in a replayed completion, and how much life it had left at the finish. */
export interface EchoPlacement {
  readonly placeFrame: number
  readonly x: number
  readonly y: number
  /** Frames of life left when the run finished — check M's raw reading. */
  readonly remainingLife: number
  /** `remainingLife` as a share of the Echo's full life. */
  readonly margin: number
}

/**
 * Replay a completion and measure, for each Echo it places, how much of the Echo's life is left when the
 * run ends. That is check M's reading: "frames from placement to the sequence's end on the intended
 * route, against the Echo lifetime". An Echo that expires before the finish reports a zero margin, which
 * is exactly the failure the check exists to catch.
 */
export function echoTimingMargin(map: ReturnType<typeof parseLevel>, inputs: readonly SimInput[]): EchoPlacement[] {
  const sim = createSim(map)
  const placements: { placeFrame: number; x: number; y: number }[] = []
  const seen = new Set<string>()
  let frame = 0
  for (const input of inputs) {
    stepSim(sim, input)
    frame += 1
    for (const echo of sim.field.echoes) {
      const key = `${echo.x}:${echo.y}`
      if (seen.has(key)) continue
      seen.add(key)
      placements.push({ placeFrame: frame, x: echo.x, y: echo.y })
    }
  }
  const finish = frame
  return placements.map((p) => {
    const elapsed = finish - p.placeFrame
    const remaining = Math.max(0, 240 - elapsed)
    return { placeFrame: p.placeFrame, x: p.x, y: p.y, remainingLife: remaining, margin: remaining / 240 }
  })
}

/** The structure check: the map parses, matches the spec's shape, has a spawn and a goal, uses only known tiles. */
function structureLine(spec: LevelSpec): CheckLine {
  const map = parseLevel(spec.rows)
  const problems: string[] = []
  if (map.cols !== spec.structure.cols) problems.push(`cols ${map.cols} ≠ declared ${spec.structure.cols}`)
  if (map.rows !== spec.structure.rows) problems.push(`rows ${map.rows} ≠ declared ${spec.structure.rows}`)
  if (findTile(map, SPAWN) === null) problems.push('no spawn tile')
  if (findTile(map, GOAL) === null) problems.push('no goal tile')
  const unknown = new Set<string>()
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const ch = tileAt(map, col, row)
      if (!KNOWN_TILES.has(ch)) unknown.add(ch)
    }
  }
  if (unknown.size > 0) problems.push(`unknown tiles ${[...unknown].join(' ')}`)
  return problems.length === 0
    ? { check: 'structure', status: 'pass', detail: `${map.cols}×${map.rows}, spawn + goal, ${KNOWN_TILES.size} tile kinds` }
    : { check: 'structure', status: 'fail', detail: problems.join('; ') }
}

/** Build the full report for one level. */
export function levelCheck(spec: LevelSpec, caps?: { readonly maxStates?: number; readonly maxFrames?: number }): LevelCheckReport {
  const map = parseLevel(spec.rows)
  const lines: CheckLine[] = [structureLine(spec)]

  const goal: ReachTarget = { kind: 'goal' }
  /** Every completion found with the Echo, in check order — check M reads the first that places one. */
  const completions: { readonly label: string; readonly inputs: readonly SimInput[] }[] = []
  const withEcho = solve({ rows: spec.rows, target: goal, echo: true, strip: true, caps })
  if (withEcho.inputs !== null) completions.push({ label: 'goal', inputs: withEcho.inputs })
  lines.push({
    check: 'reachable (goal, Echo)',
    status: withEcho.verdict === 'reachable' ? 'pass' : withEcho.verdict === 'unreachable' ? 'fail' : 'unverified',
    detail: verdictOf(withEcho),
  })

  const noEcho = solve({ rows: spec.rows, target: goal, echo: false, strip: true, caps })
  const goalExpectation = spec.goalNeedsEcho ? 'unreachable' : 'reachable'
  const goalMatches = noEcho.verdict === goalExpectation
  lines.push({
    check: `no-Echo goal (spec: ${goalExpectation})`,
    status: noEcho.verdict === 'inconclusive' ? 'unverified' : goalMatches ? 'pass' : 'fail',
    detail: verdictOf(noEcho),
  })

  for (const beat of spec.beats) {
    const beatWith = solve({ rows: spec.rows, target: beat.target, echo: true, strip: true, caps, via: beat.via })
    if (beatWith.inputs !== null) completions.push({ label: `beat ${beat.id}`, inputs: beatWith.inputs })
    lines.push({
      check: `beat "${beat.id}" with Echo`,
      status: beatWith.verdict === 'reachable' ? 'pass' : beatWith.verdict === 'unreachable' ? 'fail' : 'unverified',
      detail: verdictOf(beatWith),
    })
    const beatWithout = solve({ rows: spec.rows, target: beat.target, echo: false, strip: true, caps, via: beat.via })
    lines.push({
      check: `beat "${beat.id}" without Echo`,
      status:
        beatWithout.verdict === 'unreachable'
          ? 'pass'
          : beatWithout.verdict === 'reachable'
            ? 'fail'
            : 'unverified',
      detail: verdictOf(beatWithout),
    })
  }

  for (const forbidden of spec.forbiddenSolutions) {
    const result = solve({ rows: spec.rows, target: forbidden.target, echo: forbidden.echo, strip: true, caps })
    const status: CheckStatus =
      result.verdict === 'inconclusive'
        ? 'unverified'
        : forbidden.expect === 'blocked'
          ? result.verdict === 'unreachable'
            ? 'pass'
            : 'fail'
          : result.verdict === 'reachable'
            ? 'pass'
            : 'fail'
    lines.push({
      check: `forbidden "${forbidden.id}" (expect ${forbidden.expect})`,
      status,
      detail: verdictOf(result),
    })
  }

  // Check M: read the Echo timing margin off the first completion that actually places an Echo. The
  // goal route on 1-2 needs no Echo, so reading only the goal completion would report `n/a` and hide the
  // one Echo-dependent sequence the level is built around.
  const withEchoCompletion = completions.find((completion) => echoTimingMargin(map, completion.inputs).length > 0)
  if (withEchoCompletion !== undefined) {
    const placements = echoTimingMargin(map, withEchoCompletion.inputs)
    {
      const worst = placements.reduce((a, b) => (a.margin <= b.margin ? a : b))
      lines.push({
        check: 'Echo timing margin (check M)',
        status: worst.margin >= ECHO_MARGIN_FLOOR ? 'pass' : 'fail',
        detail:
          `${(worst.margin * 100).toFixed(0)}% of ${240} f left at the end of the Echo-dependent sequence ` +
          `(floor ${ECHO_MARGIN_FLOOR * 100}%; ${withEchoCompletion.label}, placed at frame ${worst.placeFrame}, ` +
          `finish at frame ${withEchoCompletion.inputs.length})`,
      })
    }
  } else {
    lines.push({
      check: 'Echo timing margin (check M)',
      status: 'unverified',
      detail: 'no completion that places an Echo was found, so there is no margin to read',
    })
  }

  return {
    id: spec.id,
    name: spec.name,
    lines,
    ok: lines.every((line) => line.status !== 'fail'),
  }
}

/** Render the report as markdown — the shape `make level-check` prints. */
export function renderReport(report: LevelCheckReport, spec: LevelSpec): string {
  const out: string[] = []
  out.push(`# level-check ${report.id} — ${report.name}`)
  out.push('')
  out.push(`**Question:** ${spec.primaryProblem}`)
  out.push(`**Echo role:** ${spec.echoRole} · **uses:** ${spec.echoUses.join(', ')}`)
  const d = spec.difficulty
  out.push(
    `**Difficulty (design estimate):** precision ${d.precision} · timing ${d.timing} · movement ${d.movement} · ` +
      `echo planning ${d.echoPlanning} · spatial ${d.spatialReasoning} · enemy pressure ${d.enemyPressure}`,
  )
  out.push('')
  out.push('| check | result | detail |')
  out.push('|---|---|---|')
  for (const line of report.lines) {
    out.push(`| ${line.check} | ${line.status.toUpperCase()} | ${line.detail} |`)
  }
  if (spec.notes.length > 0) {
    out.push('')
    out.push('**Notes**')
    for (const note of spec.notes) out.push(`- ${note}`)
  }
  out.push('')
  out.push(`**RESULT: ${report.ok ? 'PASS' : 'FAIL'}**`)
  return out.join('\n')
}

/** A world rule check: the spec's difficulty profile against its predecessor's. */
export function renderWorldRule(previous: LevelSpec, next: LevelSpec): string {
  const violations = difficultyViolations(previous.difficulty, next.difficulty)
  return violations.length === 0
    ? `world rule ${previous.id}→${next.id}: PASS`
    : `world rule ${previous.id}→${next.id}: FAIL — ${violations.join('; ')}`
}
