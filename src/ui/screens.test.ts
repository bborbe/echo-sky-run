import { describe, expect, it } from 'vitest'
import { missingGlyphs } from '../render/art/font.ts'
import {
  activate,
  backTarget,
  isVolumeRow,
  menuFor,
  MENUS,
  moveSelection,
  type GameScreen,
} from './screens.ts'

const SCREENS: GameScreen[] = ['title', 'level', 'pause', 'settings', 'results']

describe('the screens', () => {
  it('gives the level no menu: the game is playing', () => {
    expect(menuFor('level')).toEqual([])
  })

  it('lists each menu screen its rows in drawing order', () => {
    expect(menuFor('title').map((i) => i.label)).toEqual(['START', 'CONTROLS'])
    expect(menuFor('pause').map((i) => i.label)).toEqual(['RESUME', 'RESTART', 'SETTINGS'])
    expect(menuFor('settings').map((i) => i.label)).toEqual(['MUSIC', 'EFFECTS', 'CONTROLS', 'BACK'])
    expect(menuFor('results').map((i) => i.label)).toEqual(['RETRY', 'TITLE'])
  })

  it('draws every label with the pixel font', () => {
    for (const screen of SCREENS) {
      for (const item of menuFor(screen)) {
        expect(missingGlyphs(item.label), `${screen} / ${item.label}`).toEqual([])
      }
    }
  })
})

describe('selection', () => {
  it('wraps at both ends, so a short list never dead-ends', () => {
    expect(moveSelection(3, 0, -1)).toBe(2)
    expect(moveSelection(3, 2, 1)).toBe(0)
    expect(moveSelection(3, 1, 1)).toBe(2)
    expect(moveSelection(4, 3, 1)).toBe(0)
  })

  it('stays at zero on an empty list', () => {
    expect(moveSelection(0, 0, 1)).toBe(0)
    expect(moveSelection(0, 0, -1)).toBe(0)
  })

  it('knows which rows are volume sliders', () => {
    expect(isVolumeRow(MENUS.settings[0])).toBe(true)
    expect(isVolumeRow(MENUS.settings[1])).toBe(true)
    expect(isVolumeRow(MENUS.settings[2])).toBe(false)
    expect(isVolumeRow(undefined)).toBe(false)
  })
})

describe('confirming a row', () => {
  it('starts a fresh run from the title, and again from restart and retry', () => {
    expect(activate('title', 'start')).toEqual({ screen: 'level', restart: true, controls: false })
    expect(activate('pause', 'restart')).toEqual({ screen: 'level', restart: true, controls: false })
    expect(activate('results', 'retry')).toEqual({ screen: 'level', restart: true, controls: false })
  })

  it('resumes without restarting the run', () => {
    expect(activate('pause', 'resume')).toEqual({ screen: 'level', restart: false, controls: false })
  })

  it('reaches settings from the pause and comes back', () => {
    expect(activate('pause', 'settings')).toEqual({ screen: 'settings', restart: false, controls: false })
    expect(activate('settings', 'back')).toEqual({ screen: 'pause', restart: false, controls: false })
  })

  it('returns to the title from the results, starting clean', () => {
    expect(activate('results', 'title')).toEqual({ screen: 'title', restart: true, controls: false })
  })

  it('opens the controls card without leaving the screen it was confirmed on', () => {
    expect(activate('title', 'controls')).toEqual({ screen: 'title', restart: false, controls: true })
    expect(activate('settings', 'controls')).toEqual({ screen: 'settings', restart: false, controls: true })
  })

  it('does nothing on a volume row: ←/→ is what adjusts it', () => {
    expect(activate('settings', 'music')).toEqual({ screen: 'settings', restart: false, controls: false })
    expect(activate('settings', 'effects')).toEqual({ screen: 'settings', restart: false, controls: false })
  })
})

describe('the back key', () => {
  it('pauses the level, resumes from the pause, leaves settings for the pause', () => {
    expect(backTarget('level')).toBe('pause')
    expect(backTarget('pause')).toBe('level')
    expect(backTarget('settings')).toBe('pause')
  })

  it('leaves the results for the title, and has nowhere to go from the title', () => {
    expect(backTarget('results')).toBe('title')
    expect(backTarget('title')).toBeNull()
  })
})
