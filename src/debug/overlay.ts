// Debug overlay: a corner readout of the numbers you cannot see on the canvas, `?debug=1` or a
// backtick away, and P to copy the current spot as a spawn URL so a visual bug can be reproduced
// exactly. Modelled on Driftline's src/debug/overlay.ts — the same shape, the fields this game has.
import { COMMIT_SHA } from '../build-info.ts'

/** The query parameter that turns the overlay on at load. */
export const DEBUG_PARAM = 'debug'

export function debugVisible(search: string): boolean {
  return new URLSearchParams(search).get(DEBUG_PARAM) === '1'
}

/** True when a keydown toggles the overlay: backtick, no repeat, no modifier, not typed into a field. */
export const debugToggle = (
  code: string,
  repeat: boolean,
  modified: boolean,
  inField: boolean,
): boolean => code === 'Backquote' && !repeat && !modified && !inField

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
  /** The P-meter, 0..112. */
  readonly meter: number
  readonly echoes: number
  readonly charge: number
  /** Frames left on the oldest Echo, or 0 with none. */
  readonly life: number
}

export interface DebugOverlay {
  update(stats: DebugStats): void
  visible(): boolean
  /** The overlay's own key handling; the shell calls it from its keydown listener. */
  onKeyDown(event: KeyboardEvent): void
  /** The last spawn URL P copied, so a check can assert it without the clipboard. */
  lastSpawnUrl(): string | null
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

/**
 * `?freeze=1` starts the page paused. A screenshot taken from a spawn URL needs a still frame: the
 * debug overlay's P copies a spot, and a moving target would make every shot a different one.
 */
export function readFreeze(search: string): boolean {
  return new URLSearchParams(search).get('freeze') === '1'
}

/** One row per field. The label is what a reader scans; `field` is what the browser check keys on. */
const FIELDS: readonly (readonly [string, string])[] = [
  ['fps', 'fps'],
  ['frame', 'frame ms'],
  ['p99', 'p99 ms'],
  ['steps', 'steps/frame'],
  ['pose', 'x y vx vy'],
  ['speed', 'meter'],
  ['echo', 'echoes / charge / life'],
  ['commit', 'build'],
]

const STYLE_ID = 'debug-overlay-style'

const STYLES = `
#debug-overlay {
  position: fixed; top: 8px; left: 8px;
  padding: 8px 10px; border-radius: 6px;
  background: rgba(20, 30, 40, 0.86); color: #d8e8f0;
  font: 11px/1.45 ui-monospace, monospace;
  pointer-events: none; z-index: 11;
  display: grid; grid-template-columns: auto 1fr; gap: 1px 10px;
}
#debug-overlay .label { color: #9fe8ff; }
#debug-overlay .value { color: #f2f2f2; }
html.debug-off #debug-overlay { display: none; }
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

export interface DebugOptions {
  search: string
  /** Where P's spawn URL points, and the toast it shows once copied. */
  spawnLink: () => { query: string; copied: string }
}

export function mountDebugOverlay(options: DebugOptions): DebugOverlay {
  installStyles()

  const root = document.createElement('div')
  root.id = 'debug-overlay'
  const values = new Map<string, HTMLSpanElement>()
  for (const [field, label] of FIELDS) {
    const l = document.createElement('span')
    l.className = 'label'
    l.textContent = label
    const v = document.createElement('span')
    v.className = 'value'
    v.dataset.field = field
    v.textContent = '—'
    root.append(l, v)
    values.set(field, v)
  }
  document.body.append(root)

  // `?debug=1` starts it visible; a plain URL starts it hidden and a backtick brings it up.
  document.documentElement.classList.toggle('debug-off', !debugVisible(options.search))

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

  const visible = (): boolean => !document.documentElement.classList.contains('debug-off')

  const fmt = (n: number, digits = 1): string => (Number.isFinite(n) ? n.toFixed(digits) : '—')

  return {
    update(stats) {
      values.get('fps')!.textContent = fmt(stats.fps, 0)
      values.get('frame')!.textContent = fmt(stats.frameMs, 2)
      values.get('p99')!.textContent = fmt(stats.frameP99Ms, 2)
      values.get('steps')!.textContent = String(stats.steps)
      values.get('pose')!.textContent =
        `${stats.x.toFixed(0)} ${stats.y.toFixed(0)} ${fmt(stats.vx, 2)} ${fmt(stats.vy, 2)}`
      values.get('speed')!.textContent = String(Math.round(stats.meter))
      values.get('echo')!.textContent = `${stats.echoes} / ${stats.charge} / ${stats.life}`
      values.get('commit')!.textContent = COMMIT_SHA.slice(0, 7)
    },
    visible,
    onKeyDown(event) {
      const inField = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
      if (debugToggle(event.code, event.repeat, event.ctrlKey || event.metaKey || event.altKey, inField)) {
        document.documentElement.classList.toggle('debug-off')
        return
      }
      // P copies only while the overlay is up: with it hidden, P is the spec's pause key.
      if (event.code === 'KeyP' && !event.repeat && visible()) copySpawn()
    },
    lastSpawnUrl: () => copied,
  }
}
