import { isBlinking, type Echo } from '../echo/echo.ts'
import type { Enemy } from '../game/enemies.ts'
import type { Mushroom } from '../game/power.ts'
import { PLAYER_H, PLAYER_W, TILE } from '../physics/constants.ts'
import type { PlayerState } from '../physics/player.ts'
import { CHECKPOINT, GOAL, isOneWay, isSolid, QUESTION, SIGN, tileAt, type TileMap } from '../physics/tilemap.ts'

/**
 * The logical view height is fixed at 14 tiles. The scale is `window height / VIEW_H` and may be
 * fractional; the logical width follows from the window's aspect, so a wider window shows more of
 * the level rather than bigger pixels. Nothing is letterboxed.
 */
export const VIEW_H = 224

/** The camera lets Pip drift this far either side of the view's centre before it follows. */
export const CAMERA_DEADZONE_X = 16
/** The camera scrolls vertically once Pip is this close to the top or bottom edge. */
export const CAMERA_MARGIN_Y = 48

const SKY = '#7fc4e8'
const SKY_LOW = '#b9e2f2'
const GROUND = '#3f7a3a'
const GROUND_TOP = '#6fbf5a'
const PLANK = '#b5854a'
const FLAG = '#f2f2f2'
const FLAG_POLE = '#8a8a8a'
const PIP_BODY = '#e8663c'
const PIP_VISOR = '#2b3a4a'
const ECHO_BODY = 'rgba(120, 220, 255, 0.55)'
const GOOMBA_BODY = '#8c4a2f'
const GOOMBA_EYE = '#f2f2f2'
const TURTLE_BODY = '#2f7a4a'
const SHELL_BODY = '#c9a227'
const QUESTION_BLOCK = '#c9a227'
const USED_BLOCK = '#8a6f1e'
const MUSHROOM_CAP = '#d94a2b'
const MUSHROOM_STEM = '#f2e8d0'
const CHECKPOINT_POLE = '#8a8a8a'
const CHECKPOINT_FLAG = '#5dbb63'

/**
 * The renderer's palette. Exported so the browser check asserts these colours instead of repeating
 * the literals — a colour tweak then cannot fail the check for the wrong reason.
 */
export const PALETTE = {
  sky: SKY,
  skyLow: SKY_LOW,
  ground: GROUND,
  groundTop: GROUND_TOP,
  plank: PLANK,
  flag: FLAG,
  flagPole: FLAG_POLE,
  pip: PIP_BODY,
  visor: PIP_VISOR,
} as const

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
  readonly runSeconds: number
  /** The best time from localStorage, or null before the first finish. */
  readonly bestSeconds: number | null
  readonly tick: number
  /** Blend factor between the last two fixed steps. */
  readonly alpha: number
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private viewW = VIEW_H
  /** Set from the frame's state, because the tile pass needs it to draw an emptied ? block. */
  private usedBlocks: ReadonlySet<string> = new Set()
  private camX = 0
  private camY = 0

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.canvas = canvas
    this.ctx = ctx
    this.fit()
  }

  /** Current logical view width in pixels. */
  get width(): number {
    return this.viewW
  }

  /**
   * Size the canvas to the window. The backing store is `viewW x 224` logical pixels; the element is
   * stretched over the whole window and drawn nearest-neighbour, so there are never any bars.
   */
  fit(): void {
    const scale = Math.max(window.innerHeight, 1) / VIEW_H
    const viewW = Math.max(TILE, Math.round(window.innerWidth / scale))

    this.viewW = viewW
    this.canvas.width = viewW
    this.canvas.height = VIEW_H
    this.canvas.style.width = `${window.innerWidth}px`
    this.canvas.style.height = `${window.innerHeight}px`
    // `imageSmoothingEnabled` governs drawImage inside the canvas; the browser's upscale of the
    // element is a separate filter, and `auto` would bilinearly blur every pixel.
    this.canvas.style.imageRendering = 'pixelated'
    this.ctx.imageSmoothingEnabled = false
  }

  draw(state: RenderState): void {
    const ctx = this.ctx
    // Draw between the last two fixed steps, so a display faster than 60 Hz does not judder.
    const px = state.prevX + (state.player.x - state.prevX) * state.alpha
    const py = state.prevY + (state.player.y - state.prevY) * state.alpha

    this.updateCamera(state.map, px, py)
    this.usedBlocks = state.usedBlocks

    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H)
    sky.addColorStop(0, SKY)
    sky.addColorStop(1, SKY_LOW)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, this.viewW, VIEW_H)

    ctx.save()
    ctx.translate(-Math.round(this.camX), -Math.round(this.camY))
    this.drawTiles(state.map)
    for (const echo of state.echoes) this.drawEcho(echo, state.tick)
    for (const enemy of state.enemies) this.drawEnemy(enemy)
    for (const mushroom of state.mushrooms) this.drawMushroom(mushroom)
    this.drawPlayer(px, py, state.player.h)
    ctx.restore()

    if (state.goalReached) this.drawTally(state.runSeconds, state.bestSeconds)
  }

  /** The level-clear tally: this run's time and the best time, in screen space over the level. */
  private drawTally(runSeconds: number, bestSeconds: number | null): void {
    const ctx = this.ctx
    const w = Math.min(this.viewW - 32, 200)
    const h = 64
    const x = Math.round((this.viewW - w) / 2)
    const y = Math.round((VIEW_H - h) / 2)

    ctx.fillStyle = 'rgba(20, 30, 40, 0.85)'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = FLAG
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('LEVEL CLEAR', x + w / 2, y + 18)
    ctx.fillText(`TIME ${formatTime(runSeconds)}`, x + w / 2, y + 34)
    ctx.fillText(bestSeconds === null ? 'BEST --' : `BEST ${formatTime(bestSeconds)}`, x + w / 2, y + 50)
  }

  /** Horizontal deadzone around the view centre, plus the vertical edge margins, clamped to the level. */
  private updateCamera(map: TileMap, playerX: number, playerY: number): void {
    const worldW = map.cols * TILE
    const worldH = map.rows * TILE
    const centre = playerX + PLAYER_W / 2
    const viewCentre = this.camX + this.viewW / 2

    let wantX = this.camX
    if (centre > viewCentre + CAMERA_DEADZONE_X) wantX = centre - CAMERA_DEADZONE_X - this.viewW / 2
    else if (centre < viewCentre - CAMERA_DEADZONE_X) wantX = centre + CAMERA_DEADZONE_X - this.viewW / 2
    this.camX = clamp(wantX, 0, Math.max(0, worldW - this.viewW))

    const top = playerY
    const bottom = playerY + PLAYER_H
    let wantY = this.camY
    if (bottom > this.camY + VIEW_H - CAMERA_MARGIN_Y) wantY = bottom - (VIEW_H - CAMERA_MARGIN_Y)
    else if (top < this.camY + CAMERA_MARGIN_Y) wantY = top - CAMERA_MARGIN_Y
    this.camY = clamp(wantY, 0, Math.max(0, worldH - VIEW_H))
  }

  private drawTiles(map: TileMap): void {
    const ctx = this.ctx
    const firstCol = Math.max(0, Math.floor(this.camX / TILE))
    const lastCol = Math.min(map.cols - 1, Math.ceil((this.camX + this.viewW) / TILE))
    const firstRow = Math.max(0, Math.floor(this.camY / TILE))
    const lastRow = Math.min(map.rows - 1, Math.ceil((this.camY + VIEW_H) / TILE))

    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const ch = tileAt(map, col, row)
        const x = col * TILE
        const y = row * TILE

        if (ch === QUESTION) {
          // Drawn before the solid branch, because a ? block is solid and would otherwise be a wall.
          ctx.fillStyle = this.usedBlocks.has(`${col},${row}`) ? USED_BLOCK : QUESTION_BLOCK
          ctx.fillRect(x, y, TILE, TILE)
          if (!this.usedBlocks.has(`${col},${row}`)) {
            ctx.fillStyle = PIP_VISOR
            ctx.fillRect(x + 6, y + 4, 4, 8)
          }
        } else if (isSolid(ch)) {
          ctx.fillStyle = GROUND
          ctx.fillRect(x, y, TILE, TILE)
          if (!isSolid(tileAt(map, col, row - 1))) {
            ctx.fillStyle = GROUND_TOP
            ctx.fillRect(x, y, TILE, 3)
          }
        } else if (isOneWay(ch)) {
          ctx.fillStyle = PLANK
          ctx.fillRect(x, y, TILE, 4)
        } else if (ch === SIGN) {
          // A post with a plate showing the Echo key. It is the level's only instruction.
          ctx.fillStyle = CHECKPOINT_POLE
          ctx.fillRect(x + 7, y - TILE, 2, TILE * 2)
          ctx.fillStyle = PLANK
          ctx.fillRect(x + 1, y - TILE, 14, 10)
          ctx.fillStyle = PIP_VISOR
          ctx.font = '8px monospace'
          ctx.textAlign = 'center'
          ctx.fillText('C', x + 8, y - TILE + 8)
        } else if (ch === CHECKPOINT) {
          ctx.fillStyle = CHECKPOINT_POLE
          ctx.fillRect(x + 7, y - TILE * 2, 2, TILE * 3)
          ctx.fillStyle = CHECKPOINT_FLAG
          ctx.fillRect(x + 9, y - TILE * 2, 9, 7)
        } else if (ch === GOAL) {
          ctx.fillStyle = FLAG_POLE
          ctx.fillRect(x + 7, y - TILE * 2, 2, TILE * 3)
          ctx.fillStyle = FLAG
          ctx.beginPath()
          ctx.moveTo(x + 9, y - TILE * 2)
          ctx.lineTo(x + 9 + 10, y - TILE * 2 + 4)
          ctx.lineTo(x + 9, y - TILE * 2 + 8)
          ctx.closePath()
          ctx.fill()
        }
      }
    }
  }

  private drawEcho(echo: Echo, tick: number): void {
    // Blink for the last ECHO_BLINK_F frames, so its expiry is readable.
    if (isBlinking(echo) && Math.floor(tick / 4) % 2 === 0) return
    // Echoes never move once placed, so they need no interpolation — but they are rounded like the
    // player, or fillRect antialiases them against a pixel-perfect canvas.
    const x = Math.round(echo.x)
    const y = Math.round(echo.y)
    this.ctx.fillStyle = ECHO_BODY
    this.ctx.fillRect(x, y - PLAYER_H, PLAYER_W, PLAYER_H)
    this.ctx.fillRect(x, y, PLAYER_W, 4)
  }

  private drawEnemy(enemy: Enemy): void {
    const ctx = this.ctx
    const x = Math.round(enemy.x)
    const y = Math.round(enemy.y)

    if (enemy.kind === 'gear-goomba') {
      ctx.fillStyle = GOOMBA_BODY
      ctx.fillRect(x, y, enemy.w, enemy.h)
      ctx.fillStyle = GOOMBA_EYE
      ctx.fillRect(x + 3, y + 4, 3, 3)
      ctx.fillRect(x + enemy.w - 6, y + 4, 3, 3)
      return
    }

    // A shell is the same object once stomped, so it is drawn from its current box rather than a
    // separate sprite — the shrink to SHELL_H is what reads as "it went into its shell".
    if (enemy.mode === 'walk') {
      ctx.fillStyle = TURTLE_BODY
      ctx.fillRect(x, y, enemy.w, enemy.h)
      ctx.fillStyle = SHELL_BODY
      ctx.fillRect(x + 1, y + enemy.h - 10, enemy.w - 2, 8)
      return
    }

    ctx.fillStyle = SHELL_BODY
    ctx.fillRect(x, y, enemy.w, enemy.h)
    ctx.fillStyle = TURTLE_BODY
    ctx.fillRect(x + 2, y + 3, enemy.w - 4, enemy.h - 6)
  }

  private drawMushroom(mushroom: Mushroom): void {
    const ctx = this.ctx
    const x = Math.round(mushroom.x)
    const y = Math.round(mushroom.y)
    ctx.fillStyle = MUSHROOM_STEM
    ctx.fillRect(x + 3, y + 8, 10, 8)
    ctx.fillStyle = MUSHROOM_CAP
    ctx.fillRect(x, y, 16, 8)
  }

  private drawPlayer(x: number, y: number, h: number): void {
    const ctx = this.ctx
    const px = Math.round(x)
    const py = Math.round(y)
    ctx.fillStyle = PIP_BODY
    ctx.fillRect(px, py, PLAYER_W, h)
    ctx.fillStyle = PIP_VISOR
    ctx.fillRect(px + 2, py + 3, PLAYER_W - 4, 5)
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high))
}

/** A run time as `M:SS.t` — the shape the spec's HUD shows. */
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  const whole = Math.floor(rest)
  const tenth = Math.floor((rest - whole) * 10)
  return `${minutes}:${String(whole).padStart(2, '0')}.${tenth}`
}
