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
/** A ? block: solid until hit from below, then it releases its contents. */
export const QUESTION = '?'
/** The midpoint checkpoint flag. */
export const CHECKPOINT = 'C'

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

/** A solid tile blocks from every side. */
export function isSolid(ch: string): boolean {
  return ch === SOLID
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

/**
 * Where the level's enemies stand. An enemy is anchored by its feet: the bottom of its spawn cell is
 * the floor it stands on, so a two-tile-tall turtle straddles the cell above the one it is written in
 * without the author having to offset it.
 */
export function findEnemySpawns(map: TileMap): { kind: 'gear-goomba' | 'steam-turtle'; x: number; y: number }[] {
  const spawns: { kind: 'gear-goomba' | 'steam-turtle'; x: number; y: number }[] = []
  for (const [ch, kind] of [
    [GEAR_GOOMBA, 'gear-goomba'],
    [STEAM_TURTLE, 'steam-turtle'],
  ] as const) {
    const h = kind === 'gear-goomba' ? 16 : 24
    for (const cell of findTiles(map, ch)) {
      spawns.push({ kind, x: cell.x, y: cell.y + TILE - h })
    }
  }
  return spawns
}

