// The still preview behind the tile view: one rendered frame of each catalogue level's opening
// state, built from the level's own rows and spawn and cached, so moving focus is a blit rather
// than a re-render.
//
// It never advances a simulation: `createSim` builds the opening state and the painter draws it.
// The live game is halted while the tile view is up, and nothing here steps anything either — the
// preview is lock-agnostic too (it takes a level id, never a lock flag), so a dimmed tile still
// previews.

import { createSim, type SimState } from '../game/sim.ts'
import { findLevel, type LevelEntry } from '../levels/catalogue.ts'
import { TILE } from '../physics/constants.ts'
import type { PlayerState } from '../physics/player.ts'
import { parseLevel, type TileMap } from '../physics/tilemap.ts'
import type { MenuItem } from '../ui/screens.ts'
import { Camera, VIEW_H } from './camera.ts'
import { Juice } from './juice.ts'
import type { WorldPainter, WorldState } from './world.ts'

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

/** The level the tile view's focused tile starts, or null when the view has no tile row. */
export function focusedLevelId(view: { readonly items: readonly MenuItem[]; readonly index: number }): string | null {
  return view.items[view.index]?.level ?? null
}

/**
 * One rendered still per (level, view width). The opening state is built once per level, so the
 * painter's baked level tiles survive a resize; the canvas is rebuilt only when the logical width
 * changes.
 */
export class PreviewCache {
  private readonly painter: WorldPainter
  private readonly sources = new Map<string, PreviewSource>()
  private readonly frames = new Map<string, { viewW: number; canvas: HTMLCanvasElement; cameraX: number; cameraY: number }>()

  constructor(painter: WorldPainter) {
    this.painter = painter
  }

  /** The focused level's still, rendered on first use and cached for every later focus move. */
  frameFor(levelId: string, viewW: number): PreviewFrame | null {
    const cached = this.frames.get(levelId)
    if (cached !== undefined && cached.viewW === viewW) return cached
    const source = this.source(levelId)
    if (source === null) return null
    const camera = previewCamera(source.map, source.state.player, viewW)
    const canvas = document.createElement('canvas')
    canvas.width = viewW
    canvas.height = VIEW_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = false
    this.painter.draw(ctx, viewW, camera.x, camera.y, source.state)
    const frame = { viewW, canvas, cameraX: camera.x, cameraY: camera.y }
    this.frames.set(levelId, frame)
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
