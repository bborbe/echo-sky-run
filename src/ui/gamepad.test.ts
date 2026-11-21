import { describe, expect, it } from 'vitest'
import { keyForCode, PAD, padCodes, pickPad, STICK_DEAD_ZONE, TRIGGER_THRESHOLD, type PadSnapshot } from './gamepad.ts'

/**
 * A standard-mapping pad with every button up and both sticks centred. `values` sets a button's
 * analog travel without marking it `pressed` — the shape a real trigger reports, and the one the old
 * helper could not express.
 */
function pad(overrides: { buttons?: number[]; values?: Record<number, number>; axes?: number[] } = {}): PadSnapshot {
  const buttons = Array.from({ length: 16 }, (_, i) => {
    const pressed = (overrides.buttons ?? []).includes(i)
    return { pressed, value: overrides.values?.[i] ?? (pressed ? 1 : 0) }
  })
  return { axes: overrides.axes ?? [0, 0], buttons }
}

describe('the spec § 6 mapping', () => {
  it('resolves A jump, B spin and Start pause', () => {
    expect(padCodes(pad({ buttons: [PAD.A] }))).toEqual(['Space'])
    expect(padCodes(pad({ buttons: [PAD.B] }))).toEqual(['KeyX'])
    expect(padCodes(pad({ buttons: [PAD.START] }))).toEqual(['Escape'])
  })

  it('reads Echo from the right trigger by value, not by pressed', () => {
    // A real RT reports analog travel and leaves `pressed` false; this is the whole point of the
    // rebind, so the assertion uses `values` alone.
    expect(padCodes(pad({ values: { [PAD.RT]: 0.9 } }))).toEqual(['KeyC'])
    expect(padCodes(pad({ values: { [PAD.RT]: TRIGGER_THRESHOLD } }))).toEqual(['KeyC'])
    expect(padCodes(pad({ values: { [PAD.RT]: TRIGGER_THRESHOLD - 0.01 } }))).toEqual([])
  })

  it('reads Run / carry from the left trigger by value', () => {
    expect(padCodes(pad({ values: { [PAD.LT]: 0.9 } }))).toEqual(['ShiftLeft'])
    expect(padCodes(pad({ values: { [PAD.LT]: TRIGGER_THRESHOLD - 0.01 } }))).toEqual([])
  })

  it('opens the controls card from SELECT', () => {
    expect(padCodes(pad({ buttons: [PAD.SELECT] }))).toEqual(['KeyH'])
  })

  it('keeps the old buttons as aliases', () => {
    expect(padCodes(pad({ buttons: [PAD.Y] }))).toEqual(['KeyC'])
    expect(padCodes(pad({ buttons: [PAD.X] }))).toEqual(['ShiftLeft'])
    expect(padCodes(pad({ buttons: [PAD.LB] }))).toEqual(['KeyH'])
  })

  it('holds one code when an alias and its primary are down together', () => {
    expect(padCodes(pad({ buttons: [PAD.Y], values: { [PAD.RT]: 0.8 } }))).toEqual(['KeyC'])
    expect(padCodes(pad({ buttons: [PAD.X], values: { [PAD.LT]: 0.8 } }))).toEqual(['ShiftLeft'])
    expect(padCodes(pad({ buttons: [PAD.LB, PAD.SELECT] }))).toEqual(['KeyH'])
  })

  it('moves with the D-pad', () => {
    expect(padCodes(pad({ buttons: [PAD.LEFT] }))).toEqual(['ArrowLeft'])
    expect(padCodes(pad({ buttons: [PAD.RIGHT] }))).toEqual(['ArrowRight'])
    expect(padCodes(pad({ buttons: [PAD.UP] }))).toEqual(['PadUp'])
    expect(padCodes(pad({ buttons: [PAD.DOWN] }))).toEqual(['PadDown'])
  })

  it('moves with the left stick past the dead zone, and not inside it', () => {
    expect(padCodes(pad({ axes: [STICK_DEAD_ZONE, 0] }))).toEqual(['ArrowRight'])
    expect(padCodes(pad({ axes: [-STICK_DEAD_ZONE, 0] }))).toEqual(['ArrowLeft'])
    expect(padCodes(pad({ axes: [STICK_DEAD_ZONE / 2, 0] }))).toEqual([])
  })

  it('sends the vertical axis to the menus, never to a jump key', () => {
    // ArrowUp is a jump key, so mapping the stick's Y axis to it would make tilting up a jump. The
    // Pad codes are the ones the level's own key set never contains.
    expect(padCodes(pad({ axes: [0, 1] }))).toEqual(['PadDown'])
    expect(padCodes(pad({ axes: [0, -1] }))).toEqual(['PadUp'])
    expect(padCodes(pad({ axes: [0, STICK_DEAD_ZONE / 2] }))).toEqual([])
    for (const code of padCodes(pad({ axes: [0, 1] }))) expect(code.startsWith('Arrow')).toBe(false)
  })

  it('holds every button at once', () => {
    expect(padCodes(pad({ buttons: [PAD.A], values: { [PAD.RT]: 0.9 } })).sort()).toEqual(['KeyC', 'Space'])
  })
})

describe('pickPad', () => {
  it('prefers a standard-mapping pad and skips disconnected slots', () => {
    const generic = { connected: true, mapping: 'xinput' }
    const standard = { connected: true, mapping: 'standard' }
    expect(pickPad([null, generic, standard])).toBe(standard)
    expect(pickPad([{ ...standard, connected: false }, generic])).toBe(generic)
    expect(pickPad([null, null])).toBeNull()
  })
})

describe('keyForCode', () => {
  it('agrees with the code it is sent with', () => {
    expect(keyForCode('Space')).toBe(' ')
    expect(keyForCode('ShiftLeft')).toBe('Shift')
    expect(keyForCode('ArrowLeft')).toBe('ArrowLeft')
    expect(keyForCode('Escape')).toBe('Escape')
    expect(keyForCode('KeyC')).toBe('c')
    expect(keyForCode('PadUp')).toBe('ArrowUp')
    expect(keyForCode('PadDown')).toBe('ArrowDown')
  })
})
