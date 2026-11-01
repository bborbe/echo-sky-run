import { BUILD_LABEL } from './build-info.ts'
import { createSim, stepSim, type SimInput, type SimState } from './game/sim.ts'
import { LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_ROWS } from './levels/level1-1.ts'
import { TILE } from './physics/constants.ts'
import { FixedStepper } from './physics/loop.ts'
import { parseLevel, tileAt } from './physics/tilemap.ts'
import { Renderer, PALETTE } from './render/renderer.ts'
import { createControlsCard, ECHO_HINT } from './ui/controls-card.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('missing #game canvas')

/** The spec's storage key. It holds the best time today; unlocked levels and relics join it later. */
const STORAGE_KEY = 'echo-sky-run.v1'

interface Save {
  bestSeconds?: number
}

/**
 * The best time, or null when there is none. Every access is guarded: a browser in private mode, or
 * one with storage disabled, throws on the first read, and a level that cannot start is worse than
 * one that forgets its record.
 */
function loadBest(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Save
    return typeof parsed.bestSeconds === 'number' ? parsed.bestSeconds : null
  } catch {
    return null
  }
}

function saveBest(seconds: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bestSeconds: seconds } satisfies Save))
  } catch {
    // Storage unavailable: the run still counts, it just is not remembered.
  }
}

const map = parseLevel(LEVEL_1_1_ROWS)
const renderer = new Renderer(canvas)
window.addEventListener('resize', () => renderer.fit())

// Shown on first start and whenever H asks for it. While it is up the game does not advance, so a
// player reading the controls is not losing a run behind the card.
const controls = createControlsCard(document.body)
controls.show()

/** Set once the sign's hint has been shown for this run, so walking past twice does not repeat it. */
let signShown = false

/**
 * The sign's hint. It sits over the level rather than pausing it: the player is about to attempt the
 * gap, and a modal at that moment is a worse interruption than a line at the bottom of the screen.
 */
function showSignHint(): void {
  const el = document.createElement('div')
  el.id = 'echo-hint'
  el.textContent = ECHO_HINT
  el.style.cssText =
    'position:fixed;left:50%;bottom:48px;transform:translateX(-50%);padding:10px 16px;border-radius:8px;' +
    'background:rgba(20,30,40,.92);color:#5dbb63;font:13px ui-monospace,monospace;z-index:10'
  document.body.append(el)
  setTimeout(() => el.remove(), 6000)
}

const stepper = new FixedStepper()
let sim: SimState = createSim(map)
let prevX = sim.player.x
let prevY = sim.player.y
let paused = false
let tick = 0
/** Set once the tally for this run has been recorded, so a finished level is not saved every frame. */
let recorded = false
let bestSeconds: number | null = loadBest()

const held = new Set<string>()
const edge = { jump: false, echo: false }
/** Set while a test-seam step is driving; null means the renderer uses the stepper's own alpha. */
let renderAlpha: number | null = null

// Only the game's own keys are captured. A modified key is never a game key: Ctrl+R must reload the
// page rather than reset the run, and preventDefault on every keydown would swallow it.
const GAME_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyC',
  'KeyR',
  'ShiftLeft',
  'ShiftRight',
])

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW'])

function resetGame(): void {
  sim = createSim(map)
  prevX = sim.player.x
  prevY = sim.player.y
  // `held` mirrors the physical keyboard, not the game, and is deliberately left alone: a key still
  // down after R keeps the player moving, which is what the player is asking for. Clearing it would
  // strand that key, because the browser only re-sends repeat events for keys it still holds and the
  // handler ignores repeats.
  edge.jump = false
  edge.echo = false
  tick = 0
  recorded = false
  signShown = false
  stepper.reset()
}

function readInput(): SimInput {
  let jump = false
  for (const key of held) if (JUMP_KEYS.has(key)) jump = true

  return {
    left: held.has('ArrowLeft') || held.has('KeyA'),
    right: held.has('ArrowRight') || held.has('KeyD'),
    jump,
    jumpPressed: edge.jump,
    sprint: held.has('ShiftLeft') || held.has('ShiftRight'),
    echoPressed: edge.echo,
  }
}

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return

  // Any key dismisses the card, and the press that dismisses it is not also a game input — otherwise
  // reading the controls costs the player a jump.
  if (controls.visible()) {
    event.preventDefault()
    controls.hide()
    return
  }

  if (event.code === 'KeyH') {
    event.preventDefault()
    controls.show()
    return
  }

  if (!GAME_KEYS.has(event.code)) return
  event.preventDefault()
  if (event.repeat) return
  if (JUMP_KEYS.has(event.code)) edge.jump = true
  if (event.code === 'KeyC') edge.echo = true
  held.add(event.code)
  if (event.code === 'KeyR') resetGame()
})

// The card switches to pad labels the moment a controller is connected, so the player never has to
// translate a keyboard he is not holding.
window.addEventListener('gamepadconnected', () => controls.setPad(true))
window.addEventListener('gamepaddisconnected', () => controls.setPad(false))

window.addEventListener('keyup', (event) => {
  held.delete(event.code)
})

// A key still physically down when the tab loses focus never delivers keyup, so the player would
// keep running after refocus. Drop every held key and any latched edge.
function releaseAll(): void {
  held.clear()
  edge.jump = false
  edge.echo = false
}
window.addEventListener('blur', releaseAll)
document.addEventListener('visibilitychange', () => {
  // The spec pauses on a hidden tab. Without this a player who switches away comes back to a run
  // that carried on without him — and a run timer that kept counting.
  if (document.hidden) {
    releaseAll()
    paused = true
  }
})

let last = performance.now()

function frame(now: number): void {
  const elapsed = (now - last) / 1000
  last = now

  if (!paused && !controls.visible()) {
    stepper.advance(elapsed, () => {
      prevX = sim.player.x
      prevY = sim.player.y
      stepSim(sim, readInput())
      // An edge is consumed by the first fixed step that sees it.
      edge.jump = false
      edge.echo = false
      tick += 1
    })
  }

  // The sign's hint, once per run.
  if (sim.signSeen && !signShown) {
    signShown = true
    showSignHint()
  }

  // Record the run once it is finished: the first finish, and every faster one after it.
  if (sim.goalReached && !recorded) {
    recorded = true
    const seconds = sim.frames / 60
    if (bestSeconds === null || seconds < bestSeconds) {
      bestSeconds = seconds
      saveBest(seconds)
    }
  }

  renderer.draw({
    map,
    player: sim.player,
    prevX,
    prevY,
    echoes: sim.field.echoes,
    enemies: sim.enemies.enemies,
    mushrooms: sim.powers.mushrooms,
    usedBlocks: sim.usedBlocks,
    goalReached: sim.goalReached,
    runSeconds: sim.frames / 60,
    bestSeconds,
    tick,
    // A seam-driven step has no stepper phase, so it draws the current state rather than blending
    // back towards the previous one.
    alpha: renderAlpha ?? stepper.alpha,
  })
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

function snapshot() {
  return {
    x: sim.player.x,
    y: sim.player.y,
    vx: sim.player.vx,
    vy: sim.player.vy,
    grounded: sim.player.grounded,
    meter: sim.player.meter,
    echoes: sim.field.echoes.length,
    airCharges: sim.field.airCharges,
    enemies: sim.enemies.enemies.length,
    power: sim.power,
    invuln: sim.invuln,
    mushrooms: sim.powers.mushrooms.length,
    combo: sim.combo,
    score: sim.score,
    frames: sim.frames,
    deaths: sim.deaths,
    signSeen: sim.signSeen,
    goalReached: sim.goalReached,
  }
}

/**
 * Test seam. The browser check drives the same `stepSim` the frame loop uses, one fixed step at a
 * time, so the playthrough does not depend on frame timing.
 *
 * It is deliberately present in the production bundle: the check runs against the built `vite
 * preview` output, where a dev-only gate would make it unreachable. It is inert unless called.
 */
interface EchoSkyRunTestApi {
  readonly echoAtX: number
  readonly palette: typeof PALETTE
  pause(): void
  resume(): void
  reset(): void
  step(input: Partial<SimInput>): ReturnType<typeof snapshot>
  state(): ReturnType<typeof snapshot>
  /** The controls card, so the browser check asserts its labels and its dismissal. */
  controls(): { visible: boolean; pad: boolean; labels: string[] }
  showControls(): void
  hideControls(): void
  /** True while the sign's hint overlay is on screen. */
  hintShown(): boolean
  lipMissingAt(x: number): boolean
  enemyXs(): number[]
  spawnX(): number
}

const api: EchoSkyRunTestApi = {
  echoAtX: LEVEL_1_1_ECHO_AT_X,
  palette: PALETTE,
  pause() {
    paused = true
    renderAlpha = 1
  },
  resume() {
    paused = false
    renderAlpha = null
  },
  reset() {
    resetGame()
    renderAlpha = null
  },
  step(input) {
    // Take over the simulation: a seam step must not race the live frame loop.
    paused = true
    renderAlpha = 1
    prevX = sim.player.x
    prevY = sim.player.y
    stepSim(sim, {
      left: false,
      right: false,
      jump: false,
      jumpPressed: false,
      sprint: false,
      echoPressed: false,
      ...input,
    })
    tick += 1
    return snapshot()
  },
  state: snapshot,
  controls: () => ({
    visible: controls.visible(),
    pad: controls.isPad(),
    labels: Array.from(document.querySelectorAll('#controls-card dt')).map((el) => el.textContent ?? ''),
  }),
  showControls: () => controls.show(),
  hideControls: () => controls.hide(),
  /** The sign's hint is a transient overlay, so the check asserts its presence, not its text. */
  hintShown: () => document.getElementById('echo-hint') !== null,
  /** True when the floor under Pip's leading edge at `x` is missing — the bot's jump trigger. */
  lipMissingAt: (x: number) => {
    const feetRow = Math.floor((sim.player.y + sim.player.h) / TILE)
    const col = Math.floor((x + 12) / TILE)
    return tileAt(map, col, feetRow) !== '#'
  },
  /** Live enemy positions, so the check can jump over them instead of walking into them. */
  enemyXs: () => sim.enemies.enemies.filter((e) => e.mode !== 'carried').map((e) => e.x),
  /** Where Pip starts, so a reset assertion compares against the level rather than a literal. */
  spawnX: () => sim.respawn.x,
}

;(window as unknown as { __echoSkyRun: EchoSkyRunTestApi }).__echoSkyRun = api

// Surface the build label once, so a screenshot or the console shows which commit is live.
console.info(`echo-sky-run ${BUILD_LABEL}`)
