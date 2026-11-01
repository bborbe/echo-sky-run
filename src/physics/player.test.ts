import { describe, expect, it } from 'vitest'
import { COYOTE_F, JUMP_BUFFER_F, METER_MAX, RUN_MAX, SPRINT_MAX } from './constants.ts'
import { createPlayer, NO_INPUT, stepPlayer, type PlayerInput, type PlayerState } from './player.ts'
import { parseLevel } from './tilemap.ts'

const WIDE = parseLevel([
  '.'.repeat(40),
  '.'.repeat(40),
  '.'.repeat(40),
  '.'.repeat(40),
  '#'.repeat(40),
])

/** Floor under columns 0..3 only, so the player can walk off a ledge. */
const LEDGE = parseLevel([
  '................',
  '................',
  '................',
  '................',
  '####............',
])

const RIGHT: PlayerInput = { ...NO_INPUT, right: true }
const RIGHT_SPRINT: PlayerInput = { ...NO_INPUT, right: true, sprint: true }

function standing(): PlayerState {
  // The floor's top edge is y = 64, so a 16 px tall player rests at y = 48. One settle step runs
  // first: a jump can only fire once the simulation has established that the player is on the ground.
  const s = createPlayer(32, 48)
  stepPlayer(s, NO_INPUT, WIDE)
  return s
}

describe('horizontal speed', () => {
  it('tops out at 2.25 px/f and never exceeds it while running', () => {
    const s = standing()
    for (let i = 0; i < 120; i++) {
      stepPlayer(s, RIGHT, WIDE)
      expect(Math.abs(s.vx)).toBeLessThanOrEqual(RUN_MAX + 1e-9)
    }
    expect(s.vx).toBeCloseTo(RUN_MAX, 10)
  })

  it('reaches 3.0 px/f only once the P-meter is full', () => {
    const s = standing()

    // Sprint held from the start must not exceed the run cap while the meter is filling.
    let frames = 0
    while (s.meter < METER_MAX) {
      stepPlayer(s, RIGHT_SPRINT, WIDE)
      expect(Math.abs(s.vx)).toBeLessThanOrEqual(RUN_MAX + 1e-9)
      frames += 1
      expect(frames).toBeLessThan(1000)
    }
    expect(s.meter).toBe(METER_MAX)

    for (let i = 0; i < 30; i++) stepPlayer(s, RIGHT_SPRINT, WIDE)
    expect(s.vx).toBeCloseTo(SPRINT_MAX, 10)
  })

  it('stops at the run cap once the meter is spent by a jump', () => {
    const s = standing()
    while (s.meter < METER_MAX) stepPlayer(s, RIGHT_SPRINT, WIDE)
    s.meter = 0
    for (let i = 0; i < 30; i++) stepPlayer(s, RIGHT_SPRINT, WIDE)
    expect(s.vx).toBeCloseTo(RUN_MAX, 10)
  })
})

describe('jump', () => {
  function apex(holdJump: boolean): number {
    const s = standing()
    let top = s.y
    for (let i = 0; i < 120; i++) {
      const input: PlayerInput = { ...NO_INPUT, jump: holdJump, jumpPressed: i === 0 }
      stepPlayer(s, input, WIDE)
      top = Math.min(top, s.y)
    }
    return top
  }

  it('peaks higher when jump is held than when it is released', () => {
    const held = apex(true)
    const released = apex(false)
    // Held gravity is 0.1875 px/f^2 against 0.375 released, so the held arc is clearly taller.
    expect(held).toBeLessThan(released - 10)
  })

  it('returns to the ground', () => {
    const s = standing()
    stepPlayer(s, { ...NO_INPUT, jump: true, jumpPressed: true }, WIDE)
    expect(s.vy).toBeLessThan(0)
    for (let i = 0; i < 200; i++) stepPlayer(s, NO_INPUT, WIDE)
    expect(s.grounded).toBe(true)
    expect(s.vy).toBe(0)
  })
})

describe('coyote time', () => {
  it('allows a jump for 6 frames after walking off a ledge', () => {
    const s = createPlayer(40, 48)
    let frames = 0
    while (s.grounded || frames === 0) {
      stepPlayer(s, RIGHT, LEDGE)
      frames += 1
      expect(frames).toBeLessThan(200)
    }
    expect(s.coyote).toBeGreaterThan(0)
    expect(s.coyote).toBeLessThanOrEqual(COYOTE_F)

    stepPlayer(s, { ...NO_INPUT, jump: true, jumpPressed: true }, LEDGE)
    expect(s.vy).toBeLessThan(0)
  })

  it('refuses the jump once the window has closed', () => {
    const s = createPlayer(40, 48)
    let frames = 0
    while (s.grounded || frames === 0) {
      stepPlayer(s, RIGHT, LEDGE)
      frames += 1
      expect(frames).toBeLessThan(200)
    }
    for (let i = 0; i < COYOTE_F + 1; i++) stepPlayer(s, RIGHT, LEDGE)
    expect(s.coyote).toBe(0)

    const before = s.vy
    stepPlayer(s, { ...NO_INPUT, jump: true, jumpPressed: true }, LEDGE)
    // Falling: gravity only, no upward impulse.
    expect(s.vy).toBeGreaterThan(before)
  })
})

describe('jump buffer', () => {
  it('fires a press made just before landing', () => {
    // 2 px above the floor, so the landing lands well inside the 6-frame window.
    const s = createPlayer(32, 46)
    stepPlayer(s, { ...NO_INPUT, jump: true, jumpPressed: true }, WIDE)
    expect(s.jumpBuffer).toBeGreaterThan(0)

    let fired = false
    for (let i = 0; i < JUMP_BUFFER_F + 4; i++) {
      stepPlayer(s, { ...NO_INPUT, jump: true }, WIDE)
      if (s.vy < 0) {
        fired = true
        break
      }
    }
    expect(fired).toBe(true)
  })

  it('expires after 6 frames', () => {
    const s = createPlayer(32, 0)
    stepPlayer(s, { ...NO_INPUT, jump: true, jumpPressed: true }, WIDE)
    for (let i = 0; i < JUMP_BUFFER_F; i++) stepPlayer(s, NO_INPUT, WIDE)
    expect(s.jumpBuffer).toBe(0)
  })
})

describe('determinism', () => {
  it('produces bit-identical state for the same input sequence over 1000 ticks', () => {
    const script = (i: number): PlayerInput => ({
      left: i % 97 < 20,
      right: i % 97 >= 20 && i % 97 < 70,
      jump: i % 31 < 8,
      jumpPressed: i % 31 === 0,
      sprint: i % 53 < 25,
    })

    const run = (): PlayerState => {
      const s = standing()
      for (let i = 0; i < 1000; i++) stepPlayer(s, script(i), WIDE)
      return s
    }

    const a = run()
    const b = run()
    expect(b).toStrictEqual(a)
  })
})
