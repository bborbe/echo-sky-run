import { describe, expect, it } from 'vitest'
import { PALETTE } from './renderer.ts'

/** Relative luminance per WCAG, from a `#rrggbb` string. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const channel = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const r = channel((n >> 16) & 255)
  const g = channel((n >> 8) & 255)
  const b = channel(n & 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

describe('Echo visibility', () => {
  // Play gate 2: "the ghost platforms are strange ... i can no see them". The Echo was pale blue on
  // a pale blue sky, which is a contrast failure, not a taste one.
  it('draws an outline that stands out against the sky', () => {
    expect(contrast(PALETTE.echoOutline, PALETTE.sky)).toBeGreaterThanOrEqual(3)
  })

  it('draws a fill that reads against the sky even in greyscale', () => {
    expect(contrast(PALETTE.echoFill, PALETTE.sky)).toBeGreaterThanOrEqual(1.6)
  })
})
