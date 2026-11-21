/**
 * The level catalogue: one entry per shipped level, derived from the level modules themselves.
 *
 * Every `*.level.ts` in this folder is a level. The glob's suffix is load-bearing — a bare
 * `./*.ts` would also sweep the test files and helpers that live here, and an eager import of a
 * `.test.ts` drags vitest into the app bundle. A new level is listed the moment its module exists;
 * nothing here is a hand-maintained array.
 */
import type { MenuItem } from '../ui/screens.ts'

export interface LevelMeta {
  readonly id: string
  readonly name: string
  readonly set: string
}

export interface LevelEntry extends LevelMeta {
  /** The level's tile rows, in the format `parseLevel` reads. */
  readonly rows: readonly string[]
}

interface LevelModule {
  readonly LEVEL_META: LevelMeta
  readonly LEVEL_ROWS: readonly string[]
}

const modules = import.meta.glob<LevelModule>('./*.level.ts', { eager: true })

/** Every shipped level, in id order. */
export const LEVEL_CATALOGUE: readonly LevelEntry[] = Object.values(modules)
  .map((module) => ({ ...module.LEVEL_META, rows: module.LEVEL_ROWS }))
  .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))

export function findLevel(id: string): LevelEntry | undefined {
  return LEVEL_CATALOGUE.find((level) => level.id === id)
}

/** One set's levels, in catalogue order. */
export interface LevelSet {
  readonly set: string
  readonly levels: readonly LevelEntry[]
}

/** The catalogue grouped by set, sets in the order they first appear. */
export function groupBySet(levels: readonly LevelEntry[] = LEVEL_CATALOGUE): readonly LevelSet[] {
  const order: string[] = []
  const bySet = new Map<string, LevelEntry[]>()
  for (const level of levels) {
    const list = bySet.get(level.set)
    if (list) {
      list.push(level)
    } else {
      bySet.set(level.set, [level])
      order.push(level.set)
    }
  }
  return order.map((set) => ({ set, levels: bySet.get(set) ?? [] }))
}

/** One menu row per level: the id is the tile's label, and the row carries the level to start. */
export function tileItems(levels: readonly LevelEntry[] = LEVEL_CATALOGUE): readonly MenuItem[] {
  return levels.map((level) => ({ id: 'level' as const, label: level.id, level: level.id }))
}

/** The index of `levelId` in `items`, or 0 when it is absent — the focus to restore on return. */
export function tileIndexFor(items: readonly MenuItem[], levelId: string | null): number {
  const index = levelId === null ? -1 : items.findIndex((item) => item.level === levelId)
  return index < 0 ? 0 : index
}
