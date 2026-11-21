/**
 * The game loop's screens as a pure state machine: tiles → level → results → retry or tiles, and the
 * pause menu that reaches the settings screen. DOM-free and canvas-free, so the navigation rules are
 * unit tests and the shell and the renderer only apply what this decides.
 *
 * `GameScreen` rather than `Screen`: the DOM already owns that name.
 *
 * `tiles` is the level-select screen that replaced the old title: one row per catalogue level, so the
 * first screen is the game's shop window rather than a START button that always begins 1-1.
 */

export type GameScreen = 'tiles' | 'level' | 'pause' | 'settings' | 'results'

/** What a menu row does. `music` and `effects` are the settings screen's volume sliders. */
export type MenuId =
  | 'level'
  | 'controls'
  | 'resume'
  | 'restart'
  | 'settings'
  | 'music'
  | 'effects'
  | 'back'
  | 'retry'
  | 'menu'

export interface MenuItem {
  readonly id: MenuId
  /** The label the pixel font draws. Uppercase: the font has no lowercase. */
  readonly label: string
  /** The level a tile row starts. Absent on every non-tile row. */
  readonly level?: string
}

/**
 * The rows each menu screen shows, in drawing order. The tile view's rows are the catalogue itself
 * (see `menuFor`'s `tiles` argument), so its static entry is empty — it exists so the screen is part
 * of this model rather than a special case beside it.
 */
export const MENUS: Readonly<Record<Exclude<GameScreen, 'level'>, readonly MenuItem[]>> = {
  tiles: [],
  pause: [
    { id: 'resume', label: 'RESUME' },
    { id: 'restart', label: 'RESTART' },
    { id: 'settings', label: 'SETTINGS' },
    { id: 'menu', label: 'QUIT' },
  ],
  settings: [
    { id: 'music', label: 'MUSIC' },
    { id: 'effects', label: 'EFFECTS' },
    { id: 'controls', label: 'CONTROLS' },
    { id: 'back', label: 'BACK' },
  ],
  results: [
    { id: 'retry', label: 'RETRY' },
    { id: 'menu', label: 'MENU' },
  ],
}

const NO_ITEMS: readonly MenuItem[] = []

/**
 * The rows a screen shows. `tiles` returns the catalogue's rows, supplied by the shell; every other
 * screen reads its static `MENUS` entry.
 */
export function menuFor(screen: GameScreen, tiles: readonly MenuItem[] = []): readonly MenuItem[] {
  if (screen === 'level') return NO_ITEMS
  if (screen === 'tiles') return tiles
  return MENUS[screen]
}

/** A selection that wraps at both ends, so a short list never dead-ends. */
export function moveSelection(count: number, index: number, dir: -1 | 1): number {
  if (count <= 0) return 0
  return (((index + dir) % count) + count) % count
}

/** True when the row is one of the settings screen's volume sliders. */
export function isVolumeRow(item: MenuItem | undefined): boolean {
  return item?.id === 'music' || item?.id === 'effects'
}

/** What confirming a row does. */
export interface Activation {
  /** The screen after the press. */
  readonly screen: GameScreen
  /** True when the level must start again from the top. */
  readonly restart: boolean
  /** True when the press opens the controls card instead of changing the screen. */
  readonly controls: boolean
}

/**
 * Confirm the selected row. `controls` opens the DOM card over whatever screen is up, so the screen
 * itself does not change — that is what lets the pause menu keep its own "H / LB: CONTROLS" line and
 * the settings screen offer the card as a row.
 *
 * A tile row's level is carried by its `MenuItem.level`, not by this switch: `activate` says "start a
 * level", and the shell resolves which one from the selected row.
 */
export function activate(screen: GameScreen, id: MenuId): Activation {
  switch (id) {
    case 'level':
    case 'restart':
    case 'retry':
      return { screen: 'level', restart: true, controls: false }
    case 'resume':
      return { screen: 'level', restart: false, controls: false }
    case 'settings':
      return { screen: 'settings', restart: false, controls: false }
    case 'back':
      return { screen: 'pause', restart: false, controls: false }
    case 'menu':
      return { screen: 'tiles', restart: true, controls: false }
    case 'controls':
      return { screen, restart: false, controls: true }
    case 'music':
    case 'effects':
      return { screen, restart: false, controls: false }
  }
}

/**
 * Where the back key (Esc / pad B) goes from each screen. Null means it does nothing there — the
 * tile view is the root, so it has nowhere to go back to.
 */
export function backTarget(screen: GameScreen): GameScreen | null {
  switch (screen) {
    case 'level':
      return 'pause'
    case 'pause':
      return 'level'
    case 'settings':
      return 'pause'
    case 'results':
      return 'tiles'
    case 'tiles':
      return null
  }
}
