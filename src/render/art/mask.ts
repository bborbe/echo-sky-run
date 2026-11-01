// Pixel masks: a sprite frame written as rows of characters, one character per pixel. `.` is
// transparent; every other character is a key into the sprite's colour map. Pure data — the DOM side
// that paints a mask into a canvas lives in `../atlas.ts`, so the art can be unit-tested.

import { INK, type InkName } from './palette.ts'

/** One frame: equal-length rows, top to bottom. */
export type Mask = readonly string[]

/** A sprite family's letters, each naming a palette ink. */
export type Keys = Readonly<Record<string, InkName>>

/** The transparent pixel. */
export const CLEAR = '.'

export interface Size {
  readonly w: number
  readonly h: number
}

/** A mask's size, read from its rows. Throws on a ragged mask — a typo must not ship as art. */
export function maskSize(mask: Mask): Size {
  const h = mask.length
  if (h === 0) throw new Error('empty mask')
  const w = mask[0].length
  for (let y = 0; y < h; y++) {
    if (mask[y].length !== w) throw new Error(`ragged mask: row ${y} is ${mask[y].length} wide, expected ${w}`)
  }
  return { w, h }
}

/** The hex colour of every opaque pixel, for the palette and tone tests. */
export function maskColours(mask: Mask, keys: Keys): Set<string> {
  const used = new Set<string>()
  for (const row of mask) {
    for (const ch of row) {
      if (ch === CLEAR) continue
      const ink = keys[ch]
      if (ink === undefined) throw new Error(`mask uses '${ch}', which its keys do not name`)
      used.add(INK[ink])
    }
  }
  return used
}

/** True when the pixel is inside the mask and opaque. */
export function opaqueAt(mask: Mask, x: number, y: number): boolean {
  if (y < 0 || y >= mask.length) return false
  const row = mask[y]
  if (x < 0 || x >= row.length) return false
  return row[x] !== CLEAR
}

/**
 * The boundary pixels: opaque pixels with a transparent (or out-of-mask) neighbour on any of the
 * four sides. Spec § 9 wants every one of them in the outline colour on character sprites.
 */
export function boundaryKeys(mask: Mask): string[] {
  const keys: string[] = []
  for (let y = 0; y < mask.length; y++) {
    for (let x = 0; x < mask[y].length; x++) {
      if (!opaqueAt(mask, x, y)) continue
      if (
        !opaqueAt(mask, x - 1, y) ||
        !opaqueAt(mask, x + 1, y) ||
        !opaqueAt(mask, x, y - 1) ||
        !opaqueAt(mask, x, y + 1)
      ) {
        keys.push(mask[y][x])
      }
    }
  }
  return keys
}

/** The lowest row holding an opaque pixel — where a sprite's feet are. */
export function bottomRow(mask: Mask): number {
  for (let y = mask.length - 1; y >= 0; y--) {
    if (mask[y].split('').some((ch) => ch !== CLEAR)) return y
  }
  return -1
}

/** Mirror a mask left to right. */
export function flipMask(mask: Mask): Mask {
  return mask.map((row) => row.split('').reverse().join(''))
}

/** Prepend `n` transparent rows and drop as many from the bottom — a 1 px bob without a new frame. */
export function shiftDown(mask: Mask, n: number): Mask {
  const w = mask[0].length
  const blank = CLEAR.repeat(w)
  return [...Array.from({ length: n }, () => blank), ...mask].slice(0, mask.length)
}

/**
 * Close the outline: every boundary pixel becomes `outline`. Spec § 9 gives characters and props a
 * 1 px sepia outline, and a hand-drawn mask leaks — a belly pixel between two legs, a banner's
 * last column. Applied to every character and prop frame the game draws, so the rule holds by
 * construction rather than by proofreading.
 */
export function outlined(mask: Mask, outline = 'o'): Mask {
  return mask.map((row, y) =>
    row
      .split('')
      .map((ch, x) => {
        if (ch === CLEAR) return ch
        const edge =
          !opaqueAt(mask, x - 1, y) || !opaqueAt(mask, x + 1, y) || !opaqueAt(mask, x, y - 1) || !opaqueAt(mask, x, y + 1)
        return edge ? outline : ch
      })
      .join(''),
  )
}
