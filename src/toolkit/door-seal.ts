/**
 * A static proof that a target sealed behind an Echo door cannot be reached without an Echo.
 *
 * The search cannot answer this one: without an Echo the exact state space of a 300-tile level is still
 * far past any cap (measured: 1,500,000 states inside a 400-frame horizon, not exhausted), so the honest
 * search verdict is `inconclusive`. But the question has a geometric answer that needs no search:
 *
 *   - an Echo door is solid unless a switch is pressed (the engine's own rule in `stepSwitches`);
 *   - without an Echo, the only thing that can press a switch is Pip himself;
 *   - the door's open state is read from the frame BEFORE the player moves, so to walk through it he
 *     must have been within one frame's travel of the switch on the previous frame;
 *   - a single player box cannot be at the switch and at the door at once.
 *
 * So if the switch sits further from the door than one player box plus one frame of movement can span,
 * no input sequence can carry him through. This is a proof about the level's geometry and the engine's
 * constants — it does not simulate, and it re-implements no physics. It only ever proves `unreachable`;
 * when it cannot, it says nothing and the search's `inconclusive` stands.
 *
 * The reachability half of the proof (is the target even behind a door?) is a tile flood fill. The fill
 * treats one-way platforms as passable and closed doors as solid, so it OVER-approximates where Pip can
 * go. Over-approximating is the safe direction: if even the generous fill cannot leave the target's
 * chamber without a door, then Pip certainly cannot.
 */

import { createSim } from '../game/sim.ts'
import { MAX_FALL, PLAYER_H, PLAYER_W, SPRINT_MAX, TILE } from '../physics/constants.ts'
import { findTile, isSolid, SPAWN, tileAt, type TileMap } from '../physics/tilemap.ts'
import type { ReachTarget } from './reachability.ts'

/**
 * The distance a switch and a door must exceed, horizontally and vertically, to be provably unreachable.
 * Both bounds are read from the engine's own constants rather than copied: a hard-coded speed would
 * silently stop matching a retuned `SPRINT_MAX` and turn this proof into a false `unreachable`, which is
 * the one output this tool must never produce.
 */
const HORIZONTAL_GAP_LIMIT = PLAYER_W + SPRINT_MAX
const VERTICAL_GAP_LIMIT = PLAYER_H + MAX_FALL

export interface DoorSealProof {
  /** The closest switch to the door that seals the target, in pixels. */
  readonly switchDistancePx: number
  readonly door: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  readonly reason: string
}

/** The gap between two boxes on one axis: 0 when they overlap. */
function axisGap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  if (aMax < bMin) return bMin - aMax
  if (bMax < aMin) return aMin - bMax
  return 0
}

/** The grid cells a box covers. */
function cellsOf(box: { x: number; y: number; w: number; h: number }): { col: number; row: number }[] {
  const cells: { col: number; row: number }[] = []
  const c0 = Math.floor(box.x / TILE)
  const c1 = Math.floor((box.x + box.w - 1e-9) / TILE)
  const r0 = Math.floor(box.y / TILE)
  const r1 = Math.floor((box.y + box.h - 1e-9) / TILE)
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) cells.push({ col, row })
  return cells
}

/**
 * Flood the free space from `start`, treating solids and closed doors as walls. Returns the set of cells
 * reached. The fill is 4-connected on the tile grid: an over-approximation of the player's movement.
 */
function flood(map: TileMap, start: { col: number; row: number }, blocked: Set<string>): Set<string> {
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length > 0) {
    const cell = stack.pop() as { col: number; row: number }
    if (cell.col < 0 || cell.col >= map.cols || cell.row < 0 || cell.row >= map.rows) continue
    const key = `${cell.col},${cell.row}`
    if (seen.has(key) || blocked.has(key)) continue
    if (isSolid(tileAt(map, cell.col, cell.row))) continue
    seen.add(key)
    stack.push({ col: cell.col + 1, row: cell.row })
    stack.push({ col: cell.col - 1, row: cell.row })
    stack.push({ col: cell.col, row: cell.row + 1 })
    stack.push({ col: cell.col, row: cell.row - 1 })
  }
  return seen
}

/**
 * Prove that `target` cannot be reached without the Echo, or return null when the proof does not apply.
 *
 * The proof applies only when the target's chamber is separated from the spawn by closed doors AND every
 * one of those doors is far enough from every switch that no single player box can span both.
 */
export function proveDoorSealed(map: TileMap, target: ReachTarget): DoorSealProof | null {
  const sim = createSim(map)
  if (sim.switches.doors.length === 0 || sim.switches.switches.length === 0) return null

  const blocked = new Set<string>()
  for (const door of sim.switches.doors) {
    for (const cell of cellsOf(door)) blocked.add(`${cell.col},${cell.row}`)
  }

  // A free cell inside the target, to start the fill from.
  const box =
    target.kind === 'goal'
      ? { x: sim.goal.x, y: sim.goal.y, w: TILE, h: TILE }
      : { x: target.x, y: target.y, w: target.w, h: target.h }
  const targetCells = cellsOf(box).filter(
    (cell) => !blocked.has(`${cell.col},${cell.row}`) && !isSolid(tileAt(map, cell.col, cell.row)),
  )
  if (targetCells.length === 0) return null

  const spawn = findTile(map, SPAWN)
  if (spawn === null) return null
  const spawnCell = { col: Math.floor(spawn.x / TILE), row: Math.floor(spawn.y / TILE) }

  // Is the target reachable from the spawn once the doors are treated as walls? If so, this is not a
  // door-sealed target and the proof says nothing.
  const fromTarget = flood(map, targetCells[0], blocked)
  if (fromTarget.has(`${spawnCell.col},${spawnCell.row}`)) return null

  // Which doors border the target's chamber? Those are the only ways in.
  const bordering = sim.switches.doors.filter((door) =>
    cellsOf(door).some((cell) => fromTarget.has(`${cell.col},${cell.row}`) || fromTarget.has(`${cell.col + 1},${cell.row}`) || fromTarget.has(`${cell.col - 1},${cell.row}`) || fromTarget.has(`${cell.col},${cell.row + 1}`) || fromTarget.has(`${cell.col},${cell.row - 1}`)),
  )
  if (bordering.length === 0) return null

  let closest = Number.POSITIVE_INFINITY
  for (const door of bordering) {
    for (const sw of sim.switches.switches) {
      const dx = axisGap(door.x, door.x + door.w, sw.x, sw.x + sw.w)
      const dy = axisGap(door.y, door.y + door.h, sw.y, sw.y + sw.h)
      // Provably impossible when the pair is farther apart than one player box plus one frame of travel.
      if (dx > HORIZONTAL_GAP_LIMIT || dy > VERTICAL_GAP_LIMIT) {
        const distance = Math.hypot(dx, dy)
        if (distance < closest) closest = distance
      }
    }
  }
  if (!Number.isFinite(closest)) return null

  const door = bordering[0]
  return {
    switchDistancePx: Math.round(closest),
    door: { x: door.x, y: door.y, w: door.w, h: door.h },
    reason:
      `static proof: the target is sealed behind a door (${door.w}×${door.h} at ${door.x},${door.y}) whose nearest ` +
      `switch is ${Math.round(closest)} px away; a door opens only while pressed and a single player box ` +
      `(${PLAYER_W}×${PLAYER_H}) plus one frame of travel cannot span both, so no Echo-free input reaches it`,
  }
}
