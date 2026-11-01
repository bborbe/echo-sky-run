import { BUILD_LABEL } from './build-info.ts'
import { createSim, stepSim, type SimInput, type SimState } from './game/sim.ts'
import { LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_ROWS } from './levels/level1-1.ts'
import { FixedStepper } from './physics/loop.ts'
import { parseLevel } from './physics/tilemap.ts'
import { Renderer, PALETTE } from './render/renderer.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('missing #game canvas')

const map = parseLevel(LEVEL_1_1_ROWS)
const renderer = new Renderer(canvas)
window.addEventListener('resize', () => renderer.fit())

const stepper = new FixedStepper()
let sim: SimState = createSim(map)
let prevX = sim.player.x
let prevY = sim.player.y
let paused = false
let tick = 0

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
  if (document.hidden) releaseAll()
})

let last = performance.now()

function frame(now: number): void {
  const elapsed = (now - last) / 1000
  last = now

  if (!paused) {
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

  renderer.draw({
    map,
    player: sim.player,
    prevX,
    prevY,
    echoes: sim.field.echoes,
    enemies: sim.enemies.enemies,
    mushrooms: sim.powers.mushrooms,
    usedBlocks: sim.usedBlocks,
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
}

;(window as unknown as { __echoSkyRun: EchoSkyRunTestApi }).__echoSkyRun = api

// Surface the build label once, so a screenshot or the console shows which commit is live.
console.info(`echo-sky-run ${BUILD_LABEL}`)
