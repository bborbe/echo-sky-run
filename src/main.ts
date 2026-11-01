import { BUILD_LABEL } from './build-info.ts'
import { createSim, stepSim, type SimInput, type SimState } from './game/sim.ts'
import { LEVEL_1_1_ECHO_AT_X, LEVEL_1_1_ROWS } from './levels/level1-1.ts'
import { FixedStepper } from './physics/loop.ts'
import { parseLevel } from './physics/tilemap.ts'
import { Renderer } from './render/renderer.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('missing #game canvas')

const map = parseLevel(LEVEL_1_1_ROWS)
const renderer = new Renderer(canvas)
renderer.fit()
window.addEventListener('resize', () => renderer.fit())

const stepper = new FixedStepper()
let sim: SimState = createSim(map)
let paused = false
let tick = 0

const held = new Set<string>()
const edge = { jump: false, echo: false }

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
  held.clear()
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
      stepSim(sim, readInput())
      // An edge is consumed by the first fixed step that sees it.
      edge.jump = false
      edge.echo = false
      tick += 1
    })
  }

  renderer.draw(map, sim.player, sim.field.echoes, tick)
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
  pause(): void
  reset(): void
  step(input: Partial<SimInput>): ReturnType<typeof snapshot>
  state(): ReturnType<typeof snapshot>
}

const api: EchoSkyRunTestApi = {
  echoAtX: LEVEL_1_1_ECHO_AT_X,
  pause() {
    paused = true
  },
  reset() {
    resetGame()
  },
  step(input) {
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
