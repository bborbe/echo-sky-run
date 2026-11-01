import { groundUnder, overlapsSolid, type Box } from '../physics/collision.ts'
import { PLAYER_W } from '../physics/constants.ts'
import type { TileMap } from '../physics/tilemap.ts'

/** The Echo stays solid for 240 frames, then is removed. */
export const ECHO_LIFE_F = 240
/** Frames at the end of its life during which it blinks. */
export const ECHO_BLINK_F = 60
/** One mid-air Echo per airtime; the charge refreshes only on solid ground. */
export const ECHO_AIR_CHARGES = 1
/** The Echo's collision shape: a thin one-way top at the player's feet. */
export const ECHO_W = 24
export const ECHO_H = 4

/**
 * The Echo's top edge sits exactly at the player's feet, and it is deliberately WIDER than he is.
 * At exactly PLAYER_W the player covers the platform edge to edge, so any residual landing velocity
 * — friction needs ~48 frames to bleed off a sprint — carries him off it within a few frames. That
 * is the "I slide off them" report, and the margin is the fix.
 */
export function echoBoxAt(player: Box): Box {
  return { x: player.x - (ECHO_W - PLAYER_W) / 2, y: player.y + player.h, w: ECHO_W, h: ECHO_H }
}

export interface Echo {
  x: number
  y: number
  /** Frames of life left. Reaching 0 removes the Echo. */
  life: number
}

export interface EchoField {
  echoes: Echo[]
  /** Mid-air placements left. */
  airCharges: number
}

export function createEchoField(): EchoField {
  return { echoes: [], airCharges: ECHO_AIR_CHARGES }
}

/** True when a placement from this player box would be accepted. */
export function canPlaceEcho(field: EchoField, player: Box, map: TileMap): boolean {
  if (field.airCharges <= 0) return false
  return !overlapsSolid(echoBoxAt(player), map)
}

/** Place an Echo at the player's feet. False when refused: no charge, or the spot is inside a wall. */
export function placeEcho(field: EchoField, player: Box, map: TileMap): boolean {
  if (!canPlaceEcho(field, player, map)) return false
  const box = echoBoxAt(player)
  field.echoes.push({ x: box.x, y: box.y, life: ECHO_LIFE_F })
  field.airCharges -= 1
  return true
}

/** Age every Echo by one frame and drop the expired ones. */
export function tickEchoes(field: EchoField): void {
  for (const e of field.echoes) e.life -= 1
  field.echoes = field.echoes.filter((e) => e.life > 0)
}

/** The Echoes as collision platforms, for the physics step. */
export function echoPlatforms(field: EchoField): Box[] {
  return field.echoes.map((e) => ({ x: e.x, y: e.y, w: ECHO_W, h: ECHO_H }))
}

/** An Echo blinks for its last ECHO_BLINK_F frames. */
export function isBlinking(e: Echo): boolean {
  return e.life <= ECHO_BLINK_F
}

/**
 * Refill the mid-air charge — on solid ground only. Standing on an Echo is `platform` ground and does
 * not refresh it, which is what stops an Echo staircase from being self-sustaining.
 */
export function refreshAirCharges(field: EchoField, player: Box, map: TileMap, platforms: readonly Box[]): void {
  if (groundUnder(player, map, platforms) === 'tile') {
    field.airCharges = ECHO_AIR_CHARGES
  }
}
