import { describe, expect, it } from 'vitest'
import { DEFAULT_VOLUMES, loadVolumes, nudgeVolume, saveVolumes, SETTINGS_KEY, snapVolume } from './settings.ts'

/** A Storage stand-in backed by a map. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

describe('volume settings', () => {
  it('defaults to music 50 % and effects 80 %', () => {
    expect(DEFAULT_VOLUMES).toEqual({ music: 0.5, effects: 0.8 })
    expect(loadVolumes(memoryStorage())).toEqual(DEFAULT_VOLUMES)
    expect(loadVolumes(null)).toEqual(DEFAULT_VOLUMES)
  })

  it('round-trips through its own key, apart from the save', () => {
    const storage = memoryStorage({ 'echo-sky-run.v1': '{"bestSeconds":42}' })
    saveVolumes(storage, { music: 0.3, effects: 1 })
    expect(SETTINGS_KEY).toBe('echo-sky-run.settings.v1')
    expect(JSON.parse(storage.data.get(SETTINGS_KEY)!)).toEqual({ music: 0.3, effects: 1 })
    expect(storage.data.get('echo-sky-run.v1')).toBe('{"bestSeconds":42}')
    expect(loadVolumes(storage)).toEqual({ music: 0.3, effects: 1 })
  })

  it('survives broken or hostile storage', () => {
    expect(loadVolumes(memoryStorage({ [SETTINGS_KEY]: 'not json' }))).toEqual(DEFAULT_VOLUMES)
    expect(loadVolumes(memoryStorage({ [SETTINGS_KEY]: '{"music":"loud","effects":7}' }))).toEqual({
      music: 0.5,
      effects: 1,
    })
    const throwing = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadVolumes(throwing)).toEqual(DEFAULT_VOLUMES)
    expect(() => saveVolumes(throwing, DEFAULT_VOLUMES)).not.toThrow()
  })

  it('snaps to the ten slider steps', () => {
    expect(snapVolume(0.44)).toBe(0.4)
    expect(snapVolume(-1)).toBe(0)
    expect(snapVolume(2)).toBe(1)
    expect(snapVolume(Number.NaN)).toBe(0)
  })
})

describe('the settings sliders', () => {
  it('moves one slider one step and leaves the other alone', () => {
    expect(nudgeVolume({ music: 0.5, effects: 0.8 }, 'music', -1)).toEqual({ music: 0.4, effects: 0.8 })
    expect(nudgeVolume({ music: 0.5, effects: 0.8 }, 'effects', 1)).toEqual({ music: 0.5, effects: 0.9 })
  })

  it('reaches both ends and stops there', () => {
    let v = { music: 0.5, effects: 0.5 }
    for (let i = 0; i < 12; i++) v = nudgeVolume(v, 'music', -1)
    expect(v.music).toBe(0)
    for (let i = 0; i < 12; i++) v = nudgeVolume(v, 'effects', 1)
    expect(v.effects).toBe(1)
  })

  it('returns the same object when a press changes nothing, so the shell plays no tick', () => {
    const atTop = { music: 1, effects: 0.5 }
    expect(nudgeVolume(atTop, 'music', 1)).toBe(atTop)
    const atBottom = { music: 0.5, effects: 0 }
    expect(nudgeVolume(atBottom, 'effects', -1)).toBe(atBottom)
  })
})
