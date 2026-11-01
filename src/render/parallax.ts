// The painted background's layout, as data: the sky gradient, the three parallax layers and the
// haze band. Pure, so the "no background art inside a gap" rule is a unit test: every layer fades
// to nothing before HAZE_TOP, and below it only the sky gradient shows — which is what a gap must
// look like (spec § 9: "never place background art inside a gap, where it reads as walkable").

import { SKY } from './art/palette.ts'
import { VIEW_H } from './camera.ts'

/** No layer draws below this screen row. The ground's top is y = 192, so a gap shows only haze. */
export const HAZE_TOP = 176

/** Sky gradient stops, top to bottom, as fractions of the view height. */
export const SKY_STOPS: readonly (readonly [number, string])[] = [
  [0, SKY.top],
  [0.05, SKY.top],
  [0.55, SKY.mid],
  [0.86, SKY.horizon],
  [1, SKY.haze],
]

export type Shape =
  | { readonly kind: 'ellipse'; readonly x: number; readonly y: number; readonly rx: number; readonly ry: number; readonly colour: string; readonly alpha?: number }
  | { readonly kind: 'gear'; readonly x: number; readonly y: number; readonly r: number; readonly colour: string }
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly colour: string }

export interface Layer {
  readonly name: 'far' | 'mid' | 'near'
  /** How far the layer moves per pixel the camera moves. Further is slower. */
  readonly factor: number
  /** The strip repeats every `width` logical px. */
  readonly width: number
  /** Gaussian blur in logical px: further is softer (spec § 9). */
  readonly blur: number
  /** The layer fades out between these screen rows; nothing of it remains at `fadeTo`. */
  readonly fadeFrom: number
  readonly fadeTo: number
  readonly shapes: readonly Shape[]
}

/** Far: clouds and lavender sky islands. Mid: hills and a brass gear ruin. Near: bushes. */
export const LAYERS: readonly Layer[] = [
  {
    name: 'far',
    factor: 0.12,
    width: 720,
    blur: 3,
    fadeFrom: 130,
    fadeTo: HAZE_TOP,
    shapes: [
      { kind: 'ellipse', x: 90, y: 34, rx: 34, ry: 9, colour: SKY.cloud, alpha: 0.7 },
      { kind: 'ellipse', x: 108, y: 29, rx: 18, ry: 7, colour: SKY.cloud, alpha: 0.6 },
      { kind: 'ellipse', x: 330, y: 22, rx: 40, ry: 8, colour: SKY.cloud, alpha: 0.65 },
      { kind: 'ellipse', x: 560, y: 46, rx: 28, ry: 7, colour: SKY.cloud, alpha: 0.6 },
      { kind: 'ellipse', x: 200, y: 82, rx: 26, ry: 10, colour: SKY.farIslandShade },
      { kind: 'ellipse', x: 200, y: 76, rx: 34, ry: 7, colour: SKY.farIsland },
      { kind: 'ellipse', x: 470, y: 98, rx: 36, ry: 12, colour: SKY.farIslandShade },
      { kind: 'ellipse', x: 470, y: 91, rx: 46, ry: 8, colour: SKY.farIsland },
      { kind: 'ellipse', x: 650, y: 66, rx: 20, ry: 8, colour: SKY.farIslandShade },
      { kind: 'ellipse', x: 650, y: 61, rx: 26, ry: 5, colour: SKY.farIsland },
    ],
  },
  {
    name: 'mid',
    factor: 0.3,
    width: 600,
    blur: 1.5,
    fadeFrom: 146,
    fadeTo: HAZE_TOP,
    shapes: [
      { kind: 'ellipse', x: 80, y: 178, rx: 90, ry: 46, colour: SKY.hillShade },
      { kind: 'ellipse', x: 70, y: 182, rx: 80, ry: 44, colour: SKY.hill },
      { kind: 'ellipse', x: 330, y: 184, rx: 110, ry: 40, colour: SKY.hillShade },
      { kind: 'ellipse', x: 320, y: 188, rx: 100, ry: 38, colour: SKY.hill },
      { kind: 'rect', x: 466, y: 128, w: 12, h: 60, colour: SKY.ruin },
      { kind: 'gear', x: 472, y: 120, r: 13, colour: SKY.ruin },
      { kind: 'ellipse', x: 540, y: 190, rx: 70, ry: 34, colour: SKY.hill },
    ],
  },
  {
    name: 'near',
    factor: 0.55,
    width: 520,
    blur: 1,
    fadeFrom: 160,
    fadeTo: HAZE_TOP,
    shapes: [
      { kind: 'ellipse', x: 40, y: 176, rx: 30, ry: 18, colour: SKY.bushShade },
      { kind: 'ellipse', x: 34, y: 178, rx: 24, ry: 15, colour: SKY.bush },
      { kind: 'ellipse', x: 200, y: 178, rx: 40, ry: 20, colour: SKY.bushShade },
      { kind: 'ellipse', x: 192, y: 180, rx: 32, ry: 16, colour: SKY.bush },
      { kind: 'ellipse', x: 380, y: 177, rx: 26, ry: 15, colour: SKY.bushShade },
      { kind: 'ellipse', x: 374, y: 179, rx: 20, ry: 12, colour: SKY.bush },
    ],
  },
]

/** The layer's scroll offset into its repeating strip, in [0, width). */
export function parallaxOffset(cameraX: number, factor: number, width: number): number {
  return (((cameraX * factor) % width) + width) % width
}

/** A layer's opacity at a screen row: 1 above the fade, 0 from `fadeTo` down. */
export function layerAlpha(layer: Layer, y: number): number {
  if (y <= layer.fadeFrom) return 1
  if (y >= layer.fadeTo) return 0
  return 1 - (y - layer.fadeFrom) / (layer.fadeTo - layer.fadeFrom)
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The sky gradient's colour at a screen row — what a gap shows. The e2e compares pixels to it. */
export function skyColourAt(y: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, y / VIEW_H))
  for (let i = 1; i < SKY_STOPS.length; i++) {
    const [t1, c1] = SKY_STOPS[i]
    if (t > t1) continue
    const [t0, c0] = SKY_STOPS[i - 1]
    const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
    const a = hexRgb(c0)
    const b = hexRgb(c1)
    return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as [number, number, number]
  }
  return hexRgb(SKY_STOPS[SKY_STOPS.length - 1][1])
}
