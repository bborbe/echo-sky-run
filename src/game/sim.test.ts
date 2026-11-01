import { describe, expect, it } from 'vitest'
import { TILE } from '../physics/constants.ts'
import { findTile, GOAL, parseLevel, SPAWN } from '../physics/tilemap.ts'
import { createSim } from './sim.ts'

describe('findTile', () => {
  it('finds the first matching tile and reports its pixel origin', () => {
    const map = parseLevel(['....', '..S.', '....'])
    expect(findTile(map, SPAWN)).toEqual({ x: 2 * TILE, y: TILE })
  })

  it('returns null when the level has no such tile', () => {
    const map = parseLevel(['....', '....'])
    expect(findTile(map, SPAWN)).toBeNull()
    expect(findTile(map, GOAL)).toBeNull()
  })
})

describe('createSim', () => {
  it('throws when the level has no spawn tile', () => {
    expect(() => createSim(parseLevel(['....', '...F']))).toThrow(/spawn/)
  })

  it('throws when the level has no goal tile', () => {
    expect(() => createSim(parseLevel(['..S.', '....']))).toThrow(/goal/)
  })
})
