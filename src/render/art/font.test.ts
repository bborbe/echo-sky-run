import { describe, expect, it } from 'vitest'
import { formatTime } from '../renderer.ts'
import { FONT, GLYPH_H, GLYPH_W, OVERLAY_TEXT, missingGlyphs, textWidth } from './font.ts'

describe('the overlay pixel font', () => {
  it('draws every glyph on the same 5×7 grid, ink or clear only', () => {
    for (const [ch, glyph] of Object.entries(FONT)) {
      expect(glyph.length, ch).toBe(GLYPH_H)
      for (const row of glyph) {
        expect(row.length, ch).toBe(GLYPH_W)
        expect(row, ch).toMatch(/^[#.]+$/)
      }
    }
  })

  it('can draw every line the overlays show, times included', () => {
    for (const line of Object.values(OVERLAY_TEXT)) expect(missingGlyphs(line), line).toEqual([])
    for (const t of [0, 5.1, 13.7, 81.3, 3599.9]) expect(missingGlyphs(`TIME ${formatTime(t)}`)).toEqual([])
  })

  it('fits the longest line inside the narrowest panel', () => {
    // The tally panel is min(viewW − 32, 220) wide; the narrowest logical view is a 4:3 window (~298).
    const longest = Math.max(...Object.values(OVERLAY_TEXT).map(textWidth))
    expect(longest).toBeLessThanOrEqual(220 - 16)
  })
})
