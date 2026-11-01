// Debug overlay: a corner readout of the state you cannot see on the canvas, on by default in the
// dev build and a backtick away, with O copying the current spot as a spawn URL so a visual bug can
// be reproduced exactly. Modelled on Driftline's src/debug/overlay.ts for the visibility rule.
//
// The text is the game's own 5×7 bitmap font on its own pixelated canvas, not a DOM panel: a system
// font anti-aliases, and the browser's nearest-neighbour upscale turns those greys into blurry
// blocks (play gate 1). A bitmap font on an integer scale has no greys to scale.
import { APP_VERSION, COMMIT_SHA } from '../build-info.ts'
import { FONT, GLYPH_GAP, GLYPH_H, GLYPH_W, textWidth } from '../render/art/font.ts'
import { INK } from '../render/art/palette.ts'

/** The query parameter that forces the overlay on (`1`) or off (`0`) at load. */
export const DEBUG_PARAM = 'debug'
/** Driftline's alias: `?dev=1` shows it exactly like `?debug=1`. */
export const DEV_PARAM = 'dev'

/**
 * Driftline's rule, plus the dev build's own default: `?debug=0` always hides, `?debug=1` or
 * `?dev=1` always shows, and otherwise a dev build shows it while a production build hides it — so
 * the dev server is useful without a parameter and a shipped screenshot carries no debug noise.
 */
export function debugVisible(search: string, devBuild: boolean): boolean {
  const params = new URLSearchParams(search)
  if (params.get(DEBUG_PARAM) === '0') return false
  if (params.get(DEBUG_PARAM) === '1' || params.get(DEV_PARAM) === '1') return true
  return devBuild
}

/** True when a keydown toggles the overlay: backtick, no repeat, no modifier, not typed into a field. */
export const debugToggle = (
  code: string,
  repeat: boolean,
  modified: boolean,
  inField: boolean,
): boolean => code === 'Backquote' && !repeat && !modified && !inField

/**
 * The key that copies a spawn URL. It used to be P, which meant a visible overlay stole the pause
 * key — with the overlay on by default in dev that would have cost every play gate its pause.
 */
export const DEBUG_COPY_KEY = 'KeyO'

export interface DebugStats {
  readonly fps: number
  /** The last frame's duration in ms. */
  readonly frameMs: number
  /** The 99th percentile frame duration over the recent window, in ms. */
  readonly frameP99Ms: number
  /** Fixed simulation steps the last frame ran. */
  readonly steps: number
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly grounded: boolean
  /** `small` or `super` — the Mushroom tier. */
  readonly power: string
  /** The P-meter, 0..112. */
  readonly meter: number
  readonly echoes: number
  readonly charge: number
  /** Frames left on the oldest Echo, or 0 with none. */
  readonly life: number
  /** The level id from `?level=`, `1-1` by default. */
  readonly level: string
  /**
   * Whether the level has a midpoint flag at all, and whether Pip has claimed it. The flag's own
   * coordinates are a level constant, so they say nothing a screenshot needs.
   */
  readonly checkpoint: { readonly exists: boolean; readonly claimed: boolean }
  /** `playing`, `clear` or `dead`. */
  readonly runState: string
}

export interface DebugOverlay {
  update(stats: DebugStats): void
  visible(): boolean
  /** The overlay's own key handling; the shell calls it from its keydown listener. */
  onKeyDown(event: KeyboardEvent): void
  /** The last spawn URL copied, so a check can assert it without the clipboard. */
  lastSpawnUrl(): string | null
  /**
   * The rendered field values, keyed by field. The browser check reads this instead of scraping the
   * DOM — the overlay is a canvas now, so there are no elements to scrape.
   */
  values(): Readonly<Record<string, string>>
}

/** The query that spawns Pip at a spot: the level, and where to start him. */
export function spawnQuery(x: number, y: number): string {
  return `?level=1-1&x=${Math.round(x)}&y=${Math.round(y)}`
}

export interface SpawnPoint {
  readonly x: number
  readonly y: number
}

/** The spawn point from a `?level=1-1&x=&y=` URL, or null when the URL names no complete spot. */
export function readSpawn(search: string): SpawnPoint | null {
  const params = new URLSearchParams(search)
  const rawX = params.get('x')
  const rawY = params.get('y')
  // `Number(null)` and `Number('')` are both 0, so the raw strings are checked before converting —
  // otherwise a URL with no spot at all would spawn Pip at the world origin.
  if (rawX === null || rawY === null || rawX.trim() === '' || rawY.trim() === '') return null
  const x = Number(rawX)
  const y = Number(rawY)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

/** The level id from `?level=`, `1-1` when absent or blank — the only level that ships today. */
export function readLevel(search: string): string {
  const raw = new URLSearchParams(search).get('level')
  return raw === null || raw.trim() === '' ? '1-1' : raw.trim()
}

/**
 * `?echo=<x>,<y>` places one Echo with its platform top at that spot when the level starts — the
 * screenshot tool's way to show an Echo over a chosen background without scripting a jump. Pixel
 * coordinates, like the spawn. Null when absent or malformed.
 */
export function readEchoSpot(search: string): SpawnPoint | null {
  const raw = new URLSearchParams(search).get('echo')
  if (raw === null) return null
  const parts = raw.split(',')
  if (parts.length !== 2 || parts.some((p) => p.trim() === '')) return null
  const x = Number(parts[0])
  const y = Number(parts[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

/**
 * `?freeze=1` starts the page paused. A screenshot taken from a spawn URL needs a still frame: the
 * debug overlay's O copies a spot, and a moving target would make every shot a different one.
 */
export function readFreeze(search: string): boolean {
  return new URLSearchParams(search).get('freeze') === '1'
}

/** One row per field: the label a reader scans, and the key a check reads it by. */
const ROWS: readonly (readonly [string, string])[] = [
  ['version', 'VERSION'],
  ['commit', 'BUILD'],
  ['level', 'LEVEL'],
  ['checkpoint', 'CHECKPOINT'],
  ['state', 'STATE'],
  ['fps', 'FPS'],
  ['frame', 'FRAME MS'],
  ['p99', 'P99 MS'],
  ['steps', 'STEPS'],
  ['x', 'X'],
  ['y', 'Y'],
  ['vx', 'VX'],
  ['vy', 'VY'],
  ['grounded', 'GROUNDED'],
  ['power', 'POWER'],
  ['charge', 'ECHO CHARGE'],
  ['timer', 'ECHO TIMER'],
  ['speed', 'METER'],
]

const STYLE_ID = 'debug-overlay-style'
/** Rows per column. Eighteen fields at nine rows each is a corner block, not a column to the floor. */
const COLUMNS = 2
const ROW_H = GLYPH_H + 3
const PAD = 4
const COL_GAP = 10
/** Integer upscale, so every glyph pixel lands on a whole screen pixel and nothing blurs. */
const SCALE = 3

const STYLES = `
#debug-overlay {
  position: fixed; top: 8px; left: 8px;
  image-rendering: pixelated; pointer-events: none; z-index: 11;
}
#debug-overlay.hidden { display: none; }
#debug-toast {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  padding: 8px 14px; border-radius: 8px;
  background: rgba(20, 30, 40, 0.92); color: #f2f2f2;
  font: 12px ui-monospace, monospace; z-index: 12;
  opacity: 0; transition: opacity 120ms ease;
}
#debug-toast.show { opacity: 1; }
`

function installStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLES
  document.head.append(style)
}

/** A line of text in the bitmap font — one `fillRect` per ink pixel, so no anti-aliasing exists. */
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ink: string): void {
  ctx.fillStyle = ink
  let gx = x
  // The font is uppercase only; a lowercase character would fall back to the blank space glyph.
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT[' ']
    for (let gy = 0; gy < glyph.length; gy++) {
      const row = glyph[gy]
      for (let gxi = 0; gxi < row.length; gxi++) {
        if (row[gxi] === '#') ctx.fillRect(gx + gxi, y + gy, 1, 1)
      }
    }
    gx += GLYPH_W + GLYPH_GAP
  }
}

export interface DebugOptions {
  search: string
  /** Where O's spawn URL points, and the toast it shows once copied. */
  spawnLink: () => { query: string; copied: string }
  /** True on the dev server. Production hides the overlay unless `?debug=1` is set. */
  devBuild: boolean
}

const fmt = (n: number, digits = 1): string => (Number.isFinite(n) ? n.toFixed(digits) : '-')

/** The overlay's text for one field. Every value is a string so a check can compare it directly. */
function formatRow(field: string, stats: DebugStats): string {
  switch (field) {
    case 'version':
      return APP_VERSION
    case 'commit':
      return COMMIT_SHA.slice(0, 7)
    case 'level':
      return stats.level
    case 'checkpoint':
      if (!stats.checkpoint.exists) return 'NONE'
      return stats.checkpoint.claimed ? 'CLAIMED' : 'UNCLAIMED'
    case 'state':
      return stats.runState.toUpperCase()
    case 'fps':
      return fmt(stats.fps, 0)
    case 'frame':
      return fmt(stats.frameMs, 2)
    case 'p99':
      return fmt(stats.frameP99Ms, 2)
    case 'steps':
      return String(stats.steps)
    case 'x':
      return stats.x.toFixed(0)
    case 'y':
      return stats.y.toFixed(0)
    case 'vx':
      return fmt(stats.vx, 2)
    case 'vy':
      return fmt(stats.vy, 2)
    case 'grounded':
      return stats.grounded ? 'Y' : 'N'
    case 'power':
      return stats.power.toUpperCase()
    case 'charge':
      return String(stats.charge)
    case 'timer':
      return String(stats.life)
    case 'speed':
      return String(Math.round(stats.meter))
    default:
      return '-'
  }
}

export function mountDebugOverlay(options: DebugOptions): DebugOverlay {
  installStyles()

  const canvas = document.createElement('canvas')
  canvas.id = 'debug-overlay'
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')

  const labelWidth = Math.max(...ROWS.map(([, label]) => textWidth(label)))
  // Wide enough for the longest value the overlay ever prints — CHECKPOINT's "COL,ROW" and STATE's
  // "PLAYING" are the two that run long, so the box does not resize as the game runs.
  const valueWidth = textWidth('CHECKPOINT')
  const colW = labelWidth + 4 + valueWidth
  const rowsPerCol = Math.ceil(ROWS.length / COLUMNS)
  const logicalW = COLUMNS * colW + (COLUMNS - 1) * COL_GAP + PAD * 2
  const logicalH = rowsPerCol * ROW_H - 3 + PAD * 2
  canvas.width = logicalW
  canvas.height = logicalH
  canvas.style.width = `${logicalW * SCALE}px`
  canvas.style.height = `${logicalH * SCALE}px`
  document.body.append(canvas)

  let shown = debugVisible(options.search, options.devBuild)
  const applyShown = (): void => {
    canvas.classList.toggle('hidden', !shown)
  }

  const values: Record<string, string> = {}
  let latest: DebugStats | null = null

  const paint = (): void => {
    ctx.clearRect(0, 0, logicalW, logicalH)
    ctx.fillStyle = INK.panel
    ctx.fillRect(0, 0, logicalW, logicalH)
    if (latest === null) return
    for (let i = 0; i < ROWS.length; i++) {
      const [field, label] = ROWS[i]
      const col = Math.floor(i / rowsPerCol)
      const row = i % rowsPerCol
      const x = PAD + col * (colW + COL_GAP)
      const y = PAD + row * ROW_H
      drawText(ctx, label, x, y, INK.echo)
      drawText(ctx, values[field] ?? '-', x + labelWidth + 4, y, INK.cream)
    }
  }

  applyShown()
  paint()

  let toast: HTMLDivElement | null = null
  let toastTimer = 0
  let copied: string | null = null

  const show = (message: string): void => {
    if (toast === null) {
      toast = document.createElement('div')
      toast.id = 'debug-toast'
      document.body.append(toast)
    }
    toast.textContent = message
    toast.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toast?.classList.remove('show'), 1500)
  }

  const copySpawn = (): void => {
    const { query, copied: message } = options.spawnLink()
    copied = `${location.origin}${location.pathname}${query}`
    navigator.clipboard?.writeText(copied).then(
      () => show(message),
      () => show(copied ?? ''),
    )
  }

  return {
    update(stats) {
      latest = stats
      for (const [field] of ROWS) values[field] = formatRow(field, stats)
      paint()
    },
    visible: () => shown,
    onKeyDown(event) {
      const inField = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
      if (debugToggle(event.code, event.repeat, event.ctrlKey || event.metaKey || event.altKey, inField)) {
        shown = !shown
        applyShown()
        return
      }
      // O is the overlay's own key, so it never competes with P, the spec's pause.
      if (event.code === DEBUG_COPY_KEY && !event.repeat && shown) copySpawn()
    },
    lastSpawnUrl: () => copied,
    values: () => values,
  }
}
