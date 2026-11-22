import { describe, expect, it } from 'vitest'
import { parseLevel } from '../physics/tilemap.ts'
import {
  createPiston,
  createWindmill,
  PISTON_EXTEND_PX,
  pistonCrushing,
  pistonExtension,
  pistonSolid,
  windmillAngle,
  windmillBladeHits,
  windmillHubBox,
} from './props.ts'
import { createSim, stepSim, type SimInput } from './sim.ts'

const STILL: SimInput = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  sprint: false,
  echoPressed: false,
}

/** A wide floorless room with the goal far to the right, so an idle run never finishes. */
const ROOM = parseLevel(['S' + '.'.repeat(30) + 'F', '.'.repeat(32), '#'.repeat(32)])

/** One 200-frame idle run recording the props' derived state every frame. */
function record(): { ext: number[]; ang: number[] } {
  const sim = createSim(ROOM)
  const piston = createPiston(64, 0)
  const mill = createWindmill(160, 0)
  sim.props.props.push(piston, mill)

  const ext: number[] = []
  const ang: number[] = []
  for (let i = 0; i < 200; i++) {
    stepSim(sim, STILL)
    ext.push(pistonExtension(piston, sim.frames))
    ang.push(windmillAngle(mill, sim.frames))
  }
  return { ext, ang }
}

describe('pistons and windmills are frame-stable', () => {
  it('gives identical per-frame state across two runs of the same input', () => {
    const a = record()
    const b = record()

    expect(a.ext).toEqual(b.ext)
    expect(a.ang).toEqual(b.ang)
    // A run that never moves would also be "identical"; the positive checks below are what make
    // this a determinism test rather than a test that two arrays of zeroes match.
    expect(new Set(a.ext).size).toBeGreaterThan(1)
    expect(new Set(a.ang).size).toBeGreaterThan(1)
  })
})

describe('piston contract', () => {
  it('extends 48 px at the middle of its 2 s cycle and returns to zero', () => {
    const p = createPiston(0, 0)
    expect(pistonExtension(p, 0)).toBe(0)
    expect(pistonExtension(p, 60)).toBe(PISTON_EXTEND_PX)
    expect(pistonExtension(p, 120)).toBe(0)
  })

  it('is solid only when fully extended, and crushes only while extending', () => {
    const p = createPiston(0, 0)
    expect(pistonSolid(p, 60)).toBe(true)
    expect(pistonSolid(p, 0)).toBe(false)
    expect(pistonCrushing(p, 30)).toBe(true)
    expect(pistonCrushing(p, 60)).toBe(false)
  })
})

describe('windmill contract', () => {
  it('turns once per 3 s', () => {
    const w = createWindmill(0, 0)
    expect(windmillAngle(w, 0)).toBe(0)
    expect(windmillAngle(w, 45)).toBeCloseTo(Math.PI / 2, 6)
    expect(windmillAngle(w, 90)).toBeCloseTo(Math.PI, 6)
    // A full turn wraps back to 0 at the end of the 180-frame cycle.
    expect(windmillAngle(w, 180)).toBeCloseTo(0, 6)
  })

  it('hurts on a blade, is solid at the hub, and is clear between blades', () => {
    const w = createWindmill(0, 0) // 48x48, centre (24, 24)

    const onBlade = { x: 38, y: 22, w: 4, h: 4 } // centre (40, 24) — 16 px along the frame-0 blade
    expect(windmillBladeHits(w, 0, onBlade)).toBe(true)

    const betweenBlades = { x: 33, y: 33, w: 4, h: 4 } // centre (35, 35) — 45° off every blade
    expect(windmillBladeHits(w, 0, betweenBlades)).toBe(false)

    const hub = { x: 22, y: 22, w: 4, h: 4 } // centre at the hub
    expect(windmillBladeHits(w, 0, hub)).toBe(false)
    expect(windmillHubBox(w).w).toBe(16)
  })
})
