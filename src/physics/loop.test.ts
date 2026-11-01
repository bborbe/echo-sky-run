import { describe, expect, it } from 'vitest'
import { DT } from './constants.ts'
import { FixedStepper } from './loop.ts'

describe('FixedStepper', () => {
  it('runs exactly one step per DT of elapsed time', () => {
    const stepper = new FixedStepper()
    let steps = 0
    expect(stepper.advance(DT, () => (steps += 1))).toBe(1)
    expect(steps).toBe(1)
  })

  it('accumulates sub-step frames until a whole step is due', () => {
    const stepper = new FixedStepper()
    let steps = 0
    // Four frames of a quarter step each produce exactly one step.
    for (let i = 0; i < 4; i++) stepper.advance(DT / 4, () => (steps += 1))
    expect(steps).toBe(1)
  })

  it('runs the same number of steps at 60 Hz and at 144 Hz over one second', () => {
    const at = (fps: number): number => {
      const stepper = new FixedStepper(1000)
      let steps = 0
      for (let i = 0; i < fps; i++) stepper.advance(1 / fps, () => (steps += 1))
      return steps
    }
    // One step of tolerance: 144 x (1/144) sums to just under 1.0 in binary floating point.
    expect(Math.abs(at(60) - 60)).toBeLessThanOrEqual(1)
    expect(Math.abs(at(144) - 60)).toBeLessThanOrEqual(1)
  })

  it('caps the catch-up burst after a long stall', () => {
    const stepper = new FixedStepper(5)
    let steps = 0
    stepper.advance(10, () => (steps += 1))
    expect(steps).toBe(5)
    expect(stepper.alpha).toBe(0)
  })

  it('exposes a blend factor in 0..1', () => {
    const stepper = new FixedStepper()
    stepper.advance(DT / 2, () => {})
    expect(stepper.alpha).toBeGreaterThanOrEqual(0)
    expect(stepper.alpha).toBeLessThan(1)
  })

  it('ignores a negative or non-finite elapsed time', () => {
    const stepper = new FixedStepper()
    let steps = 0
    expect(stepper.advance(-1, () => (steps += 1))).toBe(0)
    expect(stepper.advance(Number.NaN, () => (steps += 1))).toBe(0)
    expect(steps).toBe(0)
  })
})
