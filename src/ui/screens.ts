/**
 * The game loop's screens as a pure state machine: title → level → results → retry or title, and the
 * pause menu that reaches the settings screen. DOM-free and canvas-free, so the navigation rules are
 * unit tests and the shell and the renderer only apply what this decides.
 *
 * `GameScreen` rather than `Screen`: the DOM already owns that name.
 */

export type GameScreen = 'title' | 'level' | 'pause' | 'settings' | 'results'

/** What a menu row does. `music` and `effects` are the settings screen's volume sliders. */
export type MenuId =
  | 'start'
  | 'controls'
  | 'resume'
  | 'restart'
  | 'settings'
  | 'music'
  | 'effects'
  | 'back'
  | 'retry'
  | 'title'

export interface MenuItem {
  readonly id: MenuId
  /** The label the pixel font draws. Uppercase: the font has no lowercase. */
  readonly label: string
}

/** The rows each menu screen shows, in drawing order. */
export const MENUS: Readonly<Record<Exclude<GameScreen, 'level'>, readonly MenuItem[]>> = {
  title: [
    { id: 'start', label: 'START' },
    { id: 'controls', label: 'CONTROLS' },
  ],
  pause: [
    { id: 'resume', label: 'RESUME' },
    { id: 'restart', label: 'RESTART' },
    { id: 'settings', label: 'SETTINGS' },
  ],
  settings: [
    { id: 'music', label: 'MUSIC' },
    { id: 'effects', label: 'EFFECTS' },
    { id: 'controls', label: 'CONTROLS' },
    { id: 'back', label: 'BACK' },
  ],
  results: [
    { id: 'retry', label: 'RETRY' },
    { id: 'title', label: 'TITLE' },
  ],
}

const NO_ITEMS: readonly MenuItem[] = []

export function menuFor(screen: GameScreen): readonly MenuItem[] {
  return screen === 'level' ? NO_ITEMS : MENUS[screen]
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
 */
export function activate(screen: GameScreen, id: MenuId): Activation {
  switch (id) {
    case 'start':
    case 'restart':
    case 'retry':
      return { screen: 'level', restart: true, controls: false }
    case 'resume':
      return { screen: 'level', restart: false, controls: false }
    case 'settings':
      return { screen: 'settings', restart: false, controls: false }
    case 'back':
      return { screen: 'pause', restart: false, controls: false }
    case 'title':
      return { screen: 'title', restart: true, controls: false }
    case 'controls':
      return { screen, restart: false, controls: true }
    case 'music':
    case 'effects':
      return { screen, restart: false, controls: false }
  }
}

/**
 * Where the back key (Esc / pad B) goes from each screen. Null means it does nothing there — the
 * title has nowhere to go back to.
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
      return 'title'
    case 'title':
      return null
  }
}
