import { describe, expect, it } from 'vitest'
import type { SimInput } from '../game/sim.ts'
import { decodeInputs, encodeInputs } from './replay-format.ts'

function input(overrides: Partial<SimInput> = {}): SimInput {
  return {
    left: false,
    right: false,
    jump: false,
    jumpPressed: false,
    sprint: false,
    echoPressed: false,
    ...overrides,
  }
}

describe('replay format', () => {
  it('round-trips a sequence of inputs', () => {
    const inputs = [
      input({ right: true, sprint: true }),
      input({ right: true, sprint: true }),
      input({ right: true, jump: true, jumpPressed: true, sprint: true }),
      input({ right: true, echoPressed: true }),
      input(),
    ]
    expect(decodeInputs(encodeInputs(inputs))).toEqual(inputs)
  })

  it('encodes a constant run as one segment', () => {
    const inputs = Array.from({ length: 250 }, () => input({ right: true }))
    expect(encodeInputs(inputs)).toBe('250x1')
  })

  it('rejects a malformed segment instead of silently decoding nothing', () => {
    expect(() => decodeInputs('nonsense')).toThrow(/bad replay segment/)
    expect(() => decodeInputs('0x1')).toThrow(/bad replay segment/)
    expect(() => decodeInputs('5xz')).toThrow(/bad replay segment/)
  })
})
