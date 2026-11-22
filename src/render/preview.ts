// The still preview behind the tile view: one rendered frame of each catalogue level, built from the
// level's own rows and cached, so moving focus is a blit rather than a re-render. Two framings share
// this one renderer: the opening state (the full-screen preview) and the level's declared hero spot
// (each tile's thumbnail), so a tile shows its set piece rather than the patch of ground every level
// opens on.
//
// It never advances a simulation: `createSim` builds the opening state and the painter draws it.
// The live game is halted while the tile view is up, and nothing here steps anything either — the
// preview is lock-agnostic too (it takes a level id, never a lock flag), so a dimmed tile still
// previews.

import { createSim, type SimState } from '../game/sim.ts'
import { findLevel, type HeroSpot, type LevelEntry } from '../levels/catalogue.ts'
import { TILE } from '../physics/constants.ts'
import type { PlayerState } from '../physics/player.ts'
import { parseLevel, type TileMap } from '../physics/tilemap.ts'
import type { MenuItem } from '../ui/screens.ts'
import { Camera, VIEW_H } from './camera.ts'
import { Juice } from './juice.ts'
import type { WorldPainter, WorldState } from './world.ts'

/** Which spot a still is framed on: the level's opening state, or its declared set piece. */
export type StillFraming = 'spawn' | 'hero'

/** One level's opening state, ready to paint. `sim` is kept so a test can prove it was never stepped. */
export interface PreviewSource {
  readonly level: LevelEntry
  readonly map: TileMap
  readonly state: WorldState
  readonly sim: SimState
}

/** A rendered still and the camera it was framed at. */
export interface PreviewFrame {
  readonly canvas: HTMLCanvasElement
  readonly cameraX: number
  readonly cameraY: number
}

/**
 * The opening state of a level: the same sim the game starts from, never stepped. Every field the
 * world painter reads is filled from that sim, so the still shows the level's real tiles, enemies
 * and spawn rather than a hand-drawn image.
 */
export function previewSource(level: LevelEntry): PreviewSource {
  const map = parseLevel(level.rows)
  const sim = createSim(map)
  const state: WorldState = {
    map,
    player: sim.player,
    prevX: sim.player.x,
    prevY: sim.player.y,
    echoes: sim.field.echoes,
    enemies: sim.enemies.enemies,
    mushrooms: sim.powers.mushrooms,
    switches: sim.switches,
    nimbus: sim.nimbus,
    usedBlocks: sim.usedBlocks,
    tick: 0,
    alpha: 1,
    power: sim.power,
    invuln: 0,
    checkpointClaimed: false,
    pose: 'idle',
    poseFrame: 0,
    facing: 1,
    juice: new Juice(),
  }
  return { level, map, state, sim }
}

/** The camera that frames a level's opening state — its spawn, clamped to the level's bounds. */
export function previewCamera(map: TileMap, player: PlayerState, viewW: number): { x: number; y: number } {
  const camera = new Camera()
  camera.setViewWidth(viewW)
  camera.update(player.x, player.y, player.h, map.cols * TILE, map.rows * TILE)
  return { x: Math.round(camera.x), y: Math.round(camera.y) }
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high))
}

/**
 * The camera that frames a level's hero spot: the set piece centred, then clamped so the still never
 * shows past the level's edge. It reads the spot and the map, never the player, so it is a pure
 * framing rule a test can pin.
 */
export function heroCamera(map: TileMap, hero: HeroSpot, viewW: number): { x: number; y: number } {
  const x = clamp(hero.x - viewW / 2, 0, Math.max(0, map.cols * TILE - viewW))
  const y = clamp(hero.y - VIEW_H / 2, 0, Math.max(0, map.rows * TILE - VIEW_H))
  return { x: Math.round(x), y: Math.round(y) }
}

/** A source rectangle inside a still. */
export interface CropRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/**
 * How wide a tile's crop reads from the hero-framed still, in logical pixels — 15 tiles, so a set
 * piece arrives with the ground either side of it. A crop the width of the thumbnail itself would
 * show only the middle of a gap and nothing else.
 */
export const HERO_CROP_W = 240

/**
 * Where a tile's thumbnail reads from a hero-framed still: a crop centred on the hero spot's screen
 * position, kept whole inside the still. Centring is what makes the set piece the subject; the clamp
 * is what stops a spot near a level edge from cropping past it.
 */
export function heroCropRect(
  camera: { readonly x: number; readonly y: number },
  hero: HeroSpot,
  viewW: number,
  cropW: number,
  cropH: number,
): CropRect {
  const w = Math.min(cropW, viewW)
  const h = Math.min(cropH, VIEW_H)
  const x = clamp(Math.round(hero.x - camera.x - w / 2), 0, Math.max(0, viewW - w))
  const y = clamp(Math.round(hero.y - camera.y - h / 2), 0, Math.max(0, VIEW_H - h))
  return { x, y, w, h }
}

/** The level the tile view's focused tile starts, or null when the view has no tile row. */
export function focusedLevelId(view: { readonly items: readonly MenuItem[]; readonly index: number }): string | null {
  return view.items[view.index]?.level ?? null
}

/**
 * One rendered still per (level, framing, view width). The opening state is built once per level, so
 * the painter's baked level tiles survive a resize; the canvas is rebuilt only when the logical width
 * changes. The spawn still and the hero still are separate entries under the same renderer, so a
 * thumbnail framed on a set piece can never be served the spawn-framed canvas.
 */
export class PreviewCache {
  private readonly painter: WorldPainter
  private readonly sources = new Map<string, PreviewSource>()
  private readonly frames = new Map<string, { viewW: number; canvas: HTMLCanvasElement; cameraX: number; cameraY: number }>()
  private readonly thumbnails = new Map<
    string,
    { viewW: number; width: number; height: number; canvas: HTMLCanvasElement }
  >()

  constructor(painter: WorldPainter) {
    this.painter = painter
  }

  /** The focused level's spawn-framed still, rendered on first use and cached for every later focus move. */
  frameFor(levelId: string, viewW: number): PreviewFrame | null {
    return this.still(levelId, viewW, 'spawn')
  }

  /** The level's hero-framed still — the same renderer, framed on its declared set piece. */
  heroFrameFor(levelId: string, viewW: number): PreviewFrame | null {
    return this.still(levelId, viewW, 'hero')
  }

  /**
   * The tile's thumbnail: a crop of the hero-framed still, centred on the hero spot and scaled down
   * nearest-neighbour. It is the same painter that draws the full-screen still, so the tile and the
   * background preview can never drift apart; only the framing and the crop differ.
   */
  thumbnailFor(levelId: string, viewW: number, width: number, height: number): HTMLCanvasElement | null {
    const key = `${levelId}@${width}x${height}`
    const cached = this.thumbnails.get(key)
    if (cached !== undefined && cached.viewW === viewW) return cached.canvas
    const source = this.source(levelId)
    if (source === null) return null
    const frame = this.heroFrameFor(levelId, viewW)
    if (frame === null) return null
    const cropW = HERO_CROP_W
    const cropH = Math.round((cropW * height) / width)
    const crop = heroCropRect({ x: frame.cameraX, y: frame.cameraY }, source.level.hero, viewW, cropW, cropH)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(frame.canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height)
    this.thumbnails.set(key, { viewW, width, height, canvas })
    return canvas
  }

  private still(levelId: string, viewW: number, framing: StillFraming): PreviewFrame | null {
    const key = `${levelId}:${framing}`
    const cached = this.frames.get(key)
    if (cached !== undefined && cached.viewW === viewW) return cached
    const source = this.source(levelId)
    if (source === null) return null
    const camera =
      framing === 'hero'
        ? heroCamera(source.map, source.level.hero, viewW)
        : previewCamera(source.map, source.state.player, viewW)
    const canvas = document.createElement('canvas')
    canvas.width = viewW
    canvas.height = VIEW_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = false
    this.painter.draw(ctx, viewW, camera.x, camera.y, source.state)
    const frame = { viewW, canvas, cameraX: camera.x, cameraY: camera.y }
    this.frames.set(key, frame)
    return frame
  }

  private source(levelId: string): PreviewSource | null {
    const cached = this.sources.get(levelId)
    if (cached !== undefined) return cached
    const level = findLevel(levelId)
    if (level === undefined) return null
    const source = previewSource(level)
    this.sources.set(levelId, source)
    return source
  }
}
