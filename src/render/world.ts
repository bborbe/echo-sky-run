// The world half of the renderer: everything drawn inside the game's camera — the baked level
// tiles, props, blocks, enemies, Echoes, Pip and the juice's effects. Extracted so a still preview
// can paint into its own offscreen canvas with the same code the live frame uses, instead of a
// second renderer that would drift from it.
//
// It owns no canvas of its own: every method draws into the context and camera it is handed, so the
// live renderer and the preview cache share one painter and one set of baked art.

import { ECHO_BLINK_F, ECHO_LIFE_F, type Echo } from '../echo/echo.ts'
import type { Enemy } from '../game/enemies.ts'
import type { Mushroom, PowerTier } from '../game/power.ts'
import { SMALL_W, TILE } from '../physics/constants.ts'
import type { PlayerState } from '../physics/player.ts'
import { CHECKPOINT, GOAL, isOneWay, isSolid, QUESTION, SIGN, tileAt, type TileMap } from '../physics/tilemap.ts'
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
  /** The juice the loop is running. */
  readonly juice: Juice
}

/** Draw-ready frames for every animation, both facings. */
type Atlas = ReadonlyMap<string, Baked>

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
    for (const mushroom of state.mushrooms) this.drawMushroom(ctx, mushroom)
    for (const enemy of state.enemies) this.drawEnemy(ctx, enemy, state.tick)
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

  /** The sign, the checkpoint and the goal: tall props standing on their own tile. */
  private drawProps(ctx: CanvasRenderingContext2D, viewW: number, camX: number, state: WorldState): void {
    const map = state.map
    const first = Math.max(0, Math.floor(camX / TILE) - 2)
    const last = Math.min(map.cols - 1, Math.ceil((camX + viewW) / TILE) + 2)
    const wave = Math.floor(state.tick / 10)
    for (let row = 0; row < map.rows; row++) {
      for (let col = first; col <= last; col++) {
        const ch = tileAt(map, col, row)
        const x = col * TILE
        const floor = (row + 1) * TILE
        if (ch === SIGN) {
          const img = this.frame('sign', 0, 1)
          ctx.drawImage(img, x, floor - img.height)
        } else if (ch === CHECKPOINT) {
          const img = this.frame(state.checkpointClaimed ? 'checkpoint-claimed' : 'checkpoint-open', wave, 1)
          ctx.drawImage(img, x, floor - img.height)
        } else if (ch === GOAL) {
          const img = this.frame('goal-flag', wave, 1)
          ctx.drawImage(img, x, floor - img.height)
        }
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

  private drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, tick: number): void {
    const facing: -1 | 1 = enemy.vx > 0 ? -1 : 1
    let img: HTMLCanvasElement
    if (enemy.kind === 'gear-goomba') {
      img = this.frame('goomba-walk', Math.floor(tick / 10), facing)
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
