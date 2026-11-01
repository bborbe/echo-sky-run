import { describe, expect, it } from 'vitest'
import { ECHO_LIFE_F } from '../echo/echo.ts'
import { createEnemy, GEAR_GOOMBA_H, SHELL_H, SHELL_W, type Enemy } from '../game/enemies.ts'
import { createSim, stepSim, type SimInput, type SimState } from '../game/sim.ts'
import { NO_INPUT } from '../physics/player.ts'
import { parseLevel } from '../physics/tilemap.ts'
import { LEVEL_1_1_ROWS } from '../levels/level1-1.ts'
import { SoundWatcher } from './events.ts'
import type { SoundEvent } from './recipes.ts'

const IDLE: SimInput = { ...NO_INPUT, echoPressed: false }

/** Open floor with the goal at the far right. */
const FLAT = parseLevel([
  '....................',
  '....................',
  '....................',
  '.S.................F',
  '####################',
])

/** A ? block over the spawn, as in the power tests. */
const BLOCK_MAP = parseLevel([
  '..........',
  '..?.......',
  '..........',
  '..S......F',
  '##########',
])

/** A checkpoint two tiles right of the spawn. */
const CHECKPOINT_MAP = parseLevel([
  '..........',
  '..........',
  '..........',
  '.S..C....F',
  '##########',
])

/** A pit right of the spawn: walking right falls in. */
const PIT_MAP = parseLevel([
  '..........',
  '..........',
  '..........',
  '.S.......F',
  '###....###',
])

type Script = (step: number, sim: SimState) => SimInput

/** Drive `steps` fixed steps through the watcher, the way `advance()` in main.ts does. */
function play(sim: SimState, steps: number, script: Script, watcher = new SoundWatcher()): SoundEvent[][] {
  const heard: SoundEvent[][] = []
  for (let i = 0; i < steps; i++) {
    const input = script(i, sim)
    watcher.before(sim, input)
    stepSim(sim, input)
    heard.push([...watcher.after(sim, input)])
  }
  return heard
}

/** Let Pip fall onto the floor and stand, so a scenario starts grounded. */
function settled(map: ReturnType<typeof parseLevel>): SimState {
  const sim = createSim(map)
  for (let i = 0; i < 30; i++) stepSim(sim, IDLE)
  expect(sim.player.grounded).toBe(true)
  return sim
}

const all = (heard: SoundEvent[][]): SoundEvent[] => heard.flat()
const count = (heard: SoundEvent[][], e: SoundEvent): number => all(heard).filter((x) => x === e).length

describe('sound events from the fixed step', () => {
  it('raises nothing while Pip stands still', () => {
    expect(all(play(settled(FLAT), 120, () => IDLE))).toEqual([])
  })

  it('raises one jump on the frame the jump fires, and one land when he comes down', () => {
    const heard = play(settled(FLAT), 90, (i) => ({ ...IDLE, jump: i < 20, jumpPressed: i === 0 }))
    expect(heard[0]).toContain('jump')
    expect(count(heard, 'jump')).toBe(1)
    expect(count(heard, 'land')).toBe(1)
    const landAt = heard.findIndex((e) => e.includes('land'))
    expect(landAt).toBeGreaterThan(10)
  })

  it('hears a jump pressed just before landing, when the buffer fires it on touchdown', () => {
    const sim = settled(FLAT)
    const heard = play(sim, 120, (i, s) => {
      // First jump, then press again while still falling a few pixels above the floor.
      const late = i > 5 && !s.player.grounded && s.player.vy > 0 && s.player.y > 40
      return { ...IDLE, jump: true, jumpPressed: i === 0 || late }
    })
    expect(count(heard, 'jump')).toBeGreaterThanOrEqual(2)
  })

  it('places an Echo mid-air, refuses a second with no charge, and hears it expire once', () => {
    const sim = settled(FLAT)
    const heard = play(sim, ECHO_LIFE_F + 60, (i) => ({
      ...IDLE,
      jump: i < 10,
      jumpPressed: i === 0,
      echoPressed: i === 8 || i === 10,
    }))
    expect(heard[8]).toContain('echo-place')
    expect(heard[10]).toContain('echo-refuse')
    expect(count(heard, 'echo-place')).toBe(1)
    expect(count(heard, 'echo-refuse')).toBe(1)
    expect(count(heard, 'echo-expire')).toBe(1)
    expect(heard.findIndex((e) => e.includes('echo-expire'))).toBe(8 + ECHO_LIFE_F - 1)
  })

  it('bumps the ? block, raises the Mushroom, and hears it collected', () => {
    const sim = settled(BLOCK_MAP)
    const watcher = new SoundWatcher()
    const heard: SoundEvent[][] = []
    // Same driver as the power tests: jump into the block, then chase the Mushroom as it walks right.
    for (let i = 0; i < 90 && sim.powers.mushrooms.length === 0; i++) {
      heard.push(...play(sim, 1, () => ({ ...IDLE, jump: true, jumpPressed: i === 0 }), watcher))
    }
    const bumpAt = heard.findIndex((e) => e.includes('block'))
    expect(bumpAt).toBeGreaterThan(0)
    expect(heard[bumpAt]).toContain('mushroom-appear')

    for (let i = 0; i < 400 && sim.power === 'small'; i++) {
      heard.push(...play(sim, 1, () => ({ ...IDLE, right: true }), watcher))
    }
    expect(sim.power).toBe('super')
    expect(count(heard, 'block')).toBe(1)
    expect(count(heard, 'mushroom-collect')).toBe(1)
  })

  it('hears a stomp', () => {
    const sim = settled(FLAT)
    sim.player.y -= 40
    sim.player.vy = 1
    const goomba: Enemy = createEnemy('gear-goomba', sim.player.x, sim.player.y + sim.player.h + 2)
    goomba.vx = 0
    sim.enemies.enemies.push(goomba)
    const heard = play(sim, 10, () => IDLE)
    expect(count(heard, 'stomp')).toBe(1)
    expect(goomba.y).toBeGreaterThan(0)
    expect(GEAR_GOOMBA_H).toBe(16)
  })

  it('hears a resting shell kicked away', () => {
    const sim = settled(FLAT)
    const shell = createEnemy('steam-turtle', sim.player.x + 20, sim.player.y + sim.player.h - SHELL_H)
    shell.mode = 'shell'
    shell.w = SHELL_W
    shell.h = SHELL_H
    shell.vx = 0
    sim.enemies.enemies.push(shell)
    const heard = play(sim, 40, () => ({ ...IDLE, right: true }))
    expect(count(heard, 'shell-kick')).toBe(1)
    expect(shell.mode).toBe('sliding')
  })

  it('hears a power-down, not a death, when Super Pip is hit', () => {
    const sim = settled(FLAT)
    sim.power = 'super'
    sim.player.y -= 12
    sim.player.h = 26
    const walker = createEnemy('gear-goomba', sim.player.x + 24, sim.player.y + sim.player.h - 16)
    sim.enemies.enemies.push(walker)
    const heard = play(sim, 60, () => IDLE)
    expect(count(heard, 'power-down')).toBe(1)
    expect(count(heard, 'death')).toBe(0)
    expect(sim.power).toBe('small')
  })

  it('hears a death, and nothing else on that step, when Small Pip is hit', () => {
    const sim = settled(FLAT)
    const walker = createEnemy('gear-goomba', sim.player.x + 24, sim.player.y + sim.player.h - 16)
    sim.enemies.enemies.push(walker)
    const heard = play(sim, 60, () => IDLE)
    const deathAt = heard.findIndex((e) => e.includes('death'))
    expect(deathAt).toBeGreaterThan(0)
    expect(heard[deathAt]).toEqual(['death'])
    expect(count(heard, 'power-down')).toBe(0)
  })

  it('hears a death in a pit, and no landing on the respawn', () => {
    const sim = settled(PIT_MAP)
    const heard = play(sim, 120, () => ({ ...IDLE, right: true }))
    const deathAt = heard.findIndex((e) => e.includes('death'))
    expect(deathAt).toBeGreaterThan(0)
    expect(heard[deathAt]).toEqual(['death'])
  })

  it('hears the checkpoint once, the first time it is claimed', () => {
    const sim = settled(CHECKPOINT_MAP)
    const heard = play(sim, 120, (i) => ({ ...IDLE, right: i < 40, left: i >= 60 && i < 80 }))
    expect(count(heard, 'checkpoint')).toBe(1)
  })

  it('hears the goal once, and nothing after the run is frozen', () => {
    const sim = settled(FLAT)
    const heard = play(sim, 600, () => ({ ...IDLE, right: true }))
    const goalAt = heard.findIndex((e) => e.includes('goal'))
    expect(goalAt).toBeGreaterThan(0)
    expect(count(heard, 'goal')).toBe(1)
    expect(all(heard.slice(goalAt + 1))).toEqual([])
  })

  it('raises 1-1 events along a plain run of the real level', () => {
    const sim = createSim(parseLevel(LEVEL_1_1_ROWS))
    const heard = play(sim, 400, (i) => ({ ...IDLE, right: true, jump: true, jumpPressed: i % 40 === 0 }))
    expect(count(heard, 'jump')).toBeGreaterThan(0)
    expect(count(heard, 'land')).toBeGreaterThan(0)
  })

  it('reuses one event list across steps (the step path allocates nothing)', () => {
    const sim = settled(FLAT)
    const watcher = new SoundWatcher()
    const list = watcher.events
    for (let i = 0; i < 60; i++) {
      const input = { ...IDLE, jump: true, jumpPressed: i % 20 === 0 }
      watcher.before(sim, input)
      stepSim(sim, input)
      expect(watcher.after(sim, input)).toBe(list)
    }
  })
})
