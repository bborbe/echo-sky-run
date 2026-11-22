import { sizeOf, type EnemyKind } from '../game/enemies.ts'
import { TILE } from './constants.ts'

/** Level tiles are one character each, so a level is a list of equal-length strings. */
export const EMPTY = '.'
export const SOLID = '#'
export const ONEWAY = '='
export const GOAL = 'F'
export const SPAWN = 'S'
/** A Gear-Goomba spawns in this cell, standing on the cell's floor. */
export const GEAR_GOOMBA = 'g'
/** A Steam-Turtle spawns in this cell, standing on the cell's floor. */
export const STEAM_TURTLE = 't'
/** A Spike-Beetle spawns in this cell, standing on the cell's floor. */
export const SPIKE_BEETLE = 'b'
/** A Gust-Wing hovers from this cell's floor anchor, flying its own sine path. */
export const GUST_WING = 'w'
/** A Chaser-Bot spawns in this cell, standing on the cell's floor. */
export const CHASER_BOT = 'r'
/** A ? block: solid until hit from below, then it releases its contents. */
export const QUESTION = '?'
/** The midpoint checkpoint flag. */
export const CHECKPOINT = 'C'
/** A tutorial sign. Walking past it shows its hint, once. */
export const SIGN = 'i'
/** Nimbus, the companion mount, waits in this cell. */
export const NIMBUS = 'n'
/** An Echo switch (the blue gear) sits in this cell. */
export const ECHO_SWITCH = 's'
/**
 * An Echo door's bottom tile. The door is three tiles tall (the art is 16×48), so it extends two
 * tiles above the cell it is written in — the same feet-anchored convention `findEnemySpawns` uses.
 */
export const DOOR = 'D'
/** The door spans three tiles; `DOOR_H` in `src/game/switches.ts` is the same 48 px. */
export const DOOR_TILES_H = 3

export interface TileMap {
  readonly cols: number
  readonly rows: number
  readonly tiles: readonly string[]
}

/** Parse level rows into a map, padding short rows with EMPTY so the grid stays rectangular. */
export function parseLevel(rows: readonly string[]): TileMap {
  if (rows.length === 0) return { cols: 0, rows: 0, tiles: [] }
  const cols = rows.reduce((n, r) => Math.max(n, r.length), 0)
  return { cols, rows: rows.length, tiles: rows.map((r) => r.padEnd(cols, EMPTY)) }
}

/** The tile at a grid cell. Out-of-bounds reads are EMPTY: the world has open edges, not walls. */
export function tileAt(map: TileMap, col: number, row: number): string {
  if (col < 0 || col >= map.cols || row < 0 || row >= map.rows) return EMPTY
  return map.tiles[row][col]
}

/** A solid tile blocks from every side. A ? block is solid until it is emptied from below. */
export function isSolid(ch: string): boolean {
  return ch === SOLID || ch === QUESTION
}

/** A one-way tile blocks only a fall from above; it is ignored when rising or moving sideways. */
export function isOneWay(ch: string): boolean {
  return ch === ONEWAY
}

/** The top-left corner of the first tile matching a character, or null when the level has none. */
export function findTile(map: TileMap, ch: string): { x: number; y: number } | null {
  for (let row = 0; row < map.rows; row++) {
    const col = map.tiles[row].indexOf(ch)
    if (col >= 0) return { x: col * TILE, y: row * TILE }
  }
  return null
}

/** Every cell matching a character, in row-major order. */
export function findTiles(map: TileMap, ch: string): { x: number; y: number }[] {
  const found: { x: number; y: number }[] = []
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (map.tiles[row][col] === ch) found.push({ x: col * TILE, y: row * TILE })
    }
  }
  return found
}

/** The feet-anchored spawn cells of one enemy character, its height taken from `sizeOf(kind)`. */
function findEnemyKindSpawns(map: TileMap, ch: string, kind: EnemyKind): { x: number; y: number }[] {
  const h = sizeOf(kind).h
  const spawns: { x: number; y: number }[] = []
  for (const cell of findTiles(map, ch)) spawns.push({ x: cell.x, y: cell.y + TILE - h })
  return spawns
}

/**
 * Where the level's enemies stand. An enemy is anchored by its feet: the bottom of its spawn cell is
 * the floor it stands on, so a two-tile-tall turtle straddles the cell above the one it is written in
 * without the author having to offset it. Every `EnemyKind` has a tile character, and each height
 * comes from `sizeOf` rather than a hand-kept ternary, so a new kind needs no edit here.
 */
export function findEnemySpawns(map: TileMap): { kind: EnemyKind; x: number; y: number }[] {
  const spawns: { kind: EnemyKind; x: number; y: number }[] = []
  for (const [ch, kind] of [
    [GEAR_GOOMBA, 'gear-goomba'],
    [STEAM_TURTLE, 'steam-turtle'],
    [SPIKE_BEETLE, 'spike-beetle'],
    [GUST_WING, 'gust-wing'],
    [CHASER_BOT, 'chaser-bot'],
  ] as const) {
    for (const cell of findEnemyKindSpawns(map, ch, kind)) spawns.push({ kind, ...cell })
  }
  return spawns
}

/** Where the level's Spike-Beetles stand, feet-anchored to their cell's floor. */
export function findSpikeBeetleSpawns(map: TileMap): { x: number; y: number }[] {
  return findEnemyKindSpawns(map, SPIKE_BEETLE, 'spike-beetle')
}

/** Where the level's Gust-Wings hover from, feet-anchored to their cell's floor as their path centre. */
export function findGustWingSpawns(map: TileMap): { x: number; y: number }[] {
  return findEnemyKindSpawns(map, GUST_WING, 'gust-wing')
}

/** Where the level's Chaser-Bots stand, feet-anchored to their cell's floor. */
export function findChaserBotSpawns(map: TileMap): { x: number; y: number }[] {
  return findEnemyKindSpawns(map, CHASER_BOT, 'chaser-bot')
}

/**
 * Where the level's Nimbus waits. It is one tile square, so the cell's top-left is its top-left —
 * which is also its feet anchored to the cell's floor.
 */
export function findNimbusSpawns(map: TileMap): { x: number; y: number }[] {
  return findTiles(map, NIMBUS)
}

/** Where the level's Echo switches sit. One tile square, so the cell's top-left is the switch. */
export function findSwitchSpawns(map: TileMap): { x: number; y: number }[] {
  return findTiles(map, ECHO_SWITCH)
}

/**
 * Where the level's Echo doors stand. Anchored by their feet like `findEnemySpawns`: the cell the
 * author wrote is the door's bottom tile, so a 3-tile door reaches two tiles above it.
 */
export function findDoorSpawns(map: TileMap): { x: number; y: number }[] {
  const spawns: { x: number; y: number }[] = []
  for (const cell of findTiles(map, DOOR)) {
    spawns.push({ x: cell.x, y: cell.y + TILE - DOOR_TILES_H * TILE })
  }
  return spawns
}

