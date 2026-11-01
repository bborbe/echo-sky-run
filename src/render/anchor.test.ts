import { describe, expect, it } from 'vitest'
import { spriteOrigin } from './anchor.ts'

describe('sprite anchoring', () => {
  it('stands the sprite on the hitbox floor: its last row is the floor row', () => {
    const box = { x: 288, y: 176, w: 16, h: 16 }
    const o = spriteOrigin(box, 18, 18)
    expect(o.y + 18).toBe(box.y + box.h)
  })

  it('centres a wider sprite on the hitbox', () => {
    expect(spriteOrigin({ x: 288, y: 176, w: 16, h: 16 }, 18, 18).x).toBe(287)
    expect(spriteOrigin({ x: 100, y: 178, w: 12, h: 14 }, 16, 16).x).toBe(98)
  })

  it('keeps a fractional hitbox on whole pixels without sinking it', () => {
    const o = spriteOrigin({ x: 10.4, y: 167.6, w: 16, h: 24 }, 18, 27)
    expect(Number.isInteger(o.x) && Number.isInteger(o.y)).toBe(true)
    expect(o.y + 27).toBe(Math.round(167.6 + 24))
  })
})
