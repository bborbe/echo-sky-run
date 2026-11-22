import { describe, expect, it } from 'vitest'
import {
  bestTimeFor,
  EMPTY_SAVE,
  freshSave,
  isUnlocked,
  loadSave,
  migrate,
  recordBest,
  recordLevelBest,
  relicsFor,
  SAVE_KEY,
  SAVE_VERSION,
  storeSave,
  unlockLevel,
} from './save.ts'

/** A Storage stand-in backed by a map. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

describe('the save schema', () => {
  it('is versioned, and a first run starts from the empty save', () => {
    expect(SAVE_KEY).toBe('echo-sky-run.v1')
    expect(SAVE_VERSION).toBe(2)
    expect(EMPTY_SAVE).toEqual({ version: SAVE_VERSION, bestSeconds: null })

    const storage = memoryStorage()
    expect(loadSave(storage)).toEqual(EMPTY_SAVE)
    expect(loadSave(null)).toEqual(EMPTY_SAVE)
    // A read of an empty store writes nothing: there is no migration to record.
    expect(storage.data.size).toBe(0)
  })

  it('seeds a fresh save with 1-1 open so the lock gate is real for a new player', () => {
    const fresh = freshSave()
    expect(fresh.unlockedLevels).toEqual(['1-1'])
    expect(isUnlocked(fresh, '1-1')).toBe(true)
    expect(isUnlocked(fresh, '1-2')).toBe(false)
    expect(fresh.relics).toEqual({})
    expect(fresh.bestTimes).toEqual({})
  })

  it("migrates G1's unversioned best-time store without losing the best time", () => {
    // The exact payload the previous build wrote, under the key it wrote it to.
    const storage = memoryStorage({ [SAVE_KEY]: '{"bestSeconds":42}' })

    const expected = {
      version: 2,
      bestSeconds: 42,
      unlockedLevels: ['1-1'],
      relics: {},
      bestTimes: { '1-1': 42 },
    }
    expect(loadSave(storage)).toEqual(expected)
    // The migration is recorded, so it runs once rather than on every load.
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toEqual(expected)
  })

  it('treats an explicit version 0 as the unversioned store', () => {
    expect(migrate({ version: 0, bestSeconds: 12.5 })).toEqual({
      version: 2,
      bestSeconds: 12.5,
      unlockedLevels: ['1-1'],
      relics: {},
      bestTimes: { '1-1': 12.5 },
    })
  })

  it('round-trips a save it wrote itself', () => {
    const storage = memoryStorage()
    storeSave(storage, { version: SAVE_VERSION, bestSeconds: 31.25 })
    const written = { version: 2, bestSeconds: 31.25, relics: {}, bestTimes: { '1-1': 31.25 } }
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toEqual(written)
    expect(loadSave(storage)).toEqual(written)
  })

  it('leaves a payload from a newer build alone instead of overwriting it', () => {
    const newer = '{"version":7,"bestSeconds":30,"relics":["a"]}'
    const storage = memoryStorage({ [SAVE_KEY]: newer })

    expect(loadSave(storage)).toEqual(EMPTY_SAVE)
    // Rewriting it would throw away progress a later version still understands.
    expect(storage.data.get(SAVE_KEY)).toBe(newer)
  })

  it('survives broken or hostile storage', () => {
    expect(loadSave(memoryStorage({ [SAVE_KEY]: 'not json' }))).toEqual(EMPTY_SAVE)
    expect(loadSave(memoryStorage({ [SAVE_KEY]: 'null' }))).toEqual(EMPTY_SAVE)
    expect(loadSave(memoryStorage({ [SAVE_KEY]: '{"bestSeconds":"fast"}' }))).toEqual(EMPTY_SAVE)
    expect(loadSave(memoryStorage({ [SAVE_KEY]: '{"bestSeconds":-3}' }))).toEqual(EMPTY_SAVE)

    const throwing = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadSave(throwing)).toEqual(EMPTY_SAVE)
    expect(() => storeSave(throwing, EMPTY_SAVE)).not.toThrow()
  })

  it('never touches the settings key', () => {
    // Settings live under their own key by design, so a save read or write leaves them byte-identical.
    const settings = '{"music":0.3,"effects":0.9}'
    const storage = memoryStorage({ [SAVE_KEY]: '{"bestSeconds":42}', 'echo-sky-run.settings.v1': settings })

    loadSave(storage)
    storeSave(storage, { version: SAVE_VERSION, bestSeconds: 30 })

    expect(storage.data.get('echo-sky-run.settings.v1')).toBe(settings)
  })
})

describe('the v1 → v2 migration', () => {
  it('seeds 1-1 and the per-level best time from the reachable v1 shape (no unlock list)', () => {
    // The shape every real v1 save has: `unlockLevel` has no caller, so nothing ever wrote a list.
    const storage = memoryStorage({ [SAVE_KEY]: '{"version":1,"bestSeconds":42}' })

    const migrated = loadSave(storage)
    expect(migrated.unlockedLevels).toEqual(['1-1'])
    expect(migrated.relics).toEqual({})
    expect(migrated.bestTimes).toEqual({ '1-1': 42 })
    expect(migrated.bestSeconds).toBe(42)
  })

  it('keeps a tracked v1 unlock list rather than replacing it', () => {
    // The tracked shape, read through the real key and `loadSave` — not `migrate` on a literal, so the
    // store-to-save path is the one under test.
    const storage = memoryStorage({
      [SAVE_KEY]: '{"version":1,"bestSeconds":42,"unlockedLevels":["1-1","1-2"]}',
    })
    const migrated = loadSave(storage)
    expect(migrated.unlockedLevels).toEqual(['1-1', '1-2'])
    expect(migrated.bestTimes).toEqual({ '1-1': 42 })
    expect(relicsFor(migrated, '1-1')).toBe(0)
    expect(relicsFor(migrated, '1-2')).toBe(0)
  })

  it('keeps an explicit empty unlock list, which means nothing is unlocked', () => {
    expect(migrate({ version: 1, bestSeconds: null, unlockedLevels: [] }).unlockedLevels).toEqual([])
  })

  it('defaults the Relic Coins to none on a migrated save', () => {
    const migrated = migrate({ version: 1, bestSeconds: 42 })
    expect(relicsFor(migrated, '1-1')).toBe(0)
    expect(relicsFor(migrated, '1-4')).toBe(0)
  })

  it('round-trips Relic Coins and per-level best times', () => {
    const storage = memoryStorage()
    storeSave(storage, {
      version: SAVE_VERSION,
      bestSeconds: 42.3,
      unlockedLevels: ['1-1', '1-2'],
      relics: { '1-1': 2 },
      bestTimes: { '1-1': 42.3, '1-2': 31 },
    })
    const loaded = loadSave(storage)
    expect(relicsFor(loaded, '1-1')).toBe(2)
    expect(bestTimeFor(loaded, '1-2')).toBe(31)
    expect(bestTimeFor(loaded, '1-3')).toBeNull()
  })
})

describe('recording a best time', () => {
  it('takes the first finish and every faster one after it', () => {
    const first = recordBest(EMPTY_SAVE, 42)
    expect(first).toEqual({ version: 2, bestSeconds: 42, bestTimes: { '1-1': 42 } })

    const faster = recordBest(first, 40)
    expect(faster).toEqual({ version: 2, bestSeconds: 40, bestTimes: { '1-1': 40 } })
  })

  it('returns the same object when the run is not faster, so no write is needed', () => {
    const save = { version: SAVE_VERSION, bestSeconds: 42 }
    expect(recordBest(save, 42)).toBe(save)
    expect(recordBest(save, 45)).toBe(save)
  })

  it('keeps the unlock list when it records a faster time', () => {
    const save = { version: SAVE_VERSION, bestSeconds: 42, unlockedLevels: ['1-1'] }
    expect(recordBest(save, 30)).toEqual({
      version: 2,
      bestSeconds: 30,
      unlockedLevels: ['1-1'],
      bestTimes: { '1-1': 30 },
    })
  })

  it('records a per-level best time without touching 1-1', () => {
    const save = { version: SAVE_VERSION, bestSeconds: 42, bestTimes: { '1-1': 42 } }
    const next = recordLevelBest(save, '1-2', 31)
    expect(bestTimeFor(next, '1-2')).toBe(31)
    expect(next.bestSeconds).toBe(42)
    // A slower run on the same level changes nothing.
    expect(recordLevelBest(next, '1-2', 40)).toBe(next)
  })
})

describe('unlock state', () => {
  it('leaves every level open on a save that has not tracked unlocks', () => {
    expect(isUnlocked(EMPTY_SAVE, '1-1')).toBe(true)
    expect(isUnlocked({ version: SAVE_VERSION, bestSeconds: null }, '2-3')).toBe(true)
  })

  it('narrows to exactly the ids a stored list holds', () => {
    const save = { version: SAVE_VERSION, bestSeconds: null, unlockedLevels: ['1-1', '1-2'] }
    expect(isUnlocked(save, '1-1')).toBe(true)
    expect(isUnlocked(save, '1-2')).toBe(true)
    expect(isUnlocked(save, '1-3')).toBe(false)
  })

  it('survives a storeSave → loadSave round-trip', () => {
    const storage = memoryStorage()
    storeSave(storage, { version: SAVE_VERSION, bestSeconds: 31.25, unlockedLevels: ['1-1', '2-1'] })
    const loaded = loadSave(storage)
    expect(loaded.unlockedLevels).toEqual(['1-1', '2-1'])
    expect(isUnlocked(loaded, '2-1')).toBe(true)
    expect(isUnlocked(loaded, '2-2')).toBe(false)
  })

  it('treats a malformed unlock list as untracked rather than locking every tile', () => {
    expect(migrate({ version: 1, bestSeconds: null, unlockedLevels: 'nope' }).unlockedLevels).toBeUndefined()
    expect(migrate({ version: 1, bestSeconds: null, unlockedLevels: ['1-1', 7] }).unlockedLevels).toBeUndefined()
    expect(migrate({ version: 1, bestSeconds: null, unlockedLevels: ['1-1', ''] }).unlockedLevels).toBeUndefined()
    // Untracked means open, so a corrupt list cannot brick the tile view.
    expect(isUnlocked(migrate({ version: 1, bestSeconds: null, unlockedLevels: 'nope' }), '1-1')).toBe(true)
  })

  it('treats a malformed count map as empty rather than half-reading it', () => {
    expect(migrate({ version: 2, bestSeconds: null, relics: 'nope' }).relics).toEqual({})
    expect(migrate({ version: 2, bestSeconds: null, relics: { '1-1': -1 } }).relics).toEqual({})
    expect(migrate({ version: 2, bestSeconds: null, bestTimes: { '1-1': 'fast' } }).bestTimes).toEqual({})
  })
})

describe('unlocking a level', () => {
  it('records an unlock on a tracked save and it survives a reload', () => {
    const storage = memoryStorage()
    const saved = unlockLevel({ version: SAVE_VERSION, bestSeconds: 12.5, unlockedLevels: ['1-1'] }, '1-2')
    expect(saved).toEqual({ version: 2, bestSeconds: 12.5, unlockedLevels: ['1-1', '1-2'] })

    storeSave(storage, saved)
    const loaded = loadSave(storage)
    // The entry survives a reload, asserted on the save's unlock set (no second level exists to play).
    expect(loaded.unlockedLevels).toEqual(['1-1', '1-2'])
    expect(isUnlocked(loaded, '1-2')).toBe(true)
    expect(isUnlocked(loaded, '1-3')).toBe(false)
  })

  it('returns the same save when the id is already unlocked, so no write is needed', () => {
    const tracked = { version: SAVE_VERSION, bestSeconds: 42, unlockedLevels: ['1-1'] } as const
    expect(unlockLevel(tracked, '1-1')).toBe(tracked)
    // An untracked save has every level open already, so unlocking is a no-op there too.
    expect(unlockLevel(EMPTY_SAVE, '1-1')).toBe(EMPTY_SAVE)
  })

  it('refuses an empty id so it cannot degrade the stored list to untracked', () => {
    const save = { version: SAVE_VERSION, bestSeconds: null, unlockedLevels: ['1-1'] } as const
    expect(unlockLevel(save, '')).toBe(save)
  })

  it('leaves a save that carries no unlock list valid and open', () => {
    const loaded = loadSave(memoryStorage({ [SAVE_KEY]: '{"version":2,"bestSeconds":30}' }))
    expect(loaded.unlockedLevels).toBeUndefined()
    expect(isUnlocked(loaded, '9-9')).toBe(true)
  })
})
