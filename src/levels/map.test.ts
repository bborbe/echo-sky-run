import { describe, expect, it } from 'vitest'
import { canActivate } from '../ui/screens.ts'
import { bestTimeFor, freshSave, isUnlocked, loadSave, recordLevelBest, relicsFor, SAVE_KEY, storeSave } from '../save/save.ts'
import {
  builtPathLevels,
  completeLevel,
  formatMapTime,
  layoutMap,
  MAP_LEVEL_COUNT,
  mapItems,
  mapLabel,
  mapNodeMeta,
  mapNodes,
  nextLevelId,
  relicGlyphs,
  WORLD1_PATH,
} from './map.ts'

/** A Storage stand-in backed by a map — the browser's localStorage, without a browser. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

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

  it('shows a newly unlocked level as playable, and an unbuilt one as a placeholder', () => {
    // 1-2 ships a level module, so unlocking it makes it playable; 1-3 has no module yet.
    const nodes = mapNodes((id) => isUnlocked(saveWith(['1-1', '1-2', '1-3']), id))
    expect(nodes.find((n) => n.id === '1-2')?.state).toBe('open')
    expect(nodes.find((n) => n.id === '1-3')?.state).toBe('unbuilt')
    expect(nodes.find((n) => n.id === '1-4')?.state).toBe('locked')
  })

  it('never opens a node whose level module does not exist', () => {
    // Even a save that lists every level leaves the unbuilt ones unstartable.
    const nodes = mapNodes((id) => isUnlocked(saveWith(WORLD1_PATH), id))
    expect(nodes.find((n) => n.id === '1-1')?.state).toBe('open')
    expect(nodes.find((n) => n.id === '1-2')?.state).toBe('open')
    expect(
      nodes.filter((n) => n.id !== '1-1' && n.id !== '1-2').every((n) => n.state === 'unbuilt'),
    ).toBe(true)
  })

  it('refuses activation of a locked and of an unbuilt node, and allows an open one', () => {
    const nodes = mapNodes((id) => isUnlocked(saveWith(['1-1', '1-2', '1-3']), id))
    const items = mapItems(nodes)
    const byId = (id: string) => items.find((item) => item.level === id)
    expect(canActivate(byId('1-1'))).toBe(true)
    expect(canActivate(byId('1-2'))).toBe(true) // built and unlocked
    expect(canActivate(byId('1-3'))).toBe(false) // unbuilt
    expect(canActivate(byId('1-4'))).toBe(false) // locked
  })

  it('labels a locked node and an unbuilt node differently', () => {
    const nodes = mapNodes((id) => isUnlocked(saveWith(['1-1', '1-2', '1-3']), id))
    const byId = (id: string) => nodes.find((n) => n.id === id)!
    expect(mapLabel(byId('1-1'))).toBe('')
    expect(mapLabel(byId('1-2'))).toBe('')
    expect(mapLabel(byId('1-3'))).toBe('NOT BUILT YET')
    expect(mapLabel(byId('1-4'))).toBe('LOCKED')
  })

  it('knows which path levels are actually built', () => {
    // 1-1 and 1-2 ship a level module; 1-3 and 1-4 do not yet.
    expect(builtPathLevels()).toEqual(['1-1', '1-2'])
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

describe('the map node labels', () => {
  it('walks to the next node and stops at the end of the path', () => {
    expect(nextLevelId('1-1')).toBe('1-2')
    expect(nextLevelId('1-3')).toBe('1-4')
    expect(nextLevelId('1-4')).toBeNull()
    expect(nextLevelId('9-9')).toBeNull()
  })

  it('draws Relic Coins as three slots, filled from the left', () => {
    expect(relicGlyphs(0)).toBe('◇◇◇')
    expect(relicGlyphs(1)).toBe('◆◇◇')
    expect(relicGlyphs(2)).toBe('◆◆◇')
    expect(relicGlyphs(3)).toBe('◆◆◆')
    // A count outside the slots is clamped rather than drawing a fourth or a negative slot.
    expect(relicGlyphs(9)).toBe('◆◆◆')
    expect(relicGlyphs(-1)).toBe('◇◇◇')
  })

  it('formats a map time the way the mockup shows it', () => {
    expect(formatMapTime(42.3)).toBe('42.3 s')
    expect(formatMapTime(31)).toBe('31.0 s')
    expect(formatMapTime(62.3)).toBe('1:02.3 s')
  })
})

describe('the map against two seeded saves', () => {
  // The pinned fixture: state A has two coins and a 42.3 s best, state B one coin and 31.0 s. A
  // renderer that ignores the save draws the same line for both, so these two cannot both pass.
  const STATE_A = { ...freshSave(), unlockedLevels: ['1-1'], relics: { '1-1': 2 }, bestTimes: { '1-1': 42.3 } }
  const STATE_B = { ...freshSave(), unlockedLevels: ['1-1'], relics: { '1-1': 1 }, bestTimes: { '1-1': 31.0 } }

  const layoutFor = (save: typeof STATE_A) =>
    layoutMap(mapNodes((id) => isUnlocked(save, id)), { relics: save.relics, bestTimes: save.bestTimes }, {
      x: 0,
      y: 0,
      w: 224,
      h: 160,
    })

  it('labels the node from state A with its coins and its best time', () => {
    const node = layoutFor(STATE_A).nodes.find((n) => n.id === '1-1')
    expect(node?.meta).toBe('◆◆◇ · 42.3 s')
  })

  it('labels the node from state B differently, so a save-blind renderer fails', () => {
    const node = layoutFor(STATE_B).nodes.find((n) => n.id === '1-1')
    expect(node?.meta).toBe('◆◇◇ · 31.0 s')
  })

  it('joins every adjacent pair with a connector, so a path-less map fails', () => {
    const layout = layoutFor(STATE_A)
    expect(layout.nodes.map((n) => n.id)).toEqual([...WORLD1_PATH])
    expect(layout.connectors.map((c) => `${c.from}>${c.to}`)).toEqual([
      '1-1>1-2',
      '1-2>1-3',
      '1-3>1-4',
    ])
    // One segment fewer than nodes: every adjacent pair, and nothing else.
    expect(layout.connectors).toHaveLength(layout.nodes.length - 1)
  })

  it('draws a locked node and an unbuilt node with their own reasons, not a time', () => {
    const save = { ...STATE_A, unlockedLevels: ['1-1', '1-2', '1-3'] }
    const layout = layoutFor(save)
    expect(layout.nodes.find((n) => n.id === '1-3')?.meta).toBe('NOT BUILT YET')
    expect(layout.nodes.find((n) => n.id === '1-4')?.meta).toBe('LOCKED')
  })

  it('shows a level with no recorded time as coins and a dash', () => {
    const node = mapNodeMeta({ id: '1-1', state: 'open' }, 0, null)
    expect(node).toBe('◇◇◇ · --')
  })
})

describe('clearing a level unlocks the next one through the completion path', () => {
  it('writes the unlock, the best time and the coins to the real key, and a reload reads them back', () => {
    const storage = memoryStorage()
    // The pre-run save: 1-1 open, two Relic Coins already collected on it, nothing else unlocked.
    const seeded = { ...freshSave(), unlockedLevels: ['1-1'], relics: { '1-1': 2 } }
    storeSave(storage, seeded)

    // The completion path the game itself calls when the flag is reached.
    storeSave(storage, completeLevel(seeded, '1-1', 42.3))

    // A fresh storage instance reading the real key — what a reload does.
    const raw = JSON.parse(storage.data.get(SAVE_KEY) ?? '{}')
    expect(raw.unlockedLevels).toContain('1-1')
    expect(raw.unlockedLevels).toContain('1-2')
    expect(raw.relics).toEqual({ '1-1': 2 })
    expect(raw.bestTimes['1-1']).toBe(42.3)

    const reloaded = loadSave(memoryStorage(Object.fromEntries(storage.data)))
    expect(reloaded.unlockedLevels).toContain('1-2')
    expect(relicsFor(reloaded, '1-1')).toBe(2)
    expect(bestTimeFor(reloaded, '1-1')).toBe(42.3)
  })

  it('refuses a locked node, while an open one is activatable', () => {
    const storage = memoryStorage()
    storeSave(storage, { ...freshSave(), unlockedLevels: ['1-1'] })
    let writes = 0
    const spy = {
      getItem: (k: string) => storage.getItem(k),
      setItem: (k: string, v: string) => {
        writes += 1
        storage.setItem(k, v)
      },
    }
    const save = loadSave(spy)
    const items = mapItems(mapNodes((id) => isUnlocked(save, id)))
    const open = items.find((item) => item.level === '1-1')
    const locked = items.find((item) => item.level === '1-3')

    // Positive control: a write through this spy is visible, so a zero below means something.
    storeSave(spy, recordLevelBest(save, '1-1', 10))
    expect(writes).toBe(1)

    // The refusal is the decision the shell's confirm gates on before it can write anything.
    expect(canActivate(open)).toBe(true)
    expect(canActivate(locked)).toBe(false)
    // The store is byte-identical after the refused row is read — nothing was written for it.
    const before = spy.getItem(SAVE_KEY)
    if (locked !== undefined && canActivate(locked)) storeSave(spy, freshSave())
    expect(writes).toBe(1)
    expect(spy.getItem(SAVE_KEY)).toBe(before)
  })
})
