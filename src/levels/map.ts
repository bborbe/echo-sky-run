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
 * The secret level's id. It is a branch off 1-3, reached only through that level's secret switch, so
 * it is deliberately **not** on `WORLD1_PATH`: the linear completion path (`nextLevelId`) can never
 * walk onto it, which is what keeps the switch the only producer of its unlock.
 */
export const SECRET_LEVEL_ID = '1-S'

/**
 * The nodes the map draws: the linear path, then the secret branch. The branch is appended rather
 * than interleaved, so `WORLD1_PATH` stays the only list `nextLevelId` walks and the map's drawing
 * order is independent of its progression order.
 */
export const MAP_NODE_IDS: readonly string[] = [...WORLD1_PATH, SECRET_LEVEL_ID]

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

/** The map's nodes in drawing order, resolved against the save's unlock state and the catalogue. */
export function mapNodes(
  isUnlocked: (id: string) => boolean,
  built: (id: string) => boolean = (id) => findLevel(id) !== undefined,
): readonly MapNode[] {
  return MAP_NODE_IDS.map((id) => {
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

/**
 * The save with the secret level unlocked — the **only** producer of `1-S`. The secret switch calls
 * it; `completeLevel` cannot, because `1-S` is not on `WORLD1_PATH`. It returns the same object when
 * the save already holds the level, so a caller can skip the write (`if (next !== save)`) exactly as
 * the completion path does, which is what makes a second touch of the switch a no-op.
 */
export function unlockSecretLevel(save: Save): Save {
  return unlockLevel(save, SECRET_LEVEL_ID)
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
 *
 * The fifth spot is the secret branch's: it sits in the free top-right corner, so its box clears
 * 1-2's and 1-3's on the right column and 1-1's and 1-4's on the left. One spot per entry in
 * `MAP_NODE_IDS`; `layoutMap` refuses to fall back to a shared spot, because a sixth node drawing
 * on top of the fifth is exactly the silent overlap this list exists to prevent.
 */
const NODE_SPOTS: readonly { readonly fx: number; readonly fy: number }[] = [
  { fx: 0.2, fy: 0.8 },
  { fx: 0.63, fy: 0.62 },
  { fx: 0.63, fy: 0.38 },
  { fx: 0.2, fy: 0.19 },
  { fx: 0.8, fy: 0.14 },
]

/**
 * The trail's edges: each adjacent pair on the linear path, then the secret branch off 1-3. Kept
 * explicit rather than derived from the node order, because `1-S` is a branch — an order-derived
 * list would join `1-4` to `1-S` and draw the secret level as the next step of the path.
 */
const MAP_EDGES: readonly (readonly [string, string])[] = [
  ...WORLD1_PATH.slice(0, -1).map((id, i) => [id, WORLD1_PATH[i + 1]] as const),
  ['1-3', SECRET_LEVEL_ID] as const,
]

/**
 * Lay the nodes out along the winding trail and join each `MAP_EDGES` pair with a connector. The
 * edges are explicit, so a branch is drawn as a branch: the linear path runs 1-1→1-2→1-3→1-4 and
 * the secret level hangs off 1-3, never off 1-4. Every node needs its own spot — a missing spot
 * throws rather than drawing two nodes on top of each other.
 */
export function layoutMap(nodes: readonly MapNode[], counts: MapCounts, box: MapBox): MapLayout {
  const boxes: MapNodeBox[] = nodes.map((node, i) => {
    const spot = NODE_SPOTS[i]
    if (spot === undefined) throw new Error(`no layout spot for map node ${i} (${node.id})`)
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
  const byId = new Map(boxes.map((b) => [b.id, b]))
  const connectors: MapConnector[] = []
  for (const [from, to] of MAP_EDGES) {
    const a = byId.get(from)
    const b = byId.get(to)
    // A caller may lay out a subset of the map; an edge with an absent end is simply not drawn.
    if (a === undefined || b === undefined) continue
    connectors.push({
      from,
      to,
      x1: a.x + a.w / 2,
      y1: a.y + MAP_DISC_H / 2,
      x2: b.x + b.w / 2,
      y2: b.y + MAP_DISC_H / 2,
    })
  }
  return { nodes: boxes, connectors }
}
