import { FONT, GLYPH_GAP, GLYPH_H, GLYPH_W, OVERLAY_TEXT, textWidth } from './art/font.ts'
import { INK, SKY, type InkName } from './art/palette.ts'
import { paint } from './atlas.ts'
import { Background } from './background.ts'
import { Camera, CAMERA_LEAD_X, logicalViewWidth, VIEW_H } from './camera.ts'
import { TILE } from '../physics/constants.ts'
import { focusedLevelId, PreviewCache } from './preview.ts'
import { WorldPainter, type WorldState } from './world.ts'
import { isVolumeRow, rowOfIndex, scrollToRow, type GameScreen, type MenuItem } from '../ui/screens.ts'
import { layoutMap, MAP_DISC_H, type MapCounts, type MapNode, type MapNodeBox } from '../levels/map.ts'

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
  /**
   * The medal the clear earned, or null when the level has a medal table and the run missed bronze.
   * Undefined when the level has no medal table at all — then no medal line is drawn.
   */
  readonly medal?: string | null
  /** The results screen's per-section splits, in play order. Empty when the level has no sections. */
  readonly sections?: readonly SectionLine[]
  /** The tile view's sets, in drawing order. Absent on every other screen. */
  readonly groups?: readonly MenuGroupView[]
  /**
   * The overworld map, when the tile screen is showing the map (`?map=1`) rather than the catalogue
   * grid. The nodes come from the save, so an unlock or a new best time shows on the next frame.
   */
  readonly map?: {
    readonly nodes: readonly MapNode[]
    readonly counts: MapCounts
  }
}

/** One section of a run on the results screen: its time and its delta against the stored best. */
export interface SectionLine {
  /** `S1` … `S4`, the section's position in play order. */
  readonly label: string
  /** The section's duration in seconds. */
  readonly seconds: number
  /** Seconds lost (+) or gained (−) against the best, or null before a best exists. */
  readonly delta: number | null
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

/** The tile view's tile boxes: a wide crop of the level's hero spot over its label. */
const TILE_W = 44
const TILE_H = 26
const TILE_GAP = 6
const TILE_ROW_H = TILE_H + 4
const SET_HEADING_H = 10
/** The thumbnail's box inside a tile's rim, and the label line beneath it. */
const THUMB_X = 2
const THUMB_Y = 2
const THUMB_W = TILE_W - 4
const THUMB_H = 15
/** The label's top edge: one pixel under the thumbnail, two above the rim. */
const LABEL_Y = THUMB_Y + THUMB_H
/** How far a locked tile's thumbnail fades into the panel: darker, so the tile reads unstartable. */
const LOCKED_THUMB_ALPHA = 0.45

/** One tile as drawn this frame — the browser check reads the thumbnail's own pixels from it. */
export interface TileRect {
  readonly level: string
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  /** The thumbnail's box inside the tile, or null when no still could be drawn for that level. */
  readonly thumb: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null
  readonly locked: boolean
}

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
  private readonly camera: Camera
  /** The world painter, and the still previews that share its baked art. */
  private readonly world = new WorldPainter()
  private readonly previews = new PreviewCache(this.world)
  /** What the tile view is previewing: its level and whether a still is cached. */
  private lastPreview: { level: string | null; ready: boolean } = { level: null, ready: false }
  /** Font glyphs baked per ink, on first use. */
  private readonly glyphs = new Map<InkName, Map<string, HTMLCanvasElement>>()

  constructor(canvas: HTMLCanvasElement, sky: HTMLCanvasElement, leadPx: number = CAMERA_LEAD_X) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.canvas = canvas
    this.ctx = ctx
    this.camera = new Camera(leadPx)
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

  /** The camera's vertical scroll, for the browser check's flicker probe. */
  get cameraY(): number {
    return Math.round(this.camera.y)
  }

  /** The camera the last frame was actually drawn at — the flicker probe's race-free reference. */
  private lastCam = { x: 0, y: 0 }

  /** X the current canvas was drawn at, so the probe never pairs pixels with a newer camera. */
  get drawnCameraX(): number {
    return this.lastCam.x
  }

  /** Y the current canvas was drawn at. */
  get drawnCameraY(): number {
    return this.lastCam.y
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
      this.camera.update(px, py, state.player.h, state.map.cols * TILE, state.map.rows * TILE, state.player.vx)
    }
    const shake = juice.shakeOffset()
    const camX = Math.round(this.camera.x) - shake.x
    const camY = Math.round(this.camera.y) - shake.y
    this.lastCam = { x: camX, y: camY }

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
  /** The tiles drawn this frame, for the browser check's thumbnail probe. */
  readonly tileRects: TileRect[] = []

  /** The tile view's tiles as drawn last frame — the browser check reads each thumbnail's pixels. */
  tileBoxes(): readonly TileRect[] {
    return this.tileRects
  }

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
    this.tileRects.length = 0
    if (view.screen === 'tiles') {
      if (view.map) this.drawMap(view)
      else this.drawTiles(view)
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
    // The results screen's stat block: the time, the best, the medal and one line per section.
    const statLines = stats
      ? [
          `${OVERLAY_TEXT.time} ${formatTime(view.runSeconds)}`,
          this.bestLine(view.bestSeconds),
          ...(view.medal === undefined ? [] : [medalLine(view.medal)]),
          ...(view.sections ?? []).map(sectionLine),
        ]
      : []
    for (const line of statLines) contentW = Math.max(contentW, textWidth(line))

    const w = Math.min(this.viewW - 16, contentW + 24)
    const h =
      PANEL_PAD_TOP +
      10 +
      (subtitle === null ? 0 : 10) +
      statLines.length * 10 +
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
    // `centred` records each line as it draws it, so the browser check reads the medal and the
    // section deltas off the screen.
    for (const line of statLines) {
      this.centred(line, cx, cy, 'cream')
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
        this.tile(item, index === view.index, tx, cy + SET_HEADING_H)
        index += 1
        tx += TILE_W + TILE_GAP
      }
      cy += SET_HEADING_H + TILE_ROW_H
    }
    ctx.restore()

    this.centred(hint, cx, hintY, 'echo')
  }

  /**
   * One tile: a brass rim around a panel, the level's hero crop inside it, and the label beneath.
   *
   * The crop is the level's set piece, drawn through the same still renderer the background preview
   * uses — so a tile shows what the level is about rather than the patch of ground every level opens
   * on. It is drawn even when the tile is locked: a locked tile keeps its picture, faded into the
   * panel and rimmed in steel, so it reads as unstartable without becoming anonymous.
   *
   * A locked tile is drawn in the steel inks instead of the brass ones, so it reads as dimmed next to
   * an unlocked tile at a glance — a different hue as well as a darker one, so the distinction
   * survives a greyscale check. The focused locked tile keeps a lighter rim, so focus is still
   * visible while the tile is visibly unstartable.
   */
  private tile(item: MenuItem, selected: boolean, x: number, y: number): void {
    const ctx = this.ctx
    const locked = item.locked === true
    ctx.fillStyle = locked ? (selected ? INK.steelLight : INK.steel) : selected ? INK.brassLight : INK.brass
    ctx.fillRect(x, y, TILE_W, TILE_H)
    ctx.fillStyle = INK.panel
    ctx.fillRect(x + 1, y + 1, TILE_W - 2, TILE_H - 2)
    const thumb = item.level === undefined ? null : this.previews.thumbnailFor(item.level, this.viewW, THUMB_W, THUMB_H)
    if (thumb !== null) {
      const previous = ctx.globalAlpha
      if (locked) ctx.globalAlpha = LOCKED_THUMB_ALPHA
      // The still's sky is transparent — the live view shows the parallax behind it. A tile has no
      // parallax, so the crop gets a sky band behind it, fading to the level's horizon at the ground.
      const sky = ctx.createLinearGradient(0, y + THUMB_Y, 0, y + THUMB_Y + THUMB_H)
      sky.addColorStop(0, SKY.mid)
      sky.addColorStop(1, SKY.horizon)
      ctx.fillStyle = sky
      ctx.fillRect(x + THUMB_X, y + THUMB_Y, THUMB_W, THUMB_H)
      ctx.drawImage(thumb, x + THUMB_X, y + THUMB_Y)
      ctx.globalAlpha = previous
    }
    const lx = Math.round(x + (TILE_W - textWidth(item.label)) / 2)
    const ink = locked ? 'steelLight' : selected ? 'brassLight' : 'cream'
    this.text(item.label, lx, y + LABEL_Y, ink)
    this.overlayLines.push(item.label)
    this.tileRects.push({
      level: item.level ?? item.label,
      x,
      y,
      w: TILE_W,
      h: TILE_H,
      thumb:
        thumb === null
          ? null
          : { x: x + THUMB_X, y: y + THUMB_Y, w: THUMB_W, h: THUMB_H },
      locked,
    })
  }

  /**
   * The overworld map: World 1's nodes along the winding trail the operator picked (mockup B), joined
   * by a dashed path. A node's own line carries its Relic Coins and best time when it is playable and
   * the reason it is not when it is not, so a map that never read the save cannot look right.
   */
  private drawMap(view: MenuView): void {
    const map = view.map
    if (map === undefined) return
    const heading = OVERLAY_TEXT.world
    const hint = MENU_HINT.tiles
    const w = Math.min(this.viewW - 16, 240)
    const h = Math.min(VIEW_H - 16, 200)
    const x = Math.round((this.viewW - w) / 2)
    const y = Math.round((VIEW_H - h) / 2)
    this.panel(x, y, w, h)
    this.overlayBox = { x, y, w, h }
    const cx = x + w / 2

    this.centred(heading, cx, y + PANEL_PAD_TOP, 'brassLight')

    const rowsTop = y + PANEL_PAD_TOP + 12
    const hintY = y + h - PANEL_PAD_BOTTOM - 7
    const box = { x: x + 8, y: rowsTop, w: w - 16, h: Math.max(0, hintY - 8 - rowsTop) }
    const layout = layoutMap(map.nodes, map.counts, box)

    // The trail first, so every disc and every line of text sits over it.
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = INK.brass
    ctx.lineWidth = 1
    ctx.setLineDash([3, 2])
    for (const c of layout.connectors) {
      ctx.beginPath()
      ctx.moveTo(Math.round(c.x1), Math.round(c.y1))
      ctx.lineTo(Math.round(c.x2), Math.round(c.y2))
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.restore()

    for (let i = 0; i < layout.nodes.length; i++) this.mapNode(layout.nodes[i], i === view.index)

    this.centred(hint, cx, hintY, 'echo')
  }

  /**
   * One map node: a disc carrying the level id, then its line underneath. An open node wears the
   * brass inks; a locked or unbuilt one wears steel, so it reads as unstartable at a glance.
   */
  private mapNode(node: MapNodeBox, selected: boolean): void {
    const playable = node.state === 'open'
    const discW = 30
    const dx = Math.round(node.x + (node.w - discW) / 2)
    const dy = node.y
    const rim = playable ? (selected ? INK.brassLight : INK.brass) : selected ? INK.steelLight : INK.steel
    const ctx = this.ctx
    ctx.fillStyle = rim
    ctx.fillRect(dx, dy, discW, MAP_DISC_H)
    ctx.fillStyle = INK.panel
    ctx.fillRect(dx + 1, dy + 1, discW - 2, MAP_DISC_H - 2)
    const lx = Math.round(dx + (discW - textWidth(node.label)) / 2)
    const ly = Math.round(dy + (MAP_DISC_H - GLYPH_H) / 2)
    this.text(node.label, lx, ly, playable ? (selected ? 'brassLight' : 'cream') : 'steelLight')
    const mx = Math.round(node.x + (node.w - textWidth(node.meta)) / 2)
    this.text(node.meta, mx, dy + MAP_DISC_H + 2, playable ? 'cream' : 'steelLight')
    // One recorded line per node, so the browser check reads the map exactly as it is on screen.
    this.overlayLines.push(`${node.label} ${node.meta}`)
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

/**
 * A results-screen delta in tenths of a second, signed: `+1.2` lost, `-0.3` gained, `0.0` even.
 * Rounded rather than truncated — a section that ends 0.04 s later is not worth a `+0.0`.
 */
export function formatDelta(seconds: number): string {
  const tenths = Math.round(seconds * 10)
  if (tenths === 0) return '0.0'
  const sign = tenths < 0 ? '-' : '+'
  const abs = Math.abs(tenths)
  return `${sign}${Math.floor(abs / 10)}.${abs % 10}`
}

/** The results screen's medal line: `MEDAL GOLD`, or `MEDAL --` when the run missed bronze. */
export function medalLine(medal: string | null): string {
  return medal === null ? OVERLAY_TEXT.noMedal : `${OVERLAY_TEXT.medal} ${medal}`
}

/** One results-screen section line: `S1 0:04.2 -0.3`, or `S1 0:04.2 --` before a best exists. */
export function sectionLine(section: SectionLine): string {
  const delta = section.delta === null ? '--' : formatDelta(section.delta)
  return `${section.label} ${formatTime(section.seconds)} ${delta}`
}
