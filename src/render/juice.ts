// Juice: the feedback layered over the simulation — squash and stretch, dust, sparks, hit-stop,
// screen shake, the stomp squash, the Echo's spawn ring and fizzle, the death pop. Pure and
// deterministic: it reads what a fixed step did (`StepFacts`) and advances one fixed step at a
// time, so every effect is a unit test and a replay shows the same frames. It never moves the
// camera — shake is a render offset — and it never changes what the simulation does; the only
// thing the shell takes from it is `holding()`, which pauses the fixed step for a few frames.

import type { EnemyKind } from '../game/enemies.ts'
import type { PipPose } from './art/pip.ts'

/** The simulation holds this many fixed steps on a stomp (spec § 9). */
export const HIT_STOP_STOMP_F = 3
/** Shake length and peak, on death and on a Super → Small hit only. */
export const SHAKE_F = 8
export const SHAKE_PX = 2
/** The death pop plays while the shell holds the fixed step; control returns after it. */
export const DEATH_HOLD_F = 16
/** Squash and stretch length. */
export const SQUASH_F = 7
/** How long a stomped Gear-Goomba lies flat. */
export const GOOMBA_FLAT_F = 20
export const SPAWN_RING_F = 12
export const FIZZLE_F = 12
export const BLOCK_BUMP_F = 8
export const DUST_F = 16
export const SPARK_F = 12
/** A landing faster than this kicks up dust. */
const DUST_LANDING_VY = 1.5
/** A turn against this much speed skids and kicks dust. */
const SKID_SPEED = 0.75
/** Frames between skid puffs. */
const SKID_PUFF_F = 4

export interface Box {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface StompFact extends Box {
  readonly kind: EnemyKind
}

/**
 * What one fixed step did, read off the simulation by the shell. A plain record the shell refills
 * every step; juice copies what it keeps.
 */
export interface StepFacts {
  readonly inputDir: -1 | 0 | 1
  readonly grounded: boolean
  readonly wasGrounded: boolean
  /** Vertical speed before the step — a landing's impact. */
  readonly prevVy: number
  readonly vx: number
  readonly vy: number
  /** Pip's box after the step. */
  readonly player: Box
  readonly stomps: readonly StompFact[]
  /** Pip died this step; `deathBox` is where he was before it. */
  readonly died: boolean
  readonly deathBox: Box
  readonly deathSuper: boolean
  /** Super → Small without dying. */
  readonly bigHit: boolean
  /** The Echo platform placed this step, or null. */
  readonly echoPlaced: Box | null
  /** The Echo key was pressed and no Echo appeared. */
  readonly echoRefused: boolean
  /** The ? block emptied this step, as a tile cell, or null. */
  readonly blockHit: { readonly col: number; readonly row: number } | null
  /** Pip's pose when the step ended — an Echo placed this step keeps it as its ghost. */
  readonly pose: PipPose
  readonly poseFrame: number
  readonly facing: -1 | 1
  readonly superForm: boolean
}

export type EffectKind = 'goomba-flat' | 'spawn-ring' | 'fizzle' | 'death' | 'block-bump'

export interface Effect {
  active: boolean
  kind: EffectKind
  x: number
  y: number
  age: number
  life: number
  facing: -1 | 1
  superForm: boolean
  col: number
  row: number
}

export type ParticleKind = 'dust' | 'spark'

export interface Particle {
  active: boolean
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
}

/** The ghost an Echo shows: Pip's pose at the moment it was placed. */
export interface Ghost {
  readonly x: number
  readonly y: number
  readonly pose: PipPose
  readonly frame: number
  readonly facing: -1 | 1
  readonly superForm: boolean
}

const MAX_EFFECTS = 24
const MAX_PARTICLES = 64
const MAX_GHOSTS = 4

/** A small deterministic generator, so particle spread is the same on every run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export class Juice {
  /** Fixed steps the simulation still holds for a stomp. */
  hitStop = 0
  /** Fixed steps the simulation still holds for the death pop. */
  deathHold = 0
  /** Shake frames left. */
  shake = 0
  readonly effects: Effect[] = Array.from({ length: MAX_EFFECTS }, () => ({
    active: false,
    kind: 'spawn-ring' as EffectKind,
    x: 0,
    y: 0,
    age: 0,
    life: 0,
    facing: 1 as -1 | 1,
    superForm: false,
    col: 0,
    row: 0,
  }))
  readonly particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    kind: 'dust' as ParticleKind,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    age: 0,
    life: 0,
  }))
  /** The last few Echoes' ghosts, newest last. */
  readonly ghosts: Ghost[] = []

  private squashTimer = 0
  private squashKind: 'stretch' | 'squash' = 'squash'
  private skidTimer = 0
  private random = lcg(0x5eed)
  private readonly scale = { sx: 1, sy: 1 }
  private readonly offset = { x: 0, y: 0 }

  reset(): void {
    this.hitStop = 0
    this.deathHold = 0
    this.shake = 0
    this.squashTimer = 0
    this.skidTimer = 0
    this.random = lcg(0x5eed)
    for (const e of this.effects) e.active = false
    for (const p of this.particles) p.active = false
    this.ghosts.length = 0
  }

  /** True while the simulation should not advance: a stomp's hit-stop or the death pop. */
  holding(): boolean {
    return this.hitStop > 0 || this.deathHold > 0
  }

  /** True while the death pop is on screen: Pip is drawn as the effect, the camera holds still. */
  dying(): boolean {
    return this.deathHold > 0
  }

  /**
   * One held fixed step: the hold counts down and the shake and death pop keep playing, but
   * particles and squash are frozen with the world — that stillness is what a hit-stop is.
   */
  tickHold(): void {
    if (this.hitStop > 0) this.hitStop -= 1
    if (this.deathHold > 0) {
      this.deathHold -= 1
      for (const e of this.effects) if (e.active && e.kind === 'death') this.age(e)
    }
    if (this.shake > 0) this.shake -= 1
  }

  /** One normal fixed step: everything ages. Call before `observe`, so new effects start at age 0. */
  tick(): void {
    if (this.shake > 0) this.shake -= 1
    if (this.squashTimer > 0) this.squashTimer -= 1
    for (const e of this.effects) if (e.active) this.age(e)
    for (const p of this.particles) {
      if (!p.active) continue
      p.age += 1
      if (p.age >= p.life) {
        p.active = false
        continue
      }
      p.x += p.vx
      p.y += p.vy
      if (p.kind === 'dust') {
        p.vx *= 0.85
        p.vy -= 0.02
      } else {
        p.vy += 0.08
      }
    }
  }

  /** Turn what the step did into effects. */
  observe(f: StepFacts): void {
    const feetX = f.player.x + f.player.w / 2
    const feetY = f.player.y + f.player.h

    // Squash and stretch: a take-off stretches, a landing squashes.
    if (f.wasGrounded && !f.grounded && f.vy < 0) this.startSquash('stretch')
    if (f.grounded && !f.wasGrounded) {
      this.startSquash('squash')
      if (f.prevVy > DUST_LANDING_VY) {
        this.dust(feetX - 6, feetY - 6, -0.6)
        this.dust(feetX + 2, feetY - 6, 0.6)
      }
    }

    // Turning at speed skids, and a skid kicks dust behind the feet every few frames.
    const skidding = f.grounded && f.inputDir !== 0 && Math.sign(f.vx) === -f.inputDir && Math.abs(f.vx) > SKID_SPEED
    if (skidding) {
      if (this.skidTimer % SKID_PUFF_F === 0) this.dust(feetX - 4 + Math.sign(f.vx) * 4, feetY - 7, f.vx * 0.3)
      this.skidTimer += 1
    } else {
      this.skidTimer = 0
    }

    // A stomp: the world holds still for a moment, the Gear-Goomba lies flat, dust flies.
    if (f.stomps.length > 0) {
      this.hitStop = HIT_STOP_STOMP_F
      for (const s of f.stomps) {
        if (s.kind === 'gear-goomba') {
          const e = this.spawn('goomba-flat', s.x + s.w / 2, s.y + s.h, GOOMBA_FLAT_F)
          if (e) e.facing = f.facing
        }
        this.dust(s.x - 2, s.y + s.h - 6, -0.8)
        this.dust(s.x + s.w - 6, s.y + s.h - 6, 0.8)
      }
    }

    // A death: shake, and Pip's death pose pops up where he was while the fixed step holds.
    if (f.died) {
      this.deathHold = DEATH_HOLD_F
      this.shake = SHAKE_F
      this.squashTimer = 0
      const e = this.spawn('death', f.deathBox.x + f.deathBox.w / 2, f.deathBox.y + f.deathBox.h, DEATH_HOLD_F)
      if (e) e.superForm = f.deathSuper
      this.ghosts.length = 0
    } else if (f.bigHit) {
      this.shake = SHAKE_F
    }

    if (f.echoPlaced !== null) {
      const cx = f.echoPlaced.x + f.echoPlaced.w / 2
      const cy = f.echoPlaced.y
      this.spawn('spawn-ring', cx, cy, SPAWN_RING_F)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + this.random() * 0.4
        this.particle('spark', cx, cy - 4, Math.cos(a) * 1.3, Math.sin(a) * 1.3 - 0.6, SPARK_F)
      }
      if (this.ghosts.length >= MAX_GHOSTS) this.ghosts.shift()
      this.ghosts.push({
        x: f.echoPlaced.x,
        y: f.echoPlaced.y,
        pose: f.pose,
        frame: f.poseFrame,
        facing: f.facing,
        superForm: f.superForm,
      })
    }

    if (f.echoRefused) this.spawn('fizzle', feetX, feetY - 6, FIZZLE_F)

    if (f.blockHit !== null) {
      const e = this.spawn('block-bump', 0, 0, BLOCK_BUMP_F)
      if (e) {
        e.col = f.blockHit.col
        e.row = f.blockHit.row
      }
    }
  }

  /** Pip's draw scale for squash and stretch: 1 × 1 when nothing is playing. */
  pipScale(): { readonly sx: number; readonly sy: number } {
    const t = this.squashTimer / SQUASH_F
    if (t <= 0) {
      this.scale.sx = 1
      this.scale.sy = 1
    } else if (this.squashKind === 'stretch') {
      this.scale.sx = 1 - 0.2 * t
      this.scale.sy = 1 + 0.25 * t
    } else {
      this.scale.sx = 1 + 0.3 * t
      this.scale.sy = 1 - 0.25 * t
    }
    return this.scale
  }

  /** The render offset for the shake, in whole logical pixels; 0, 0 when still. */
  shakeOffset(): { readonly x: number; readonly y: number } {
    if (this.shake <= 0) {
      this.offset.x = 0
      this.offset.y = 0
    } else {
      const amp = Math.max(1, Math.round((SHAKE_PX * this.shake) / SHAKE_F))
      this.offset.x = this.shake % 2 === 0 ? amp : -amp
      this.offset.y = this.shake % 3 === 0 ? -amp : this.shake % 3 === 1 ? amp : 0
    }
    return this.offset
  }

  /** The block's lift in pixels, 0 when it is not bumping. */
  blockLift(col: number, row: number): number {
    for (const e of this.effects) {
      if (!e.active || e.kind !== 'block-bump' || e.col !== col || e.row !== row) continue
      const t = e.age / e.life
      return Math.round(Math.sin(t * Math.PI) * 4)
    }
    return 0
  }

  /**
   * The death pop's offset from where Pip died, and which of the two death frames to show. It
   * holds still for 4 frames (the hit reads), then hops up and drops.
   */
  static deathPose(age: number): { readonly dy: number; readonly frame: number } {
    if (age < 4) return { dy: 0, frame: 0 }
    const t = age - 4
    return { dy: Math.round(-3.2 * t + 0.4 * t * t), frame: Math.floor(age / 3) % 2 }
  }

  private startSquash(kind: 'stretch' | 'squash'): void {
    this.squashKind = kind
    this.squashTimer = SQUASH_F
  }

  private age(e: Effect): void {
    e.age += 1
    if (e.age >= e.life) e.active = false
  }

  private spawn(kind: EffectKind, x: number, y: number, life: number): Effect | null {
    for (const e of this.effects) {
      if (e.active) continue
      e.active = true
      e.kind = kind
      e.x = x
      e.y = y
      e.age = 0
      e.life = life
      e.facing = 1
      e.superForm = false
      return e
    }
    return null
  }

  private dust(x: number, y: number, vx: number): void {
    this.particle('dust', x, y, vx + (this.random() - 0.5) * 0.3, -0.15 - this.random() * 0.2, DUST_F)
  }

  private particle(kind: ParticleKind, x: number, y: number, vx: number, vy: number, life: number): void {
    for (const p of this.particles) {
      if (p.active) continue
      p.active = true
      p.kind = kind
      p.x = x
      p.y = y
      p.vx = vx
      p.vy = vy
      p.age = 0
      p.life = life
      return
    }
  }
}
