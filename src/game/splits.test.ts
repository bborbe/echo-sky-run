import { describe, expect, it } from 'vitest'
import { crossedBoundaries, sectionDeltas, sectionDurations, sectionKey } from './splits.ts'

describe('section splits', () => {
  it('reports only a forward crossing of each boundary', () => {
    const bounds = [100, 200, 300]
    expect(crossedBoundaries(bounds, 90, 110)).toEqual([0])
    expect(crossedBoundaries(bounds, 90, 310)).toEqual([0, 1, 2])
    // A respawn teleports back to the checkpoint: no boundary is crossed in the reverse direction.
    expect(crossedBoundaries(bounds, 250, 10)).toEqual([])
    // Standing exactly on the boundary is not a new crossing.
    expect(crossedBoundaries(bounds, 100, 100)).toEqual([])
  })

  it('turns cumulative splits into one duration per section, ending at the finish', () => {
    expect(sectionDurations([2, 5], 9)).toEqual([2, 3, 4])
    // A missing split is treated as reached at the finish, so the list keeps its length.
    expect(sectionDurations([2, null], 9)).toEqual([2, 7, 0])
    expect(sectionDurations([], 9)).toEqual([9])
  })

  it('reports seconds lost (+) or gained (−) against the best, null where none is stored', () => {
    expect(sectionDeltas([2, 3], [1, 3])).toEqual([1, 0])
    expect(sectionDeltas([2, 3], [3, 2])).toEqual([-1, 1])
    expect(sectionDeltas([2, 3], [null, 2])).toEqual([null, 1])
  })

  it('keys a section best into the existing per-level best-times map', () => {
    expect(sectionKey('1-1', 0)).toBe('1-1#0')
    expect(sectionKey('1-1', 3)).toBe('1-1#3')
  })
})
