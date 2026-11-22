import { describe, expect, it } from 'vitest'
import { createSim, stepSim, type SimInput } from '../game/sim.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { canActivate } from '../ui/screens.ts'
import { bestTimeFor, freshSave, isUnlocked, loadSave, recordLevelBest, relicsFor, SAVE_KEY, storeSave } from '../save/save.ts'
import {
  builtPathLevels,
  completeLevel,
  formatMapTime,
  layoutMap,
  MAP_LEVEL_COUNT,
  MAP_NODE_IDS,
  mapItems,
  mapLabel,
  mapNodeMeta,
  mapNodes,
  nextLevelId,
  relicGlyphs,
  SECRET_LEVEL_ID,
  unlockSecretLevel,
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
  it('walks World 1 in play order, with the secret branch off the end of the path', () => {
    expect(WORLD1_PATH).toEqual(['1-1', '1-2', '1-3', '1-4'])
    expect(SECRET_LEVEL_ID).toBe('1-S')
    expect(MAP_NODE_IDS).toEqual(['1-1', '1-2', '1-3', '1-4', '1-S'])
  })

  it('opens 1-1 and locks the rest, including the secret node, on a fresh save', () => {
    const nodes = mapNodes((id) => isUnlocked(saveWith(['1-1']), id))
    expect(nodes.map((n) => [n.id, n.state])).toEqual([
      ['1-1', 'open'],
      ['1-2', 'locked'],
      ['1-3', 'locked'],
      ['1-4', 'locked'],
      ['1-S', 'locked'],
    ])
  })

  it('shows a newly unlocked level as playable, and an unbuilt one as a placeholder', () => {
    // 1-2 ships a level module, so unlocking it makes it playable; 1-3 has no module yet. 1-S is
    // held here too, but has no module, so it reads as a placeholder rather than a lock.
    const nodes = mapNodes((id) => isUnlocked(saveWith(['1-1', '1-2', '1-3', '1-S']), id))
    expect(nodes.find((n) => n.id === '1-2')?.state).toBe('open')
    expect(nodes.find((n) => n.id === '1-3')?.state).toBe('unbuilt')
    expect(nodes.find((n) => n.id === '1-4')?.state).toBe('locked')
    expect(nodes.find((n) => n.id === '1-S')?.state).toBe('unbuilt')
  })

  it('never opens a node whose level module does not exist', () => {
    // Even a save that lists every node leaves the unbuilt ones unstartable.
    const nodes = mapNodes((id) => isUnlocked(saveWith(MAP_NODE_IDS), id))
    expect(nodes.find((n) => n.id === '1-1')?.state).toBe('open')
    expect(nodes.find((n) => n.id === '1-2')?.state).toBe('open')
    expect(
      nodes.filter((n) => n.id !== '1-1' && n.id !== '1-2').every((n) => n.state === 'unbuilt'),
    ).toBe(true)
  })

  it('refuses activation of a locked and of an unbuilt node, and allows an open one', () => {
    const nodes = mapNodes((id) => isUnlocked(saveWith(['1-1', '1-2', '1-3', '1-S']), id))
    const items = mapItems(nodes)
    const byId = (id: string) => items.find((item) => item.level === id)
    expect(canActivate(byId('1-1'))).toBe(true)
    expect(canActivate(byId('1-2'))).toBe(true) // built and unlocked
    expect(canActivate(byId('1-3'))).toBe(false) // unbuilt
    expect(canActivate(byId('1-4'))).toBe(false) // locked
    expect(canActivate(byId('1-S'))).toBe(false) // held but unbuilt
  })

  it('labels a locked node and an unbuilt node differently', () => {
    const nodes = mapNodes((id) => isUnlocked(saveWith(['1-1', '1-2', '1-3']), id))
    const byId = (id: string) => nodes.find((n) => n.id === id)!
    expect(mapLabel(byId('1-1'))).toBe('')
    expect(mapLabel(byId('1-2'))).toBe('')
    expect(mapLabel(byId('1-3'))).toBe('NOT BUILT YET')
    expect(mapLabel(byId('1-4'))).toBe('LOCKED')
    expect(mapLabel(byId('1-S'))).toBe('LOCKED')
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
    // The secret level is a branch, not a step: nothing walks onto it and it walks nowhere.
    expect(nextLevelId('1-S')).toBeNull()
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

  it('joins the linear path and hangs the secret branch off 1-3, never off 1-4', () => {
    const layout = layoutFor(STATE_A)
    expect(layout.nodes.map((n) => n.id)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-S'])
    // An explicit list, not a length: a 1-S drawn as the continuation of 1-4 would still be one
    // connector per node, and only this list catches it.
    expect(layout.connectors.map((c) => `${c.from}>${c.to}`)).toEqual([
      '1-1>1-2',
      '1-2>1-3',
      '1-3>1-4',
      '1-3>1-S',
    ])
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

describe('the secret level is a branch, not a step of the path', () => {
  it('never unlocks 1-S through the linear completion path', () => {
    // The end of the path has no next node, so clearing 1-4 unlocks nothing — least of all 1-S.
    expect(nextLevelId('1-4')).toBeNull()
    const cleared = completeLevel(freshSave(), '1-4', 42.3)
    expect(cleared.unlockedLevels).not.toContain('1-S')

    // The only linear producer near the branch is clearing 1-3, and it unlocks 1-4 alone.
    const after13 = completeLevel(freshSave(), '1-3', 12)
    expect(after13.unlockedLevels).toContain('1-4')
    expect(after13.unlockedLevels).not.toContain('1-S')
  })
})

describe('the map lays out five nodes', () => {
  const BOX = { x: 0, y: 0, w: 224, h: 160 }
  const layout = layoutMap(mapNodes((id) => isUnlocked(freshSave(), id)), {}, BOX)

  it('gives every node its own centre and a box fully inside the map', () => {
    expect(layout.nodes).toHaveLength(5)
    const centres = layout.nodes.map((n) => `${n.x + n.w / 2},${n.y + n.h / 2}`)
    expect(new Set(centres).size).toBe(5)
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(BOX.x)
      expect(node.y).toBeGreaterThanOrEqual(BOX.y)
      expect(node.x + node.w).toBeLessThanOrEqual(BOX.x + BOX.w)
      expect(node.y + node.h).toBeLessThanOrEqual(BOX.y + BOX.h)
    }
  })

  it('never draws two node boxes overlapping', () => {
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i]
        const b = layout.nodes[j]
        const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlaps).toBe(false)
      }
    }
  })
})

/**
 * A fixture level for the secret switch: Pip on a flat floor with the switch a few tiles to his
 * right. Deliberately not 1-3's layout — this proves the tile, the contact and the latch, and 1-3
 * places its own switch against the same contract.
 */
const SECRET_FIXTURE = [
  '................',
  '................',
  '................',
  '................',
  '.S...X.....F....',
  '################',
]

const WALK_RIGHT: SimInput = {
  left: false,
  right: true,
  jump: false,
  jumpPressed: false,
  sprint: false,
  echoPressed: false,
}

/** Step the fixture until Pip touches the secret switch, so the latch comes from the real step. */
function stepOntoSecretSwitch() {
  const sim = createSim(parseLevel(SECRET_FIXTURE))
  let frames = 0
  while (!sim.secretSwitchTouched && frames < 300) {
    stepSim(sim, WALK_RIGHT)
    frames += 1
  }
  return { sim, frames }
}

describe('the secret switch unlocks the secret level', () => {
  it('unlocks 1-S on contact and the unlock survives a reload as unbuilt', () => {
    const { sim, frames } = stepOntoSecretSwitch()
    expect(sim.secretSwitchTouched).toBe(true)
    expect(frames).toBeLessThan(300)

    const storage = memoryStorage()
    storeSave(storage, { ...freshSave(), unlockedLevels: ['1-1'] })
    storeSave(storage, unlockSecretLevel(loadSave(storage)))

    // The real key holds it — not an in-memory save object.
    const raw = JSON.parse(storage.data.get(SAVE_KEY) ?? '{}')
    expect(raw.unlockedLevels).toContain('1-S')

    // A fresh storage over the same data is what a reload reads.
    const reloaded = loadSave(memoryStorage(Object.fromEntries(storage.data)))
    expect(reloaded.unlockedLevels).toContain('1-S')
    // Held, but with no level module yet, so the map draws it as a placeholder rather than a lock.
    const node = mapNodes((id) => isUnlocked(reloaded, id)).find((n) => n.id === '1-S')
    expect(node?.state).toBe('unbuilt')
  })

  it('holds exactly one 1-S and skips the write when the save already has it', () => {
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
    let save = loadSave(spy)

    // Touch the switch twice in one run: the second step lands on the same latched switch, so the
    // latch does not move and the shell has nothing new to write.
    const { sim } = stepOntoSecretSwitch()
    expect(sim.secretSwitchTouched).toBe(true)
    stepSim(sim, WALK_RIGHT)
    expect(sim.secretSwitchTouched).toBe(true)

    // The shell's guard, twice: the first call writes, the second returns the same save.
    const first = unlockSecretLevel(save)
    if (first !== save) {
      save = first
      storeSave(spy, save)
    }
    expect(writes).toBe(1)
    const second = unlockSecretLevel(save)
    expect(second).toBe(save)
    if (second !== save) storeSave(spy, second)
    expect(writes).toBe(1)

    expect(save.unlockedLevels?.filter((id) => id === '1-S')).toHaveLength(1)
    expect(JSON.parse(spy.getItem(SAVE_KEY) ?? '{}').unlockedLevels).toContain('1-S')
  })
})
