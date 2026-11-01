import { describe, expect, it } from 'vitest'
import { EMPTY_SAVE, loadSave, migrate, recordBest, SAVE_KEY, SAVE_VERSION, storeSave } from './save.ts'

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
    expect(SAVE_VERSION).toBe(1)
    expect(EMPTY_SAVE).toEqual({ version: SAVE_VERSION, bestSeconds: null })

    const storage = memoryStorage()
    expect(loadSave(storage)).toEqual(EMPTY_SAVE)
    expect(loadSave(null)).toEqual(EMPTY_SAVE)
    // A read of an empty store writes nothing: there is no migration to record.
    expect(storage.data.size).toBe(0)
  })

  it("migrates G1's unversioned best-time store without losing the best time", () => {
    // The exact payload the previous build wrote, under the key it wrote it to.
    const storage = memoryStorage({ [SAVE_KEY]: '{"bestSeconds":42}' })

    expect(loadSave(storage)).toEqual({ version: 1, bestSeconds: 42 })
    // The migration is recorded, so it runs once rather than on every load.
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toEqual({ version: 1, bestSeconds: 42 })
  })

  it('treats an explicit version 0 as the unversioned store', () => {
    expect(migrate({ version: 0, bestSeconds: 12.5 })).toEqual({ version: 1, bestSeconds: 12.5 })
  })

  it('round-trips a save it wrote itself', () => {
    const storage = memoryStorage()
    storeSave(storage, { version: SAVE_VERSION, bestSeconds: 31.25 })
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toEqual({ version: 1, bestSeconds: 31.25 })
    expect(loadSave(storage)).toEqual({ version: 1, bestSeconds: 31.25 })
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

describe('recording a best time', () => {
  it('takes the first finish and every faster one after it', () => {
    const first = recordBest(EMPTY_SAVE, 42)
    expect(first).toEqual({ version: 1, bestSeconds: 42 })

    const faster = recordBest(first, 40)
    expect(faster).toEqual({ version: 1, bestSeconds: 40 })
  })

  it('returns the same object when the run is not faster, so no write is needed', () => {
    const save = { version: SAVE_VERSION, bestSeconds: 42 }
    expect(recordBest(save, 42)).toBe(save)
    expect(recordBest(save, 45)).toBe(save)
  })
})
