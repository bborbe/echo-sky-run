// The painted layer of art direction C: a smooth canvas under the pixel canvas, off the pixel grid
// (spec § 9 "two render layers"). Everything is painted once into strips at load or resize; a frame
// is a handful of drawImage calls at sub-pixel offsets, which is what makes the parallax glide.

import { VIEW_H } from './camera.ts'
import { HAZE_TOP, LAYERS, SKY_STOPS, parallaxOffset, type Layer, type Shape } from './parallax.ts'

/** The painted canvas's resolution per logical pixel: soft art needs no more. */
export const BG_SCALE = 3

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  return [c, ctx]
}

function paintShape(ctx: CanvasRenderingContext2D, s: Shape, dx: number): void {
  ctx.fillStyle = s.colour
  if (s.kind === 'ellipse') {
    ctx.globalAlpha = s.alpha ?? 1
    ctx.beginPath()
    ctx.ellipse(s.x + dx, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  } else if (s.kind === 'rect') {
    ctx.fillRect(s.x + dx, s.y, s.w, s.h)
  } else {
    // A gear: a disc with eight square teeth and a hole the sky shows through.
    ctx.beginPath()
    ctx.arc(s.x + dx, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      ctx.save()
      ctx.translate(s.x + dx + Math.cos(a) * (s.r + 2), s.y + Math.sin(a) * (s.r + 2))
      ctx.rotate(a)
      ctx.fillRect(-2.5, -2.5, 5, 5)
      ctx.restore()
    }
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(s.x + dx, s.y, s.r * 0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }
}

/** One layer as a horizontally repeating strip, blurred and faded out before the haze line. */
function paintLayer(layer: Layer): HTMLCanvasElement {
  const k = BG_SCALE
  const [c, ctx] = makeCanvas(layer.width * k, VIEW_H * k)
  ctx.scale(k, k)
  ctx.filter = `blur(${layer.blur * k}px)`
  // Shapes near the strip's seam are painted twice, one strip-width apart, so the wrap is invisible.
  for (const dx of [-layer.width, 0, layer.width]) for (const s of layer.shapes) paintShape(ctx, s, dx)
  ctx.filter = 'none'
  // Fade the layer out from fadeFrom to fadeTo and clear everything below: no art in a gap.
  const fade = ctx.createLinearGradient(0, layer.fadeFrom, 0, layer.fadeTo)
  fade.addColorStop(0, 'rgba(0,0,0,1)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, layer.width, layer.fadeTo)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillRect(0, layer.fadeTo, layer.width, VIEW_H - layer.fadeTo)
  ctx.globalCompositeOperation = 'source-over'
  return c
}

/** The soft cyan halo behind an Echo, painted once. */
function paintGlow(): HTMLCanvasElement {
  const k = BG_SCALE
  const r = 22
  const [c, ctx] = makeCanvas(r * 2 * k, r * 2 * k)
  const g = ctx.createRadialGradient(r * k, r * k, 2 * k, r * k, r * k, r * k)
  g.addColorStop(0, 'rgba(159,232,255,0.7)')
  g.addColorStop(1, 'rgba(159,232,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, c.width, c.height)
  return c
}

export class Background {
  private readonly ctx: CanvasRenderingContext2D
  private sky: HTMLCanvasElement | null = null
  private readonly strips = LAYERS.map((layer) => ({ layer, canvas: paintLayer(layer) }))
  private readonly glow = paintGlow()
  private viewW = VIEW_H
  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.canvas = canvas
    this.ctx = ctx
  }

  /** Size the painted canvas to the view and repaint the sky for its width. */
  fit(viewW: number, cssW: number, cssH: number): void {
    const k = BG_SCALE
    this.viewW = viewW
    this.canvas.width = Math.round(viewW * k)
    this.canvas.height = VIEW_H * k
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
    // Smooth, deliberately: this is the painted layer, not pixel art.
    this.canvas.style.imageRendering = 'auto'
    this.ctx.imageSmoothingEnabled = true

    const [sky, ctx] = makeCanvas(viewW * k, VIEW_H * k)
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H * k)
    for (const [t, colour] of SKY_STOPS) grad.addColorStop(t, colour)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, sky.width, sky.height)
    // The sun's warm glow, high on the right, kept above the haze line.
    const sx = viewW * 0.78 * k
    const sy = 52 * k
    const sun = ctx.createRadialGradient(sx, sy, 4 * k, sx, sy, 110 * k)
    sun.addColorStop(0, 'rgba(255,232,194,0.85)')
    sun.addColorStop(1, 'rgba(255,232,194,0)')
    ctx.fillStyle = sun
    ctx.fillRect(0, 0, sky.width, 160 * k)
    this.sky = sky
  }

  /**
   * Opaque pixels in each layer's strip above and below the haze line. A layer that draws nothing,
   * or anything below the line, fails the browser check.
   */
  layerCoverage(): { name: string; above: number; below: number }[] {
    const k = BG_SCALE
    return this.strips.map(({ layer, canvas }) => {
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const split = HAZE_TOP * k
      let above = 0
      let below = 0
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (data[(y * canvas.width + x) * 4 + 3] === 0) continue
          if (y < split) above++
          else below++
        }
      }
      return { name: layer.name, above, below }
    })
  }

  /** Paint one frame for the camera's position, plus a halo behind each Echo (world coordinates). */
  draw(cameraX: number, cameraY: number, echoes: readonly { x: number; y: number; w: number }[]): void {
    const ctx = this.ctx
    const k = BG_SCALE
    if (this.sky) ctx.drawImage(this.sky, 0, 0)
    for (const { layer, canvas } of this.strips) {
      const off = parallaxOffset(cameraX, layer.factor, layer.width) * k
      for (let x = -off; x < this.viewW * k; x += canvas.width) ctx.drawImage(canvas, x, 0)
    }
    for (const e of echoes) {
      const cx = (e.x + e.w / 2 - cameraX) * k
      const cy = (e.y - 8 - cameraY) * k
      ctx.drawImage(this.glow, cx - this.glow.width / 2, cy - this.glow.height / 2)
    }
  }
}

