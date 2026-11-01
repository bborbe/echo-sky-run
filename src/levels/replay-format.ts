import type { SimInput } from '../game/sim.ts'

/**
 * A recorded run is stored as run-length-encoded input, one 5-bit code per frame. The bits are
 * stable and are part of the fixture format — changing them invalidates every recorded replay.
 */
const BITS = { right: 1, jump: 2, jumpPressed: 4, sprint: 8, echoPressed: 16 } as const

const ALPHABET = '0123456789abcdefghijklmnopqrstuv'

function code(input: SimInput): number {
  return (
    (input.right ? BITS.right : 0) |
    (input.jump ? BITS.jump : 0) |
    (input.jumpPressed ? BITS.jumpPressed : 0) |
    (input.sprint ? BITS.sprint : 0) |
    (input.echoPressed ? BITS.echoPressed : 0)
  )
}

function fromCode(value: number): SimInput {
  return {
    left: false,
    right: (value & BITS.right) !== 0,
    jump: (value & BITS.jump) !== 0,
    jumpPressed: (value & BITS.jumpPressed) !== 0,
    sprint: (value & BITS.sprint) !== 0,
    echoPressed: (value & BITS.echoPressed) !== 0,
  }
}

/**
 * Encode a per-frame input sequence as `<count>x<code>` runs joined by commas. A scripted level run
 * is almost constant, so this turns ~3000 frames into a handful of segments.
 */
export function encodeInputs(inputs: readonly SimInput[]): string {
  const runs: string[] = []
  let previous = -1
  let count = 0

  const flush = (): void => {
    if (count > 0) runs.push(`${count}x${ALPHABET[previous]}`)
  }

  for (const input of inputs) {
    const value = code(input)
    if (value === previous) {
      count += 1
      continue
    }
    flush()
    previous = value
    count = 1
  }
  flush()
  return runs.join(',')
}

/** Expand an encoded sequence back into one `SimInput` per frame. */
export function decodeInputs(encoded: string): SimInput[] {
  const inputs: SimInput[] = []
  for (const run of encoded.split(',')) {
    if (run === '') continue
    const [countText, codeText] = run.split('x')
    const count = Number(countText)
    const value = ALPHABET.indexOf(codeText)
    if (!Number.isInteger(count) || count <= 0 || value < 0) {
      throw new Error(`bad replay segment: ${run}`)
    }
    for (let i = 0; i < count; i++) inputs.push(fromCode(value))
  }
  return inputs
}
