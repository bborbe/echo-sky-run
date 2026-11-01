import { describe, expect, it } from 'vitest'
import { EVENT_RECIPE, GAME_EVENTS, LATER_RECIPES, RECIPE_IDS, RECIPES } from './recipes.ts'
import { distinct, fingerprint, peak, renderSound, rms } from './synth.ts'
import { EFFECT_SAMPLE_RATE } from './bank.ts'

const rendered = new Map(RECIPE_IDS.map((id) => [id, renderSound(RECIPES[id], EFFECT_SAMPLE_RATE)]))
const prints = new Map(RECIPE_IDS.map((id) => [id, fingerprint(rendered.get(id)!, EFFECT_SAMPLE_RATE)]))

describe('effect recipes, measured from their rendered samples', () => {
  it('covers the 17 events of 1-1 plus spin, coin and switch', () => {
    expect(GAME_EVENTS).toHaveLength(17)
    expect([...LATER_RECIPES]).toEqual(['spin', 'coin', 'switch'])
    expect(RECIPE_IDS).toHaveLength(20)
    for (const id of RECIPE_IDS) expect(RECIPES[id].length, id).toBeGreaterThan(0)
  })

  it.each(RECIPE_IDS)('%s is audible: peak ≥ 0.1 and RMS ≥ 0.02', (id) => {
    const samples = rendered.get(id)!
    expect(peak(samples)).toBeGreaterThanOrEqual(0.1)
    expect(rms(samples, 0, Math.round(prints.get(id)!.length * EFFECT_SAMPLE_RATE))).toBeGreaterThanOrEqual(0.02)
  })

  it.each(RECIPE_IDS)('%s lasts at least 40 ms and within its cap', (id) => {
    const { length } = prints.get(id)!
    const cap = id === 'goal' ? 2.5 : 0.8
    expect(length).toBeGreaterThanOrEqual(0.04)
    expect(length).toBeLessThanOrEqual(cap)
  })

  it('never clips on its own', () => {
    for (const id of RECIPE_IDS) expect(peak(rendered.get(id)!), id).toBeLessThan(1)
  })

  it('every pair of recipes differs by ≥ 15 % in length, start pitch, end pitch or brightness', () => {
    const alike: string[] = []
    for (let i = 0; i < RECIPE_IDS.length; i++) {
      for (let j = i + 1; j < RECIPE_IDS.length; j++) {
        const a = RECIPE_IDS[i]
        const b = RECIPE_IDS[j]
        if (!distinct(prints.get(a)!, prints.get(b)!, 0.15)) alike.push(`${a} ~ ${b}`)
      }
    }
    expect(alike).toEqual([])
  })

  it('the fingerprint can tell two sounds apart, and cannot tell a sound from itself', () => {
    // A known positive and a known negative, so an empty "alike" list above means something.
    const jump = prints.get('jump')!
    expect(distinct(jump, jump)).toBe(false)
    expect(distinct(prints.get('ui-open')!, prints.get('ui-close')!)).toBe(true)
  })

  it('maps the 17 events to 17 different recipes', () => {
    const targets = GAME_EVENTS.map((e) => EVENT_RECIPE[e])
    expect(new Set(targets).size).toBe(17)
    for (const later of LATER_RECIPES) expect(targets).not.toContain(later)
  })

  it('renders deterministically: the same recipe gives the same samples twice', () => {
    const again = renderSound(RECIPES['echo-refuse'], EFFECT_SAMPLE_RATE)
    expect(Array.from(again)).toEqual(Array.from(rendered.get('echo-refuse')!))
  })
})
