import { describe, expect, it } from 'vitest'
import { NO_INPUT } from '../physics/player.ts'
import { PLAYER_W } from '../physics/constants.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { createSim, stepSim, type SimInput } from './sim.ts'

// Play gate 3, row 2 (Echo). Two operator reports, both driven here through the real step function —
// no hand-set velocity, no hand-set `grounded` — because AGENTS.md forbids a test that sets a flag
// the game does not produce:
//   1. "if I run and jump and spawn the echo, then I normally slide off the echo"
//   2. "but I can't press jump that passed again to jump directly from the freshly spawned echo"

const IDLE: SimInput = { ...NO_INPUT, echoPressed: false }

/** A wide, tall, open sky over a floor, with the spawn and the goal far apart. */
const MAP = parseLevel([
  '........................................',
  '........................................',
  '........................................',
  '........................................',
  'S.....................................F.',
  '########################################',
])

/** Run right on the floor until the P-meter is full, so the jump that follows is a sprint jump. */
function chargeSprint(sim: ReturnType<typeof createSim>): void {
  for (let i = 0; i < 200 && sim.player.meter < 112; i++) stepSim(sim, { ...IDLE, right: true })
}

describe('landing on a freshly placed Echo at speed', () => {
  it('keeps Pip on it when he releases the run key — he does not slide off', () => {
    const sim = createSim(MAP)
    chargeSprint(sim)

    // The operator's sequence: run, jump, spawn the Echo on the way up, come down onto it.
    // 18 frames after take-off is the moment a player who presses jump and Echo together places it,
    // and it lands him near the platform's right edge — the landing the report describes.
    let landedFrame = -1
    let platformX = 0
    let platformY = 0
    let platformW = 0
    for (let i = 0; i < 200; i++) {
      stepSim(sim, {
        ...IDLE,
        right: true,
        sprint: true,
        jump: i < 12,
        jumpPressed: i === 0,
        echoPressed: i === 18,
      })
      if (sim.player.onPlatform && sim.field.echoes.length > 0) {
        landedFrame = i
        platformX = sim.field.echoes[0].x
        platformY = sim.field.echoes[0].y
        platformW = sim.field.echoes[0].w
        break
      }
    }

    // A landing that never happened cannot fire the assertion below, so it is asserted first: a
    // missed placement must fail loudly, not pass as "he stayed".
    expect(landedFrame, 'the Echo must catch Pip — otherwise this test cannot fire').toBeGreaterThanOrEqual(0)

    // He lands and lets go of everything, which is what the report describes: the slide happens with
    // no key held, carried by the speed he arrived with.
    for (let i = 0; i < 60; i++) stepSim(sim, IDLE)

    expect(sim.player.grounded, 'still standing, not falling to the floor').toBe(true)
    expect(sim.player.onPlatform, 'still on the Echo, not on the level floor').toBe(true)
    expect(sim.player.y + sim.player.h, 'feet still on the Echo top').toBeCloseTo(platformY, 6)
    expect(sim.player.x + PLAYER_W).toBeGreaterThan(platformX)
    expect(sim.player.x).toBeLessThan(platformX + platformW)
  })
})

describe('jumping off a freshly placed Echo', () => {
  it('takes a jump that was already held through the landing, with no release-and-press', () => {
    const sim = createSim(MAP)
    chargeSprint(sim)

    // The operator holds jump for the whole hop — the natural thing when you jump onto the Echo and
    // want straight back off it. Today that hold is a single keydown edge, spent on the first jump,
    // so landing produces no new press and the Echo becomes a trap. A held jump rises higher than the
    // 12-frame tap the slide test uses, so the Echo is placed later — 32 frames after take-off — for
    // the same landing on it.
    let landedFrame = -1
    for (let i = 0; i < 200; i++) {
      stepSim(sim, {
        ...IDLE,
        right: true,
        sprint: true,
        jump: true,
        jumpPressed: i === 0,
        echoPressed: i === 32,
      })
      if (sim.player.onPlatform && sim.field.echoes.length > 0) {
        landedFrame = i
        break
      }
    }
    expect(landedFrame, 'the Echo must catch Pip — otherwise this test cannot fire').toBeGreaterThanOrEqual(0)

    // From here: jump stays held, no new press, the run key released.
    let jumped = false
    for (let i = 0; i < 10; i++) {
      stepSim(sim, { ...IDLE, jump: true, jumpPressed: false })
      if (sim.player.vy < 0 && !sim.player.grounded) {
        jumped = true
        break
      }
    }

    expect(jumped, 'a held jump lifts him off the Echo without a release-and-press').toBe(true)
  })
})
