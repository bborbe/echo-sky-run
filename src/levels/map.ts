/**
 * The World 1 overworld map: the path of level nodes, including the ones not built yet.
 *
 * The catalogue is derived from the level modules, so it can only ever list levels that exist. The
 * map is the opposite: it shows the whole world, and a node whose module does not exist yet is a
 * placeholder — drawn "not built yet", never startable. The map is the level-select, so this module
 * owns the node order and the lock/unbuilt decision; the renderer only draws what it decides.
 */
import { LEVEL_CATALOGUE, findLevel } from './catalogue.ts'
import type { MenuItem } from '../ui/screens.ts'

/** World 1's path, in play order. The map shows these nodes whether or not each one is built. */
export const WORLD1_PATH: readonly string[] = ['1-1', '1-2', '1-3', '1-4']

/**
 * How a node reads:
 *  - `locked`  — the save does not hold it, so it cannot be started.
 *  - `unbuilt` — the save holds it but no level module exists yet: a placeholder.
 *  - `open`    — held and built, so confirming it starts the level.
 *
 * Locked is checked first: an unheld level reads "locked" even when it is also unbuilt, so a player
 * sees the progression gate rather than a build status they cannot act on.
 */
export type MapNodeState = 'open' | 'locked' | 'unbuilt'

export interface MapNode {
  readonly id: string
  readonly state: MapNodeState
}

/** The map's nodes in path order, resolved against the save's unlock state and the catalogue. */
export function mapNodes(
  isUnlocked: (id: string) => boolean,
  built: (id: string) => boolean = (id) => findLevel(id) !== undefined,
): readonly MapNode[] {
  return WORLD1_PATH.map((id) => {
    if (!isUnlocked(id)) return { id, state: 'locked' as const }
    return built(id) ? { id, state: 'open' as const } : { id, state: 'unbuilt' as const }
  })
}

/**
 * The map's rows as menu items, so the shell's existing selection, navigation and `canActivate` gate
 * serve the map unchanged. Every non-open node is `locked`, which is what makes confirming it start
 * nothing — a placeholder is not startable either.
 */
export function mapItems(nodes: readonly MapNode[]): readonly MenuItem[] {
  return nodes.map((node) => ({
    id: 'level' as const,
    label: node.id,
    level: node.id,
    ...(node.state === 'open' ? {} : { locked: true }),
  }))
}

/** The state label the map draws under a node; empty for an open one, whose name is drawn instead. */
export function mapLabel(node: MapNode): string {
  if (node.state === 'unbuilt') return 'NOT BUILT YET'
  if (node.state === 'locked') return 'LOCKED'
  return ''
}

/** The built levels the map knows about, in path order — what the renderer can draw a still for. */
export function builtPathLevels(): readonly string[] {
  return WORLD1_PATH.filter((id) => findLevel(id) !== undefined)
}

/** Re-exported so a caller can size the map without importing the catalogue too. */
export const MAP_LEVEL_COUNT = LEVEL_CATALOGUE.length
