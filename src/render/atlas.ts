// The DOM half of the art: masks become canvases once, at load, so a frame is a single drawImage.

import type { Animation } from './art/catalogue.ts'
import { CLEAR, flipMask, maskSize, type Keys, type Mask } from './art/mask.ts'
import { INK } from './art/palette.ts'

/** Paint a mask into a fresh canvas of its own size. */
export function paint(mask: Mask, keys: Keys): HTMLCanvasElement {
  const { w, h } = maskSize(mask)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  for (let y = 0; y < h; y++) {
    const row = mask[y]
    for (let x = 0; x < w; x++) {
      const ch = row[x]
      if (ch === CLEAR) continue
      ctx.fillStyle = INK[keys[ch]]
      ctx.fillRect(x, y, 1, 1)
    }
  }
  return canvas
}

/** An animation baked for both facings: `right[i]` is the mask as drawn, `left[i]` its mirror. */
export interface Baked {
  readonly right: readonly HTMLCanvasElement[]
  readonly left: readonly HTMLCanvasElement[]
}

export function bake(frames: readonly Mask[], keys: Keys): Baked {
  return {
    right: frames.map((m) => paint(m, keys)),
    left: frames.map((m) => paint(flipMask(m), keys)),
  }
}

export function bakeAnimation(anim: Animation): Baked {
  return bake(anim.frames, anim.keys)
}
