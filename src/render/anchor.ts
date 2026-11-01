// Where a sprite is drawn for a hitbox: centred on it horizontally, its last row on the hitbox's
// floor. One function for Pip and every enemy, so "drawn into a tile" — feet below the floor the
// physics stands them on — is ruled out in one place and tested there.

export interface Box {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** The top-left pixel to draw a `spriteW × spriteH` sprite at, for a hitbox. */
export function spriteOrigin(box: Box, spriteW: number, spriteH: number): { x: number; y: number } {
  return {
    x: Math.round(box.x + box.w / 2 - spriteW / 2),
    y: Math.round(box.y + box.h) - spriteH,
  }
}
