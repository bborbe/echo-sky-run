import { describe, expect, it } from 'vitest'
import { formatDelta, medalLine, sectionLine } from './renderer.ts'
import { missingGlyphs } from './art/font.ts'

describe('the results screen lines', () => {
  it('formats a signed delta in tenths of a second', () => {
    expect(formatDelta(1.2)).toBe('+1.2')
    expect(formatDelta(-0.3)).toBe('-0.3')
    expect(formatDelta(0)).toBe('0.0')
    // A sub-tenth difference is even, not a spurious +0.0.
    expect(formatDelta(0.04)).toBe('0.0')
    expect(formatDelta(-0.04)).toBe('0.0')
  })

  it('draws the medal the clear earned, or a dash when it earned none', () => {
    expect(medalLine('GOLD')).toBe('MEDAL GOLD')
    expect(medalLine('AUTHOR')).toBe('MEDAL AUTHOR')
    expect(medalLine(null)).toBe('MEDAL --')
  })

  it('draws a section with its time and its delta, or a dash before a best exists', () => {
    expect(sectionLine({ label: 'S1', seconds: 4.2, delta: -0.3 })).toBe('S1 0:04.2 -0.3')
    expect(sectionLine({ label: 'S2', seconds: 12, delta: 1.2 })).toBe('S2 0:12.0 +1.2')
    expect(sectionLine({ label: 'S3', seconds: 3, delta: null })).toBe('S3 0:03.0 --')
  })

  it('every line is drawable by the pixel font, including the delta sign', () => {
    for (const line of [
      medalLine('AUTHOR'),
      medalLine('GOLD'),
      medalLine('SILVER'),
      medalLine('BRONZE'),
      medalLine(null),
      sectionLine({ label: 'S4', seconds: 10.1, delta: -7.2 }),
      sectionLine({ label: 'S1', seconds: 0.5, delta: 0 }),
    ]) {
      expect(missingGlyphs(line)).toEqual([])
    }
  })
})
