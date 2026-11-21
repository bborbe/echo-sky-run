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
  type MenuItem,
} from './screens.ts'

const SCREENS: GameScreen[] = ['tiles', 'level', 'pause', 'settings', 'results']

/** Two catalogue rows, the shape the shell hands the tile view. */
const TILES: readonly MenuItem[] = [
  { id: 'level', label: '1-1', level: '1-1' },
  { id: 'level', label: '1-2', level: '1-2' },
]

describe('the screens', () => {
  it('gives the level no menu: the game is playing', () => {
    expect(menuFor('level')).toEqual([])
  })

  it('lists each static menu screen its rows in drawing order', () => {
    expect(menuFor('pause').map((i) => i.label)).toEqual(['RESUME', 'RESTART', 'SETTINGS', 'QUIT'])
    expect(menuFor('settings').map((i) => i.label)).toEqual(['MUSIC', 'EFFECTS', 'CONTROLS', 'BACK'])
    expect(menuFor('results').map((i) => i.label)).toEqual(['RETRY', 'MENU'])
  })

  it('draws the tile view from the catalogue it is handed, and is empty without one', () => {
    expect(menuFor('tiles', TILES).map((i) => i.label)).toEqual(['1-1', '1-2'])
    expect(menuFor('tiles')).toEqual([])
  })

  it('draws every label with the pixel font', () => {
    for (const screen of SCREENS) {
      for (const item of menuFor(screen, TILES)) {
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
  it('starts a fresh run from a tile, from restart and from retry', () => {
    expect(activate('tiles', 'level')).toEqual({ screen: 'level', restart: true, controls: false })
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

  it('returns to the tile view from the results and from a quit, starting clean', () => {
    expect(activate('results', 'menu')).toEqual({ screen: 'tiles', restart: true, controls: false })
    expect(activate('pause', 'menu')).toEqual({ screen: 'tiles', restart: true, controls: false })
  })

  it('opens the controls card without leaving the screen it was confirmed on', () => {
    expect(activate('tiles', 'controls')).toEqual({ screen: 'tiles', restart: false, controls: true })
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

  it('leaves the results for the tile view, and has nowhere to go from the tile view', () => {
    expect(backTarget('results')).toBe('tiles')
    expect(backTarget('tiles')).toBeNull()
  })
})
