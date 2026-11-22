import { describe, expect, it } from 'vitest'
import { missingGlyphs } from '../render/art/font.ts'
import {
  activate,
  backTarget,
  canActivate,
  isVolumeRow,
  menuFor,
  MENUS,
  moveFocus,
  moveSelection,
  rowOfIndex,
  scrollToRow,
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

describe('locked tiles', () => {
  const LOCKED: MenuItem = { id: 'level', label: '1-2', level: '1-2', locked: true }
  const OPEN: MenuItem = { id: 'level', label: '1-1', level: '1-1' }

  it('refuses to start a locked tile', () => {
    expect(canActivate(LOCKED)).toBe(false)
  })

  it('starts an unlocked tile, and every non-tile row is unaffected', () => {
    expect(canActivate(OPEN)).toBe(true)
    expect(canActivate(MENUS.pause[0])).toBe(true)
    expect(canActivate(undefined)).toBe(false)
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

describe('tile focus', () => {
  // Two sets of three tiles — the shape a multi-set catalogue hands the tile view.
  const GRID = [3, 3]

  it('walks tiles left and right in reading order, wrapping at both ends', () => {
    expect(moveFocus(GRID, 0, 'left')).toBe(5)
    expect(moveFocus(GRID, 5, 'right')).toBe(0)
    expect(moveFocus(GRID, 1, 'right')).toBe(2)
  })

  it('crosses into the next set at the edge of a row', () => {
    expect(moveFocus(GRID, 2, 'right')).toBe(3) // last of set 1 → first of set 2
    expect(moveFocus(GRID, 3, 'left')).toBe(2) // first of set 2 → last of set 1
  })

  it('moves up and down between rows, keeping the column', () => {
    expect(moveFocus(GRID, 1, 'down')).toBe(4)
    expect(moveFocus(GRID, 4, 'up')).toBe(1)
  })

  it('wraps up from the first row and down from the last', () => {
    expect(moveFocus(GRID, 0, 'up')).toBe(3)
    expect(moveFocus(GRID, 5, 'down')).toBe(2)
  })

  it('clamps the column to a shorter target row', () => {
    // Set 1 has three tiles, set 2 one: up from the third tile lands on set 2's only tile.
    expect(moveFocus([3, 1], 2, 'up')).toBe(3)
  })

  it('stays put on a single row or a single tile', () => {
    expect(moveFocus([1], 0, 'left')).toBe(0)
    expect(moveFocus([1], 0, 'down')).toBe(0)
    expect(moveFocus([], 0, 'right')).toBe(0)
  })

  it('reports the row a flat index sits in', () => {
    expect(rowOfIndex([3, 3], 0)).toBe(0)
    expect(rowOfIndex([3, 3], 2)).toBe(0)
    expect(rowOfIndex([3, 3], 3)).toBe(1)
    expect(rowOfIndex([], 0)).toBe(0)
  })
})

describe('tile scroll', () => {
  const ROWS = [34, 34, 34, 34, 34]

  it('does not scroll when the content fits the viewport', () => {
    expect(scrollToRow(ROWS, 4, 200)).toBe(0)
  })

  it('scrolls a focused row into view from below', () => {
    // Row 3 spans 102..136; a 100 px window from the top shows 0..100, so it scrolls to 36.
    expect(scrollToRow(ROWS, 3, 100)).toBe(36)
  })

  it('keeps an already-visible row where it is', () => {
    expect(scrollToRow(ROWS, 3, 100, 36)).toBe(36)
  })

  it('clamps at the end of the content', () => {
    expect(scrollToRow(ROWS, 4, 100, 36)).toBe(70) // 170 content − 100 viewport
  })

  it('does nothing on an empty grid or a zero viewport', () => {
    expect(scrollToRow([], 0, 100)).toBe(0)
    expect(scrollToRow(ROWS, 0, 0)).toBe(0)
  })
})
