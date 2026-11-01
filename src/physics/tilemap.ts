import { TILE } from './constants.ts'

/** Level tiles are one character each, so a level is a list of equal-length strings. */
export const EMPTY = '.'
export const SOLID = '#'
export const ONEWAY = '='
export const GOAL = 'F'
export const SPAWN = 'S'

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

