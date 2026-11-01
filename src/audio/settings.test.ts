import { describe, expect, it } from 'vitest'
import { DEFAULT_VOLUMES, loadVolumes, saveVolumes, SETTINGS_KEY, snapVolume, VolumeMenu } from './settings.ts'

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

describe('the pause panel volume rows', () => {
  it('Space and ↑/↓ switch the row; ←/→ move the selected slider one step', () => {
    const menu = new VolumeMenu({ music: 0.5, effects: 0.8 })
    expect(menu.row).toBe('music')
    expect(menu.key('ArrowLeft')).toBe('volume')
    expect(menu.volumes).toEqual({ music: 0.4, effects: 0.8 })
    expect(menu.key('Space')).toBe('row')
    expect(menu.row).toBe('effects')
    expect(menu.key('ArrowRight')).toBe('volume')
    expect(menu.key('ArrowRight')).toBe('volume')
    expect(menu.volumes).toEqual({ music: 0.4, effects: 1 })
    expect(menu.key('ArrowRight')).toBe('none')
    expect(menu.key('ArrowUp')).toBe('row')
    expect(menu.row).toBe('music')
  })

  it('reaches both ends of a slider using only the pad keys (Space and ←/→)', () => {
    const menu = new VolumeMenu({ music: 0.5, effects: 0.5 })
    for (let i = 0; i < 12; i++) menu.key('ArrowLeft')
    menu.key('Space')
    for (let i = 0; i < 12; i++) menu.key('ArrowRight')
    expect(menu.volumes).toEqual({ music: 0, effects: 1 })
  })

  it('owns its keys and nothing else', () => {
    expect(VolumeMenu.owns('Space')).toBe(true)
    expect(VolumeMenu.owns('ArrowLeft')).toBe(true)
    expect(VolumeMenu.owns('KeyH')).toBe(false)
    expect(VolumeMenu.owns('Escape')).toBe(false)
    expect(new VolumeMenu(DEFAULT_VOLUMES).key('KeyQ')).toBe('none')
  })
})
