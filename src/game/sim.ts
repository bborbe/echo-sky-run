import {
  createEchoField,
  echoPlatforms,
  placeEcho,
  refreshAirCharges,
  tickEchoes,
  type EchoField,
} from '../echo/echo.ts'
import type { Box } from '../physics/collision.ts'
import { EPS, MAX_FALL, PLAYER_H, PLAYER_W, TILE } from '../physics/constants.ts'
import { createPlayer, stepPlayer, type PlayerInput, type PlayerState } from '../physics/player.ts'
import {
  CHECKPOINT,
  findDoorSpawns,
  findEnemySpawns,
  findNimbusSpawns,
  findSecretSwitchSpawns,
  findSwitchSpawns,
  findTile,
  GOAL,
  QUESTION,
  SIGN,
  SPAWN,
  tileAt,
  type TileMap,
} from '../physics/tilemap.ts'
import {
  createEnemy,
  createEnemyField,
  dropShell,
  type Enemy,
  STOMP_BOUNCE,
  stepEnemies,
  touchShell,
  type EnemyField,
} from './enemies.ts'
import {
  applyHit,
  collectMushrooms,
  createPowerField,
  heightOf,
  INVULN_F,
  spawnMushroom,
  stepMushrooms,
  yAfterResize,
  type PowerField,
  type PowerTier,
} from './power.ts'
import {
  createNimbus,
  createNimbusField,
  glideFall,
  mountNimbus,
  startPeck,
  stepNimbus,
  stepPeck,
  throwOff,
  type NimbusField,
} from './nimbus.ts'
import { createPropField, type PropField } from './props.ts'
import { closedDoors, createDoor, createSwitch, createSwitchField, stepSwitches, type SwitchField } from './switches.ts'

export interface SimInput extends PlayerInput {
  /** The Echo key went down this frame. */
  readonly echoPressed: boolean
}

export interface SimState {
  readonly map: TileMap
  readonly goal: { x: number; y: number }
  /** The midpoint flag, or null when the level has none. */
  readonly checkpoint: { x: number; y: number } | null
  /** The tutorial sign before the Echo gap, or null. */
  readonly sign: { x: number; y: number } | null
  /** Set the first time Pip walks past the sign; the shell shows its hint once. */
  signSeen: boolean
  /** Where a death puts Pip back: the level start until the checkpoint is touched. */
  respawn: { x: number; y: number }
  player: PlayerState
  field: EchoField
  enemies: EnemyField
  powers: PowerField
  /** Nimbus, the companion mount: where it is, whether Pip rides it, and its peck timer. */
  nimbus: NimbusField
  /** Echo switches and the doors they hold open. */
  switches: SwitchField
  /**
   * The secret-switch cells, taken from the level's tiles at load. They are separate from the Echo
   * switches: a secret switch holds no door, it latches once and unlocks the secret level.
   */
  readonly secretSwitches: readonly { readonly x: number; readonly y: number }[]
  /** Set the first time Pip touches a secret switch; the shell turns it into the 1-S unlock. */
  secretSwitchTouched: boolean
  /**
   * The closed doors as solid boxes, refilled once per step from `switches` and handed to the
   * player's collision. Reused every frame so the fixed step allocates nothing.
   */
  doorBoxes: Box[]
  /** Pistons and windmills, whose state is a pure function of the frame. */
  props: PropField
  /** Pip's tier: Small dies to a hit, Super drops to Small. */
  power: PowerTier
  /** Frames of invincibility left. A hit during this window is ignored. */
  invuln: number
  /** ? blocks already emptied, keyed "col,row" so the renderer can draw them flat. */
  readonly usedBlocks: Set<string>
  goalReached: boolean
  /** Fixed steps since the run began. The tally shows it as a time; a death does not reset it. */
  frames: number
  /** Deaths this run — the tally shows it, and a test asserts the respawn happened. */
  deaths: number
  /** Consecutive stomps without landing. Resets on any landing, including on an Echo. */
  combo: number
  score: number
  /**
   * The enemies stomped in the last step — the renderer's squash and hit-stop read it. The same
   * reused array every step (the per-frame path allocates nothing); valid until the next step.
   */
  stomped: readonly Enemy[]
}

/** No stomps yet: the value before the first step. */
const NO_STOMPS: readonly Enemy[] = []

/**
 * The score a stomp chain is worth. The first stomp is 100 and each further one doubles, capped at
 * 1000 — the spec's 100, 200, 400, 800, 1000… sequence.
 */
export function comboValue(chain: number): number {
  if (chain <= 0) return 0
  return Math.min(100 * 2 ** (chain - 1), 1000)
}

/**
 * One shared player box, filled per use. The per-frame path is under a zero-allocation budget, and
 * every caller consumes it immediately, before the next `playerBox` call overwrites it.
 */
const PLAYER_BOX = { x: 0, y: 0, w: PLAYER_W, h: PLAYER_H }

function playerBox(p: PlayerState): Box {
  PLAYER_BOX.x = p.x
  PLAYER_BOX.y = p.y
  PLAYER_BOX.h = p.h
  return PLAYER_BOX
}

function overlapsTile(p: PlayerState, tile: { x: number; y: number }): boolean {
  return p.x + PLAYER_W > tile.x && p.x < tile.x + TILE && p.y + p.h > tile.y && p.y < tile.y + TILE
}

/**
 * The goal flag is taller than its tile: it is drawn two tiles up, and the second jump off an Echo
 * lands a player high enough to sail over a single-tile trigger. Matching the drawn shape is what
 * makes "touch the flag" mean what it looks like.
 */
function overlapsGoal(p: PlayerState, goal: { x: number; y: number }): boolean {
  return (
    p.x + PLAYER_W > goal.x &&
    p.x < goal.x + TILE &&
    p.y + p.h > goal.y - 2 * TILE &&
    p.y < goal.y + TILE
  )
}

function blockKey(col: number, row: number): string {
  return `${col},${row}`
}

/**
 * Build the state for a level. Throws when the level has no spawn or no goal tile — a silent
 * fallback spawn would present an authoring mistake as a physics bug.
 */
export function createSim(map: TileMap): SimState {
  const spawn = findTile(map, SPAWN)
  if (spawn === null) throw new Error('level has no spawn tile')
  const goal = findTile(map, GOAL)
  if (goal === null) throw new Error('level has no goal tile')

  const enemies = createEnemyField()
  for (const spawnPoint of findEnemySpawns(map)) {
    enemies.enemies.push(createEnemy(spawnPoint.kind, spawnPoint.x, spawnPoint.y))
  }

  const switches = createSwitchField()
  for (const spawnPoint of findSwitchSpawns(map)) {
    switches.switches.push(createSwitch(spawnPoint.x, spawnPoint.y))
  }
  for (const spawnPoint of findDoorSpawns(map)) {
    switches.doors.push(createDoor(spawnPoint.x, spawnPoint.y))
  }

  // The secret switches are their own list: they do not hold a door, they latch once and open a
  // branch of the map.
  const secretSwitches = findSecretSwitchSpawns(map)

  // A level carries at most one Nimbus: the first spawn wins, so an accidental second one does not
  // silently replace the mount the level meant.
  const nimbus = createNimbusField()
  const nimbusSpawns = findNimbusSpawns(map)
  if (nimbusSpawns.length > 0) nimbus.nimbus = createNimbus(nimbusSpawns[0].x, nimbusSpawns[0].y)

  return {
    map,
    goal,
    checkpoint: findTile(map, CHECKPOINT),
    sign: findTile(map, SIGN),
    signSeen: false,
    respawn: { x: spawn.x, y: spawn.y },
    player: createPlayer(spawn.x, spawn.y, heightOf('small')),
    field: createEchoField(),
    enemies,
    powers: createPowerField(),
    nimbus,
    switches,
    secretSwitches,
    secretSwitchTouched: false,
    doorBoxes: [],
    props: createPropField(),
    power: 'small',
    invuln: 0,
    usedBlocks: new Set<string>(),
    goalReached: false,
    frames: 0,
    deaths: 0,
    combo: 0,
    score: 0,
    stomped: NO_STOMPS,
  }
}

/** Put Pip back at the last checkpoint, in his starting tier. */
export function respawnPlayer(sim: SimState): void {
  sim.power = 'small'
  sim.invuln = 0
  sim.player = createPlayer(sim.respawn.x, sim.respawn.y, heightOf('small'))
  sim.field = createEchoField()
  sim.powers = createPowerField()
  sim.combo = 0
  // A death throws Pip off Nimbus and ends its flee, so it is waiting again at the level's start.
  sim.nimbus.mounted = false
  sim.nimbus.peck = 0
  if (sim.nimbus.nimbus !== null) sim.nimbus.nimbus.flee = 0
}

/** Grow or shrink Pip, keeping his feet where they are. */
function setTier(sim: SimState, tier: PowerTier): void {
  const oldH = sim.player.h
  const newH = heightOf(tier)
  if (newH === oldH) return
  sim.player.y = yAfterResize(sim.player.y, oldH, newH)
  sim.player.h = newH
  sim.power = tier
}

/**
 * A ? block Pip's head met this frame: empty it and drop a Mushroom on top of it. Only the first
 * block in reach is used, which is what a player expects when two sit side by side.
 */
function hitBlocks(sim: SimState): void {
  if (!sim.player.hitCeiling) return
  const row = Math.floor((sim.player.y - 1) / TILE)
  const c0 = Math.floor(sim.player.x / TILE)
  const c1 = Math.floor((sim.player.x + PLAYER_W - EPS) / TILE)

  for (let col = c0; col <= c1; col++) {
    if (tileAt(sim.map, col, row) !== QUESTION) continue
    const key = blockKey(col, row)
    if (sim.usedBlocks.has(key)) continue

    sim.usedBlocks.add(key)
    sim.powers.mushrooms.push(spawnMushroom(col * TILE, row * TILE - 16))
    return
  }
}

/**
 * One fixed step of the whole game. Deterministic, not pure: it mutates `sim` in place. Same state
 * plus the same input sequence gives the same result, which is what lets the level's own test and
 * the browser drive the identical simulation.
 */
export function stepSim(sim: SimState, input: SimInput): void {
  // A finished run is frozen. The tally shows the time the flag was touched, so the clock, Pip and
  // every entity stop on that frame — otherwise a player who keeps holding right walks off the
  // level behind the tally while the timer climbs (operator playtest, 2026-11-01). A retry builds a
  // fresh sim; nothing here can un-finish this one.
  if (sim.goalReached) return

  const map = sim.map
  sim.frames += 1

  // Place before the step, so a mid-air Echo can catch the player on the very frame it appears.
  if (input.echoPressed) placeEcho(sim.field, playerBox(sim.player), map)

  // A closed door is solid. The door state is the switch result from the previous step — the state
  // the player is walking into — and `stepSwitches` below refreshes it for the next frame.
  closedDoors(sim.switches, sim.doorBoxes)

  // Nimbus's glide caps the fall at 1 px/f before the move, so the cap holds on the frame it is set.
  const preStepVy = sim.player.vy
  const fallCap = glideFall(sim.nimbus, input.jump, MAX_FALL)
  stepPlayer(sim.player, input, map, echoPlatforms(sim.field), fallCap, sim.doorBoxes)
  hitBlocks(sim)

  // A landing on Nimbus mounts it. `preStepVy` is the fall speed he arrived with, since stepPlayer
  // has already zeroed it if he hit the ground.
  mountNimbus(sim.nimbus, playerBox(sim.player), preStepVy)

  // Enemies move after the player, so a stomp is tested against the position he actually reached.
  // The Echo list is passed so a Chaser-Bot can target the nearer of Pip and an Echo.
  const events = stepEnemies(sim.enemies, playerBox(sim.player), sim.player.vy, map, echoPlatforms(sim.field))
  sim.stomped = events.stomped

  // A peck: the run key, while mounted, reaches 24 px forward and defeats Gear-Goombas and Gust-Wings.
  const facing: -1 | 1 = input.left && !input.right ? -1 : 1
  if (sim.nimbus.mounted && input.sprint && sim.nimbus.peck <= 0) startPeck(sim.nimbus)
  stepPeck(sim.nimbus, playerBox(sim.player), facing, sim.enemies)

  // Shells: hold the run key to carry one, touch it without to kick it away, release to drop it.
  if (sim.enemies.carried !== null && !input.sprint) dropShell(sim.enemies, facing)
  touchShell(sim.enemies, playerBox(sim.player), facing, input.sprint)

  for (const _ of events.stomped) {
    sim.combo += 1
    sim.score += comboValue(sim.combo)
    sim.player.vy = -STOMP_BOUNCE
    sim.player.grounded = false
  }

  // A stomp chain is broken by landing, and an Echo landing counts as landing.
  if (sim.player.grounded) sim.combo = 0

  // --- the Mushroom and the tier it buys
  stepMushrooms(sim.powers, map)
  if (collectMushrooms(sim.powers, playerBox(sim.player)) > 0 && sim.power === 'small') {
    setTier(sim, 'super')
  }

  // --- damage: a hit while mounted throws Pip off Nimbus (no damage to Pip); otherwise Super drops
  // to Small and Small is death. Invincibility swallows both.
  if (events.hit && sim.invuln === 0) {
    if (sim.nimbus.mounted) {
      throwOff(sim.nimbus)
      sim.player.vy = -STOMP_BOUNCE
      sim.player.grounded = false
    } else {
      const hit = applyHit(sim.power)
      if (hit.died) {
        sim.deaths += 1
        respawnPlayer(sim)
      } else {
        setTier(sim, hit.tier)
        sim.invuln = INVULN_F
      }
    }
  }
  if (sim.invuln > 0) sim.invuln -= 1

  stepNimbus(sim.nimbus)
  tickEchoes(sim.field)
  stepSwitches(sim.switches, playerBox(sim.player), echoPlatforms(sim.field))
  refreshAirCharges(sim.field, playerBox(sim.player), map, echoPlatforms(sim.field))

  // The checkpoint claims the respawn point the first time Pip reaches it, keeps it thereafter, and
  // grants Super if he is still Small — the spec's rule, so the second half of the level is played
  // with the tier the first half earned.
  if (sim.checkpoint !== null && overlapsTile(sim.player, sim.checkpoint)) {
    // Assign only when the point actually moves: standing on the checkpoint runs this every frame,
    // and a fresh object each frame would break the zero-allocation budget.
    if (sim.respawn.x !== sim.checkpoint.x || sim.respawn.y !== sim.checkpoint.y) {
      sim.respawn = { x: sim.checkpoint.x, y: sim.checkpoint.y }
    }
    if (sim.power === 'small') setTier(sim, 'super')
  }

  // A pit kills regardless of tier, and puts Pip back with no key press — on the same frame, which
  // is what makes the 300 ms bound trivially true.
  if (sim.player.y > map.rows * TILE) {
    sim.deaths += 1
    respawnPlayer(sim)
  }

  // The sign teaches the Echo just before the gap that needs it, once per run.
  if (sim.sign !== null && overlapsTile(sim.player, sim.sign)) sim.signSeen = true

  // A secret switch latches on the first touch and never clears. It is not the Echo switch: it does
  // not hold a door, and the shell reads the latch once to unlock the secret level on the map. The
  // loop allocates nothing and stops at the first touch, so the zero-allocation budget holds.
  if (!sim.secretSwitchTouched) {
    for (let i = 0; i < sim.secretSwitches.length; i++) {
      if (overlapsTile(sim.player, sim.secretSwitches[i])) {
        sim.secretSwitchTouched = true
        break
      }
    }
  }

  if (overlapsGoal(sim.player, sim.goal)) sim.goalReached = true
}
