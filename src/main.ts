import { BUILD_LABEL } from './build-info.ts'
import { createSim, stepSim, type SimInput, type SimState } from './game/sim.ts'
import { LEVEL_1_1_ROWS } from './levels/level1-1.ts'
import { FixedStepper } from './physics/loop.ts'
import { parseLevel } from './physics/tilemap.ts'
import { Renderer } from './render/renderer.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('missing #game canvas')

const map = parseLevel(LEVEL_1_1_ROWS)
const renderer = new Renderer(canvas)
renderer.fit()
window.addEventListener('resize', () => renderer.fit())

let sim: SimState = createSim(map)
let paused = false
let tick = 0

const held = new Set<string>()
const edge = { jump: false, echo: false }

function readInput(): SimInput {
  return {
    left: held.has('ArrowLeft') || held.has('KeyA'),
    right: held.has('ArrowRight') || held.has('KeyD'),
    jump: held.has('Space') || held.has('ArrowUp') || held.has('KeyW'),
    jumpPressed: edge.jump,
    sprint: held.has('ShiftLeft') || held.has('ShiftRight'),
    echoPressed: edge.echo,
  }
}

window.addEventListener('keydown', (event) => {
  if (event.repeat) return
  if (event.code === 'Space') edge.jump = true
  if (event.code === 'KeyC') edge.echo = true
  held.add(event.code)
  if (event.code === 'KeyR') sim = createSim(map)
  event.preventDefault()
})

window.addEventListener('keyup', (event) => {
  held.delete(event.code)
})

const stepper = new FixedStepper()
let last = performance.now()

function frame(now: number): void {
  const elapsed = (now - last) / 1000
  last = now

  if (!paused) {
    stepper.advance(elapsed, () => {
      stepSim(sim, readInput(), map)
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

/**
 * Test seam. The browser test drives the same `stepSim` the frame loop uses, one fixed step at a
 * time, so the level can be played deterministically without depending on frame timing.
 */
interface EchoSkyRunTestApi {
  pause(): void
  reset(): void
  step(input: Partial<SimInput>): ReturnType<typeof snapshot>
  state(): ReturnType<typeof snapshot>
}

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

const api: EchoSkyRunTestApi = {
  pause() {
    paused = true
  },
  reset() {
    sim = createSim(map)
    tick = 0
  },
  step(input) {
    stepSim(
      sim,
      {
        left: false,
        right: false,
        jump: false,
        jumpPressed: false,
        sprint: false,
        echoPressed: false,
        ...input,
      },
      map,
    )
    tick += 1
    return snapshot()
  },
  state: snapshot,
}

;(window as unknown as { __echoSkyRun: EchoSkyRunTestApi }).__echoSkyRun = api

// Surface the build label once, so a screenshot or the console shows which commit is live.
console.info(`echo-sky-run ${BUILD_LABEL}`)
