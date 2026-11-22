import { describe, expect, it } from 'vitest'
import { TILE } from './constants.ts'
import { findDoorSpawns, findNimbusSpawns, findSwitchSpawns, parseLevel } from './tilemap.ts'

describe('level entities', () => {
  // One of each on row 2, at known columns: n(1), s(5), D(8).
  const LEVEL = parseLevel(['..........', '..........', '.n...s..D.', '..........'])

  it('finds the Nimbus spawn at its cell', () => {
    expect(findNimbusSpawns(LEVEL)).toEqual([{ x: 1 * TILE, y: 2 * TILE }])
  })

  it('finds the Echo switch spawn at its cell', () => {
    expect(findSwitchSpawns(LEVEL)).toEqual([{ x: 5 * TILE, y: 2 * TILE }])
  })

  it('anchors a three-tile door by its feet', () => {
    // The D cell's bottom is the next row's top; the 48 px door reaches two tiles above it.
    expect(findDoorSpawns(LEVEL)).toEqual([{ x: 8 * TILE, y: 2 * TILE + TILE - 3 * TILE }])
  })

  it('returns an empty list for a row without them', () => {
    const bare = parseLevel(['..........'])

    expect(findNimbusSpawns(bare)).toEqual([])
    expect(findSwitchSpawns(bare)).toEqual([])
    expect(findDoorSpawns(bare)).toEqual([])
  })
})
