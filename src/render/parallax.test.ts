import { describe, expect, it } from 'vitest'
import { SKY } from './art/palette.ts'
import { HAZE_TOP, LAYERS, layerAlpha, parallaxOffset, skyColourAt } from './parallax.ts'

describe('the painted background', () => {
  it('has three parallax layers, far to near, each moving faster than the one behind it', () => {
    expect(LAYERS.map((l) => l.name)).toEqual(['far', 'mid', 'near'])
    for (let i = 1; i < LAYERS.length; i++) {
      expect(LAYERS[i].factor).toBeGreaterThan(LAYERS[i - 1].factor)
      expect(LAYERS[i].blur).toBeLessThan(LAYERS[i - 1].blur)
    }
    for (const l of LAYERS) expect(l.factor).toBeLessThan(1)
  })

  it('draws no layer below the haze line, so a gap shows only sky', () => {
    expect(HAZE_TOP).toBeLessThanOrEqual(192 - 16)
    for (const layer of LAYERS) {
      expect(layer.fadeTo, layer.name).toBeLessThanOrEqual(HAZE_TOP)
      for (let y = HAZE_TOP; y < 224; y++) expect(layerAlpha(layer, y), `${layer.name} at y=${y}`).toBe(0)
    }
  })

  it('wraps each layer within its strip, in both scroll directions', () => {
    expect(parallaxOffset(0, 0.3, 600)).toBe(0)
    expect(parallaxOffset(1000, 0.3, 600)).toBeCloseTo(300)
    expect(parallaxOffset(-100, 0.3, 600)).toBeCloseTo(570)
  })

  it('runs the sky from the top colour to the haze', () => {
    const hex = (c: [number, number, number]): string => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
    expect(hex(skyColourAt(0))).toBe(SKY.top)
    expect(hex(skyColourAt(224))).toBe(SKY.haze)
  })
})
