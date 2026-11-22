// The world half of the renderer: everything drawn inside the game's camera — the baked level
// tiles, props, blocks, enemies, Echoes, Pip and the juice's effects. Extracted so a still preview
// can paint into its own offscreen canvas with the same code the live frame uses, instead of a
// second renderer that would drift from it.
//
// It owns no canvas of its own: every method draws into the context and camera it is handed, so the
// live renderer and the preview cache share one painter and one set of baked art.

import { ECHO_BLINK_F, ECHO_LIFE_F, type Echo } from '../echo/echo.ts'
import type { Enemy } from '../game/enemies.ts'
import type { NimbusField } from '../game/nimbus.ts'
import type { Mushroom, PowerTier } from '../game/power.ts'
import { DOOR_H, switchPressed, type Door, type EchoSwitch, type SwitchField } from '../game/switches.ts'
import { PLAYER_W, SMALL_W, TILE } from '../physics/constants.ts'
import type { PlayerState } from '../physics/player.ts'
import {
  CHECKPOINT,
  DOOR,
  ECHO_SWITCH,
  GEAR_GOOMBA,
  GOAL,
  NIMBUS,
  QUESTION,
  SIGN,
  SPAWN,
  STEAM_TURTLE,
  isOneWay,
  isSolid,
  tileAt,
  type TileMap,
} from '../physics/tilemap.ts'
import { CATALOGUE, animation } from './art/catalogue.ts'
import { ECHO_KEYS, RING_SIZE, SPAWN_RING_RADII, ghostMask, litSegments, spawnRingMask } from './art/fx.ts'
import type { Mask } from './art/mask.ts'
import { INK } from './art/palette.ts'
import { PIP_SMALL, PIP_SUPER, type PipPose } from './art/pip.ts'
import { tileMask, tileShape } from './art/tiles.ts'
import { bake, paint, type Baked } from './atlas.ts'
import { spriteOrigin } from './anchor.ts'
import { VIEW_H } from './camera.ts'
import { Juice } from './juice.ts'

/**
 * Everything the world painter reads from a frame. `RenderState` adds the shell's own fields (the
 * menu, the run timer), so the painter can also be driven by a preview's opening state.
 */
export interface WorldState {
  readonly map: TileMap
  readonly player: PlayerState
  /** The player's position at the previous fixed step, blended with the current one by `alpha`. */
  readonly prevX: number
  readonly prevY: number
  readonly echoes: readonly Echo[]
  readonly enemies: readonly Enemy[]
  readonly mushrooms: readonly Mushroom[]
  /** ? blocks already emptied, keyed "col,row". */
  readonly usedBlocks: ReadonlySet<string>
  readonly tick: number
  /** Blend factor between the last two fixed steps. */
  readonly alpha: number
  readonly power: PowerTier
  /** Invincibility frames left: Pip blinks while it runs. */
  readonly invuln: number
  readonly checkpointClaimed: boolean
  /** Pip's pose, from the shell's animator. */
  readonly pose: PipPose
  readonly poseFrame: number
  readonly facing: -1 | 1
  /** Echo switches and the doors they hold open. Drawn from these boxes, never re-derived from tiles. */
  readonly switches: SwitchField
  /** Nimbus, the companion mount: where it waits, whether Pip rides it, and whether it has fled. */
  readonly nimbus: NimbusField
  /** The juice the loop is running. */
  readonly juice: Juice
  /**
   * Test-only: extra catalogue sprites drawn at fixed spots. The `?fixture=world1-new` scene fills it
   * with one of every new world-1 sprite, so the screenshot review and readability check can measure
   * art the shipped level does not place yet.
   */
  readonly fixture?: readonly FixtureSprite[]
}

/** One sprite the fixture scene draws at a fixed world position, its box matching the baked frame. */
export interface FixtureSprite {
  readonly name: string
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** Draw-ready frames for every animation, both facings. */
type Atlas = ReadonlyMap<string, Baked>

/** Resolve a baked catalogue frame — a prop painter's only route to the art. */
export type FrameLookup = (name: string, index: number, facing: -1 | 1) => HTMLCanvasElement

/** A prop tile's cell: its left edge, the floor it stands on, and a time-driven frame index. */
export interface PropCell {
  readonly x: number
  /** The y of the cell's bottom edge — a feet-anchored prop's last row. */
  readonly floor: number
  /** A frame index derived from the tick, so a waving prop needs no clock of its own. */
  readonly wave: number
}

/** Paint one prop tile. */
export type PropPainter = (
  ctx: CanvasRenderingContext2D,
  cell: PropCell,
  frame: FrameLookup,
  state: WorldState,
) => void

/** The door the sim placed at this box, or undefined when the cell carries no door. */
function doorAt(state: WorldState, x: number, y: number): Door | undefined {
  for (const door of state.switches.doors) if (door.x === x && door.y === y) return door
  return undefined
}

/** The switch the sim placed at this box. */
function switchAt(state: WorldState, x: number, y: number): EchoSwitch | undefined {
  for (const sw of state.switches.switches) if (sw.x === x && sw.y === y) return sw
  return undefined
}

/**
 * One shared box for the renderer's "is a switch pressed" read. `PlayerState` carries no width, so
 * the box is built the way the sim builds it; it is filled per call and never retained.
 */
const PRESS_BOX = { x: 0, y: 0, w: PLAYER_W, h: 0 }

function pressBox(player: PlayerState): typeof PRESS_BOX {
  PRESS_BOX.x = player.x
  PRESS_BOX.y = player.y
  PRESS_BOX.h = player.h
  return PRESS_BOX
}

const DRAW_SIGN: PropPainter = (ctx, cell, frame) => {
  const img = frame('sign', 0, 1)
  ctx.drawImage(img, cell.x, cell.floor - img.height)
}

const DRAW_CHECKPOINT: PropPainter = (ctx, cell, frame, state) => {
  const img = frame(state.checkpointClaimed ? 'checkpoint-claimed' : 'checkpoint-open', cell.wave, 1)
  ctx.drawImage(img, cell.x, cell.floor - img.height)
}

const DRAW_GOAL: PropPainter = (ctx, cell, frame) => {
  const img = frame('goal-flag', cell.wave, 1)
  ctx.drawImage(img, cell.x, cell.floor - img.height)
}

/** How bright an idle switch plate reads — the art ships one frame, so lit-versus-idle is the alpha. */
const SWITCH_IDLE_ALPHA = 0.6

/**
 * The Echo switch: a blue-geared plate, lit while Pip or an Echo stands on it. Lit is the same
 * `switchPressed` read the sim steps the doors from, so the plate cannot show pressed while the door
 * it holds stays shut.
 */
const DRAW_ECHO_SWITCH: PropPainter = (ctx, cell, frame, state) => {
  const sw = switchAt(state, cell.x, cell.floor - TILE)
  const pressed = sw !== undefined && switchPressed(sw, pressBox(state.player), state.echoes)
  const img = frame('echo-switch', 0, 1)
  ctx.globalAlpha = pressed ? 1 : SWITCH_IDLE_ALPHA
  ctx.drawImage(img, sw?.x ?? cell.x, sw?.y ?? cell.floor - TILE)
  ctx.globalAlpha = 1
}

/** How solid an open door still reads — the art ships one frame, so open is a faded portal. */
const DOOR_OPEN_ALPHA = 0.25

/**
 * The Echo door: drawn on exactly the box `closedDoors` hands the player's collision, so the wall a
 * player walks into and the wall they see are the same rectangle. An open door keeps the sprite at a
 * ghost's alpha — a portal that is visibly no longer a barrier.
 */
const DRAW_ECHO_DOOR: PropPainter = (ctx, cell, frame, state) => {
  const door = doorAt(state, cell.x, cell.floor - DOOR_H)
  const img = frame('echo-door', 0, 1)
  ctx.globalAlpha = door?.open === true ? DOOR_OPEN_ALPHA : 1
  ctx.drawImage(img, door?.x ?? cell.x, door?.y ?? cell.floor - DOOR_H)
  ctx.globalAlpha = 1
}

/**
 * Every tile character `drawProps` paints, and the painter that draws it. This map is the only place
 * a prop tile is registered, so a shipped level using a character with no entry here fails
 * `tile-coverage.test.ts` by name instead of shipping an invisible prop.
 */
export const PROP_TILES: ReadonlyMap<string, PropPainter> = new Map([
  [SIGN, DRAW_SIGN],
  [CHECKPOINT, DRAW_CHECKPOINT],
  [GOAL, DRAW_GOAL],
  [ECHO_SWITCH, DRAW_ECHO_SWITCH],
  [DOOR, DRAW_ECHO_DOOR],
])

/**
 * The tile characters that spawn a moving entity rather than standing a prop on the cell: Pip's
 * spawn, the enemies and Nimbus. Each is drawn from the sim's own list, so a character listed here
 * with no spawner — or a spawner with no entry here — is a level character nothing ever shows.
 */
export const ENTITY_TILES: ReadonlyMap<string, 'player' | 'enemy' | 'nimbus'> = new Map([
  [SPAWN, 'player'],
  [GEAR_GOOMBA, 'enemy'],
  [STEAM_TURTLE, 'enemy'],
  [NIMBUS, 'nimbus'],
])

export class WorldPainter {
  private readonly atlas: Atlas
  private readonly ghosts = new Map<string, Baked>()
  private readonly flashGhosts = new Map<string, Baked>()
  private readonly rings: readonly HTMLCanvasElement[]
  private readonly spawnRings: readonly HTMLCanvasElement[]
  /**
   * The static tiles of each map, baked once. A WeakMap, so a reset's discarded map is collected
   * rather than accumulating a canvas per restart, while a preview's cached map keeps its bake.
   */
  private readonly levels = new WeakMap<TileMap, HTMLCanvasElement>()
  /**
   * The prop painters' route to the art, bound once. A module-level table cannot hold `this`, so the
   * lookup is passed in — and it is a field rather than a per-frame closure so a frame allocates
   * nothing here.
   */
  private readonly frameLookup: FrameLookup = (name, index, facing) => this.frame(name, index, facing)

  constructor() {
    const atlas = new Map<string, Baked>()
    for (const anim of CATALOGUE) atlas.set(anim.name, bake(anim.frames, anim.keys))
    this.atlas = atlas
    this.rings = animation('echo-timer-ring').frames.map((m) => paint(m, ECHO_KEYS))
    this.spawnRings = SPAWN_RING_RADII.map((r) => paint(spawnRingMask(r), ECHO_KEYS))
  }

  /**
   * Draw one frame of the world into `ctx`, clearing it first and translating to the camera. The
   * camera is a parameter rather than painter state, so the live frame and a preview still can be
   * drawn from the same painter at different scrolls.
   */
  draw(ctx: CanvasRenderingContext2D, viewW: number, camX: number, camY: number, state: WorldState): void {
    const juice = state.juice
    // Draw between the last two fixed steps, so a display faster than 60 Hz does not judder.
    const px = state.prevX + (state.player.x - state.prevX) * state.alpha
    const py = state.prevY + (state.player.y - state.prevY) * state.alpha

    ctx.clearRect(0, 0, viewW, VIEW_H)
    ctx.save()
    ctx.translate(-camX, -camY)
    this.drawLevel(ctx, state.map)
    this.drawProps(ctx, viewW, camX, state)
    this.drawBlocks(ctx, state)
    this.drawFixture(ctx, state)
    for (const mushroom of state.mushrooms) this.drawMushroom(ctx, mushroom)
    for (const enemy of state.enemies) this.drawEnemy(ctx, enemy, state.tick)
    this.drawNimbus(ctx, state)
    if (!juice.dying()) for (const echo of state.echoes) this.drawEcho(ctx, echo, state)
    this.drawEffects(ctx, camY, juice)
    if (!juice.dying()) this.drawPlayer(ctx, px, py, state)
    this.drawParticles(ctx, juice)
    ctx.restore()
  }

  /** A frame of a catalogue animation, for a facing. */
  private frame(name: string, index: number, facing: -1 | 1): HTMLCanvasElement {
    const baked = this.atlas.get(name)
    if (!baked) throw new Error(`no baked animation ${name}`)
    const frames = facing === 1 ? baked.right : baked.left
    return frames[((index % frames.length) + frames.length) % frames.length]
  }

  /** Bake the level's static tiles once: every solid cell, auto-tiled by its open sides. */
  private drawLevel(ctx: CanvasRenderingContext2D, map: TileMap): void {
    let canvas = this.levels.get(map)
    if (canvas === undefined) {
      canvas = document.createElement('canvas')
      canvas.width = map.cols * TILE
      canvas.height = map.rows * TILE
      const lctx = canvas.getContext('2d')
      if (!lctx) throw new Error('no 2d context')
      const cache = new Map<string, HTMLCanvasElement>()
      for (let row = 0; row < map.rows; row++) {
        for (let col = 0; col < map.cols; col++) {
          const ch = tileAt(map, col, row)
          if (ch === QUESTION) continue
          if (isSolid(ch)) {
            const shape = tileShape(map, col, row)
            const key = JSON.stringify(shape)
            let img = cache.get(key)
            if (!img) {
              img = paint(tileMask(shape), animation('tile-top').keys)
              cache.set(key, img)
            }
            lctx.drawImage(img, col * TILE, row * TILE)
          } else if (isOneWay(ch)) {
            lctx.fillStyle = INK.outline
            lctx.fillRect(col * TILE, row * TILE, TILE, 5)
            lctx.fillStyle = INK.brass
            lctx.fillRect(col * TILE, row * TILE + 1, TILE, 3)
          }
        }
      }
      this.levels.set(map, canvas)
    }
    ctx.drawImage(canvas, 0, 0)
  }

  /** The sign, the checkpoint, the goal, the Echo switch and its door: sprites standing on their cell. */
  private drawProps(ctx: CanvasRenderingContext2D, viewW: number, camX: number, state: WorldState): void {
    const map = state.map
    const first = Math.max(0, Math.floor(camX / TILE) - 2)
    const last = Math.min(map.cols - 1, Math.ceil((camX + viewW) / TILE) + 2)
    const wave = Math.floor(state.tick / 10)
    for (let row = 0; row < map.rows; row++) {
      for (let col = first; col <= last; col++) {
        const paint = PROP_TILES.get(tileAt(map, col, row))
        if (paint === undefined) continue
        paint(ctx, { x: col * TILE, floor: (row + 1) * TILE, wave }, this.frameLookup, state)
      }
    }
  }

  /** ? blocks: a shimmer every couple of seconds while full, flat bronze once used, a bump when hit. */
  private drawBlocks(ctx: CanvasRenderingContext2D, state: WorldState): void {
    const map = state.map
    // Shimmer frames 1 and 2 play briefly once every 96 ticks; frame 0 the rest of the time.
    const phase = state.tick % 96
    const shimmer = phase < 6 ? 1 : phase < 12 ? 2 : 0
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        if (tileAt(map, col, row) !== QUESTION) continue
        const used = state.usedBlocks.has(`${col},${row}`)
        const lift = state.juice.blockLift(col, row)
        const img = used ? this.frame('qblock-used', 0, 1) : this.frame('qblock-full', shimmer, 1)
        ctx.drawImage(img, col * TILE, row * TILE - lift)
      }
    }
  }

  private drawMushroom(ctx: CanvasRenderingContext2D, m: Mushroom): void {
    ctx.drawImage(this.frame('mushroom', 0, 1), Math.round(m.x), Math.round(m.y))
  }

  /**
   * Nimbus, the companion mount. It waits where the level placed it until Pip rides it — then it is
   * drawn under his feet, since it carries him — and it is absent entirely while a throw-off has it
   * fleeing.
   */
  private drawNimbus(ctx: CanvasRenderingContext2D, state: WorldState): void {
    const field = state.nimbus
    const n = field.nimbus
    if (n === null || n.flee > 0) return
    const img = this.frame('nimbus-fly', Math.floor(state.tick / 8), 1)
    const box = field.mounted
      ? { x: state.player.x, y: state.player.y, w: PLAYER_W, h: state.player.h }
      : { x: n.x, y: n.y, w: n.w, h: n.h }
    const o = spriteOrigin(box, img.width, img.height)
    ctx.drawImage(img, o.x, o.y)
  }

  /** The `?fixture=world1-new` scene: one of every new sprite, drawn at its fixed spot. */
  private drawFixture(ctx: CanvasRenderingContext2D, state: WorldState): void {
    if (state.fixture === undefined) return
    const wave = Math.floor(state.tick / 10)
    for (const s of state.fixture) {
      ctx.drawImage(this.frame(s.name, wave, 1), Math.round(s.x), Math.round(s.y))
    }
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, tick: number): void {
    const facing: -1 | 1 = enemy.vx > 0 ? -1 : 1
    let img: HTMLCanvasElement
    if (enemy.kind === 'gear-goomba') {
      img = this.frame('goomba-walk', Math.floor(tick / 10), facing)
    } else if (enemy.kind === 'spike-beetle') {
      img = this.frame('spike-beetle-walk', Math.floor(tick / 10), facing)
    } else if (enemy.kind === 'gust-wing') {
      img = this.frame('gust-wing-fly', Math.floor(tick / 8), facing)
    } else if (enemy.kind === 'chaser-bot') {
      img = this.frame('chaser-bot-walk', Math.floor(tick / 10), facing)
    } else if (enemy.mode === 'walk') {
      img = this.frame('turtle-walk', Math.floor(tick / 10), facing)
    } else if (enemy.mode === 'sliding') {
      img = this.frame('turtle-shell-kicked', Math.floor(tick / 3), facing)
    } else {
      img = this.frame('turtle-shell', 0, 1)
    }
    const o = spriteOrigin(enemy, img.width, img.height)
    ctx.drawImage(img, o.x, o.y)
  }

  private ghost(
    pose: PipPose,
    frame: number,
    facing: -1 | 1,
    superForm: boolean,
    flash: boolean,
  ): HTMLCanvasElement {
    const set = superForm ? PIP_SUPER : PIP_SMALL
    const frames = set[pose]
    const i = ((frame % frames.length) + frames.length) % frames.length
    const key = `${superForm ? 'super' : 'small'}-${pose}-${i}`
    const cache = flash ? this.flashGhosts : this.ghosts
    let baked = cache.get(key)
    if (!baked) {
      const mask: Mask = ghostMask(frames[i])
      baked = bake([flash ? mask.map((row) => row.replace(/[ckr]/g, 'w')) : mask], ECHO_KEYS)
      cache.set(key, baked)
    }
    return facing === 1 ? baked.right[0] : baked.left[0]
  }

  /**
   * An Echo: Pip's ghost in the pose he placed it in, the platform he can stand on, and the timer
   * ring above showing the life left. It flashes white as it appears and blinks in its last second.
   */
  private drawEcho(ctx: CanvasRenderingContext2D, echo: Echo, state: WorldState): void {
    // Blink at 8 f intervals during the last ECHO_BLINK_F frames (spec § 9).
    const blinking = echo.life <= ECHO_BLINK_F
    const hidden = blinking && Math.floor(echo.life / 4) % 2 === 0
    const x = Math.round(echo.x)
    const y = Math.round(echo.y)

    let g = state.juice.ghosts.find((gh) => gh.x === echo.x && gh.y === echo.y)
    if (g === undefined) g = { x: echo.x, y: echo.y, pose: 'idle', frame: 0, facing: 1, superForm: false }
    const flash = echo.life > ECHO_LIFE_F - 6
    const ghost = this.ghost(g.pose, g.frame, g.facing, g.superForm, flash)
    const gx = x + Math.round((echo.w - ghost.width) / 2)
    const gy = y - ghost.height + 1

    ctx.globalAlpha = hidden ? 0.25 : blinking ? 0.5 : 0.75
    ctx.drawImage(ghost, gx, gy)
    ctx.globalAlpha = hidden ? 0.45 : 1
    ctx.drawImage(this.frame(hidden ? 'echo-fading' : 'echo-platform', hidden ? 1 : 0, 1), x, y)
    ctx.globalAlpha = 1

    const ring = this.rings[litSegments(echo.life)]
    ctx.drawImage(ring, x + Math.round((echo.w - RING_SIZE) / 2), gy - RING_SIZE - 1)
  }

  private drawEffects(ctx: CanvasRenderingContext2D, camY: number, juice: Juice): void {
    for (const e of juice.effects) {
      if (!e.active) continue
      if (e.kind === 'goomba-flat') {
        const img = this.frame('goomba-squash', 0, e.facing)
        // Fades over its last few frames instead of popping out.
        ctx.globalAlpha = Math.min(1, (e.life - e.age) / 6)
        ctx.drawImage(img, Math.round(e.x - img.width / 2), Math.round(e.y - img.height))
        ctx.globalAlpha = 1
      } else if (e.kind === 'spawn-ring') {
        const img = this.spawnRings[Math.min(e.age, this.spawnRings.length - 1)]
        ctx.globalAlpha = 1 - e.age / e.life
        ctx.drawImage(img, Math.round(e.x - img.width / 2), Math.round(e.y - 6 - img.height / 2))
        ctx.globalAlpha = 1
      } else if (e.kind === 'fizzle') {
        const img = this.frame('echo-refused', Math.floor(e.age / 4), 1)
        ctx.drawImage(img, Math.round(e.x - img.width / 2), Math.round(e.y - img.height / 2))
      } else if (e.kind === 'death') {
        const pose = Juice.deathPose(e.age)
        const img = this.frame(e.superForm ? 'pip-super-death' : 'pip-small-death', pose.frame, 1)
        // A pit death happens below the view; the pop starts from the view's bottom edge instead.
        const bottom = Math.min(e.y, camY + VIEW_H + 4)
        ctx.drawImage(img, Math.round(e.x - img.width / 2), Math.round(bottom - img.height + pose.dy))
      }
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, px: number, py: number, state: WorldState): void {
    // Invincibility after a hit: Pip blinks (spec § 9).
    if (state.invuln > 0 && Math.floor(state.invuln / 4) % 2 === 0) return
    const name = `pip-${state.power === 'super' ? 'super' : 'small'}-${state.pose}`
    const img = this.frame(name, state.poseFrame, state.facing)
    const { sx, sy } = state.juice.pipScale()
    const w = Math.round(img.width * sx)
    const h = Math.round(img.height * sy)
    const o = spriteOrigin({ x: px, y: py, w: SMALL_W, h: state.player.h }, w, h)
    ctx.drawImage(img, o.x, o.y, w, h)
  }

  private drawParticles(ctx: CanvasRenderingContext2D, juice: Juice): void {
    for (const p of juice.particles) {
      if (!p.active) continue
      const t = p.age / p.life
      if (p.kind === 'dust') {
        ctx.drawImage(this.frame('dust', Math.floor(t * 4), 1), Math.round(p.x), Math.round(p.y))
      } else {
        ctx.drawImage(this.frame('echo-spark', Math.floor(t * 3), 1), Math.round(p.x) - 1, Math.round(p.y) - 1)
      }
    }
  }
}
