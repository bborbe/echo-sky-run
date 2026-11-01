import { ECHO_BLINK_F, ECHO_LIFE_F, type Echo } from '../echo/echo.ts'
import type { Enemy } from '../game/enemies.ts'
import type { Mushroom, PowerTier } from '../game/power.ts'
import { SMALL_W, TILE } from '../physics/constants.ts'
import type { PlayerState } from '../physics/player.ts'
import { CHECKPOINT, GOAL, isOneWay, isSolid, QUESTION, SIGN, tileAt, type TileMap } from '../physics/tilemap.ts'
import { CATALOGUE, animation } from './art/catalogue.ts'
import { FONT, GLYPH_GAP, GLYPH_W, OVERLAY_TEXT, textWidth } from './art/font.ts'
import { ECHO_KEYS, RING_SIZE, SPAWN_RING_RADII, ghostMask, litSegments, spawnRingMask } from './art/fx.ts'
import type { Mask } from './art/mask.ts'
import { INK, SKY, type InkName } from './art/palette.ts'
import { PIP_SMALL, PIP_SUPER, type PipPose } from './art/pip.ts'
import { tileMask, tileShape } from './art/tiles.ts'
import { bake, paint, type Baked } from './atlas.ts'
import { spriteOrigin } from './anchor.ts'
import { Background } from './background.ts'
import { Camera, VIEW_H } from './camera.ts'
import { Juice } from './juice.ts'

/**
 * The logical view height is fixed at 14 tiles. The scale is `window height / VIEW_H` and may be
 * fractional; the logical width follows from the window's aspect, so a wider window shows more of
 * the level rather than bigger pixels. Nothing is letterboxed.
 */
export { VIEW_H }


/**
 * The colours the browser check looks for on the canvases. Exported so the check asserts these
 * instead of repeating literals — a colour tweak then cannot fail the check for the wrong reason.
 * `sky` is on the painted `#sky` canvas; the rest are on the pixel `#game` canvas.
 */
export const PALETTE = {
  sky: SKY.top,
  ground: INK.earth,
  groundTop: INK.grass,
  pip: INK.fur,
  echoFill: INK.echo,
  echoOutline: INK.echoEdge,
} as const

/** Every colour the painted background uses — the Echo's dark edge must read against each one. */
export const BACKGROUND_COLOURS: readonly string[] = Object.values(SKY)

export interface RenderState {
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
  readonly goalReached: boolean
  /** The player paused, or the tab is hidden. */
  readonly paused: boolean
  readonly runSeconds: number
  /** The best time from localStorage, or null before the first finish. */
  readonly bestSeconds: number | null
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
  readonly juice: Juice
  /** The volume rows, shown on the pause panel when the player paused; null hides them. */
  readonly volumeMenu?: VolumeMenuView | null
}

/** What the pause panel's volume rows show: two 0..1 levels and the selected row. */
export interface VolumeMenuView {
  readonly music: number
  readonly effects: number
  readonly row: 'music' | 'effects'
}

/** Segments in a volume bar, one per slider step. */
const BAR_SEGMENTS = 10
const SEGMENT_W = 4
const SEGMENT_H = 5

/** Draw-ready frames for every animation, both facings. */
type Atlas = ReadonlyMap<string, Baked>

export class Renderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly background: Background
  private viewW = VIEW_H
  /** Scroll offset, in its own pure module so the framing is a unit test. */
  private readonly camera = new Camera()
  private readonly atlas: Atlas
  private readonly ghosts = new Map<string, Baked>()
  private readonly flashGhosts = new Map<string, Baked>()
  private readonly rings: readonly HTMLCanvasElement[]
  private readonly spawnRings: readonly HTMLCanvasElement[]
  /** Font glyphs baked per ink, on first use. */
  private readonly glyphs = new Map<InkName, Map<string, HTMLCanvasElement>>()
  /** The level's static tiles, baked once per map. */
  private level: { map: TileMap; canvas: HTMLCanvasElement } | null = null

  constructor(canvas: HTMLCanvasElement, sky: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.canvas = canvas
    this.ctx = ctx
    this.background = new Background(sky)
    const atlas = new Map<string, Baked>()
    for (const anim of CATALOGUE) atlas.set(anim.name, bake(anim.frames, anim.keys))
    this.atlas = atlas
    this.rings = animation('echo-timer-ring').frames.map((m) => paint(m, ECHO_KEYS))
    this.spawnRings = SPAWN_RING_RADII.map((r) => paint(spawnRingMask(r), ECHO_KEYS))
    this.fit()
  }

  /** Current logical view width in pixels. */
  get width(): number {
    return this.viewW
  }

  /** Opaque pixels per parallax layer above and below the haze line — the browser check's layer probe. */
  layerCoverage(): { name: string; above: number; below: number }[] {
    return this.background.layerCoverage()
  }

  /** The camera's scroll, for the browser check's flicker probe. */
  get cameraX(): number {
    return Math.round(this.camera.x)
  }

  /**
   * Size the canvases to the window. The pixel canvas's backing store is `viewW x 224` logical
   * pixels, stretched over the whole window and drawn nearest-neighbour, so there are never bars.
   */
  fit(): void {
    const scale = Math.max(window.innerHeight, 1) / VIEW_H
    const viewW = Math.max(TILE, Math.round(window.innerWidth / scale))

    this.viewW = viewW
    this.camera.setViewWidth(viewW)
    this.canvas.width = viewW
    this.canvas.height = VIEW_H
    this.canvas.style.width = `${window.innerWidth}px`
    this.canvas.style.height = `${window.innerHeight}px`
    // `imageSmoothingEnabled` governs drawImage inside the canvas; the browser's upscale of the
    // element is a separate filter, and `auto` would bilinearly blur every pixel.
    this.canvas.style.imageRendering = 'pixelated'
    this.ctx.imageSmoothingEnabled = false
    this.background.fit(viewW, window.innerWidth, window.innerHeight)
  }

  draw(state: RenderState): void {
    const ctx = this.ctx
    const juice = state.juice
    // Draw between the last two fixed steps, so a display faster than 60 Hz does not judder.
    const px = state.prevX + (state.player.x - state.prevX) * state.alpha
    const py = state.prevY + (state.player.y - state.prevY) * state.alpha

    // The death pop plays where Pip fell: the camera waits for it rather than jumping to the respawn.
    if (!juice.dying()) {
      this.camera.update(px, py, state.player.h, state.map.cols * TILE, state.map.rows * TILE)
    }
    const shake = juice.shakeOffset()
    const camX = Math.round(this.camera.x) - shake.x
    const camY = Math.round(this.camera.y) - shake.y

    this.background.draw(camX, camY, juice.dying() ? [] : state.echoes)

    ctx.clearRect(0, 0, this.viewW, VIEW_H)
    ctx.save()
    ctx.translate(-camX, -camY)
    this.drawLevel(state.map)
    this.drawProps(state)
    this.drawBlocks(state)
    for (const mushroom of state.mushrooms) this.drawMushroom(mushroom)
    for (const enemy of state.enemies) this.drawEnemy(enemy, state.tick)
    if (!juice.dying()) for (const echo of state.echoes) this.drawEcho(echo, state)
    this.drawEffects(juice)
    if (!juice.dying()) this.drawPlayer(px, py, state)
    this.drawParticles(juice)
    ctx.restore()

    this.overlayBox = null
    this.overlayLines.length = 0
    if (state.goalReached) this.drawTally(state.runSeconds, state.bestSeconds)
    else if (state.paused) this.drawPaused(state.volumeMenu ?? null)
  }

  /** A frame of a catalogue animation, for a facing. */
  private frame(name: string, index: number, facing: -1 | 1): HTMLCanvasElement {
    const baked = this.atlas.get(name)
    if (!baked) throw new Error(`no baked animation ${name}`)
    const frames = facing === 1 ? baked.right : baked.left
    return frames[((index % frames.length) + frames.length) % frames.length]
  }

  /** Bake the level's static tiles once: every solid cell, auto-tiled by its open sides. */
  private drawLevel(map: TileMap): void {
    if (this.level === null || this.level.map !== map) {
      const canvas = document.createElement('canvas')
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
      this.level = { map, canvas }
    }
    this.ctx.drawImage(this.level.canvas, 0, 0)
  }

  /** The sign, the checkpoint and the goal: tall props standing on their own tile. */
  private drawProps(state: RenderState): void {
    const map = state.map
    const cam = this.camera.x
    const first = Math.max(0, Math.floor(cam / TILE) - 2)
    const last = Math.min(map.cols - 1, Math.ceil((cam + this.viewW) / TILE) + 2)
    const wave = Math.floor(state.tick / 10)
    for (let row = 0; row < map.rows; row++) {
      for (let col = first; col <= last; col++) {
        const ch = tileAt(map, col, row)
        const x = col * TILE
        const floor = (row + 1) * TILE
        if (ch === SIGN) {
          const img = this.frame('sign', 0, 1)
          this.ctx.drawImage(img, x, floor - img.height)
        } else if (ch === CHECKPOINT) {
          const img = this.frame(state.checkpointClaimed ? 'checkpoint-claimed' : 'checkpoint-open', wave, 1)
          this.ctx.drawImage(img, x, floor - img.height)
        } else if (ch === GOAL) {
          const img = this.frame('goal-flag', wave, 1)
          this.ctx.drawImage(img, x, floor - img.height)
        }
      }
    }
  }

  /** ? blocks: a shimmer every couple of seconds while full, flat bronze once used, a bump when hit. */
  private drawBlocks(state: RenderState): void {
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
        this.ctx.drawImage(img, col * TILE, row * TILE - lift)
      }
    }
  }

  private drawMushroom(m: Mushroom): void {
    this.ctx.drawImage(this.frame('mushroom', 0, 1), Math.round(m.x), Math.round(m.y))
  }

  private drawEnemy(enemy: Enemy, tick: number): void {
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
    this.ctx.drawImage(img, o.x, o.y)
  }

  private ghost(pose: PipPose, frame: number, facing: -1 | 1, superForm: boolean, flash: boolean): HTMLCanvasElement {
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
  private drawEcho(echo: Echo, state: RenderState): void {
    // Blink at 8 f intervals during the last ECHO_BLINK_F frames (spec § 9).
    const blinking = echo.life <= ECHO_BLINK_F
    const hidden = blinking && Math.floor(echo.life / 4) % 2 === 0
    const ctx = this.ctx
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

  private drawEffects(juice: Juice): void {
    const ctx = this.ctx
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
        const bottom = Math.min(e.y, this.camera.y + VIEW_H + 4)
        ctx.drawImage(img, Math.round(e.x - img.width / 2), Math.round(bottom - img.height + pose.dy))
      }
    }
  }

  private drawPlayer(px: number, py: number, state: RenderState): void {
    // Invincibility after a hit: Pip blinks (spec § 9).
    if (state.invuln > 0 && Math.floor(state.invuln / 4) % 2 === 0) return
    const name = `pip-${state.power === 'super' ? 'super' : 'small'}-${state.pose}`
    const img = this.frame(name, state.poseFrame, state.facing)
    const { sx, sy } = state.juice.pipScale()
    const w = Math.round(img.width * sx)
    const h = Math.round(img.height * sy)
    const o = spriteOrigin({ x: px, y: py, w: SMALL_W, h: state.player.h }, w, h)
    this.ctx.drawImage(img, o.x, o.y, w, h)
  }

  private drawParticles(juice: Juice): void {
    for (const p of juice.particles) {
      if (!p.active) continue
      const t = p.age / p.life
      if (p.kind === 'dust') {
        this.ctx.drawImage(this.frame('dust', Math.floor(t * 4), 1), Math.round(p.x), Math.round(p.y))
      } else {
        this.ctx.drawImage(this.frame('echo-spark', Math.floor(t * 3), 1), Math.round(p.x) - 1, Math.round(p.y) - 1)
      }
    }
  }

  /** One line of pixel text, its top-left on whole pixels, every glyph pixel a palette ink. */
  private text(line: string, x: number, y: number, ink: InkName): void {
    let cache = this.glyphs.get(ink)
    if (!cache) {
      cache = new Map()
      this.glyphs.set(ink, cache)
    }
    let gx = Math.round(x)
    const gy = Math.round(y)
    for (const ch of line) {
      let img = cache.get(ch)
      if (!img) {
        const glyph = FONT[ch] ?? FONT[' ']
        img = paint(glyph, { '#': ink })
        cache.set(ch, img)
      }
      this.ctx.drawImage(img, gx, gy)
      gx += GLYPH_W + GLYPH_GAP
    }
  }

  /** A line of pixel text centred on `cx`. */
  private centred(line: string, cx: number, y: number, ink: InkName): void {
    this.overlayLines.push(line)
    this.text(line, Math.round(cx - textWidth(line) / 2), y, ink)
  }

  /** An opaque panel with a brass rim — text on it sits on one known colour, never on the world. */
  private panel(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx
    ctx.fillStyle = INK.brass
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = INK.panel
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2)
  }

  /** The overlay panel's box, for the browser check's text probe. Null when no overlay is up. */
  overlayBox: { x: number; y: number; w: number; h: number } | null = null
  /** The lines the overlay drew this frame, for the browser check. */
  readonly overlayLines: string[] = []

  /**
   * A pause has to look like one, or a player cannot tell a stopped game from a broken one. It also
   * names the way back to the controls card (play gate 1: "esc ... where is not option to show
   * keybind again"); H opens the card from here and dismissing it returns to the pause.
   */
  private drawPaused(menu: VolumeMenuView | null): void {
    const w = Math.max(textWidth(OVERLAY_TEXT.pausedHint), menu ? textWidth(OVERLAY_TEXT.volumeHint) : 0) + 20
    const h = menu ? 86 : 46
    const x = Math.round((this.viewW - w) / 2)
    const y = Math.round((VIEW_H - h) / 2)
    this.panel(x, y, w, h)
    this.overlayBox = { x, y, w, h }
    this.centred(OVERLAY_TEXT.paused, x + w / 2, y + 8, 'brassLight')
    this.centred(OVERLAY_TEXT.pausedHint, x + w / 2, y + 21, 'echo')
    this.centred(OVERLAY_TEXT.pausedControls, x + w / 2, y + 32, 'echo')
    if (menu) {
      this.volumeRow(OVERLAY_TEXT.music, menu.music, menu.row === 'music', x + w / 2, y + 47)
      this.volumeRow(OVERLAY_TEXT.effects, menu.effects, menu.row === 'effects', x + w / 2, y + 58)
      this.centred(OVERLAY_TEXT.volumeHint, x + w / 2, y + 72, 'echo')
    }
  }

  /**
   * One slider: a marker on the selected row, the label, a 10-segment bar and the level as a number.
   * The drawn line is recorded as `MUSIC 50` so the browser check reads exactly what is on screen.
   */
  private volumeRow(label: string, level: number, selected: boolean, cx: number, y: number): void {
    const labelW = textWidth(OVERLAY_TEXT.effects)
    const barW = BAR_SEGMENTS * (SEGMENT_W + 1) - 1
    const number = String(Math.round(level * 100))
    const rowW = textWidth('>') + 4 + labelW + 6 + barW + 6 + textWidth('100')
    let gx = Math.round(cx - rowW / 2)
    if (selected) this.text('>', gx, y, 'brassLight')
    gx += textWidth('>') + 4
    this.text(label, gx, y, selected ? 'brassLight' : 'cream')
    gx += labelW + 6
    const lit = Math.round(level * BAR_SEGMENTS)
    for (let i = 0; i < BAR_SEGMENTS; i++) {
      this.ctx.fillStyle = i < lit ? INK.brassLight : INK.brass
      const segH = i < lit ? SEGMENT_H : 1
      this.ctx.fillRect(gx + i * (SEGMENT_W + 1), y + 1 + SEGMENT_H - segH, SEGMENT_W, segH)
    }
    gx += barW + 6
    this.text(number, gx, y, 'cream')
    this.overlayLines.push(`${label} ${number}`)
  }

  /**
   * The level-clear tally: this run's time, the best time, and the way out. The prompt matters as
   * much as the numbers — the run is frozen, so without it a player who wants another go has no
   * visible way to start one (operator playtest, 2026-11-01). Pixel font on an opaque panel, the
   * prompt in bright cyan: play gate 1 found the old system-font text soft and its hint too dim.
   */
  private drawTally(runSeconds: number, bestSeconds: number | null): void {
    const w = Math.min(this.viewW - 32, 220)
    const h = 76
    const x = Math.round((this.viewW - w) / 2)
    const y = Math.round((VIEW_H - h) / 2)
    this.panel(x, y, w, h)
    this.overlayBox = { x, y, w, h }
    const cx = x + w / 2
    this.centred(OVERLAY_TEXT.clear, cx, y + 9, 'brassLight')
    this.centred(`${OVERLAY_TEXT.time} ${formatTime(runSeconds)}`, cx, y + 25, 'cream')
    this.centred(
      bestSeconds === null ? OVERLAY_TEXT.noBest : `${OVERLAY_TEXT.best} ${formatTime(bestSeconds)}`,
      cx,
      y + 37,
      'cream',
    )
    this.centred(OVERLAY_TEXT.clearHint, cx, y + 58, 'echo')
  }
}

/** A run time as `M:SS.t` — the shape the spec's HUD shows. Integer maths throughout, because a
 *  float remainder truncates: 5.1 seconds renders `0:05.0` if you take `(rest - whole) * 10`. */
export function formatTime(seconds: number): string {
  const tenths = Math.floor(seconds * 10)
  const minutes = Math.floor(tenths / 600)
  const whole = Math.floor((tenths % 600) / 10)
  const tenth = tenths % 10
  return `${minutes}:${String(whole).padStart(2, '0')}.${tenth}`
}
