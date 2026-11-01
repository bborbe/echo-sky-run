import { describe, expect, it } from 'vitest'
import { RUN_MAX, SPRINT_MAX } from '../physics/constants.ts'
import { LAND_F, PipAnimator, RUN_STRIDE_PX, type PoseInput } from './pose.ts'

const STAND: PoseInput = { vx: 0, vy: 0, grounded: true, inputDir: 0 }

function steps(a: PipAnimator, input: PoseInput, n: number): void {
  for (let i = 0; i < n; i++) a.update(input)
}

describe('Pip pose selection', () => {
  it('idles when standing and breathes on a slow beat', () => {
    const a = new PipAnimator()
    a.update(STAND)
    expect(a.pose).toBe('idle')
    const first = a.frame
    steps(a, STAND, 40)
    expect(a.pose).toBe('idle')
    expect(a.frame).not.toBe(first)
  })

  it('runs with the legs keeping pace with the distance covered', () => {
    const a = new PipAnimator()
    const run: PoseInput = { vx: 1.5, vy: 0, grounded: true, inputDir: 1 }
    a.update(run)
    expect(a.pose).toBe('run')
    const before = a.frame
    steps(a, run, Math.ceil(RUN_STRIDE_PX / 1.5))
    expect(a.frame).toBe(before + 1)
  })

  it('sprints only past run speed', () => {
    const a = new PipAnimator()
    a.update({ vx: RUN_MAX, vy: 0, grounded: true, inputDir: 1 })
    expect(a.pose).toBe('run')
    a.update({ vx: SPRINT_MAX, vy: 0, grounded: true, inputDir: 1 })
    expect(a.pose).toBe('sprint')
  })

  it('shows jump while rising and fall while dropping', () => {
    const a = new PipAnimator()
    a.update({ vx: 0, vy: -4, grounded: false, inputDir: 0 })
    expect(a.pose).toBe('jump')
    a.update({ vx: 0, vy: 2, grounded: false, inputDir: 0 })
    expect(a.pose).toBe('fall')
  })

  it('crouches on a standing landing for LAND_F frames, then idles', () => {
    const a = new PipAnimator()
    a.update({ vx: 0, vy: 3, grounded: false, inputDir: 0 })
    a.update(STAND)
    expect(a.pose).toBe('land')
    steps(a, STAND, LAND_F)
    expect(a.pose).toBe('idle')
  })

  it('skids when pushing hard against the motion, and faces the new way', () => {
    const a = new PipAnimator()
    a.update({ vx: 2, vy: 0, grounded: true, inputDir: 1 })
    expect(a.facing).toBe(1)
    a.update({ vx: 2, vy: 0, grounded: true, inputDir: -1 })
    expect(a.pose).toBe('skid')
    expect(a.facing).toBe(-1)
  })

  it('keeps facing the last direction when the stick is released', () => {
    const a = new PipAnimator()
    a.update({ vx: -1, vy: 0, grounded: true, inputDir: -1 })
    a.update(STAND)
    expect(a.facing).toBe(-1)
  })

  // Play gate 1: "the char animation does not stop at level end". The finished run is frozen with
  // Pip's last speed still in it; the animator must not read that speed as running.
  it('settles into idle once the run is finished, even though the frozen state still has speed', () => {
    const a = new PipAnimator()
    a.update({ vx: 2.25, vy: 0, grounded: true, inputDir: 1 })
    expect(a.pose).toBe('run')
    const finished: PoseInput = { vx: 2.25, vy: 0, grounded: true, inputDir: 1, finished: true }
    a.update(finished)
    expect(a.pose).toBe('idle')
    const frames = new Set<number>()
    for (let i = 0; i < 30; i++) {
      a.update(finished)
      expect(a.pose).toBe('idle')
      frames.add(a.frame)
    }
    // An idle breath at most — never a run cycle's four frames in half a second.
    expect(frames.size).toBeLessThanOrEqual(2)
  })

  it('keeps facing the way Pip finished', () => {
    const a = new PipAnimator()
    a.update({ vx: 2, vy: 0, grounded: true, inputDir: 1 })
    a.update({ vx: 2, vy: 0, grounded: true, inputDir: -1, finished: true })
    expect(a.facing).toBe(1)
  })
})
