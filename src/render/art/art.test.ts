import { describe, expect, it } from 'vitest'
import { ECHO_LIFE_F } from '../../echo/echo.ts'
import {
  GEAR_GOOMBA_H,
  GEAR_GOOMBA_W,
  SHELL_H,
  SHELL_W,
  STEAM_TURTLE_H,
  STEAM_TURTLE_W,
} from '../../game/enemies.ts'
import { SMALL_H, SMALL_W, SUPER_H, SUPER_W } from '../../physics/constants.ts'
import { parseLevel } from '../../physics/tilemap.ts'
import { CATALOGUE, animation } from './catalogue.ts'
import { ECHO_PLATFORM, RING_SEGMENTS, litSegments, ringFraction } from './fx.ts'
import { boundaryKeys, bottomRow, maskColours, maskSize, opaqueBounds, pixelDiff, unionBounds } from './mask.ts'
import { INK, INK_HEX } from './palette.ts'
import { tileShape } from './tiles.ts'

/** The animations that move — named here, so the catalogue cannot quietly mark one as held. */
const MOVING = new Set([
  ...['small', 'super'].flatMap((f) => ['idle', 'run', 'sprint', 'death'].map((p) => `pip-${f}-${p}`)),
  'goomba-walk',
  'turtle-walk',
  'turtle-shell-kicked',
  'qblock-full',
  'checkpoint-open',
  'checkpoint-claimed',
  'goal-flag',
  'echo-fading',
  'echo-refused',
  'echo-spawn-ring',
  'echo-timer-ring',
  'echo-spark',
  'dust',
])

/** Two frames of a moving animation must differ by more than a stray pixel. */
const MIN_FRAME_DIFF_PX = 4

describe('the sprite catalogue', () => {
  it('holds only rectangular masks, one size per animation', () => {
    for (const anim of CATALOGUE) {
      if (anim.name === 'echo-spawn-ring' || anim.name === 'echo-timer-ring') continue
      const first = maskSize(anim.frames[0])
      for (const frame of anim.frames) {
        expect(maskSize(frame), anim.name).toEqual(first)
      }
    }
  })

  it('draws only with palette colours', () => {
    for (const anim of CATALOGUE) {
      for (const frame of anim.frames) {
        for (const hex of maskColours(frame, anim.keys)) {
          expect(INK_HEX.has(hex), `${anim.name} uses ${hex}`).toBe(true)
        }
      }
    }
  })

  it('flags exactly the named animations as moving', () => {
    const flagged = new Set(CATALOGUE.filter((a) => a.moves).map((a) => a.name))
    expect([...flagged].sort()).toEqual([...MOVING].sort())
  })

  it('gives every moving animation frames that really differ, and every held pose one frame', () => {
    for (const anim of CATALOGUE) {
      if (anim.moves) {
        expect(anim.frames.length, anim.name).toBeGreaterThanOrEqual(2)
        for (let i = 0; i < anim.frames.length; i++) {
          for (let j = i + 1; j < anim.frames.length; j++) {
            const a = anim.frames[i]
            const b = anim.frames[j]
            // Rings grow, so their frames differ in size; a size change is a difference.
            const diff = a.length === b.length && a[0].length === b[0].length ? pixelDiff(a, b) : Infinity
            expect(diff, `${anim.name} frames ${i} and ${j}`).toBeGreaterThanOrEqual(MIN_FRAME_DIFF_PX)
          }
        }
      } else if (anim.kind === 'character' || anim.kind === 'prop') {
        expect(anim.frames.length, anim.name).toBe(1)
      }
    }
  })

  it('outlines every character and prop in sepia, with at least three fill tones', () => {
    for (const anim of CATALOGUE) {
      if (anim.kind !== 'character' && anim.kind !== 'prop') continue
      anim.frames.forEach((frame, i) => {
        const offenders = boundaryKeys(frame).filter((key) => INK[anim.keys[key]] !== INK.outline)
        expect(offenders, `${anim.name}[${i}] has non-outline boundary pixels`).toEqual([])
        const fills = [...maskColours(frame, anim.keys)].filter((hex) => hex !== INK.outline)
        expect(fills.length, `${anim.name}[${i}] fill tones`).toBeGreaterThanOrEqual(3)
      })
    }
  })

  it('lists every animation the spec asks for', () => {
    const names = new Set(CATALOGUE.map((a) => a.name))
    for (const form of ['small', 'super']) {
      for (const pose of ['idle', 'run', 'sprint', 'jump', 'fall', 'land', 'death']) {
        expect(names.has(`pip-${form}-${pose}`), `pip-${form}-${pose}`).toBe(true)
      }
    }
    for (const name of [
      'echo-platform',
      'echo-fading',
      'echo-refused',
      'echo-spawn-ring',
      'echo-timer-ring',
      'goomba-walk',
      'goomba-squash',
      'turtle-walk',
      'turtle-shell',
      'turtle-shell-kicked',
      'qblock-full',
      'qblock-used',
      'mushroom',
      'checkpoint-open',
      'checkpoint-claimed',
      'goal-flag',
      'sign',
      'tile-top',
      'tile-edges',
    ]) {
      expect(names.has(name), name).toBe(true)
    }
  })
})

describe('hitbox and sprite sizes (spec § 4)', () => {
  /** The mask size, for the non-hazard size checks. */
  function spriteSize(name: string): { w: number; h: number } {
    return maskSize(animation(name).frames[0])
  }

  // The live hazards. The flattened Gear-Goomba is a corpse, not a hazard.
  const hazards = [
    ['goomba-walk', GEAR_GOOMBA_W, GEAR_GOOMBA_H],
    ['turtle-walk', STEAM_TURTLE_W, STEAM_TURTLE_H],
    ['turtle-shell', SHELL_W, SHELL_H],
    ['turtle-shell-kicked', SHELL_W, SHELL_H],
  ] as const

  it('keeps every hazard hitbox at 85–90 % of what is drawn, on each axis', () => {
    for (const [name, hitW, hitH] of hazards) {
      // The opaque box over all frames: transparent padding cannot inflate the sprite.
      const { w, h } = unionBounds(animation(name).frames)
      expect(hitW / w, `${name} width ${hitW}/${w}`).toBeGreaterThanOrEqual(0.85)
      expect(hitW / w, `${name} width ${hitW}/${w}`).toBeLessThanOrEqual(0.9)
      expect(hitH / h, `${name} height ${hitH}/${h}`).toBeGreaterThanOrEqual(0.85)
      expect(hitH / h, `${name} height ${hitH}/${h}`).toBeLessThanOrEqual(0.9)
    }
  })

  it('draws each hazard at exactly the spec § 4 sprite size', () => {
    const drawn = (name: string): { w: number; h: number } => {
      const { w, h } = unionBounds(animation(name).frames)
      return { w, h }
    }
    expect(drawn('goomba-walk')).toEqual({ w: 18, h: 18 })
    expect(drawn('turtle-walk')).toEqual({ w: 18, h: 27 })
    expect(drawn('turtle-shell')).toEqual({ w: 18, h: 18 })
    expect(drawn('turtle-shell-kicked')).toEqual({ w: 18, h: 18 })
  })

  it('never draws a hazard frame smaller than its hitbox', () => {
    for (const [name, hitW, hitH] of hazards) {
      animation(name).frames.forEach((frame, i) => {
        const box = opaqueBounds(frame)
        expect(box.w, `${name}[${i}] width`).toBeGreaterThanOrEqual(hitW)
        expect(box.h, `${name}[${i}] height`).toBeGreaterThanOrEqual(hitH)
      })
    }
  })

  it('stands every hazard and Pip on the hitbox floor: the mask bottom row is the feet', () => {
    for (const anim of CATALOGUE) {
      if (anim.kind !== 'character') continue
      anim.frames.forEach((frame, i) => {
        expect(bottomRow(frame), `${anim.name}[${i}]`).toBe(frame.length - 1)
      })
    }
  })

  it('draws Pip at least as large as his hitbox in both forms', () => {
    const small = spriteSize('pip-small-idle')
    const big = spriteSize('pip-super-idle')
    expect(small).toEqual({ w: 16, h: 16 })
    expect(big).toEqual({ w: 16, h: 28 })
    expect(small.w).toBeGreaterThanOrEqual(SMALL_W)
    expect(small.h).toBeGreaterThanOrEqual(SMALL_H)
    expect(big.w).toBeGreaterThanOrEqual(SUPER_W)
    expect(big.h).toBeGreaterThanOrEqual(SUPER_H)
  })

  it('draws the Echo platform exactly as large as the box Pip stands on', () => {
    expect(maskSize(ECHO_PLATFORM)).toEqual({ w: 32, h: 4 })
  })
})

describe('the Echo timer ring', () => {
  it('shows the life left: full at placement, half at 120 f, empty at 0', () => {
    expect(ringFraction(ECHO_LIFE_F)).toBe(1)
    expect(ringFraction(120)).toBe(0.5)
    expect(ringFraction(0)).toBe(0)
    expect(litSegments(ECHO_LIFE_F)).toBe(RING_SEGMENTS)
    expect(litSegments(120)).toBe(RING_SEGMENTS / 2)
    expect(litSegments(0)).toBe(0)
  })

  it('lights more ring pixels the more life is left', () => {
    const lit = animation('echo-timer-ring').frames.map((m) => m.join('').split('r').length - 1)
    for (let i = 1; i < lit.length; i++) expect(lit[i]).toBeGreaterThan(lit[i - 1])
  })
})

describe('auto-tiling', () => {
  const map = parseLevel(['......', '.##...', '.##.#.', '######'])

  it('puts grass on a cell with open sky above and earth under a solid one', () => {
    expect(tileShape(map, 1, 1).top).toBe(true)
    expect(tileShape(map, 1, 2).top).toBe(false)
  })

  it('edges the open sides and leaves shared sides plain', () => {
    expect(tileShape(map, 1, 1)).toMatchObject({ left: true, right: false })
    expect(tileShape(map, 2, 1)).toMatchObject({ left: false, right: true })
    expect(tileShape(map, 4, 2)).toMatchObject({ top: true, left: true, right: true })
  })

  it('draws no underside at the bottom of the map', () => {
    expect(tileShape(map, 0, 3).bottom).toBe(false)
  })
})
