import { AudioEngine } from './audio/engine.ts'
import { SoundWatcher } from './audio/events.ts'
import { loadVolumes, nudgeVolume, saveVolumes, type Volumes } from './audio/settings.ts'
import { BUILD_LABEL } from './build-info.ts'
import { mountDebugOverlay, readEchoSpot, readFreeze, readLevel, readSpawn, spawnQuery } from './debug/overlay.ts'
import { ECHO_LIFE_F, placeEcho } from './echo/echo.ts'
import { createSim, stepSim, type SimInput, type SimState } from './game/sim.ts'
import { LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_ROWS } from './levels/level1-1.ts'
import { PLAYER_W, TILE } from './physics/constants.ts'
import { FixedStepper } from './physics/loop.ts'
import { parseLevel, tileAt } from './physics/tilemap.ts'
import { Juice, type StepFacts, type StompFact } from './render/juice.ts'
import { skyColourAt } from './render/parallax.ts'
import { PipAnimator } from './render/pose.ts'
import { INK } from './render/art/palette.ts'
import { Renderer, PALETTE, type MenuView } from './render/renderer.ts'
import { loadSave, recordBest, storeSave, type Save } from './save/save.ts'
import { createControlsCard, ECHO_HINT } from './ui/controls-card.ts'
import { escapeLeavesFullscreen, toggleFullscreen, watchFullscreen } from './ui/fullscreen.ts'
import { mountGamepad } from './ui/gamepad-shell.ts'
import {
  activate,
  backTarget,
  isVolumeRow,
  menuFor,
  moveSelection,
  type GameScreen,
  type MenuId,
} from './ui/screens.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('missing #game canvas')
const skyCanvas = document.querySelector<HTMLCanvasElement>('#sky')
if (!skyCanvas) throw new Error('missing #sky canvas')

/**
 * The save is versioned and migrated on read (`src/save/save.ts`): the key keeps the name G1 wrote,
 * the payload carries the schema version, and G1's unversioned `{ bestSeconds }` store is upgraded in
 * place rather than dropped. Settings are not part of it — they live under their own key.
 */

/** localStorage, or null where reading it throws (private mode, storage disabled). */
function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const params = new URLSearchParams(location.search)

/**
 * Sound. The bank renders in a worker from page load; the context starts on the first key or click.
 * `?vol=0` mutes the master for agent-driven browsers, `?audiolog=1` keeps the trace the browser
 * check reads.
 */
const audio = new AudioEngine({
  volumes: loadVolumes(storage()),
  muted: params.get('vol') === '0',
  log: params.get('audiolog') === '1',
  worker:
    typeof Worker === 'undefined'
      ? null
      : () => new Worker(new URL('./audio/render.worker.ts', import.meta.url), { type: 'module' }),
  now: () => performance.now(),
})
/** Reads each fixed step for the sounds it raised. */
const sounds = new SoundWatcher()
/** The settings screen's sliders, kept in step with the engine and with localStorage. */
let volumes: Volumes = audio.volumes()
/**
 * The screen that is up. Only `level` steps the simulation. A debug URL (`?level=`, `?x=&y=`,
 * `?echo=`, `?freeze=1`) is asking for the level itself, so it starts there and skips the title.
 */
const debugEntry = ['level', 'x', 'y', 'echo', 'freeze'].some((key) => params.has(key))
let screen: GameScreen = debugEntry ? 'level' : 'title'
/** The selected row on the current menu screen. */
let selected = 0

const map = parseLevel(LEVEL_1_1_ROWS)
const renderer = new Renderer(canvas, skyCanvas)
window.addEventListener('resize', () => renderer.fit())
// Fullscreen changes the window size, so the canvas has to re-fit on every change, not just a resize.
watchFullscreen(() => renderer.fit())

// The controls card, opened by H, by pad LB, and from a menu row. It is not shown on load: the
// title screen is the first thing a player sees, and it carries CONTROLS as a row of its own.
const controls = createControlsCard(document.body)

// On by default on the dev server, `?debug=1` forces it on and `?debug=0` hides it; a production
// build hides it unless `?debug=1` is set, so a shipped screenshot carries no debug noise. O copies
// the spot Pip is standing on, so a visual bug can be reopened exactly there — P stays the pause.
const overlay = mountDebugOverlay({
  search: location.search,
  spawnLink: () => ({ query: spawnQuery(sim.player.x, sim.player.y), copied: 'Spawn URL copied' }),
  devBuild: import.meta.env.DEV,
})

/** The level id the URL asked for, so the overlay's level row reflects what is actually running. */
const levelId = readLevel(location.search)

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
  sounds.before(sim, input)
  stepSim(sim, input)
  for (const sound of sounds.after(sim, input)) audio.play(sound)

  const p = sim.player
  const inputDir: -1 | 0 | 1 = input.left && !input.right ? -1 : input.right && !input.left ? 1 : 0
  animator.update({ vx: p.vx, vy: p.vy, grounded: p.grounded, inputDir, finished: sim.goalReached })
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
/**
 * `?freeze=1`: hold the simulation on the frame the page loaded. It is not a player pause — a
 * screenshot needs a still frame with no menu drawn over the game.
 */
let frozen = frozenAtLoad
let tabHidden = false
/**
 * Set while a test-seam step is driving. The frame loop must not step alongside it, but the screen
 * stays where it is — a seam run is a run of the level, not a pause.
 */
let seamHalted = false
/** A menu screen stops the game as surely as a pause does; the hidden tab is tracked apart. */
const isPaused = (): boolean => screen !== 'level' || tabHidden
/** Everything that stops the fixed step. A frozen page still renders; that is what the shot captures. */
const isHalted = (): boolean => isPaused() || frozen || seamHalted
let tick = 0
/** Set once the tally for this run has been recorded, so a finished level is not saved every frame. */
let recorded = false
let save: Save = loadSave(storage())

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
  // A new run starts the music from the top; a death inside a run never does.
  audio.restartMusic()
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

/** Go to a screen. Entering a menu plays `ui-open`; going back into the game plays `ui-close`. */
function show(next: GameScreen): void {
  if (next === screen) return
  screen = next
  selected = 0
  audio.play(next === 'level' ? 'ui-close' : 'ui-open')
}

/**
 * The menu keys. Only reached while a menu screen is up, and every key it sees is swallowed — an
 * unknown press on the title does nothing rather than falling through to the game's own handler.
 */
function menuKey(code: string): void {
  // Esc, P and the pad's B (KeyX) are all "back": P is the spec's pause key, so it has to close the
  // pause it opened rather than doing nothing.
  if (code === 'Escape' || code === 'KeyP' || code === 'KeyX') {
    const back = backTarget(screen)
    if (back !== null) show(back)
    return
  }
  if (code === 'ArrowUp' || code === 'KeyW' || code === 'PadUp') return moveSelectionBy(-1)
  if (code === 'ArrowDown' || code === 'KeyS' || code === 'PadDown') return moveSelectionBy(1)
  if (code === 'ArrowLeft' || code === 'KeyA') return adjustVolume(-1)
  if (code === 'ArrowRight' || code === 'KeyD') return adjustVolume(1)
  if (code === 'Space' || code === 'Enter' || code === 'KeyK') return confirm(menuFor(screen)[selected]?.id)
}

function moveSelectionBy(dir: -1 | 1): void {
  const items = menuFor(screen)
  const next = moveSelection(items.length, selected, dir)
  if (next === selected) return
  selected = next
  audio.play('ui-tick')
}

/**
 * ←/→ move the selected slider one step. On any other row the press does nothing: the settings
 * screen mixes sliders with plain rows, and a left/right there must not move the selection.
 */
function adjustVolume(dir: -1 | 1): void {
  const item = menuFor(screen)[selected]
  if (!isVolumeRow(item)) return
  const row = item.id === 'music' ? 'music' : 'effects'
  const next = nudgeVolume(volumes, row, dir)
  if (next === volumes) return
  volumes = next
  audio.setVolume(row, volumes[row])
  saveVolumes(storage(), volumes)
  audio.play('ui-tick')
}

/** Confirm the selected row. A run that starts or restarts begins from a clean level. */
function confirm(id: MenuId | undefined): void {
  if (id === undefined) return
  const outcome = activate(screen, id)
  if (outcome.controls) {
    controls.show()
    audio.play('ui-open')
    return
  }
  if (outcome.restart) resetGame()
  show(outcome.screen)
}

/** The menu the renderer draws: the screen's rows, the selection, and the numbers it shows. */
function menuView(): MenuView | null {
  if (screen === 'level') return null
  return {
    screen,
    items: menuFor(screen),
    index: selected,
    music: volumes.music,
    effects: volumes.effects,
    runSeconds: sim.frames / 60,
    bestSeconds: save.bestSeconds,
  }
}

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return

  // The browser starts audio only inside a real gesture. Unlock first, so the sound this very press
  // raises plays. A pad's synthetic key is not a gesture and cannot unlock.
  if (event.isTrusted) audio.unlock()

  // Any key dismisses the card, and the press that dismisses it is not also a game input — otherwise
  // reading the controls costs the player a jump.
  if (controls.visible()) {
    event.preventDefault()
    controls.hide()
    audio.play('ui-close')
    return
  }

  if (event.code === 'KeyH') {
    event.preventDefault()
    controls.show()
    audio.play('ui-open')
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

  // The debug overlay owns the backtick and O. P is the spec's pause key whether the overlay is on
  // screen or not — it used to be split by visibility, which with the overlay on by default in the
  // dev build would have left the play gates with no pause at all.
  overlay.onKeyDown(event)

  // A menu screen owns every key: a stray press on the title must not start a run, and one on the
  // pause must not move Pip. The three that work everywhere — H, F and dismissing the controls card
  // — are handled above this point.
  if (screen !== 'level') {
    event.preventDefault()
    menuKey(event.code)
    return
  }

  if (event.code === 'Escape' || event.code === 'KeyP') {
    event.preventDefault()
    releaseAll()
    show('pause')
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

// A click is a gesture too: a player who clicks the page before pressing a key hears the game.
window.addEventListener('pointerdown', (event) => {
  if (event.isTrusted) audio.unlock()
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
  audio.setHidden(document.hidden)
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

/**
 * The overlay's view of the world, pushed from both the frame loop and the browser check's `step`
 * seam — a seam run never yields a frame, so without this the readout would lag a scripted play by
 * however many steps it took between animation frames.
 */
function pushOverlay(stats: { fps: number; frameMs: number; frameP99Ms: number; steps: number }): void {
  const oldest = sim.field.echoes.reduce((min, e) => Math.min(min, e.life), Number.POSITIVE_INFINITY)
  overlay.update({
    ...stats,
    x: sim.player.x,
    y: sim.player.y,
    vx: sim.player.vx,
    vy: sim.player.vy,
    grounded: sim.player.grounded,
    power: sim.power,
    meter: sim.player.meter,
    echoes: sim.field.echoes.length,
    charge: sim.field.airCharges,
    life: Number.isFinite(oldest) ? oldest : 0,
    level: levelId,
    checkpoint: {
      exists: sim.checkpoint !== null,
      claimed:
        sim.checkpoint !== null &&
        sim.respawn.x === sim.checkpoint.x &&
        sim.respawn.y === sim.checkpoint.y,
    },
    // A finished run outranks the death pop: the flag is reached, the tally is up, and reporting
    // DEAD there would send a bug report after the wrong state.
    runState: sim.goalReached ? 'clear' : juice.dying() ? 'dead' : 'playing',
  })
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

  // The music sounds only while the game runs: not paused, not behind the controls card, not frozen,
  // not after the flag. It keeps its place across a stop, and only a new run rewinds it.
  audio.setMusic(!isHalted() && !controls.visible() && !sim.goalReached)

  // The sign's hint, once per run.
  if (sim.signSeen && !signShown) {
    signShown = true
    showSignHint()
  }

  // Record the run once it is finished: the first finish, and every faster one after it.
  if (sim.goalReached && !recorded) {
    recorded = true
    const next = recordBest(save, sim.frames / 60)
    if (next !== save) {
      save = next
      storeSave(storage(), save)
    }
  }

  // The flag hands the run to the results screen, which carries the time and the best time.
  if (sim.goalReached && screen === 'level') show('results')

  renderer.draw({
    map,
    player: sim.player,
    prevX,
    prevY,
    echoes: sim.field.echoes,
    enemies: sim.enemies.enemies,
    mushrooms: sim.powers.mushrooms,
    usedBlocks: sim.usedBlocks,
    paused: isPaused(),
    runSeconds: sim.frames / 60,
    bestSeconds: save.bestSeconds,
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
    menu: menuView(),
  })

  pushOverlay(frameStats(frameMs, steps))

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
    /** The pose being drawn, so the browser check can assert what Pip looks like. */
    pose: animator.pose,
    poseFrame: animator.frame,
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
  /** The screen that is up. Only `level` steps the simulation. */
  screen(): GameScreen
  /** The menu on screen: its rows and the selected index. Null while the level plays. */
  menu(): { screen: GameScreen; index: number; items: string[] } | null
  /** Go to a screen the way a player would, without the sound — the screenshot tool's shortcut. */
  openScreen(name: GameScreen): void
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
  juice(): {
    hitStop: number
    deathHold: number
    shake: number
    shakeX: number
    shakeY: number
    heldSteps: number
    sx: number
    sy: number
    dust: number
  }
  /** Opaque pixels per parallax layer above and below the haze line. */
  layers(): { name: string; above: number; below: number }[]
  /** The level's tile rows, for the seam and gap probes. */
  tiles(): readonly string[]
  /** The overlay panel (tally or pause) on the play canvas, or null when none is up. */
  overlayBox(): { x: number; y: number; w: number; h: number } | null
  /** The inks the overlay panel may contain: panel, rim and the font's colours. */
  overlayInks(): string[]
  /** The lines the overlay panel drew on the last frame. */
  overlayLines(): string[]
  /** The camera's integer scroll, for the flicker probe. */
  cameraX(): number
  /** The sky gradient's colour at a screen row — what a gap must show. */
  skyAt(y: number): [number, number, number]
  /** World boxes of what the readability check measures: Pip, the ground under him, enemies, ? blocks, Echoes and their rings. */
  elements(): { name: string; x: number; y: number; w: number; h: number }[]
  /**
   * The sound engine as the browser check sees it: lock state, the `?audiolog=1` trace, the volumes
   * the settings hold and the gains the audio graph holds, the bus levels read before the volume,
   * the music position, and the pause panel's volume rows.
   */
  audio(): {
    state: string
    unlocked: boolean
    ready: boolean
    log: { t: number; event: string; recipe: string; played: boolean }[] | null
    volumes: { music: number; effects: number }
    gains: { music: number; effects: number } | null
    levels: { music: number; effects: number }
    musicTime: number
    menu: { open: boolean; row: string }
  }
}

const api: EchoSkyRunTestApi = {
  echoAtX: LEVEL_1_1_ECHO_AT_X,
  palette: PALETTE,
  pause() {
    screen = 'pause'
    selected = 0
    renderAlpha = 1
  },
  resume() {
    screen = 'level'
    frozen = false
    seamHalted = false
    tabHidden = false
    renderAlpha = null
  },
  reset() {
    resetGame()
    screen = 'level'
    selected = 0
    renderAlpha = null
  },
  screen: () => screen,
  menu: () => {
    if (screen === 'level') return null
    const items = menuFor(screen)
    return { screen, index: selected, items: items.map((item) => item.label) }
  },
  openScreen(name) {
    resetGame()
    screen = name
    selected = 0
    seamHalted = false
    frozen = false
    renderAlpha = null
  },
  step(input) {
    // Take over the simulation: a seam step must not race the live frame loop. It goes through the
    // same advance() as the loop, so the pose and the juice follow — but never holds: a seam step is
    // always exactly one simulation step.
    seamHalted = true
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
    // The overlay repaints on the frame loop, which a seam run never reaches between steps.
    pushOverlay(frameStats(0, 1))
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
    // The overlay is a canvas, so the field map comes from the overlay itself rather than the DOM.
    fields: { ...overlay.values() },
    spawnUrl: overlay.lastSpawnUrl(),
  }),
  paused: () => isPaused(),
  frozen: () => frozen,
  hold() {
    seamHalted = false
    frozen = true
    renderAlpha = 1
  },
  juice: () => {
    const o = juice.shakeOffset()
    const scale = juice.pipScale()
    return {
      hitStop: juice.hitStop,
      deathHold: juice.deathHold,
      shake: juice.shake,
      shakeX: o.x,
      shakeY: o.y,
      heldSteps,
      sx: scale.sx,
      sy: scale.sy,
      dust: juice.particles.filter((p) => p.active && p.kind === 'dust').length,
    }
  },
  layers: () => renderer.layerCoverage(),
  tiles: () => map.tiles,
  overlayBox: () => renderer.overlayBox,
  overlayInks: () => [INK.panel, INK.brass, INK.brassLight, INK.cream, INK.echo],
  overlayLines: () => [...renderer.overlayLines],
  cameraX: () => renderer.cameraX,
  elements: () => {
    const out: { name: string; x: number; y: number; w: number; h: number }[] = []
    const p = sim.player
    out.push({ name: 'pip', x: p.x, y: p.y, w: PLAYER_W, h: p.h })
    const feetRow = Math.floor((p.y + p.h) / TILE)
    if (tileAt(map, Math.floor(p.x / TILE), feetRow) === '#') {
      out.push({ name: 'ground', x: Math.floor(p.x / TILE) * TILE - TILE, y: feetRow * TILE, w: 3 * TILE, h: TILE })
    }
    for (const e of sim.enemies.enemies) {
      const name = e.kind === 'gear-goomba' ? 'gear-goomba' : e.mode === 'walk' ? 'steam-turtle' : 'shell'
      out.push({ name, x: e.x, y: e.y, w: e.w, h: e.h })
    }
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        if (tileAt(map, col, row) === '?') out.push({ name: 'qblock', x: col * TILE, y: row * TILE, w: TILE, h: TILE })
      }
    }
    for (const e of sim.field.echoes) {
      out.push({ name: 'echo-platform', x: e.x, y: e.y, w: e.w, h: e.h })
      // The ring sits above the ghost: same placement as the renderer, ghost height from Pip's form.
      const ghostH = (sim.power === 'super' ? 28 : 16) + 2
      out.push({ name: 'echo-ring', x: e.x + (e.w - 13) / 2, y: e.y - ghostH + 1 - 14, w: 13, h: 13 })
    }
    return out
  },
  skyAt: (y: number) => skyColourAt(y),
  audio: () => ({
    state: audio.state,
    unlocked: audio.unlocked,
    ready: audio.ready,
    log: audio.log === null ? null : audio.log.map((e) => ({ ...e })),
    volumes: audio.volumes(),
    gains: audio.gains(),
    levels: audio.levels(),
    musicTime: audio.musicTime(),
    menu: { open: screen !== 'level', row: menuFor(screen)[selected]?.id ?? '' },
  }),
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
