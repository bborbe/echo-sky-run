/**
 * Which sounds one fixed step of the game raises, read off the simulation before and after the step.
 * DOM-free and deterministic: tests drive it through `stepSim` exactly as the browser shell does.
 *
 * The step path is under a zero-allocation budget, so the watcher keeps scalars between `before` and
 * `after` and writes into one reused event list.
 */
import { ECHO_LIFE_F } from '../echo/echo.ts'
import type { SimInput, SimState } from '../game/sim.ts'
import type { SoundEvent } from './recipes.ts'

/** Falling faster than this when Pip lands is a landing worth hearing; a step down is not. */
export const LAND_MIN_VY = 1.5

export class SoundWatcher {
  /** The events of the last step, in a fixed order. Reused: valid until the next `after`. */
  readonly events: SoundEvent[] = []

  private frames = 0
  private jumpFires = false
  private wasGrounded = false
  private prevVy = 0
  private deaths = 0
  private power: SimState['power'] = 'small'
  private blocks = 0
  private mushrooms = 0
  private expiring = 0
  private sliding = 0
  private respawnX = 0
  private respawnY = 0
  private goal = false

  /** Capture what the step is about to change. Call it right before `stepSim`. */
  before(sim: SimState, input: SimInput): void {
    const p = sim.player
    this.frames = sim.frames
    // The jump rule of `stepPlayer`: a press (new or buffered) fires on the ground or in coyote time.
    // Grounded and coyote are read before the step, exactly where the physics reads them.
    this.jumpFires = (input.jumpPressed || p.jumpBuffer > 0) && (p.grounded || p.coyote > 0)
    this.wasGrounded = p.grounded
    this.prevVy = p.vy
    this.deaths = sim.deaths
    this.power = sim.power
    this.blocks = sim.usedBlocks.size
    this.mushrooms = sim.powers.mushrooms.length
    this.respawnX = sim.respawn.x
    this.respawnY = sim.respawn.y
    this.goal = sim.goalReached

    let expiring = 0
    for (const e of sim.field.echoes) if (e.life === 1) expiring += 1
    this.expiring = expiring

    let sliding = 0
    for (const e of sim.enemies.enemies) if (e.mode === 'sliding' && !e.dead) sliding += 1
    this.sliding = sliding
  }

  /** The sounds the step raised. Call it right after `stepSim`, with the same input. */
  after(sim: SimState, input: SimInput): readonly SoundEvent[] {
    const out = this.events
    out.length = 0
    // A finished run does not step, and a frozen step raises nothing.
    if (sim.frames === this.frames) return out

    const p = sim.player
    const died = sim.deaths > this.deaths

    if (died) {
      out.push('death')
    } else {
      if (this.jumpFires) out.push('jump')
      if (!this.wasGrounded && p.grounded && this.prevVy >= LAND_MIN_VY) out.push('land')

      let placed = false
      for (const e of sim.field.echoes) if (e.life === ECHO_LIFE_F - 1) placed = true
      if (input.echoPressed) out.push(placed ? 'echo-place' : 'echo-refuse')
      if (this.expiring > 0) out.push('echo-expire')

      if (this.power === 'super' && sim.power === 'small') out.push('power-down')
    }

    if (sim.stomped.length > 0) out.push('stomp')

    const newBlocks = sim.usedBlocks.size - this.blocks
    if (newBlocks > 0) {
      out.push('block')
      out.push('mushroom-appear')
    }
    // A death clears the field, so only a living step can have collected one.
    if (!died && this.mushrooms + newBlocks > sim.powers.mushrooms.length) out.push('mushroom-collect')

    let sliding = 0
    for (const e of sim.enemies.enemies) if (e.mode === 'sliding' && !e.dead) sliding += 1
    if (sliding > this.sliding) out.push('shell-kick')

    const cp = sim.checkpoint
    if (
      cp !== null &&
      sim.respawn.x === cp.x &&
      sim.respawn.y === cp.y &&
      (this.respawnX !== cp.x || this.respawnY !== cp.y)
    ) {
      out.push('checkpoint')
    }

    if (!this.goal && sim.goalReached) out.push('goal')
    return out
  }
}
