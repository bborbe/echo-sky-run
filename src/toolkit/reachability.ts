/**
 * The reachability solver: it drives the real `stepSim` and asks whether a level can be finished.
 *
 * Two questions, one tool:
 *   - can Pip reach the target at all, and
 *   - can he reach it with the Echo key never pressed.
 *
 * The second is how a level's Echo necessity is *proved* rather than asserted. The answer is
 * three-valued — `reachable`, `unreachable`, `inconclusive` — because a false `unreachable` would send
 * someone to redesign a level that was fine.
 *
 * ## Why there are two engines
 *
 * A frame-by-frame search over the exact state is intractable for a whole level. Measured on 1-1: the
 * exact state space inside a **500-frame** horizon already exceeds 3,000,000 states, because every
 * position on the 1/32 lattice crossed with every velocity, meter value and timer is a distinct state.
 * So the two verdicts are produced by two different engines, each used only where it is sound:
 *
 * 1. **The foothold finder** (`findPath`) produces `reachable`. It searches over *footholds* — states
 *    standing on something solid — and each transition is a short input programme (run, jump, place an
 *    Echo) simulated frame by frame through the real `stepSim`. It is a heuristic: it may miss a path.
 *    That is harmless, because a found path is **replayed through `stepSim` before the verdict is
 *    returned** — so `reachable` is a proof, never a guess.
 *
 * 2. **The exact search** (`exhaust`) produces `unreachable`, and only when it exhausted the whole
 *    space within the caps. It is the per-frame search over the exact state key. When it hits a cap it
 *    returns `inconclusive` naming the cap — never `unreachable`.
 *
 * The split is what keeps the tool honest: the fast engine can only ever *find* completions, and the
 * slow engine is the only one allowed to say "none exists".
 *
 * ## The exact state key (`exhaust`)
 *
 * Every value that can change a collision outcome is keyed at its EXACT value: the player's
 * `x/y/vx/vy/h`, `meter`, `grounded`, `coyote`, `jumpBuffer`, `onPlatform`, the Echo air charge, and
 * the live Echoes as `(x, y, life)` in insertion order (list order is load-bearing — `platformUnder`
 * clamps against the first platform under the box).
 *
 * Nothing is quantised. Every constant in `physics/constants.ts` is a dyadic rational with a
 * denominator of at most 32, so every reachable position and velocity is exactly a multiple of 1/32;
 * the key encodes them as `Math.round(v * 32)` integers, which is lossless. A value off that lattice
 * throws rather than being rounded — a silent round would merge two states whose collision outcomes
 * differ, which is the class of bug that produces a false verdict.
 *
 * `frames` is deliberately NOT in the key: including it would defeat deduplication entirely. That is
 * sound only while no prop reads the frame, and props are not wired into `createSim` today; the solver
 * returns `inconclusive` rather than drop a frame-dependent level.
 *
 * A death is pruned: a pit respawns Pip at a checkpoint he already stood on, so any path that dies can
 * be shortened to a death-free one.
 *
 * ## The bound
 *
 * Two caps, both reported when hit: `maxStates` (visited states) and `maxFrames` (frames in one path).
 * `unreachable` means "exhausted the space within `maxFrames`" — the step cap is part of what the
 * verdict claims, and the report says so.
 */

import { canPlaceEcho, ECHO_LIFE_F } from '../echo/echo.ts'
import { createSim, stepSim, type SimInput, type SimState } from '../game/sim.ts'
import { PLAYER_W, SPRINT_MAX } from '../physics/constants.ts'
import { parseLevel, type TileMap } from '../physics/tilemap.ts'
import { proveDoorSealed } from './door-seal.ts'

/** The exact lattice every physics value lives on: denominator 32. */
const LATTICE = 32

/** Default state cap for the exact search. */
export const DEFAULT_MAX_STATES = 300_000

/** Default step cap: a long level at run speed, with room for the Echo detours. */
export function defaultMaxFrames(map: TileMap): number {
  return Math.max(3000, map.cols * 20)
}

/** Where the search is trying to get to. */
export type ReachTarget =
  /** The level's own goal flag — the engine's `sim.goalReached`, so it is the real win condition. */
  | { readonly kind: 'goal' }
  /** A world-pixel rectangle. A target predicate only — it is not part of the physics. */
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export type ReachVerdict = 'reachable' | 'unreachable' | 'inconclusive'

/** Which cap stopped an inconclusive run. */
export type ReachCap = 'states' | 'frames'

export interface ReachStats {
  /** States whose successors were generated. */
  readonly expanded: number
  /** States ever seen. */
  readonly visited: number
  /** Wall-clock milliseconds. */
  readonly ms: number
  /** Which engine produced the verdict. */
  readonly engine: 'footholds' | 'exact' | 'proof'
}

export interface ReachResult {
  readonly verdict: ReachVerdict
  /** Frames the found completion took, or null. */
  readonly frames: number | null
  /** The completion as one input per frame — replayable through `stepSim`. */
  readonly inputs: readonly SimInput[] | null
  /** The cap that stopped the run, when `inconclusive`. */
  readonly cap: ReachCap | null
  /** Why the run is inconclusive, when it is. */
  readonly reason: string | null
  readonly stats: ReachStats
}

export interface ReachOptions {
  /** The level's rows, in `parseLevel` format. */
  readonly rows: readonly string[]
  readonly target: ReachTarget
  /** False forbids the Echo key entirely — the no-Echo search. */
  readonly echo: boolean
  /**
   * True maps the enemy and item characters to empty, the rating guide's criterion-1 procedure
   * ("on a map stripped of enemies and items only"). False searches the populated level.
   */
  readonly strip: boolean
  readonly caps?: Partial<{ readonly maxStates: number; readonly maxFrames: number }>
  /**
   * Optional intermediate targets, solved in order. A level's Echo beat is often a route rather than a
   * single jump — climb the ledge, reach the switch, then hold the door — and a route the finder cannot
   * see in one heuristic pass it can usually see leg by leg. Each leg starts from the exact state the
   * previous leg reached, and the concatenation is replay-verified like any other completion.
   */
  readonly via?: readonly ReachTarget[]
}

/** Every character a level uses for an enemy or a collectible: stripped for the geometry search. */
const ENEMY_AND_ITEM_TILES = /[gtbwr?n]/g

/** The level rows with enemies and items removed — the criterion-1 map. */
export function stripEnemiesAndItems(rows: readonly string[]): readonly string[] {
  return rows.map((row) => row.replace(ENEMY_AND_ITEM_TILES, '.'))
}

/**
 * Encode a value as an exact integer on the 1/32 lattice. Throws rather than rounding: a rounded
 * value would merge two states whose collision outcomes can differ.
 */
function lattice(value: number, label: string): number {
  const scaled = value * LATTICE
  const rounded = Math.round(scaled)
  if (!Number.isFinite(scaled) || Math.abs(scaled - rounded) > 1e-6) {
    throw new Error(
      `reachability: ${label}=${value} is off the 1/32 lattice (${scaled}); ` +
        'the state key cannot encode it exactly, and rounding would merge distinct states',
    )
  }
  return rounded
}

/** The player's box, built fresh for a probe — never held across a step. */
function playerBox(sim: SimState): { x: number; y: number; w: number; h: number } {
  return { x: sim.player.x, y: sim.player.y, w: PLAYER_W, h: sim.player.h }
}

/**
 * The exact state key. Everything that can change a future step is here; `frames` is not (see the
 * module comment). Derived fields (`doors[].open`, `power`, `invuln`, `usedBlocks`) are keyed anyway:
 * a derived field can only make deduplication finer, never coarser, so it costs speed and buys safety.
 */
export function stateKey(sim: SimState): string {
  const p = sim.player
  const echoes = sim.field.echoes
    .map((e) => `${lattice(e.x, 'echo.x')}:${lattice(e.y, 'echo.y')}:${e.life}`)
    .join(';')
  const doors = sim.switches.doors.map((d) => (d.open ? '1' : '0')).join('')
  const enemies = sim.enemies.enemies
    .map(
      (e) =>
        `${e.kind}:${lattice(e.x, 'enemy.x')}:${lattice(e.y, 'enemy.y')}:` +
        `${lattice(e.vx, 'enemy.vx')}:${lattice(e.vy, 'enemy.vy')}:${e.mode}:${e.hp}:${e.age}:${e.windup}:${e.baseY}`,
    )
    .join(';')
  const mushrooms = sim.powers.mushrooms
    .map((m) => `${lattice(m.x, 'mushroom.x')}:${lattice(m.y, 'mushroom.y')}:${lattice(m.vx, 'mushroom.vx')}`)
    .join(';')
  const nimbus =
    sim.nimbus.nimbus === null
      ? '-'
      : `${lattice(sim.nimbus.nimbus.x, 'nimbus.x')}:${lattice(sim.nimbus.nimbus.y, 'nimbus.y')}:${sim.nimbus.nimbus.flee}`

  return [
    lattice(p.x, 'player.x'),
    lattice(p.y, 'player.y'),
    lattice(p.vx, 'player.vx'),
    lattice(p.vy, 'player.vy'),
    p.h,
    p.meter,
    p.grounded ? 1 : 0,
    p.coyote,
    p.jumpBuffer,
    p.onPlatform ? 1 : 0,
    sim.field.airCharges,
    echoes,
    doors,
    sim.power,
    sim.invuln,
    [...sim.usedBlocks].sort().join(','),
    enemies,
    mushrooms,
    nimbus,
    sim.nimbus.mounted ? 1 : 0,
    sim.nimbus.peck,
  ].join('|')
}

/**
 * A deep-enough copy to step one branch without touching its siblings. The immutable level data is
 * shared; every mutable field is copied. `doorBoxes` is refilled by `stepSim` each frame, so the copy
 * starts empty. A carried shell is re-pointed at the cloned instance so the reference stays whole.
 */
export function cloneSim(sim: SimState): SimState {
  const enemies = sim.enemies.enemies.map((e) => ({ ...e }))
  const carriedIndex = sim.enemies.carried === null ? -1 : sim.enemies.enemies.indexOf(sim.enemies.carried)
  return {
    ...sim,
    player: { ...sim.player },
    respawn: { ...sim.respawn },
    field: { echoes: sim.field.echoes.map((e) => ({ ...e })), airCharges: sim.field.airCharges },
    enemies: {
      enemies,
      carried:
        carriedIndex >= 0
          ? enemies[carriedIndex]
          : sim.enemies.carried === null
            ? null
            : { ...sim.enemies.carried },
    },
    powers: { mushrooms: sim.powers.mushrooms.map((m) => ({ ...m })) },
    nimbus: {
      nimbus: sim.nimbus.nimbus === null ? null : { ...sim.nimbus.nimbus },
      mounted: sim.nimbus.mounted,
      peck: sim.nimbus.peck,
    },
    switches: {
      switches: sim.switches.switches.map((s) => ({ ...s })),
      doors: sim.switches.doors.map((d) => ({ ...d })),
    },
    doorBoxes: [],
    props: { props: sim.props.props.map((p) => ({ ...p })) },
    usedBlocks: new Set(sim.usedBlocks),
  }
}

const DIRECTIONS = [-1, 0, 1] as const

/**
 * The legal input alphabet for one frame. `left && right` is folded into "neither": the only reader of
 * the raw pair is `dir = right - left`, so the two are the same action.
 *
 * `echoPressed` is offered only when a placement would be accepted — `placeEcho` returns false when it
 * would not, and nothing else reads the flag, so a refused placement is a provably identical action.
 */
export function legalInputs(sim: SimState, echoAllowed: boolean): SimInput[] {
  const inputs: SimInput[] = []
  const echoPossible =
    echoAllowed && sim.field.airCharges > 0 && canPlaceEcho(sim.field, playerBox(sim), sim.map)
  for (const dir of DIRECTIONS) {
    for (const jump of [false, true]) {
      for (const jumpPressed of [false, true]) {
        for (const sprint of [false, true]) {
          inputs.push({ left: dir < 0, right: dir > 0, jump, jumpPressed, sprint, echoPressed: false })
          if (echoPossible) {
            inputs.push({ left: dir < 0, right: dir > 0, jump, jumpPressed, sprint, echoPressed: true })
          }
        }
      }
    }
  }
  return inputs
}

/** True when this state satisfies the target. The `goal` case is the engine's own win condition. */
export function reachedTarget(sim: SimState, target: ReachTarget): boolean {
  if (target.kind === 'goal') return sim.goalReached
  const p = sim.player
  return (
    p.x + PLAYER_W > target.x && p.x < target.x + target.w && p.y + p.h > target.y && p.y < target.y + target.h
  )
}

/**
 * Replay a completion through the real `stepSim` from a fresh sim. This is the trust anchor: a
 * `reachable` verdict is only returned after its own input sequence reproduces the target.
 */
export function replay(
  map: TileMap,
  inputs: readonly SimInput[],
  target: ReachTarget,
): { won: boolean; frames: number } {
  const sim = createSim(map)
  let frames = 0
  for (const input of inputs) {
    if (reachedTarget(sim, target)) return { won: true, frames }
    stepSim(sim, input)
    frames += 1
    if (sim.goalReached) return { won: true, frames }
  }
  return { won: reachedTarget(sim, target), frames }
}

/** A binary min-heap over node indices, ordered by priority. */
class Heap {
  private readonly items: number[] = []
  private readonly priorities: number[] = []

  get size(): number {
    return this.items.length
  }

  push(index: number, priority: number): void {
    this.items.push(index)
    this.priorities.push(priority)
    let i = this.items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.priorities[parent] <= this.priorities[i]) break
      this.swap(parent, i)
      i = parent
    }
  }

  pop(): number {
    const top = this.items[0]
    const last = this.items.length - 1
    this.swap(0, last)
    this.items.pop()
    this.priorities.pop()
    let i = 0
    for (;;) {
      const left = 2 * i + 1
      const right = left + 1
      let smallest = i
      if (left < this.items.length && this.priorities[left] < this.priorities[smallest]) smallest = left
      if (right < this.items.length && this.priorities[right] < this.priorities[smallest]) smallest = right
      if (smallest === i) break
      this.swap(i, smallest)
      i = smallest
    }
    return top
  }

  private swap(a: number, b: number): void {
    const item = this.items[a]
    this.items[a] = this.items[b]
    this.items[b] = item
    const priority = this.priorities[a]
    this.priorities[a] = this.priorities[b]
    this.priorities[b] = priority
  }
}

// ---------------------------------------------------------------------------------------------
// Engine 1 — the foothold finder (produces `reachable`)
// ---------------------------------------------------------------------------------------------

/** Run lengths tried on the ground, in frames. */
const RUN_FRAMES = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32] as const
/** How long the jump key is held: 1 is a tap (full gravity at once), 60 is a full held jump. */
const JUMP_HOLDS = [1, 8, 60] as const
/** Flight frames at which an Echo placement is tried. */
const ECHO_FRAMES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 56, 64, 72, 80] as const
/** The longest a single transition may run before it is abandoned. */
const MAX_TRANSITION_FRAMES = 320
/** Foothold identity: positions rounded to this many pixels. */
const FOOTHOLD_POS_PX = 4

/**
 * A foothold's identity, coarser than the exact key. It exists only to stop the finder from drowning in
 * sub-pixel variants of the same perch; the state behind it is exact and every transition is stepped
 * exactly, so a path this finds is a real path. Merging can only make the finder *miss* paths, never
 * invent one.
 */
function footholdKey(sim: SimState): string {
  const p = sim.player
  const q = (v: number, step: number): number => Math.round(v / step)
  const echoes = sim.field.echoes
    .map((e) => `${q(e.x, FOOTHOLD_POS_PX)}:${q(e.y, FOOTHOLD_POS_PX)}:${Math.round(e.life / 32)}`)
    .join(';')
  return [
    q(p.x, FOOTHOLD_POS_PX),
    q(p.y, FOOTHOLD_POS_PX),
    p.grounded ? 1 : 0,
    p.onPlatform ? 1 : 0,
    sim.field.airCharges,
    echoes,
    sim.switches.doors.map((d) => (d.open ? 1 : 0)).join(''),
  ].join('|')
}

interface Transition {
  /** The input sequence, one per frame, ending on a foothold (or the target). */
  readonly inputs: SimInput[]
  /** The state after the sequence. */
  readonly state: SimState
}

/** One step's input, built from a direction and the key flags. */
function inputOf(dir: number, jump: boolean, jumpPressed: boolean, sprint: boolean, echoPressed: boolean): SimInput {
  return { left: dir < 0, right: dir > 0, jump, jumpPressed, sprint, echoPressed }
}

/**
 * Walk `start` forward with `input` for `frames` frames, then keep going until the player is grounded
 * again, reaches the target, or dies. A run that walks off a ledge is a real transition — Pip falls and
 * lands lower down — so it must not be dropped just because the last commanded frame was airborne.
 */
function walkOut(start: SimState, dir: number, sprint: boolean, frames: number, target: ReachTarget): Transition | null {
  const sim = cloneSim(start)
  const inputs: SimInput[] = []
  const deathMark = sim.deaths
  for (let i = 0; i < MAX_TRANSITION_FRAMES; i++) {
    const input = inputOf(dir, false, false, sprint, false)
    inputs.push(input)
    stepSim(sim, input)
    if (sim.deaths > deathMark) return null
    if (reachedTarget(sim, target)) return { inputs, state: sim }
    // The commanded walk has run; from here keep going only until he lands.
    if (i + 1 >= frames && sim.player.grounded) return { inputs, state: sim }
  }
  return null
}

/**
 * Jump from `start`, holding the jump key for `hold` frames, optionally placing the Echo at frame
 * `echoAt`, and run until the player lands again. Returns null on a death or a flight that never lands.
 */
function jumpOut(
  start: SimState,
  dir: number,
  sprint: boolean,
  hold: number,
  echoAt: number | null,
  target: ReachTarget,
): Transition | null {
  const sim = cloneSim(start)
  const inputs: SimInput[] = []
  const deathMark = sim.deaths
  for (let frame = 0; frame < MAX_TRANSITION_FRAMES; frame++) {
    const airborne = frame > 0
    const jump = airborne ? frame <= hold : hold > 0
    const jumpPressed = frame === 0
    const echoPressed = echoAt !== null && frame === echoAt
    const input = inputOf(dir, jump, jumpPressed, sprint, echoPressed)
    inputs.push(input)
    stepSim(sim, input)
    if (sim.deaths > deathMark) return null
    if (reachedTarget(sim, target)) return { inputs, state: sim }
    // A landing is only a foothold once he has actually left the ground; frame 0 is the launch.
    if (airborne && sim.player.grounded) return { inputs, state: sim }
  }
  return null
}

/** Every transition the finder tries from one foothold. */
function transitionsFrom(start: SimState, echoAllowed: boolean, target: ReachTarget): Transition[] {
  const out: Transition[] = []

  for (const dir of DIRECTIONS) {
    for (const sprint of [false, true]) {
      for (const frames of RUN_FRAMES) {
        const walked = walkOut(start, dir, sprint, frames, target)
        if (walked !== null) out.push(walked)
      }
    }
  }

  // An Echo is placed MID-FLIGHT, so whether one could be placed while standing here is the wrong
  // question: on solid ground the box at Pip's feet is inside the floor and the placement is refused,
  // which is exactly the state at every ledge lip. Only the air charge matters at this point.
  const echoFrames: (number | null)[] =
    echoAllowed && start.field.airCharges > 0 ? [null, ...ECHO_FRAMES] : [null]

  for (const dir of [0, 1] as const) {
    for (const sprint of [false, true]) {
      for (const hold of JUMP_HOLDS) {
        for (const echoAt of echoFrames) {
          const jumped = jumpOut(start, dir, sprint, hold, echoAt, target)
          if (jumped !== null) out.push(jumped)
        }
      }
    }
  }
  return out
}

interface PathSearch {
  readonly inputs: SimInput[] | null
  readonly visited: number
  readonly expanded: number
  readonly capped: boolean
}

/**
 * The foothold finder: best-first over footholds, ordered by the remaining horizontal distance to the
 * target. It returns the input sequence of the first completion it finds, or null.
 */
/** How the finder orders its frontier. Two orderings, because neither alone is enough. */
type Ordering = 'depth' | 'breadth'

/** A single attempt may not spend more than this many footholds before the next ordering is tried. */
const ATTEMPT_CAP = 8_000

/**
 * One search pass with a given ordering.
 *
 * `depth` (distance first) dives at the target and is what finds a long straight route in a handful of
 * expansions. `breadth` (frames first) explores outward from the start and is the only one that finds a
 * route which first goes *away* from the target — 1-2's corridor is reached by climbing a ledge and
 * walking left of the door, and a distance-first order commits to the ground underneath the alcove and
 * never looks up. Running both, depth first because it is usually the faster win, costs at most one
 * capped attempt before the other succeeds.
 */
function findPathOrdered(
  root: SimState,
  target: ReachTarget,
  echoAllowed: boolean,
  maxStates: number,
  maxFrames: number,
  ordering: Ordering,
): PathSearch {
  const goal = target.kind === 'goal' ? { x: root.goal.x, y: root.goal.y } : { x: target.x, y: target.y }
  const estimate = (sim: SimState): number =>
    (Math.abs(goal.x - sim.player.x) + Math.abs(goal.y - sim.player.y)) / SPRINT_MAX
  const priorityOf = (sim: SimState, frames: number): number =>
    ordering === 'depth' ? estimate(sim) + frames * 1e-6 : frames + estimate(sim) * 1e-3

  interface Node {
    readonly state: SimState
    readonly parent: number
    readonly inputs: readonly SimInput[]
    readonly frames: number
    readonly priority: number
  }

  const nodes: Node[] = [{ state: root, parent: -1, inputs: [], frames: 0, priority: priorityOf(root, 0) }]
  const visited = new Set<string>([footholdKey(root)])
  const heap = new Heap()
  heap.push(0, nodes[0].priority)
  let expanded = 0
  let capped = false

  const reconstruct = (index: number): SimInput[] => {
    const chain: SimInput[][] = []
    let cursor = index
    while (cursor >= 0) {
      chain.push([...nodes[cursor].inputs])
      cursor = nodes[cursor].parent
    }
    return chain.reverse().flat()
  }

  while (heap.size > 0) {
    const index = heap.pop()
    const node = nodes[index]
    expanded += 1
    if (node.frames >= maxFrames) continue
    for (const transition of transitionsFrom(node.state, echoAllowed, target)) {
      const frames = node.frames + transition.inputs.length
      if (frames > maxFrames) continue
      if (reachedTarget(transition.state, target)) {
        return { inputs: [...reconstruct(index), ...transition.inputs], visited: visited.size, expanded, capped: false }
      }
      const key = footholdKey(transition.state)
      if (visited.has(key)) continue
      visited.add(key)
      if (visited.size >= maxStates) {
        capped = true
        return { inputs: null, visited: visited.size, expanded, capped }
      }
      nodes.push({
        state: transition.state,
        parent: index,
        inputs: transition.inputs,
        frames,
        priority: priorityOf(transition.state, frames),
      })
      heap.push(nodes.length - 1, nodes[nodes.length - 1].priority)
    }
  }
  return { inputs: null, visited: visited.size, expanded, capped }
}

/** Try each ordering in turn; the first completion wins. */
function findPath(
  root: SimState,
  target: ReachTarget,
  echoAllowed: boolean,
  maxStates: number,
  maxFrames: number,
): PathSearch {
  const attemptCap = Math.min(maxStates, ATTEMPT_CAP)
  let visited = 0
  let expanded = 0
  for (const ordering of ['depth', 'breadth'] as const) {
    const attempt = findPathOrdered(root, target, echoAllowed, attemptCap, maxFrames, ordering)
    visited = Math.max(visited, attempt.visited)
    expanded += attempt.expanded
    if (attempt.inputs !== null) return { inputs: attempt.inputs, visited, expanded, capped: false }
  }
  return { inputs: null, visited, expanded, capped: true }
}

// ---------------------------------------------------------------------------------------------
// Engine 2 — the exact search (produces `unreachable`)
// ---------------------------------------------------------------------------------------------

interface ExactSearch {
  readonly found: boolean
  readonly capped: boolean
  readonly cap: ReachCap | null
  readonly visited: number
  readonly expanded: number
}

/**
 * The exact per-frame search. Best-first on the remaining horizontal distance, deduplicated on the
 * exact state key. It returns `found` only if it reached the target, and `capped` if a cap stopped it
 * before the space was exhausted.
 */
function exhaust(
  root: SimState,
  target: ReachTarget,
  echoAllowed: boolean,
  maxStates: number,
  maxFrames: number,
): ExactSearch {
  const targetX = target.kind === 'goal' ? root.goal.x : target.x
  const priorityOf = (sim: SimState): number => Math.abs(targetX - sim.player.x)

  interface Node {
    sim: SimState | null
    readonly frames: number
  }

  const nodes: Node[] = [{ sim: root, frames: 0 }]
  const visited = new Set<string>([stateKey(root)])
  const heap = new Heap()
  heap.push(0, priorityOf(root))
  let expanded = 0
  let capped = false
  let cap: ReachCap | null = null

  while (heap.size > 0) {
    const index = heap.pop()
    const node = nodes[index]
    const sim = node.sim
    if (sim === null) continue
    node.sim = null
    expanded += 1
    if (reachedTarget(sim, target)) return { found: true, capped: false, cap: null, visited: visited.size, expanded }
    if (node.frames >= maxFrames) continue
    if (visited.size >= maxStates) {
      capped = true
      cap = 'states'
      break
    }
    for (const input of legalInputs(sim, echoAllowed)) {
      const child = cloneSim(sim)
      stepSim(child, input)
      if (child.deaths > sim.deaths) continue
      const key = stateKey(child)
      if (visited.has(key)) continue
      visited.add(key)
      nodes.push({ sim: child, frames: node.frames + 1 })
      heap.push(nodes.length - 1, priorityOf(child))
    }
  }
  return { found: false, capped, cap, visited: visited.size, expanded }
}

// ---------------------------------------------------------------------------------------------
// The public entry point
// ---------------------------------------------------------------------------------------------

/**
 * Search the level for a completion.
 *
 * `reachable` comes from the foothold finder and is replayed through `stepSim` before it is returned.
 * `unreachable` comes from the exact search, and only when the space was exhausted within the caps.
 * Everything else is `inconclusive`, naming the cap.
 */
export function solve(options: ReachOptions): ReachResult {
  const startedAt = Date.now()
  const rows = options.strip ? stripEnemiesAndItems(options.rows) : options.rows
  const map = parseLevel(rows)
  const maxStates = options.caps?.maxStates ?? DEFAULT_MAX_STATES
  const maxFrames = options.caps?.maxFrames ?? defaultMaxFrames(map)

  const probe = createSim(map)
  // Props would make the frame number part of the state, and `frames` is not in the key.
  if (probe.props.props.length > 0) {
    return {
      verdict: 'inconclusive',
      frames: null,
      inputs: null,
      cap: null,
      reason: 'unsupported: level has props (frame-dependent geometry), and `frames` is not in the state key',
      stats: { expanded: 0, visited: 0, ms: Date.now() - startedAt, engine: 'exact' },
    }
  }

  // Engine 1: find a completion, optionally leg by leg through declared waypoints.
  let root = probe
  const collected: SimInput[] = []
  let viaFailed = false
  for (const waypoint of options.via ?? []) {
    const leg = findPath(root, waypoint, options.echo, maxStates, maxFrames)
    if (leg.inputs === null) {
      viaFailed = true
      break
    }
    collected.push(...leg.inputs)
    root = stepAll(root, leg.inputs)
  }
  const path = viaFailed ? { inputs: null, visited: 0, expanded: 0, capped: false } : findPath(root, options.target, options.echo, maxStates, maxFrames)
  const inputs = path.inputs === null ? null : [...collected, ...path.inputs]
  if (inputs !== null) {
    const check = replay(map, inputs, options.target)
    if (!check.won) {
      throw new Error(
        `reachability: the finder produced a completion the replay does not reproduce (${inputs.length} frames); ` +
          'the foothold search and the simulation disagree',
      )
    }
    return {
      verdict: 'reachable',
      frames: check.frames,
      inputs,
      cap: null,
      reason: null,
      stats: { expanded: path.expanded, visited: path.visited, ms: Date.now() - startedAt, engine: 'footholds' },
    }
  }

  // Engine 2: the exact search, which is the only one allowed to say "none exists".
  const exact = exhaust(probe, options.target, options.echo, maxStates, maxFrames)
  if (exact.found) {
    // The exact search can find what the finder missed; it has no replay to return, so report the fact.
    return {
      verdict: 'reachable',
      frames: null,
      inputs: null,
      cap: null,
      reason: 'found by the exact search; no replay was recorded',
      stats: { expanded: exact.expanded, visited: exact.visited, ms: Date.now() - startedAt, engine: 'exact' },
    }
  }
  if (exact.capped) {
    // A no-Echo door question has a geometric answer even when the search space is far past any cap.
    if (!options.echo) {
      const proof = proveDoorSealed(map, options.target)
      if (proof !== null) {
        return {
          verdict: 'unreachable',
          frames: null,
          inputs: null,
          cap: null,
          reason: proof.reason,
          stats: { expanded: exact.expanded, visited: exact.visited, ms: Date.now() - startedAt, engine: 'proof' },
        }
      }
    }
    return {
      verdict: 'inconclusive',
      frames: null,
      inputs: null,
      cap: exact.cap,
      reason:
        `hit the ${exact.cap} cap (${exact.cap === 'states' ? maxStates : maxFrames}); ` +
        'the space was not exhausted, so no verdict is claimed',
      stats: { expanded: exact.expanded, visited: exact.visited, ms: Date.now() - startedAt, engine: 'exact' },
    }
  }
  return {
    verdict: 'unreachable',
    frames: null,
    inputs: null,
    cap: null,
    reason: `no completion within ${maxFrames} frames; the space was exhausted`,
    stats: { expanded: exact.expanded, visited: exact.visited, ms: Date.now() - startedAt, engine: 'exact' },
  }
}

/** Advance a copy of `start` through `inputs`, returning the state it reaches. */
function stepAll(start: SimState, inputs: readonly SimInput[]): SimState {
  const sim = cloneSim(start)
  for (const input of inputs) stepSim(sim, input)
  return sim
}

/** The Echo's full life, re-exported so a caller can compute a timing margin without importing echo.ts. */
export const ECHO_LIFETIME_F = ECHO_LIFE_F
