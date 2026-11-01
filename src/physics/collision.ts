import { EPS, TILE } from './constants.ts'
import { isOneWay, isSolid, tileAt, type TileMap } from './tilemap.ts'

export interface Box {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface MoveResult {
  readonly x: number
  readonly y: number
  readonly hitLeft: boolean
  readonly hitRight: boolean
  readonly hitTop: boolean
  readonly hitBottom: boolean
}

/** What a box is standing on. An Echo is a platform, never solid ground. */
export type Ground = 'none' | 'tile' | 'platform'

/**
 * The shared result `moveBox` fills in place. Read it before the next `moveBox` call — the reference
 * is reused so the 60 Hz step allocates nothing.
 */
const MOVE_RESULT = { x: 0, y: 0, hitLeft: false, hitRight: false, hitTop: false, hitBottom: false }

interface Cells {
  c0: number
  c1: number
  r0: number
  r1: number
}

/**
 * One shared cell range, filled in place. The fixed step runs at 60 Hz and the performance budget is
 * zero heap allocations per frame, so the hot path must not build a fresh object per collision probe.
 * Every caller reads the fields immediately and never holds the reference across another call.
 */
const CELLS: Cells = { c0: 0, c1: 0, r0: 0, r1: 0 }

function cellsOverlapping(x: number, y: number, w: number, h: number): Cells {
  CELLS.c0 = Math.floor(x / TILE)
  CELLS.c1 = Math.floor((x + w - EPS) / TILE)
  CELLS.r0 = Math.floor(y / TILE)
  CELLS.r1 = Math.floor((y + h - EPS) / TILE)
  return CELLS
}

function hitsSolid(x: number, y: number, w: number, h: number, map: TileMap): boolean {
  const { c0, c1, r0, r1 } = cellsOverlapping(x, y, w, h)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (isSolid(tileAt(map, c, r))) return true
    }
  }
  return false
}

/**
 * A one-way tile blocks only a box falling onto its top edge from above, so the box's bottom must
 * have been at or above the tile's top before the move.
 */
function hitsOneWayFromAbove(x: number, y: number, w: number, h: number, map: TileMap, prevBottom: number): boolean {
  const { c0, c1, r0, r1 } = cellsOverlapping(x, y, w, h)
  for (let r = r0; r <= r1; r++) {
    const top = r * TILE
    if (prevBottom > top + EPS) continue
    for (let c = c0; c <= c1; c++) {
      if (isOneWay(tileAt(map, c, r))) return true
    }
  }
  return false
}

function overlapsHorizontally(x: number, w: number, p: Box): boolean {
  return x + w > p.x + EPS && x < p.x + p.w - EPS
}

/** The highest platform top a downward move crosses, or null when it crosses none. */
function platformStop(
  x: number,
  w: number,
  prevBottom: number,
  nextBottom: number,
  platforms: readonly Box[],
): number | null {
  let best: number | null = null
  for (const p of platforms) {
    if (!overlapsHorizontally(x, w, p)) continue
    const top = p.y
    if (prevBottom > top + EPS) continue // already past it: it is no longer a surface
    if (nextBottom < top) continue // this step does not reach it
    if (best === null || top < best) best = top
  }
  return best
}

/**
 * Move a box by (dx, dy) through the tile grid and any dynamic platforms, resolving each axis
 * separately and in sub-steps of at most one pixel, so no surface can be tunnelled through at any
 * speed the game produces. A blocked axis snaps flush to the surface edge.
 *
 * The result object is reused between calls — read its fields before calling `moveBox` again.
 */
export function moveBox(box: Box, dx: number, dy: number, map: TileMap, platforms: readonly Box[] = []): MoveResult {
  let { x, y } = box
  let hitLeft = false
  let hitRight = false
  let hitTop = false
  let hitBottom = false

  // --- horizontal
  let remaining = dx
  while (Math.abs(remaining) > EPS) {
    const step = Math.sign(remaining) * Math.min(Math.abs(remaining), 1)
    const nx = x + step
    if (hitsSolid(nx, y, box.w, box.h, map)) {
      // Snap flush to the blocking tile edge. Stopping at the last free sub-step instead would leave
      // the box up to a pixel short of the surface, which breaks the ground probe.
      if (step > 0) {
        x = Math.floor((nx + box.w) / TILE) * TILE - box.w
        hitRight = true
      } else {
        x = (Math.floor(nx / TILE) + 1) * TILE
        hitLeft = true
      }
      break
    }
    x = nx
    remaining -= step
  }

  // --- vertical
  remaining = dy
  while (Math.abs(remaining) > EPS) {
    const step = Math.sign(remaining) * Math.min(Math.abs(remaining), 1)
    const ny = y + step
    const prevBottom = y + box.h

    const tileBlocked =
      hitsSolid(x, ny, box.w, box.h, map) ||
      (step > 0 && hitsOneWayFromAbove(x, ny, box.w, box.h, map, prevBottom))
    const pStop = step > 0 ? platformStop(x, box.w, prevBottom, ny + box.h, platforms) : null

    if (tileBlocked || pStop !== null) {
      if (step > 0) {
        let stop = Number.POSITIVE_INFINITY
        if (tileBlocked) stop = Math.floor((ny + box.h) / TILE) * TILE
        if (pStop !== null) stop = Math.min(stop, pStop)
        y = stop - box.h
        hitBottom = true
      } else {
        y = (Math.floor(ny / TILE) + 1) * TILE
        hitTop = true
      }
      break
    }

    y = ny
    remaining -= step
  }

  MOVE_RESULT.x = x
  MOVE_RESULT.y = y
  MOVE_RESULT.hitLeft = hitLeft
  MOVE_RESULT.hitRight = hitRight
  MOVE_RESULT.hitTop = hitTop
  MOVE_RESULT.hitBottom = hitBottom
  return MOVE_RESULT
}

/** What is under the box: a solid tile, a one-way tile at exactly its feet, a platform, or nothing. */
export function groundUnder(box: Box, map: TileMap, platforms: readonly Box[] = []): Ground {
  const feet = box.y + box.h
  const row = Math.floor(feet / TILE)
  const { c0, c1 } = cellsOverlapping(box.x, box.y, box.w, box.h)

  for (let c = c0; c <= c1; c++) {
    const ch = tileAt(map, c, row)
    if (isSolid(ch)) return 'tile'
    if (isOneWay(ch) && feet <= row * TILE + EPS) return 'tile'
  }

  for (const p of platforms) {
    if (!overlapsHorizontally(box.x, box.w, p)) continue
    if (Math.abs(feet - p.y) <= EPS) return 'platform'
  }

  return 'none'
}

export function isGrounded(box: Box, map: TileMap, platforms: readonly Box[] = []): boolean {
  return groundUnder(box, map, platforms) !== 'none'
}

/** True when the box overlaps any solid tile — used to refuse an Echo placed inside a wall. */
export function overlapsSolid(box: Box, map: TileMap): boolean {
  return hitsSolid(box.x, box.y, box.w, box.h, map)
}
