import { isBlinking, type Echo } from '../echo/echo.ts'
import { PLAYER_H, PLAYER_W, TILE } from '../physics/constants.ts'
import type { PlayerState } from '../physics/player.ts'
import { GOAL, isOneWay, isSolid, tileAt, type TileMap } from '../physics/tilemap.ts'

/** The logical canvas. Every pixel is drawn at this size, then scaled by an integer factor. */
export const VIEW_W = 256
export const VIEW_H = 224

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

export interface RenderState {
  readonly map: TileMap
  readonly player: PlayerState
  /** The player's position at the previous fixed step, blended with the current one by `alpha`. */
  readonly prevX: number
  readonly prevY: number
  readonly echoes: readonly Echo[]
  readonly tick: number
  /** Blend factor between the last two fixed steps. */
  readonly alpha: number
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.canvas = canvas
    this.ctx = ctx
    canvas.width = VIEW_W
    canvas.height = VIEW_H
    ctx.imageSmoothingEnabled = false
  }

  /** Fit the window with the largest whole-number scale, so no pixel is ever resampled. */
  fit(): number {
    const scale = Math.max(
      1,
      Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)),
    )
    this.canvas.style.width = `${VIEW_W * scale}px`
    this.canvas.style.height = `${VIEW_H * scale}px`
    // `imageSmoothingEnabled` governs drawImage inside the canvas; the browser's upscale of the
    // element is a separate filter, and `auto` would bilinearly blur every pixel.
    this.canvas.style.imageRendering = 'pixelated'
    return scale
  }

  draw(state: RenderState): void {
    const ctx = this.ctx
    // Draw between the last two fixed steps, so a display faster than 60 Hz does not judder.
    const px = state.prevX + (state.player.x - state.prevX) * state.alpha
    const py = state.prevY + (state.player.y - state.prevY) * state.alpha
    const camX = this.cameraX(state.map, px)

    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H)
    sky.addColorStop(0, SKY)
    sky.addColorStop(1, SKY_LOW)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)

    ctx.save()
    ctx.translate(-Math.round(camX), 0)
    this.drawTiles(state.map, camX)
    for (const echo of state.echoes) this.drawEcho(echo, state.tick)
    this.drawPlayer(px, py)
    ctx.restore()
  }

  private cameraX(map: TileMap, playerX: number): number {
    const worldW = map.cols * TILE
    if (worldW <= VIEW_W) return 0
    const want = playerX + PLAYER_W / 2 - VIEW_W / 2
    return Math.max(0, Math.min(want, worldW - VIEW_W))
  }

  private drawTiles(map: TileMap, camX: number): void {
    const ctx = this.ctx
    const firstCol = Math.floor(camX / TILE)
    const lastCol = Math.min(map.cols - 1, firstCol + Math.ceil(VIEW_W / TILE))

    for (let row = 0; row < map.rows; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const ch = tileAt(map, col, row)
        const x = col * TILE
        const y = row * TILE

        if (isSolid(ch)) {
          ctx.fillStyle = GROUND
          ctx.fillRect(x, y, TILE, TILE)
          if (!isSolid(tileAt(map, col, row - 1))) {
            ctx.fillStyle = GROUND_TOP
            ctx.fillRect(x, y, TILE, 3)
          }
        } else if (isOneWay(ch)) {
          ctx.fillStyle = PLANK
          ctx.fillRect(x, y, TILE, 4)
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

  private drawPlayer(x: number, y: number): void {
    const ctx = this.ctx
    const px = Math.round(x)
    const py = Math.round(y)
    ctx.fillStyle = PIP_BODY
    ctx.fillRect(px, py, PLAYER_W, PLAYER_H)
    ctx.fillStyle = PIP_VISOR
    ctx.fillRect(px + 2, py + 3, PLAYER_W - 4, 5)
  }
}
