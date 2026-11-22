// The Echo switch (blue gear) and its door, from the game description § 5. A door is open while a
// switch is pressed by Pip or by an Echo; an Echo counts for as long as it exists, so a door held by
// an Echo closes on the frame that Echo expires. Pure and DOM-free.

import type { Box } from '../physics/collision.ts'
import { overlaps } from './enemies.ts'

export const ECHO_SWITCH_W = 16
export const ECHO_SWITCH_H = 16
/** A door is three tiles tall — the art is 16×48 — so its collision box matches what is drawn. */
export const DOOR_W = 16
export const DOOR_H = 48

export interface EchoSwitch {
  x: number
  y: number
  w: number
  h: number
}

export interface Door {
  x: number
  y: number
  w: number
  h: number
  /** Open while any switch is pressed. */
  open: boolean
}

export interface SwitchField {
  switches: EchoSwitch[]
  doors: Door[]
}

export function createSwitchField(): SwitchField {
  return { switches: [], doors: [] }
}

export function createSwitch(x: number, y: number): EchoSwitch {
  return { x, y, w: ECHO_SWITCH_W, h: ECHO_SWITCH_H }
}

export function createDoor(x: number, y: number, w = DOOR_W, h = DOOR_H): Door {
  return { x, y, w, h, open: false }
}

/**
 * True when Pip or an Echo overlaps this switch. An Echo is a valid press because it is in the Echo
 * list until it expires; once `tickEchoes` drops it the press is gone.
 *
 * One rule, shared by `stepSwitches` and the renderer's lit read, so the plate can never show
 * pressed while the door it holds was stepped from a different answer.
 */
export function switchPressed(sw: EchoSwitch, player: Box, echoes: readonly Box[]): boolean {
  if (overlaps(player, sw)) return true
  for (let i = 0; i < echoes.length; i++) if (overlaps(echoes[i], sw)) return true
  return false
}

/** Set every door's `open` from whether any switch is pressed this frame. */
export function stepSwitches(field: SwitchField, player: Box, echoes: readonly Box[]): void {
  let pressed = false
  for (let i = 0; i < field.switches.length && !pressed; i++) {
    pressed = switchPressed(field.switches[i], player, echoes)
  }
  for (let i = 0; i < field.doors.length; i++) field.doors[i].open = pressed
}

/**
 * The closed doors, as solid boxes, into a caller-owned array. A level wires these into its
 * collision; the engine keeps the switch→door rule itself free of the collision layer.
 */
export function closedDoors(field: SwitchField, out: Box[]): Box[] {
  out.length = 0
  for (const d of field.doors) if (!d.open) out.push(d)
  return out
}
