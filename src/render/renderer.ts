import { FONT, GLYPH_GAP, GLYPH_H, GLYPH_W, OVERLAY_TEXT, textWidth } from './art/font.ts'
import { INK, SKY, type InkName } from './art/palette.ts'
import { paint } from './atlas.ts'
import { Background } from './background.ts'
import { Camera, logicalViewWidth, VIEW_H } from './camera.ts'
import { TILE } from '../physics/constants.ts'
import { focusedLevelId, PreviewCache } from './preview.ts'
import { WorldPainter, type WorldState } from './world.ts'
import { isVolumeRow, rowOfIndex, scrollToRow, type GameScreen, type MenuItem } from '../ui/screens.ts'

/**
 * The logical view height is fixed at 14 tiles. The scale is `window height / VIEW_H` and may be
 * fractional; the logical width follows from the window's aspect, so a wider window shows more of
 * the level rather than bigger pixels. Nothing is letterboxed.
 */
export { VIEW_H }

/**
 * The colours the browser check looks for on the canvases. Exported so the check asserts these
 * instead of repeating literals — a colour tweak then cannot fail the check for the wrong reason.
 * `sky` is on the painted `#sky` canvas; the rest are on the pixel `#game` canvas.
 */
export const PALETTE = {
  sky: SKY.top,
  ground: INK.earth,
  groundTop: INK.grass,
  pip: INK.fur,
  echoFill: INK.echo,
  echoOutline: INK.echoEdge,
} as const

/** Every colour the painted background uses — the Echo's dark edge must read against each one. */
export const BACKGROUND_COLOURS: readonly string[] = Object.values(SKY)

/** What the renderer draws: the world, plus the shell's menu and run numbers. */
export interface RenderState extends WorldState {
  /** The player paused, or the tab is hidden. */
  readonly paused: boolean
  readonly runSeconds: number
  /** The best time from localStorage, or null before the first finish. */
  readonly bestSeconds: number | null
  /** The menu screen that is up, or null while the game plays. */
  readonly menu?: MenuView | null
}

/** One set's tiles, for the tile view's headings. */
export interface MenuGroupView {
  readonly set: string
  readonly items: readonly MenuItem[]
}

/** What a menu screen shows: its rows, which one is selected, and the numbers it needs. */
export interface MenuView {
  readonly screen: Exclude<GameScreen, 'level'>
  readonly items: readonly MenuItem[]
  readonly index: number
  /** The settings screen's two sliders, 0..1. */
  readonly music: number
  readonly effects: number
  /** The results screen's run time, and the best time or null before the first finish. */
  readonly runSeconds: number
  readonly bestSeconds: number | null
  /** The tile view's sets, in drawing order. Absent on every other screen. */
  readonly groups?: readonly MenuGroupView[]
}

/** Each screen's heading and its one footer line. */
const MENU_HEADING: Readonly<Record<Exclude<GameScreen, 'level'>, string>> = {
  tiles: OVERLAY_TEXT.gameTitle,
  pause: OVERLAY_TEXT.paused,
  settings: OVERLAY_TEXT.settings,
  results: OVERLAY_TEXT.clear,
}

const MENU_HINT: Readonly<Record<Exclude<GameScreen, 'level'>, string>> = {
  tiles: OVERLAY_TEXT.selectHint,
  pause: OVERLAY_TEXT.pausedControls,
  settings: OVERLAY_TEXT.settingsHint,
  results: OVERLAY_TEXT.selectHint,
}

/** Rows are this far apart, so a menu never crowds and the panel height is arithmetic. */
const ROW_H = 12
const PANEL_PAD_TOP = 9
const PANEL_PAD_BOTTOM = 9

/** The tile view's tile boxes. A box is a label with a brass rim; the focused one has a bright rim. */
const TILE_W = 34
const TILE_H = 20
const TILE_GAP = 6
const TILE_ROW_H = TILE_H + 4
const SET_HEADING_H = 10

/** Segments in a volume bar, one per slider step. */
const BAR_SEGMENTS = 10
const SEGMENT_W = 4
const SEGMENT_H = 5

export class Renderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly background: Background
  private viewW = VIEW_H
  /** Scroll offset, in its own pure module so the framing is a unit test. */
  private readonly camera = new Camera()
  /** The world painter, and the still previews that share its baked art. */
  private readonly world = new WorldPainter()
  private readonly previews = new PreviewCache(this.world)
  /** What the tile view is previewing: its level and whether a still is cached. */
  private lastPreview: { level: string | null; ready: boolean } = { level: null, ready: false }
  /** Font glyphs baked per ink, on first use. */
  private readonly glyphs = new Map<InkName, Map<string, HTMLCanvasElement>>()

  constructor(canvas: HTMLCanvasElement, sky: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.canvas = canvas
    this.ctx = ctx
    this.background = new Background(sky)
    this.fit()
  }

  /** Current logical view width in pixels. */
  get width(): number {
    return this.viewW
  }

  /** Opaque pixels per parallax layer above and below the haze line — the browser check's layer probe. */
  layerCoverage(): { name: string; above: number; below: number }[] {
    return this.background.layerCoverage()
  }

  /** The camera's scroll, for the browser check's flicker probe. */
  get cameraX(): number {
    return Math.round(this.camera.x)
  }

  /**
   * Size the canvases to the window. The pixel canvas's backing store is `viewW x 224` logical
   * pixels, stretched over the whole window and drawn nearest-neighbour, so there are never bars.
   */
  fit(): void {
    const viewW = logicalViewWidth(window.innerWidth, window.innerHeight)

    this.viewW = viewW
    this.camera.setViewWidth(viewW)
    this.canvas.width = viewW
    this.canvas.height = VIEW_H
    this.canvas.style.width = `${window.innerWidth}px`
    this.canvas.style.height = `${window.innerHeight}px`
    // `imageSmoothingEnabled` governs drawImage inside the canvas; the browser's upscale of the
    // element is a separate filter, and `auto` would bilinearly blur every pixel.
    this.canvas.style.imageRendering = 'pixelated'
    this.ctx.imageSmoothingEnabled = false
    this.background.fit(viewW, window.innerWidth, window.innerHeight)
  }

  draw(state: RenderState): void {
    // The tile view shows a rendered still of its focused level, not the last run's frozen world.
    if (state.menu?.screen === 'tiles' && this.drawTilePreview(state.menu)) return

    const juice = state.juice
    // Draw between the last two fixed steps, so a display faster than 60 Hz does not judder.
    const px = state.prevX + (state.player.x - state.prevX) * state.alpha
    const py = state.prevY + (state.player.y - state.prevY) * state.alpha

    // The death pop plays where Pip fell: the camera waits for it rather than jumping to the respawn.
    if (!juice.dying()) {
      this.camera.update(px, py, state.player.h, state.map.cols * TILE, state.map.rows * TILE)
    }
    const shake = juice.shakeOffset()
    const camX = Math.round(this.camera.x) - shake.x
    const camY = Math.round(this.camera.y) - shake.y

    this.background.draw(camX, camY, juice.dying() ? [] : state.echoes)
    this.world.draw(this.ctx, this.viewW, camX, camY, state)

    this.overlayBox = null
    this.overlayLines.length = 0
    if (state.menu) this.drawMenu(state.menu)
  }

  /**
   * Draw the focused tile's still behind the tile view. Returns false when there is no frame to
   * show (no focused level, or no canvas context), so the live world draws behind the panel
   * instead. The still is cached per level, so a focus move is a blit; a level never seen before is
   * rendered here, in the same frame, so there is no gap or flash of the previous level.
   */
  private drawTilePreview(view: MenuView): boolean {
    const levelId = focusedLevelId(view)
    const frame = levelId === null ? null : this.previews.frameFor(levelId, this.viewW)
    this.lastPreview = { level: levelId, ready: frame !== null }
    if (frame === null) return false
    // The parallax follows the preview's own camera, so the sky behind the still lines up with it.
    this.background.draw(frame.cameraX, frame.cameraY, [])
    this.ctx.clearRect(0, 0, this.viewW, VIEW_H)
    this.ctx.drawImage(frame.canvas, 0, 0)
    this.overlayBox = null
    this.overlayLines.length = 0
    this.drawMenu(view)
    return true
  }

  /** What the tile view is previewing — for the browser check. */
  previewInfo(): { level: string | null; ready: boolean } {
    return this.lastPreview
  }

  /** One line of pixel text, its top-left on whole pixels, every glyph pixel a palette ink. */
  private text(line: string, x: number, y: number, ink: InkName): void {
    let cache = this.glyphs.get(ink)
    if (!cache) {
      cache = new Map()
      this.glyphs.set(ink, cache)
    }
    let gx = Math.round(x)
    const gy = Math.round(y)
    for (const ch of line) {
      let img = cache.get(ch)
      if (!img) {
        const glyph = FONT[ch] ?? FONT[' ']
        img = paint(glyph, { '#': ink })
        cache.set(ch, img)
      }
      this.ctx.drawImage(img, gx, gy)
      gx += GLYPH_W + GLYPH_GAP
    }
  }

  /** A line of pixel text centred on `cx`. */
  private centred(line: string, cx: number, y: number, ink: InkName): void {
    this.overlayLines.push(line)
    this.text(line, Math.round(cx - textWidth(line) / 2), y, ink)
  }

  /** An opaque panel with a brass rim — text on it sits on one known colour, never on the world. */
  private panel(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx
    ctx.fillStyle = INK.brass
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = INK.panel
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2)
  }

  /** The overlay panel's box, for the browser check's text probe. Null when no overlay is up. */
  overlayBox: { x: number; y: number; w: number; h: number } | null = null
  /** The tile view's vertical scroll, kept between frames so a focused row already in view does not jump. */
  private tileScroll = 0
  /** The lines the overlay drew this frame, for the browser check. */
  readonly overlayLines: string[] = []

  /**
   * One panel per screen: the title, the pause menu, the settings sliders and the level-clear tally.
   * Every screen draws the same brass-rimmed panel in the same pixel font, so the loop reads as one
   * game rather than four overlays — play gate 1 found the old system-font text soft, and a screen
   * that looked different from the tally would read as a different product.
   *
   * The panel is sized from its own widest line and centred, which is also what keeps it clear of the
   * debug overlay's strip along the top edge.
   */
  private drawMenu(view: MenuView): void {
    if (view.screen === 'tiles') {
      this.drawTiles(view)
      return
    }
    const heading = MENU_HEADING[view.screen]
    const hint = MENU_HINT[view.screen]
    const subtitle: string | null = null
    const stats = view.screen === 'results'
    const sliders = view.screen === 'settings'

    let contentW = Math.max(textWidth(heading), textWidth(hint))
    if (subtitle !== null) contentW = Math.max(contentW, textWidth(subtitle))
    for (const item of view.items) {
      contentW = Math.max(
        contentW,
        sliders && isVolumeRow(item) ? this.volumeRowWidth() : this.menuRowWidth(item.label),
      )
    }
    if (stats) {
      contentW = Math.max(
        contentW,
        textWidth(`${OVERLAY_TEXT.time} ${formatTime(view.runSeconds)}`),
        textWidth(this.bestLine(view.bestSeconds)),
      )
    }

    const w = Math.min(this.viewW - 16, contentW + 24)
    const h =
      PANEL_PAD_TOP +
      10 +
      (subtitle === null ? 0 : 10) +
      (stats ? 20 : 0) +
      4 +
      view.items.length * ROW_H +
      8 +
      7 +
      PANEL_PAD_BOTTOM
    const x = Math.round((this.viewW - w) / 2)
    const y = Math.round((VIEW_H - h) / 2)
    this.panel(x, y, w, h)
    this.overlayBox = { x, y, w, h }
    const cx = x + w / 2

    let cy = y + PANEL_PAD_TOP
    this.centred(heading, cx, cy, 'brassLight')
    cy += 10
    if (subtitle !== null) {
      this.centred(subtitle, cx, cy, 'echo')
      cy += 10
    }
    if (stats) {
      this.centred(`${OVERLAY_TEXT.time} ${formatTime(view.runSeconds)}`, cx, cy, 'cream')
      cy += 10
      this.centred(this.bestLine(view.bestSeconds), cx, cy, 'cream')
      cy += 10
    }
    cy += 4
    for (let i = 0; i < view.items.length; i++) {
      const item = view.items[i]
      const selected = i === view.index
      if (sliders && isVolumeRow(item)) {
        this.volumeRow(item.label, item.id === 'music' ? view.music : view.effects, selected, cx, cy)
      } else {
        this.menuRow(item.label, selected, cx, cy)
      }
      cy += ROW_H
    }
    cy += 8
    this.centred(hint, cx, cy, 'echo')
  }

  /**
   * The level-select tile view: one box per catalogue level, grouped under its set heading. The
   * focused box carries a bright rim, so the selection reads the way Driftline's `menu-focus` does.
   * A catalogue taller than the panel scrolls so the focused row is never off-screen; the scroll is
   * kept between frames, so a row already in view does not make the panel jump.
   */
  private drawTiles(view: MenuView): void {
    const groups = view.groups ?? []
    const heading = MENU_HEADING.tiles
    const hint = MENU_HINT.tiles
    let rowW = 0
    for (const group of groups) {
      rowW = Math.max(rowW, group.items.length * TILE_W + Math.max(0, group.items.length - 1) * TILE_GAP)
    }
    const contentW = Math.max(textWidth(heading), textWidth(hint), rowW)
    const w = Math.min(this.viewW - 16, contentW + 24)

    const rowHeights = groups.map(() => SET_HEADING_H + TILE_ROW_H)
    const naturalH =
      PANEL_PAD_TOP + 10 + 4 + rowHeights.reduce((sum, n) => sum + n, 0) + 8 + 7 + PANEL_PAD_BOTTOM
    const h = Math.min(VIEW_H - 16, naturalH)
    const x = Math.round((this.viewW - w) / 2)
    const y = Math.round((VIEW_H - h) / 2)
    this.panel(x, y, w, h)
    this.overlayBox = { x, y, w, h }
    const cx = x + w / 2

    this.centred(heading, cx, y + PANEL_PAD_TOP, 'brassLight')

    // The rows scroll between the heading and the footer hint. The clip keeps a tall catalogue from
    // spilling past the panel while `scrollToRow` keeps the focused row in view.
    const rowsTop = y + PANEL_PAD_TOP + 10 + 4
    const hintY = y + h - PANEL_PAD_BOTTOM - 7
    const viewport = Math.max(0, hintY - 8 - rowsTop)
    const focusedRow = rowOfIndex(
      groups.map((group) => group.items.length),
      view.index,
    )
    const offset = scrollToRow(rowHeights, focusedRow, viewport, this.tileScroll)
    this.tileScroll = offset

    const ctx = this.ctx
    ctx.save()
    ctx.beginPath()
    ctx.rect(x + 1, rowsTop, w - 2, viewport)
    ctx.clip()
    let cy = rowsTop - offset
    let index = 0
    for (const group of groups) {
      this.centred(group.set, cx, cy, 'echo')
      const rowWidth = group.items.length * TILE_W + Math.max(0, group.items.length - 1) * TILE_GAP
      let tx = Math.round(cx - rowWidth / 2)
      for (const item of group.items) {
        this.tile(item.label, index === view.index, tx, cy + SET_HEADING_H)
        index += 1
        tx += TILE_W + TILE_GAP
      }
      cy += SET_HEADING_H + TILE_ROW_H
    }
    ctx.restore()

    this.centred(hint, cx, hintY, 'echo')
  }

  /** One tile: a brass rim around the panel, brighter on the focused tile, with its label centred. */
  private tile(label: string, selected: boolean, x: number, y: number): void {
    const ctx = this.ctx
    ctx.fillStyle = selected ? INK.brassLight : INK.brass
    ctx.fillRect(x, y, TILE_W, TILE_H)
    ctx.fillStyle = INK.panel
    ctx.fillRect(x + 1, y + 1, TILE_W - 2, TILE_H - 2)
    const lx = Math.round(x + (TILE_W - textWidth(label)) / 2)
    const ly = Math.round(y + (TILE_H - GLYPH_H) / 2)
    this.text(label, lx, ly, selected ? 'brassLight' : 'cream')
    this.overlayLines.push(label)
  }

  private bestLine(bestSeconds: number | null): string {
    return bestSeconds === null ? OVERLAY_TEXT.noBest : `${OVERLAY_TEXT.best} ${formatTime(bestSeconds)}`
  }

  private menuRowWidth(label: string): number {
    return textWidth('>') + 4 + textWidth(label)
  }

  /**
   * One plain row: a marker on the selected row, then the label. The drawn line is recorded, so the
   * browser check reads the menu exactly as it is on screen.
   */
  private menuRow(label: string, selected: boolean, cx: number, y: number): void {
    let gx = Math.round(cx - this.menuRowWidth(label) / 2)
    if (selected) this.text('>', gx, y, 'brassLight')
    gx += textWidth('>') + 4
    this.text(label, gx, y, selected ? 'brassLight' : 'cream')
    this.overlayLines.push(label)
  }

  private volumeRowWidth(): number {
    const labelW = textWidth(OVERLAY_TEXT.effects)
    const barW = BAR_SEGMENTS * (SEGMENT_W + 1) - 1
    return textWidth('>') + 4 + labelW + 6 + barW + 6 + textWidth('100')
  }

  /**
   * One slider: a marker on the selected row, the label, a 10-segment bar and the level as a number.
   * The drawn line is recorded as `MUSIC 50` so the browser check reads exactly what is on screen.
   */
  private volumeRow(label: string, level: number, selected: boolean, cx: number, y: number): void {
    const labelW = textWidth(OVERLAY_TEXT.effects)
    const barW = BAR_SEGMENTS * (SEGMENT_W + 1) - 1
    const number = String(Math.round(level * 100))
    let gx = Math.round(cx - this.volumeRowWidth() / 2)
    if (selected) this.text('>', gx, y, 'brassLight')
    gx += textWidth('>') + 4
    this.text(label, gx, y, selected ? 'brassLight' : 'cream')
    gx += labelW + 6
    const lit = Math.round(level * BAR_SEGMENTS)
    for (let i = 0; i < BAR_SEGMENTS; i++) {
      this.ctx.fillStyle = i < lit ? INK.brassLight : INK.brass
      const segH = i < lit ? SEGMENT_H : 1
      this.ctx.fillRect(gx + i * (SEGMENT_W + 1), y + 1 + SEGMENT_H - segH, SEGMENT_W, segH)
    }
    gx += barW + 6
    this.text(number, gx, y, 'cream')
    this.overlayLines.push(`${label} ${number}`)
  }
}

/** A run time as `M:SS.t` — the shape the spec's HUD shows. Integer maths throughout, because a
 *  float remainder truncates: 5.1 seconds renders `0:05.0` if you take `(rest - whole) * 10`. */
export function formatTime(seconds: number): string {
  const tenths = Math.floor(seconds * 10)
  const minutes = Math.floor(tenths / 600)
  const whole = Math.floor((tenths % 600) / 10)
  const tenth = tenths % 10
  return `${minutes}:${String(whole).padStart(2, '0')}.${tenth}`
}
