/**
 * The World 1 overworld map: the path of level nodes, including the ones not built yet.
 *
 * The catalogue is derived from the level modules, so it can only ever list levels that exist. The
 * map is the opposite: it shows the whole world, and a node whose module does not exist yet is a
 * placeholder — drawn "not built yet", never startable. The map is the level-select, so this module
 * owns the node order and the lock/unbuilt decision; the renderer only draws what it decides.
 */
import { LEVEL_CATALOGUE, findLevel } from './catalogue.ts'
import { recordLevelBest, unlockLevel, type LevelCounts, type Save } from '../save/save.ts'
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

/** The node after `id` on World 1's path, or null at the end or off the path. */
export function nextLevelId(id: string): string | null {
  const i = WORLD1_PATH.indexOf(id)
  return i >= 0 && i + 1 < WORLD1_PATH.length ? WORLD1_PATH[i + 1] : null
}

/**
 * The save after clearing `levelId` in `seconds`: the level's best time recorded, and the next node
 * on the path unlocked. This is the completion path — the game calls it when the flag is reached, so
 * what it writes is what a reload reads back.
 */
export function completeLevel(save: Save, levelId: string, seconds: number): Save {
  const withBest = recordLevelBest(save, levelId, seconds)
  const after = nextLevelId(levelId)
  return after === null ? withBest : unlockLevel(withBest, after)
}

/** Relic-Coin slots a level holds, the denominator of `◆◆◇`. */
export const RELIC_SLOTS = 3

/** A level's Relic Coins as three slots, collected ones filled: 2 → `◆◆◇`, 1 → `◆◇◇`. */
export function relicGlyphs(collected: number): string {
  const filled = Math.max(0, Math.min(RELIC_SLOTS, Math.floor(collected)))
  return '◆'.repeat(filled) + '◇'.repeat(RELIC_SLOTS - filled)
}

/** A map best time as `42.3 s`, or `1:02.3 s` past a minute — the mockup's shape, not the HUD's. */
export function formatMapTime(seconds: number): string {
  const tenths = Math.floor(seconds * 10)
  const whole = Math.floor(tenths / 10)
  const rest = tenths % 10
  if (whole < 60) return `${whole}.${rest} s`
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}.${rest} s`
}

/**
 * The line drawn under a node: its Relic Coins and best time when it is playable, and otherwise why
 * it is not. A level with no recorded time yet still shows its coins, with `--` where the time goes.
 */
export function mapNodeMeta(node: MapNode, relics: number, bestSeconds: number | null): string {
  if (node.state === 'unbuilt') return 'NOT BUILT YET'
  if (node.state === 'locked') return 'LOCKED'
  const time = bestSeconds === null ? '--' : formatMapTime(bestSeconds)
  return `${relicGlyphs(relics)} · ${time}`
}

/** What the map reads off a save: the per-level coins and best times, both keyed by level id. */
export interface MapCounts {
  readonly relics?: LevelCounts
  readonly bestTimes?: LevelCounts
}

/** The box the map is laid out in, in logical canvas pixels. */
export interface MapBox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** One node as the renderer draws it: its box, its name, and the line under it. */
export interface MapNodeBox {
  readonly id: string
  readonly state: MapNodeState
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly label: string
  readonly meta: string
}

/** A dashed trail segment between two adjacent nodes, drawn centre to centre. */
export interface MapConnector {
  readonly from: string
  readonly to: string
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

export interface MapLayout {
  readonly nodes: readonly MapNodeBox[]
  readonly connectors: readonly MapConnector[]
}

/** A node's drawn size: the disc, then its meta line under it. Wide enough for `◆◆◇ · 42.3 s`. */
export const MAP_NODE_W = 72
export const MAP_NODE_H = 24
/** The disc's height — the trail joins disc centres, not box centres. */
export const MAP_DISC_H = 14

/**
 * The node centres along the winding trail, as fractions of the layout box — mockup B, which the
 * operator picked on 2026-11-21. The S-curve climbs from the bottom left to the top left, so the
 * path reads as a journey upward.
 */
const NODE_SPOTS: readonly { readonly fx: number; readonly fy: number }[] = [
  { fx: 0.2, fy: 0.8 },
  { fx: 0.63, fy: 0.62 },
  { fx: 0.63, fy: 0.38 },
  { fx: 0.2, fy: 0.19 },
]

/**
 * Lay the nodes out along the winding trail and join every adjacent pair with a connector, so a map
 * without a path is not representable: the connector list is derived from the node order and always
 * holds one segment fewer than there are nodes.
 */
export function layoutMap(nodes: readonly MapNode[], counts: MapCounts, box: MapBox): MapLayout {
  const boxes: MapNodeBox[] = nodes.map((node, i) => {
    const spot = NODE_SPOTS[i] ?? NODE_SPOTS[NODE_SPOTS.length - 1]
    const cx = box.x + spot.fx * box.w
    const cy = box.y + spot.fy * box.h
    return {
      id: node.id,
      state: node.state,
      x: Math.round(cx - MAP_NODE_W / 2),
      y: Math.round(cy - MAP_NODE_H / 2),
      w: MAP_NODE_W,
      h: MAP_NODE_H,
      label: node.id,
      meta: mapNodeMeta(node, counts.relics?.[node.id] ?? 0, counts.bestTimes?.[node.id] ?? null),
    }
  })
  const connectors: MapConnector[] = []
  for (let i = 0; i + 1 < boxes.length; i++) {
    const a = boxes[i]
    const b = boxes[i + 1]
    connectors.push({
      from: a.id,
      to: b.id,
      x1: a.x + a.w / 2,
      y1: a.y + MAP_DISC_H / 2,
      x2: b.x + b.w / 2,
      y2: b.y + MAP_DISC_H / 2,
    })
  }
  return { nodes: boxes, connectors }
}
