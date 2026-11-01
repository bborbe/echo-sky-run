// `?sheet=1`: the contact sheet — every animation in the catalogue, every frame, scaled up over the
// two backgrounds it must read against. The art is reviewed here, and `make shots` records it.

import { CATALOGUE } from '../render/art/catalogue.ts'
import { maskSize } from '../render/art/mask.ts'
import { SKY } from '../render/art/palette.ts'
import { paint } from '../render/atlas.ts'

export function readSheet(search: string): boolean {
  return new URLSearchParams(search).get('sheet') === '1'
}

const SCALE = 4
const PAD = 6
const LABEL = 14

/** Draw the sheet into the page, replacing the game. Returns the canvas for the screenshot tool. */
export function mountSheet(root: HTMLElement): HTMLCanvasElement {
  const width = 1600
  // Lay the animations out in rows, wrapping at the page width.
  type Placed = { name: string; x: number; y: number; w: number; h: number; frames: number }
  const placed: Placed[] = []
  let x = PAD
  let y = PAD
  let rowH = 0
  for (const anim of CATALOGUE) {
    const sizes = anim.frames.map(maskSize)
    const fw = Math.max(...sizes.map((s) => s.w)) * SCALE
    const fh = Math.max(...sizes.map((s) => s.h)) * SCALE
    const w = anim.frames.length * (fw + 2) + PAD
    if (x + w > width) {
      x = PAD
      y += rowH + LABEL + PAD
      rowH = 0
    }
    placed.push({ name: anim.name, x, y, w: fw, h: fh, frames: anim.frames.length })
    x += Math.max(w, anim.name.length * 6 + PAD)
    rowH = Math.max(rowH, fh)
  }
  const height = y + rowH + LABEL + PAD

  const canvas = document.createElement('canvas')
  canvas.id = 'sheet'
  canvas.width = width
  canvas.height = height
  canvas.style.cssText = 'display:block;image-rendering:pixelated'
  root.replaceChildren(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.imageSmoothingEnabled = false
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, SKY.top)
  sky.addColorStop(0.6, SKY.mid)
  sky.addColorStop(1, SKY.horizon)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  CATALOGUE.forEach((anim, i) => {
    const p = placed[i]
    anim.frames.forEach((mask, f) => {
      const img = paint(mask, anim.keys)
      const fx = p.x + f * (p.w + 2)
      // The lower half of each cell is the hill colour, so every frame is seen on both backgrounds.
      ctx.fillStyle = SKY.hill
      ctx.fillRect(fx, p.y + p.h / 2, p.w, p.h / 2)
      ctx.drawImage(img, fx, p.y + p.h - img.height * SCALE, img.width * SCALE, img.height * SCALE)
    })
    ctx.fillStyle = '#1e1e28'
    ctx.font = '11px monospace'
    ctx.fillText(`${p.name} ×${p.frames}`, p.x, p.y + p.h + 11)
  })
  return canvas
}
