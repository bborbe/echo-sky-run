import { describe, expect, it } from 'vitest'
import { LEVEL_1_1_ROWS } from '../levels/level1-1.level.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { encounterList, firstLethalBeforeSafe } from './encounters.ts'

describe('the encounter list', () => {
  it('passes 1-1: the Echo is taught by the sign before the gap that needs it', () => {
    const encounters = encounterList(parseLevel(LEVEL_1_1_ROWS))
    expect(encounters.length).toBeGreaterThan(0)
    expect(firstLethalBeforeSafe(encounters)).toEqual([])
  })

  it('lists the Echo beat as lethal and the sign as safe, in level order', () => {
    const echoes = encounterList(parseLevel(LEVEL_1_1_ROWS)).filter(
      (encounter) => encounter.mechanic === 'echo',
    )
    expect(echoes.some((encounter) => encounter.safe)).toBe(true)
    expect(echoes.some((encounter) => !encounter.safe)).toBe(true)
    expect(echoes[0].safe).toBe(true)
  })

  it('has an encounter check that actually fires: an enemy at a pit lip is flagged', () => {
    // The known positive: a Gear-Goomba two tiles from a pit, with no safe encounter of its kind
    // anywhere in the level.
    const planted = parseLevel(['S..g............F...', '####....############'])
    const violations = firstLethalBeforeSafe(encounterList(planted))

    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0].mechanic).toBe('gear-goomba')
    expect(violations[0].safe).toBe(false)
  })
})
