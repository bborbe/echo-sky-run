// Which Pip frame to draw. A pure function of the player state, advanced once per fixed step, so a
// replay draws the same frames and the choice is a unit test rather than something to eyeball.

import { RUN_MAX } from '../physics/constants.ts'
import type { PipPose } from './art/pip.ts'

/** What the animator reads off the player each fixed step. */
export interface PoseInput {
  readonly vx: number
  readonly vy: number
  readonly grounded: boolean
  /** The direction the player is pushing: -1 left, 1 right, 0 neither. */
  readonly inputDir: -1 | 0 | 1
  /**
   * The run is over (goal reached). The simulation freezes a finished run with Pip's last speed
   * still in it, so speed no longer means running: Pip stands idle, facing the way he finished.
   */
  readonly finished?: boolean
}

/** Frames the landing crouch is held. */
export const LAND_F = 5
/** Pixels travelled per run frame — the legs keep pace with the ground instead of a clock. */
export const RUN_STRIDE_PX = 6
export const SPRINT_STRIDE_PX = 7
/** Frames per idle breath. */
export const IDLE_BREATH_F = 32
/** Below this speed Pip is standing, not running. */
const STILL = 0.1
/** A skid needs real speed against the stick; a gentle turn just turns. */
const SKID_SPEED = 0.75

export class PipAnimator {
  facing: -1 | 1 = 1
  pose: PipPose = 'idle'
  /** Index into the pose's frames; the renderer takes it modulo the frame count. */
  frame = 0
  private landTimer = 0
  private stride = 0
  private idleTimer = 0
  private wasGrounded = true

  reset(): void {
    this.facing = 1
    this.pose = 'idle'
    this.frame = 0
    this.landTimer = 0
    this.stride = 0
    this.idleTimer = 0
    this.wasGrounded = true
  }

  /** Advance one fixed step. */
  update(p: PoseInput): void {
    if (p.finished) {
      this.landTimer = 0
      this.stride = 0
      this.idleTimer += 1
      this.set('idle', Math.floor(this.idleTimer / IDLE_BREATH_F))
      return
    }

    if (p.inputDir !== 0) this.facing = p.inputDir
    else if (Math.abs(p.vx) > 0.2) this.facing = p.vx > 0 ? 1 : -1

    const landed = p.grounded && !this.wasGrounded
    this.wasGrounded = p.grounded
    if (landed) this.landTimer = LAND_F

    if (!p.grounded) {
      this.landTimer = 0
      this.set(p.vy < 0 ? 'jump' : 'fall', 0)
      return
    }

    const speed = Math.abs(p.vx)
    const against = p.inputDir !== 0 && Math.sign(p.vx) === -p.inputDir
    if (against && speed > SKID_SPEED) {
      this.landTimer = 0
      this.set('skid', 0)
      return
    }

    if (this.landTimer > 0) {
      this.landTimer -= 1
      // A landing at a run goes straight back into the stride; the crouch is for a standing landing.
      if (speed <= 1) {
        this.set('land', 0)
        return
      }
    }

    if (speed > STILL) {
      const sprinting = speed > RUN_MAX + 0.05
      this.stride += speed
      const step = sprinting ? SPRINT_STRIDE_PX : RUN_STRIDE_PX
      this.set(sprinting ? 'sprint' : 'run', Math.floor(this.stride / step))
      this.idleTimer = 0
      return
    }

    this.stride = 0
    this.idleTimer += 1
    this.set('idle', Math.floor(this.idleTimer / IDLE_BREATH_F))
  }

  private set(pose: PipPose, frame: number): void {
    this.pose = pose
    this.frame = frame
  }
}
