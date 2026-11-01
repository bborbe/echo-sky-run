import { describe, expect, it } from 'vitest'
import { keyForCode, PAD, padCodes, pickPad, STICK_DEAD_ZONE, type PadSnapshot } from './gamepad.ts'

/** A standard-mapping pad with every button up and both sticks centred. */
function pad(overrides: { buttons?: number[]; axes?: number[] } = {}): PadSnapshot {
  const buttons = Array.from({ length: 16 }, (_, i) => ({
    pressed: (overrides.buttons ?? []).includes(i),
    value: (overrides.buttons ?? []).includes(i) ? 1 : 0,
  }))
  return { axes: overrides.axes ?? [0, 0], buttons }
}

describe('the spec § 6 mapping', () => {
  it('resolves A jump, B spin, X run, Y Echo and Start pause', () => {
    expect(padCodes(pad({ buttons: [PAD.A] }))).toEqual(['Space'])
    expect(padCodes(pad({ buttons: [PAD.B] }))).toEqual(['KeyX'])
    expect(padCodes(pad({ buttons: [PAD.X] }))).toEqual(['ShiftLeft'])
    expect(padCodes(pad({ buttons: [PAD.Y] }))).toEqual(['KeyC'])
    expect(padCodes(pad({ buttons: [PAD.START] }))).toEqual(['Escape'])
  })

  it('moves with the D-pad', () => {
    expect(padCodes(pad({ buttons: [PAD.LEFT] }))).toEqual(['ArrowLeft'])
    expect(padCodes(pad({ buttons: [PAD.RIGHT] }))).toEqual(['ArrowRight'])
    expect(padCodes(pad({ buttons: [PAD.UP] }))).toEqual(['PadUp'])
    expect(padCodes(pad({ buttons: [PAD.DOWN] }))).toEqual(['PadDown'])
  })

  it('opens the controls card from LB, the free button spec § 6 leaves', () => {
    expect(padCodes(pad({ buttons: [PAD.LB] }))).toEqual(['KeyH'])
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
    expect(padCodes(pad({ buttons: [PAD.A, PAD.Y] })).sort()).toEqual(['KeyC', 'Space'])
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
