import { describe, expect, it } from 'vitest'
import {
  LEVEL_CATALOGUE,
  findLevel,
  groupBySet,
  tileIndexFor,
  tileItems,
  type LevelEntry,
} from './catalogue.ts'

/** Three levels over two sets — the two-entry shape the task's criterion asks for, plus a second set. */
const FIXTURE: readonly LevelEntry[] = [
  { id: '1-1', name: 'MEADOW LEDGE', set: 'WORLD 1', rows: ['#S#'] },
  { id: '1-2', name: 'SECOND LEDGE', set: 'WORLD 1', rows: ['#S#'] },
  { id: '2-1', name: 'THIRD LEDGE', set: 'WORLD 2', rows: ['#S#'] },
]

describe('the level catalogue', () => {
  it('lists every shipped level exactly once, derived from its module', () => {
    const ids = LEVEL_CATALOGUE.map((level) => level.id)
    expect(ids).toEqual([...new Set(ids)])
    expect(ids).toContain('1-1')
  })

  it('carries the id, display name, set and rows the tile view needs', () => {
    for (const level of LEVEL_CATALOGUE) {
      expect(level.id).not.toBe('')
      expect(level.name).not.toBe('')
      expect(level.set).not.toBe('')
      expect(level.rows.length).toBeGreaterThan(0)
    }
  })

  it('maps one tile per level, labelled by id', () => {
    expect(tileItems(FIXTURE).map((item) => item.label)).toEqual(['1-1', '1-2', '2-1'])
    expect(tileItems(FIXTURE).every((item) => item.id === 'level')).toBe(true)
  })

  it('leaves every tile startable when the caller has no unlock state', () => {
    expect(tileItems(FIXTURE).every((item) => item.locked !== true)).toBe(true)
  })

  it('marks exactly the levels its unlock predicate rejects', () => {
    const items = tileItems(FIXTURE, (id) => id === '1-1')
    expect(items.map((item) => item.locked === true)).toEqual([false, true, true])
  })

  it('groups levels by set in first-seen order', () => {
    expect(groupBySet(FIXTURE).map((group) => group.set)).toEqual(['WORLD 1', 'WORLD 2'])
    expect(groupBySet(FIXTURE)[0].levels.map((level) => level.id)).toEqual(['1-1', '1-2'])
  })

  it('restores the focus to the tile that was started', () => {
    expect(tileIndexFor(tileItems(FIXTURE), '1-2')).toBe(1)
    expect(tileIndexFor(tileItems(FIXTURE), '2-1')).toBe(2)
    expect(tileIndexFor(tileItems(FIXTURE), null)).toBe(0)
    expect(tileIndexFor(tileItems(FIXTURE), 'missing')).toBe(0)
  })

  it('resolves a level id to its entry', () => {
    expect(findLevel('1-1')?.name).toBe('MEADOW LEDGE')
    expect(findLevel('nope')).toBeUndefined()
  })
})
