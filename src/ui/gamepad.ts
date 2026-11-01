// Gamepad → the keys the game already reads (game description § 6). The pad never talks to the
// simulation: it presses the same key codes a keyboard does, so there is one input path, one set of
// rules, and a pad press shows up in exactly the place a key press does.
//
// Standard mapping (https://w3c.github.io/gamepad/#remapping), Xbox button names.

/** Standard-mapping button indices. */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  LS: 10,
  RS: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const

/** The part of a Gamepad this module reads. A real `Gamepad` fits; a test builds a plain object. */
export interface PadSnapshot {
  readonly axes: readonly number[]
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[]
}

export interface PadBinding {
  readonly button: number
  /** The keyboard code the button stands for. */
  readonly code: string
  /** The button's name as a player knows it. */
  readonly name: string
  readonly action: string
}

/**
 * The spec's § 6 mapping. Movement is the left stick and the D-pad; the vertical axis and D-pad
 * up/down are deliberately absent, because "look up / duck" has no mechanic in this build — mapping
 * them to ArrowUp would make a stick nudge jump, since ArrowUp is a jump key.
 */
export const PAD_BINDINGS: readonly PadBinding[] = [
  { button: PAD.A, code: 'Space', name: 'A', action: 'Jump' },
  { button: PAD.B, code: 'KeyX', name: 'B', action: 'Spin jump' },
  { button: PAD.X, code: 'ShiftLeft', name: 'X', action: 'Run / carry' },
  { button: PAD.Y, code: 'KeyC', name: 'Y', action: 'Echo' },
  { button: PAD.START, code: 'Escape', name: 'Start', action: 'Pause' },
  { button: PAD.LEFT, code: 'ArrowLeft', name: 'D-pad ←', action: 'Move' },
  { button: PAD.RIGHT, code: 'ArrowRight', name: 'D-pad →', action: 'Move' },
]

/** Stick deflection that counts as a direction. Worn sticks rest off zero, so this is not 0. */
export const STICK_DEAD_ZONE = 0.35

const pressed = (pad: PadSnapshot, i: number): boolean => pad.buttons[i]?.pressed === true

/**
 * The codes the pad is holding right now — the whole input state, not an edge list. The shell diffs
 * this against the previous frame, which is what makes a button already down when the pad appears a
 * press rather than a swallowed first input.
 */
export function padCodes(pad: PadSnapshot): string[] {
  const codes = PAD_BINDINGS.filter((b) => pressed(pad, b.button)).map((b) => b.code)
  const x = pad.axes[0] ?? 0
  if (x <= -STICK_DEAD_ZONE) codes.push('ArrowLeft')
  if (x >= STICK_DEAD_ZONE) codes.push('ArrowRight')
  return codes
}

/** The pad to read: the first connected standard-mapping pad, else the first connected one. */
export function pickPad<T extends { connected: boolean; mapping: string }>(
  pads: readonly (T | null)[],
): T | null {
  const live = pads.filter((p): p is T => p !== null && p.connected)
  return live.find((p) => p.mapping === 'standard') ?? live[0] ?? null
}

/** The `key` value that goes with a code — a synthetic event with the wrong one still works here,
 * but a listener that reads `key` (and the browser's own handling) expects them to agree. */
export function keyForCode(code: string): string {
  if (code === 'Space') return ' '
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift'
  if (code.startsWith('Arrow') || code === 'Escape') return code
  return code.replace(/^(Key|Digit)/, '').toLowerCase()
}
