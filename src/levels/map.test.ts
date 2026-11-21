import { describe, expect, it } from 'vitest'
import { canActivate } from '../ui/screens.ts'
import { bestTimeFor, freshSave, isUnlocked, relicsFor } from '../save/save.ts'
import { builtPathLevels, MAP_LEVEL_COUNT, mapItems, mapLabel, mapNodes, WORLD1_PATH } from './map.ts'

/** A save whose unlock list is exactly `ids`, so the map reads a real lock state. */
function saveWith(ids: readonly string[]) {
  return { ...freshSave(), unlockedLevels: ids }
}

describe('the overworld map', () => {
  it('walks World 1 in play order', () => {
    expect(WORLD1_PATH).toEqual(['1-1', '1-2', '1-3', '1-4'])
  })

  it('opens 1-1 and locks the rest on a fresh save', () => {
    const nodes = mapNodes((id) => isUnlocked(saveWith(['1-1']), id))
    expect(nodes.map((n) => [n.id, n.state])).toEqual([
      ['1-1', 'open'],
      ['1-2', 'locked'],
      ['1-3', 'locked'],
      ['1-4', 'locked'],
    ])
  })

  it('shows a newly unlocked level as not built yet, while the rest stay locked', () => {
    // 1-2 is unlocked but has no level module, so it reads as a placeholder, not as playable.
    const nodes = mapNodes((id) => isUnlocked(saveWith(['1-1', '1-2']), id))
    expect(nodes.find((n) => n.id === '1-2')?.state).toBe('unbuilt')
    expect(nodes.find((n) => n.id === '1-3')?.state).toBe('locked')
  })

  it('never opens a node whose level module does not exist', () => {
    // Even a save that lists every level leaves the unbuilt ones unstartable.
    const nodes = mapNodes((id) => isUnlocked(saveWith(WORLD1_PATH), id))
    expect(nodes.find((n) => n.id === '1-1')?.state).toBe('open')
    expect(nodes.filter((n) => n.id !== '1-1').every((n) => n.state === 'unbuilt')).toBe(true)
  })

  it('refuses activation of a locked and of an unbuilt node, and allows an open one', () => {
    const nodes = mapNodes((id) => isUnlocked(saveWith(['1-1', '1-2']), id))
    const items = mapItems(nodes)
    const byId = (id: string) => items.find((item) => item.level === id)
    expect(canActivate(byId('1-1'))).toBe(true)
    expect(canActivate(byId('1-2'))).toBe(false) // unbuilt
    expect(canActivate(byId('1-3'))).toBe(false) // locked
  })

  it('labels a locked node and an unbuilt node differently', () => {
    const nodes = mapNodes((id) => isUnlocked(saveWith(['1-1', '1-2']), id))
    const byId = (id: string) => nodes.find((n) => n.id === id)!
    expect(mapLabel(byId('1-1'))).toBe('')
    expect(mapLabel(byId('1-2'))).toBe('NOT BUILT YET')
    expect(mapLabel(byId('1-3'))).toBe('LOCKED')
  })

  it('knows which path levels are actually built', () => {
    // Only 1-1 ships a level module today.
    expect(builtPathLevels()).toEqual(['1-1'])
    expect(MAP_LEVEL_COUNT).toBeGreaterThanOrEqual(1)
  })

  it('reads Relic Coins and best times off the save for a node', () => {
    const save = { ...saveWith(['1-1']), relics: { '1-1': 2 }, bestTimes: { '1-1': 42.3 } }
    expect(relicsFor(save, '1-1')).toBe(2)
    expect(bestTimeFor(save, '1-1')).toBe(42.3)
    expect(relicsFor(save, '1-2')).toBe(0)
    expect(bestTimeFor(save, '1-2')).toBeNull()
  })
})
