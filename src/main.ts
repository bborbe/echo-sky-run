import { BUILD_LABEL } from './build-info.ts'
import { mountDebugOverlay, readEchoSpot, readFreeze, readSpawn, spawnQuery } from './debug/overlay.ts'
import { ECHO_LIFE_F, placeEcho } from './echo/echo.ts'
import { createSim, stepSim, type SimInput, type SimState } from './game/sim.ts'
import { LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_ROWS } from './levels/level1-1.ts'
import { PLAYER_W, TILE } from './physics/constants.ts'
import { FixedStepper } from './physics/loop.ts'
import { parseLevel, tileAt } from './physics/tilemap.ts'
import { Juice, type StepFacts, type StompFact } from './render/juice.ts'
import { skyColourAt } from './render/parallax.ts'
import { PipAnimator } from './render/pose.ts'
import { Renderer, PALETTE } from './render/renderer.ts'
import { createControlsCard, ECHO_HINT } from './ui/controls-card.ts'
import { escapeLeavesFullscreen, toggleFullscreen, watchFullscreen } from './ui/fullscreen.ts'
import { mountGamepad } from './ui/gamepad-shell.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('missing #game canvas')
const skyCanvas = document.querySelector<HTMLCanvasElement>('#sky')
if (!skyCanvas) throw new Error('missing #sky canvas')

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
const renderer = new Renderer(canvas, skyCanvas)
window.addEventListener('resize', () => renderer.fit())
// Fullscreen changes the window size, so the canvas has to re-fit on every change, not just a resize.
watchFullscreen(() => renderer.fit())

// Shown on first start and whenever H asks for it. While it is up the game does not advance, so a
// player reading the controls is not losing a run behind the card.
const controls = createControlsCard(document.body)
controls.show()

// `?debug=1` opens it; a plain URL keeps it hidden until a backtick. Its P copies the spot Pip is
// standing on, so a visual bug can be reopened exactly there.
const overlay = mountDebugOverlay({
  search: location.search,
  spawnLink: () => ({ query: spawnQuery(sim.player.x, sim.player.y), copied: 'Spawn URL copied' }),
})

// The pad presses the game's own keys, so nothing downstream knows a controller exists — and the
// card switches to pad labels the moment one connects.
const gamepad = mountGamepad(navigator, { onConnect: (connected) => controls.setPad(connected) })

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

/**
 * A `?level=1-1&x=&y=` URL starts Pip where it says, which is what the debug overlay's P copies.
 * Read once: a spawn is a property of the page load, not something a run changes.
 */
const spawnPoint = readSpawn(location.search)

/** `?freeze=1` starts paused, so a screenshot from a spawn URL is a still frame, not a moving one. */
const frozenAtLoad = readFreeze(location.search)

/** `?echo=x,y` starts the level with an Echo standing there — the screenshot tool's Echo poses. */
const echoSpot = readEchoSpot(location.search)

function newSim(): SimState {
  const next = createSim(map)
  if (spawnPoint !== null) {
    next.player.x = spawnPoint.x
    next.player.y = spawnPoint.y
    next.respawn = { x: spawnPoint.x, y: spawnPoint.y }
  }
  if (echoSpot !== null) {
    // A box whose feet are at the spot: placeEcho puts the platform's top exactly there.
    placeEcho(next.field, { x: echoSpot.x, y: echoSpot.y - next.player.h, w: PLAYER_W, h: next.player.h }, map)
    next.field.airCharges = 1
  }
  return next
}

/** Pip's pose, advanced once per fixed step. */
const animator = new PipAnimator()
/** Squash, dust, hit-stop, shake and the rest — advanced once per fixed step. */
const juice = new Juice()
/** Fixed steps the loop held for juice (hit-stop, death pop). The browser check reads it. */
let heldSteps = 0

/** What a step did, rebuilt every step for the juice. The stomp list is reused. */
const stompFacts: StompFact[] = []

/**
 * One fixed step of the game plus everything drawn off it: the pose, then the juice. The frame loop
 * and the browser check's seam both come through here, so a seam-driven run shows the same effects.
 */
function advance(input: SimInput): void {
  const before = sim.player
  const wasGrounded = before.grounded
  const prevVy = before.vy
  const deathBox = { x: before.x, y: before.y, w: PLAYER_W, h: before.h }
  const deathsBefore = sim.deaths
  const powerBefore = sim.power
  const blocksBefore = sim.usedBlocks.size
  const framesBefore = sim.frames

  prevX = before.x
  prevY = before.y
  stepSim(sim, input)

  const p = sim.player
  const inputDir: -1 | 0 | 1 = input.left && !input.right ? -1 : input.right && !input.left ? 1 : 0
  animator.update({ vx: p.vx, vy: p.vy, grounded: p.grounded, inputDir })
  juice.tick()
  // A finished run does not step; there is nothing for the juice to read.
  if (sim.frames === framesBefore) return

  stompFacts.length = 0
  for (const e of sim.stomped) stompFacts.push({ kind: e.kind, x: e.x, y: e.y, w: e.w, h: e.h })
  const placed = sim.field.echoes.find((e) => e.life === ECHO_LIFE_F - 1) ?? null
  let blockHit: { col: number; row: number } | null = null
  if (sim.usedBlocks.size > blocksBefore) {
    let last = ''
    for (const key of sim.usedBlocks) last = key
    const [col, row] = last.split(',').map(Number)
    blockHit = { col, row }
  }
  const died = sim.deaths > deathsBefore
  const facts: StepFacts = {
    inputDir,
    grounded: p.grounded,
    wasGrounded: died ? true : wasGrounded,
    prevVy,
    vx: p.vx,
    vy: p.vy,
    player: { x: p.x, y: p.y, w: PLAYER_W, h: p.h },
    stomps: stompFacts,
    died,
    deathBox,
    deathSuper: powerBefore === 'super',
    bigHit: !died && powerBefore === 'super' && sim.power === 'small',
    echoPlaced: placed,
    echoRefused: input.echoPressed && placed === null,
    blockHit,
    pose: animator.pose,
    poseFrame: animator.frame,
    facing: animator.facing,
    superForm: sim.power === 'super',
  }
  juice.observe(facts)
}

const stepper = new FixedStepper()
let sim: SimState = newSim()
let prevX = sim.player.x
let prevY = sim.player.y
/** The player asked for a pause; the tab being hidden is tracked separately so one does not clear the other. */
let paused = false
/**
 * `?freeze=1`: hold the simulation on the frame the page loaded. It is not a player pause — a
 * screenshot needs a still frame without the PAUSED banner drawn over the game.
 */
let frozen = frozenAtLoad
let tabHidden = false
const isPaused = (): boolean => paused || tabHidden
/** Everything that stops the fixed step. A frozen page still renders; that is what the shot captures. */
const isHalted = (): boolean => isPaused() || frozen
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
  sim = newSim()
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
  animator.reset()
  juice.reset()
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

  if (event.code === 'KeyF') {
    event.preventDefault()
    toggleFullscreen()
    return
  }

  // Esc leaves fullscreen natively. Swallowing that same keydown as a pause would make one press
  // do two things, so a press inside the exit grace window is left to the browser.
  if (event.code === 'Escape' && escapeLeavesFullscreen(document.fullscreenElement !== null, performance.now())) {
    return
  }

  // The debug overlay owns the backtick, and P while it is up. With the overlay hidden, P is the
  // spec's pause key — the same key doing two jobs, split by whether the overlay is on screen.
  overlay.onKeyDown(event)

  if (event.code === 'Escape' || (event.code === 'KeyP' && !overlay.visible())) {
    event.preventDefault()
    paused = !paused
    if (paused) releaseAll()
    return
  }

  // A finished run is frozen by the sim, so a jump is the tally's "retry" — the prompt on the tally
  // promises exactly that, and without it the only way out is a key the card does not mention.
  if (sim.goalReached && JUMP_KEYS.has(event.code)) {
    event.preventDefault()
    resetGame()
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
  // that carried on without him — and a run timer that kept counting. The else branch matters just
  // as much: without it the pause is a one-way latch and the game never resumes. It lifts only the
  // tab's own pause, never one the player asked for.
  if (document.hidden) {
    releaseAll()
    tabHidden = true
  } else {
    tabHidden = false
  }
})

/** Frame durations for the debug overlay's p99. A long stall is clamped: a tab switch is not a frame. */
const frameTimes: number[] = []
const FRAME_WINDOW = 120
const FRAME_CLAMP_MS = 250

function frameStats(frameMs: number, steps: number) {
  frameTimes.push(Math.min(frameMs, FRAME_CLAMP_MS))
  if (frameTimes.length > FRAME_WINDOW) frameTimes.shift()
  const sorted = [...frameTimes].sort((a, b) => a - b)
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] ?? 0
  const mean = frameTimes.reduce((sum, ms) => sum + ms, 0) / Math.max(1, frameTimes.length)
  return { fps: mean > 0 ? 1000 / mean : 0, frameMs, frameP99Ms: p99, steps }
}

let last = performance.now()

function frame(now: number): void {
  const elapsed = (now - last) / 1000
  const frameMs = elapsed * 1000
  last = now

  let steps = 0
  if (!isHalted() && !controls.visible()) {
    steps = stepper.advance(elapsed, () => {
      // Hit-stop and the death pop hold the world still for a few fixed steps. A press made
      // meanwhile stays latched and lands on the first step after the hold.
      if (juice.holding()) {
        juice.tickHold()
        prevX = sim.player.x
        prevY = sim.player.y
        heldSteps += 1
        return
      }
      advance(readInput())
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
    paused: isPaused(),
    runSeconds: sim.frames / 60,
    bestSeconds,
    tick,
    // A seam-driven step has no stepper phase, so it draws the current state rather than blending
    // back towards the previous one.
    alpha: renderAlpha ?? stepper.alpha,
    power: sim.power,
    invuln: sim.invuln,
    checkpointClaimed:
      sim.checkpoint !== null && sim.respawn.x === sim.checkpoint.x && sim.respawn.y === sim.checkpoint.y,
    pose: animator.pose,
    poseFrame: animator.frame,
    facing: animator.facing,
    juice,
  })

  const stats = frameStats(frameMs, steps)
  const oldest = sim.field.echoes.reduce((min, e) => Math.min(min, e.life), Number.POSITIVE_INFINITY)
  overlay.update({
    ...stats,
    x: sim.player.x,
    y: sim.player.y,
    vx: sim.player.vx,
    vy: sim.player.vy,
    meter: sim.player.meter,
    echoes: sim.field.echoes.length,
    charge: sim.field.airCharges,
    life: Number.isFinite(oldest) ? oldest : 0,
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
  /** The pad the shell sees, and how many keys it is holding. */
  pad(): { id: string | null; held: number }
  /** The debug overlay's state: visibility, each field's rendered value, and the last spawn URL. */
  debug(): { visible: boolean; fields: Record<string, string>; spawnUrl: string | null }
  paused(): boolean
  /** True while `?freeze=1` holds the simulation — the screenshot tool's own still-frame check. */
  frozen(): boolean
  /** Frame durations over the recent window — the browser check asserts the 18 ms p99 budget. */
  frameTimings(): { samples: number; meanMs: number; p99Ms: number; maxMs: number }
  /** Turn a seam pause into a freeze: the sim stays still and no PAUSED plate is drawn (screenshots). */
  hold(): void
  /** The juice the loop is running: holds, shake, and fixed steps held so far. */
  juice(): { hitStop: number; deathHold: number; shake: number; shakeX: number; shakeY: number; heldSteps: number }
  /** The camera's integer scroll, for the flicker probe. */
  cameraX(): number
  /** The sky gradient's colour at a screen row — what a gap must show. */
  skyAt(y: number): [number, number, number]
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
    frozen = false
    tabHidden = false
    renderAlpha = null
  },
  reset() {
    resetGame()
    renderAlpha = null
  },
  step(input) {
    // Take over the simulation: a seam step must not race the live frame loop. It goes through the
    // same advance() as the loop, so the pose and the juice follow — but never holds: a seam step is
    // always exactly one simulation step.
    paused = true
    renderAlpha = 1
    advance({
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
  pad: () => ({ id: gamepad.id(), held: gamepad.heldCount() }),
  debug: () => ({
    visible: overlay.visible(),
    fields: Object.fromEntries(
      Array.from(document.querySelectorAll<HTMLElement>('#debug-overlay .value')).map((el) => [
        el.dataset.field ?? '',
        el.textContent ?? '',
      ]),
    ),
    spawnUrl: overlay.lastSpawnUrl(),
  }),
  paused: () => isPaused(),
  frozen: () => frozen,
  hold() {
    paused = false
    frozen = true
    renderAlpha = 1
  },
  juice: () => {
    const o = juice.shakeOffset()
    return {
      hitStop: juice.hitStop,
      deathHold: juice.deathHold,
      shake: juice.shake,
      shakeX: o.x,
      shakeY: o.y,
      heldSteps,
    }
  },
  cameraX: () => renderer.cameraX,
  skyAt: (y: number) => skyColourAt(y),
  frameTimings: () => {
    const sorted = [...frameTimes].sort((a, b) => a - b)
    const samples = sorted.length
    const meanMs = frameTimes.reduce((sum, ms) => sum + ms, 0) / Math.max(1, samples)
    return {
      samples,
      meanMs,
      p99Ms: samples === 0 ? 0 : sorted[Math.min(samples - 1, Math.floor(samples * 0.99))],
      maxMs: samples === 0 ? 0 : sorted[samples - 1],
    }
  },
}

;(window as unknown as { __echoSkyRun: EchoSkyRunTestApi }).__echoSkyRun = api

// Surface the build label once, so a screenshot or the console shows which commit is live.
console.info(`echo-sky-run ${BUILD_LABEL}`)
