import { DT } from './constants.ts'

/**
 * Fixed-timestep accumulator. The simulation only ever advances in whole DT steps, so behaviour does
 * not depend on the frame rate; the renderer interpolates between the last two steps with `alpha`.
 */
export class FixedStepper {
  private accumulator = 0
  private readonly maxSteps: number

  constructor(maxSteps = 5) {
    this.maxSteps = maxSteps
  }

  /**
   * Feed one frame's elapsed seconds. Returns the number of fixed steps that ran, so a caller can
   * feed the simulation and the renderer the same truth.
   */
  advance(elapsedSeconds: number, step: () => void): number {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return 0
    this.accumulator += elapsedSeconds

    let steps = 0
    while (this.accumulator >= DT && steps < this.maxSteps) {
      step()
      this.accumulator -= DT
      steps += 1
    }

    // Anything still queued could not be consumed (the step cap was hit): drop it, so a long stall
    // does not leave the renderer interpolating past the current step.
    if (this.accumulator >= DT) this.accumulator = 0

    return steps
  }

  /** Blend factor in 0..1 between the last two fixed steps, for the renderer. */
  get alpha(): number {
    return this.accumulator / DT
  }

  reset(): void {
    this.accumulator = 0
  }
}
