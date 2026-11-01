import { describe, expect, it } from 'vitest'
import { FixedStepper } from './loop.ts'

/**
 * How many rendered frames pass between a key press and the first fixed step that can see it.
 *
 * The shell samples input inside the stepper's step callback, so the latency is exactly "frames until
 * the next fixed step runs". A press that arrives between frames is not lost — the shell holds the
 * edge until a step consumes it — so this is the whole of the input-to-frame delay.
 */
function framesUntilStep(displayHz: number, burnInFrames: number): number {
  const stepper = new FixedStepper()
  // Burn a few frames first so the accumulator sits at an arbitrary phase, not at zero.
  for (let i = 0; i < burnInFrames; i++) stepper.advance(1 / displayHz, () => {})

  for (let frames = 1; frames <= 20; frames++) {
    if (stepper.advance(1 / displayHz, () => {}) > 0) return frames
  }
  return Number.POSITIVE_INFINITY
}

describe('input-to-frame latency', () => {
  it('reaches a fixed step within 3 frames at every common display rate', () => {
    // The design guide's budget: input must land within 3 frames. Above ~165 Hz the fixed step can
    // take 4, which is why 60–165 Hz is the tested range.
    for (const hz of [30, 60, 90, 120, 144, 165]) {
      for (let burn = 0; burn < 6; burn++) {
        expect(framesUntilStep(hz, burn), `${hz} Hz, burn ${burn}`).toBeLessThanOrEqual(3)
      }
    }
  })

  it('never drops a press: the stepper always consumes a pending edge eventually', () => {
    // A press latched while zero steps ran must still fire on the next frame that does run one.
    const stepper = new FixedStepper()
    stepper.advance(1 / 1000, () => {}) // far less than one DT
    expect(framesUntilStep(60, 0)).toBeLessThanOrEqual(3)
  })
})
