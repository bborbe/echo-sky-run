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
  /**
   * True when the tile is locked: the tile view draws it dimmed and confirming it starts nothing.
   * A locked tile stays focusable, so its still preview still shows.
   */
  readonly locked?: boolean
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

/**
 * True when confirming the row may act. Every row can, except a locked tile: the tile view keeps it
 * focusable so its preview still shows, but confirming it must neither start the level nor leave the
 * screen.
 */
export function canActivate(item: MenuItem | undefined): boolean {
  return item !== undefined && item.locked !== true
}

/** A direction the tile view's focus moves in. */
export type FocusDirection = 'up' | 'down' | 'left' | 'right'

/** The first flat index of `row`, from the per-row counts. */
function rowStart(rows: readonly number[], row: number): number {
  let start = 0
  for (let r = 0; r < row; r++) start += rows[r]
  return start
}

/**
 * The row (set) a flat tile index sits in, given how many tiles each row holds. Returns 0 for an
 * empty grid or an index past the end, so a caller never reads a missing row.
 */
export function rowOfIndex(rows: readonly number[], index: number): number {
  let start = 0
  for (let r = 0; r < rows.length; r++) {
    start += rows[r]
    if (index < start) return r
  }
  return 0
}

/**
 * Move the tile view's focus one step in `dir` across a grid with one row per set.
 *
 * The model is the flat `selected` index the game already uses, extended to two dimensions:
 *  - left / right walk the tiles in reading order and wrap at the catalogue's ends — left at the
 *    very first tile lands on the last, right at the last lands on the first. That is what carries
 *    focus from one set into the next at a row's edge.
 *  - up / down move between rows (sets), keeping the column where the target row is long enough and
 *    clamping to its last tile where it is not, wrapping from the first row to the last and back.
 * A single row or a single tile stays put, which is the shape the one-level catalogue has today.
 */
export function moveFocus(rows: readonly number[], index: number, dir: FocusDirection): number {
  const total = rows.reduce((sum, n) => sum + n, 0)
  if (total <= 0) return 0
  const from = index < 0 || index >= total ? 0 : index
  if (dir === 'left') return (from - 1 + total) % total
  if (dir === 'right') return (from + 1) % total
  const row = rowOfIndex(rows, from)
  const col = from - rowStart(rows, row)
  const target = dir === 'up' ? (row - 1 + rows.length) % rows.length : (row + 1) % rows.length
  const targetCol = Math.min(col, Math.max(0, rows[target] - 1))
  return rowStart(rows, target) + targetCol
}

/**
 * The vertical scroll offset (pixels) that keeps row `index` inside a `viewport` tall window.
 * `rows` are the row heights in drawing order, not tile counts; `current` is the offset already
 * applied, so a row already in view does not make the panel jump. The offset stays between 0 and the
 * point where the content's end meets the viewport's bottom.
 */
export function scrollToRow(rows: readonly number[], index: number, viewport: number, current = 0): number {
  const total = rows.reduce((sum, n) => sum + n, 0)
  if (rows.length === 0 || viewport <= 0 || total <= viewport) return 0
  const row = Math.max(0, Math.min(index, rows.length - 1))
  const top = rowStart(rows, row)
  const bottom = top + rows[row]
  const max = total - viewport
  let offset = Math.max(0, Math.min(current, max))
  if (top < offset) offset = top
  else if (bottom > offset + viewport) offset = bottom - viewport
  return Math.max(0, Math.min(offset, max))
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
