import { describe, expect, it } from 'vitest'
import { DEATH_HOLD_F, HIT_STOP_STOMP_F, Juice, SHAKE_F, SHAKE_PX, type StepFacts } from './juice.ts'

const BOX = { x: 100, y: 178, w: 12, h: 14 }

/** A quiet step: standing on the ground, nothing happening. */
function facts(over: Partial<StepFacts> = {}): StepFacts {
  return {
    inputDir: 0,
    grounded: true,
    wasGrounded: true,
    prevVy: 0,
    vx: 0,
    vy: 0,
    player: BOX,
    stomps: [],
    died: false,
    deathBox: BOX,
    deathSuper: false,
    bigHit: false,
    echoPlaced: null,
    echoRefused: false,
    blockHit: null,
    pose: 'idle',
    poseFrame: 0,
    facing: 1,
    superForm: false,
    ...over,
  }
}

/** One fixed step the way the shell runs it: a held step only counts down, a normal one ages and observes. */
function step(j: Juice, f: StepFacts = facts()): void {
  if (j.holding()) {
    j.tickHold()
    return
  }
  j.tick()
  j.observe(f)
}

const JUMP = facts({ wasGrounded: true, grounded: false, vy: -5 })
const LAND = facts({ wasGrounded: false, grounded: true, prevVy: 3 })
const STOMP = facts({
  grounded: false,
  wasGrounded: false,
  vy: -4.5,
  stomps: [{ kind: 'gear-goomba', x: 110, y: 176, w: 16, h: 16 }],
})
const DEATH = facts({ died: true, deathBox: { x: 300, y: 150, w: 12, h: 14 } })
const BIG_HIT = facts({ bigHit: true })

function scaledFrames(j: Juice, trigger: StepFacts): number {
  step(j, trigger)
  let n = 0
  for (let i = 0; i < 20; i++) {
    const s = j.pipScale()
    if (s.sx !== 1 || s.sy !== 1) n++
    step(j, facts({ grounded: trigger.grounded, wasGrounded: trigger.grounded }))
  }
  return n
}

function shakeFrames(j: Juice, trigger: StepFacts): { frames: number; peak: number } {
  step(j, trigger)
  let frames = 0
  let peak = 0
  for (let i = 0; i < 40; i++) {
    const o = j.shakeOffset()
    if (o.x !== 0 || o.y !== 0) frames++
    peak = Math.max(peak, Math.abs(o.x), Math.abs(o.y))
    step(j)
  }
  return { frames, peak }
}

describe('juice', () => {
  it('stretches Pip on take-off and squashes him on landing, each for at least 4 frames', () => {
    expect(scaledFrames(new Juice(), JUMP)).toBeGreaterThanOrEqual(4)
    expect(scaledFrames(new Juice(), LAND)).toBeGreaterThanOrEqual(4)
    const j = new Juice()
    step(j, JUMP)
    expect(j.pipScale().sy).toBeGreaterThan(1)
    const k = new Juice()
    step(k, LAND)
    expect(k.pipScale().sy).toBeLessThan(1)
  })

  it('kicks up dust on a landing and on a skid, and none while standing', () => {
    const live = (j: Juice): number => j.particles.filter((p) => p.active && p.kind === 'dust').length
    const still = new Juice()
    for (let i = 0; i < 10; i++) step(still)
    expect(live(still)).toBe(0)

    const landing = new Juice()
    step(landing, LAND)
    expect(live(landing)).toBeGreaterThan(0)

    const skid = new Juice()
    step(skid, facts({ inputDir: -1, vx: 2 }))
    expect(live(skid)).toBeGreaterThan(0)
  })

  it('holds the simulation for exactly 3 fixed steps after a stomp', () => {
    const j = new Juice()
    step(j, STOMP)
    let held = 0
    while (j.holding()) {
      held++
      step(j)
    }
    expect(held).toBe(HIT_STOP_STOMP_F)
    expect(HIT_STOP_STOMP_F).toBeGreaterThanOrEqual(2)
    expect(HIT_STOP_STOMP_F).toBeLessThanOrEqual(4)
  })

  it('lays a stomped Gear-Goomba flat for at least 8 frames', () => {
    const j = new Juice()
    step(j, STOMP)
    let flat = 0
    for (let i = 0; i < 40; i++) {
      if (j.effects.some((e) => e.active && e.kind === 'goomba-flat')) flat++
      step(j)
    }
    expect(flat).toBeGreaterThanOrEqual(8)
  })

  it('shakes the screen on a death and on a Super → Small hit — briefly and by at most 2 px', () => {
    for (const trigger of [DEATH, BIG_HIT]) {
      const { frames, peak } = shakeFrames(new Juice(), trigger)
      expect(frames).toBeGreaterThan(0)
      expect(frames).toBeLessThanOrEqual(SHAKE_F)
      expect(peak).toBeLessThanOrEqual(SHAKE_PX)
    }
  })

  it('never shakes on a stomp, a jump or a landing', () => {
    for (const trigger of [STOMP, JUMP, LAND]) {
      expect(shakeFrames(new Juice(), trigger).frames).toBe(0)
    }
  })

  it('plays the death pop for at least 8 distinct frames and gives control back within 18', () => {
    const j = new Juice()
    step(j, DEATH)
    const seen = new Set<string>()
    let held = 0
    while (j.holding()) {
      const death = j.effects.find((e) => e.active && e.kind === 'death')
      if (death) {
        const pose = Juice.deathPose(death.age)
        seen.add(`${pose.frame}:${pose.dy}`)
      }
      held++
      step(j)
    }
    expect(seen.size).toBeGreaterThanOrEqual(8)
    expect(held).toBeLessThanOrEqual(DEATH_HOLD_F)
    // The death step itself, the held steps, then the first controlled step.
    expect(1 + held + 1).toBeLessThanOrEqual(18)
  })

  it('rings and sparks an Echo placement and keeps the ghost in the pose it was placed in', () => {
    const j = new Juice()
    step(j, facts({ echoPlaced: { x: 90, y: 150, w: 32, h: 4 }, pose: 'fall', facing: -1 }))
    expect(j.effects.some((e) => e.active && e.kind === 'spawn-ring')).toBe(true)
    expect(j.particles.filter((p) => p.active && p.kind === 'spark').length).toBeGreaterThanOrEqual(4)
    expect(j.ghosts.at(-1)).toMatchObject({ x: 90, y: 150, pose: 'fall', facing: -1 })
  })

  it('fizzles a refused Echo', () => {
    const j = new Juice()
    step(j, facts({ echoRefused: true }))
    expect(j.effects.some((e) => e.active && e.kind === 'fizzle')).toBe(true)
  })

  it('bumps an emptied ? block up and back down', () => {
    const j = new Juice()
    step(j, facts({ blockHit: { col: 24, row: 9 } }))
    const lifts: number[] = []
    for (let i = 0; i < 10; i++) {
      step(j)
      lifts.push(j.blockLift(24, 9))
    }
    expect(Math.max(...lifts)).toBeGreaterThan(0)
    expect(lifts.at(-1)).toBe(0)
  })

  it('draws the same particles on every run', () => {
    const run = (): string => {
      const j = new Juice()
      step(j, LAND)
      step(j, facts({ echoPlaced: { x: 0, y: 0, w: 32, h: 4 } }))
      for (let i = 0; i < 5; i++) step(j)
      return JSON.stringify(j.particles.filter((p) => p.active))
    }
    expect(run()).toBe(run())
  })
})
