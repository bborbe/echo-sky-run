/**
 * World 1's music, "Brass Clockwork Skies": an original 16-bar loop in F major at 120 bpm, written
 * as data and rendered by `synth.ts`. Brass lead, music-box arpeggio, oom-pah bass with brass stabs,
 * and clockwork percussion — the spec's § 9 Sound.
 *
 * The loop is rendered once with its release tail, then the tail is folded back onto the start, so
 * the buffer plays as one seamless loop: what rings past the end of bar 16 sounds under bar 1, just
 * as it would on a second pass.
 */
import { hz } from './recipes.ts'
import { addVoice, type Voice } from './synth.ts'

export const BPM = 120
export const BEATS_PER_BAR = 4
export const BARS = 16
/** Seconds per eighth note — the score's grid. */
export const EIGHTH = 60 / BPM / 2
export const EIGHTHS_PER_BAR = BEATS_PER_BAR * 2
export const LOOP_SECONDS = BARS * EIGHTHS_PER_BAR * EIGHTH
/** Longer than any release in the score, so nothing is cut when the tail is folded. */
export const TAIL_SECONDS = 2
export const MUSIC_SAMPLE_RATE = 32000
/** The folded loop is scaled so its loudest sample sits here, leaving headroom for the effects. */
export const MUSIC_PEAK = 0.8

interface Chord {
  /** Bass note, MIDI. */
  readonly bass: number
  /** Chord tones in the stab and music-box register, MIDI, lowest first. */
  readonly tones: readonly number[]
}

const CHORDS: Readonly<Record<string, Chord>> = {
  F: { bass: 41, tones: [65, 69, 72] },
  Dm: { bass: 38, tones: [62, 65, 69] },
  Bb: { bass: 46, tones: [62, 65, 70] },
  C: { bass: 48, tones: [64, 67, 72] },
  Am: { bass: 45, tones: [64, 69, 72] },
  Gm: { bass: 43, tones: [62, 67, 70] },
  C7: { bass: 48, tones: [64, 67, 70] },
}

/** One chord per half bar: A section then B section. */
export const HARMONY: readonly string[] = [
  // A: F Dm Bb C | F Am Bb-C F
  'F', 'F', 'Dm', 'Dm', 'Bb', 'Bb', 'C', 'C', 'F', 'F', 'Am', 'Am', 'Bb', 'C', 'F', 'F',
  // B: Bb C Am Dm | Gm C Bb C7
  'Bb', 'Bb', 'C', 'C', 'Am', 'Am', 'Dm', 'Dm', 'Gm', 'Gm', 'C', 'C', 'Bb', 'Bb', 'C7', 'C7',
]

/** The brass melody, one row per bar: [MIDI note or null for a rest, length in eighths]. */
export const MELODY: readonly (readonly (readonly [number | null, number])[])[] = [
  [[65, 1], [69, 1], [72, 2], [69, 1], [72, 1], [77, 2]],
  [[76, 2], [74, 1], [72, 1], [69, 3], [null, 1]],
  [[70, 1], [74, 1], [77, 2], [74, 1], [77, 1], [82, 2]],
  [[81, 2], [79, 1], [77, 1], [76, 3], [null, 1]],
  [[65, 1], [69, 1], [72, 2], [69, 1], [72, 1], [77, 2]],
  [[76, 2], [77, 1], [76, 1], [72, 4]],
  [[74, 2], [70, 2], [76, 2], [79, 2]],
  [[77, 3], [72, 1], [77, 3], [null, 1]],
  [[74, 1], [77, 1], [82, 1], [77, 1], [74, 2], [77, 2]],
  [[76, 1], [79, 1], [84, 1], [79, 1], [76, 4]],
  [[72, 1], [76, 1], [81, 1], [76, 1], [72, 2], [76, 2]],
  [[74, 3], [72, 1], [69, 3], [null, 1]],
  [[70, 1], [74, 1], [79, 2], [77, 1], [74, 1], [70, 2]],
  [[72, 1], [76, 1], [79, 2], [81, 1], [79, 1], [76, 2]],
  [[77, 2], [74, 2], [70, 2], [74, 2]],
  [[76, 1], [77, 1], [79, 1], [82, 1], [79, 2], [76, 1], [72, 1]],
]

/** Music-box pattern over a chord's tones (index 3 = the root an octave up), one per eighth. */
const MUSIC_BOX_PATTERN = [0, 1, 2, 3, 2, 1, 2, 1]

function chordAt(eighth: number): Chord {
  return CHORDS[HARMONY[Math.floor(eighth / (EIGHTHS_PER_BAR / 2))]]
}

/** Every voice of one pass of the loop, positioned in seconds from the loop's start. */
export function scoreVoices(): Voice[] {
  const voices: Voice[] = []

  // --- brass lead
  let eighth = 0
  for (const bar of MELODY) {
    for (const [note, len] of bar) {
      if (note !== null) {
        const long = len >= 3
        voices.push({
          wave: 'saw',
          at: eighth * EIGHTH,
          dur: len * EIGHTH * 0.88,
          freq: hz(note),
          gain: 0.15,
          detune: 7,
          attack: 0.02,
          decay: 0.12,
          sustain: 0.65,
          release: 0.08,
          lowpass: 900,
          lowpassEnv: 2200,
          ...(long ? { vibratoRate: 5.5, vibratoDepth: 0.12, vibratoDelay: 0.18 } : {}),
        })
      }
      eighth += len
    }
  }

  for (let e = 0; e < BARS * EIGHTHS_PER_BAR; e++) {
    const at = e * EIGHTH
    const inBar = e % EIGHTHS_PER_BAR
    const bar = Math.floor(e / EIGHTHS_PER_BAR)
    const chord = chordAt(e)

    // --- music box: quarters in the first four bars, eighths after, an octave above the chord
    if (bar >= 4 || inBar % 2 === 0) {
      const idx = MUSIC_BOX_PATTERN[inBar]
      const midi = (idx === 3 ? chord.tones[0] + 12 : chord.tones[idx]) + 12
      voices.push({ wave: 'sine', at, dur: 0.35, freq: hz(midi), gain: 0.055, decay: 0.35, sustain: 0 })
      voices.push({ wave: 'sine', at, dur: 0.1, freq: hz(midi) * 4, gain: 0.012, decay: 0.1, sustain: 0 })
    }

    // --- oom-pah bass on beats 1 and 3: the root, then the fifth while the chord holds
    if (inBar === 0 || inBar === 4) {
      const prev = inBar === 4 ? chordAt(e - 4) : null
      const bass = prev === chord ? chord.bass + 7 : chord.bass
      voices.push({
        wave: 'triangle',
        at,
        dur: 0.4,
        freq: hz(bass),
        gain: 0.3,
        attack: 0.005,
        decay: 0.25,
        sustain: 0.4,
        release: 0.06,
      })
      voices.push({
        wave: 'square',
        at,
        dur: 0.4,
        freq: hz(bass),
        gain: 0.07,
        attack: 0.005,
        decay: 0.25,
        sustain: 0.4,
        release: 0.06,
        lowpass: 600,
      })
      // a soft kick under the bass
      voices.push({ wave: 'sine', at, dur: 0.12, freq: 110, freqEnd: 45, gain: 0.3, attack: 0.001, decay: 0.12, sustain: 0 })
    }

    // --- brass stabs and the woodblock tock on beats 2 and 4
    if (inBar === 2 || inBar === 6) {
      for (const tone of chord.tones) {
        voices.push({
          wave: 'saw',
          at,
          dur: 0.1,
          freq: hz(tone),
          gain: 0.045,
          detune: 9,
          attack: 0.008,
          decay: 0.06,
          sustain: 0.5,
          release: 0.06,
          lowpass: 1200,
          lowpassEnv: 600,
        })
      }
      voices.push({ wave: 'sine', at, dur: 0.04, freq: 1100, freqEnd: 1000, gain: 0.1, attack: 0.001, decay: 0.04, sustain: 0 })
    }

    // --- the clock's tick on every off-beat
    if (inBar % 2 === 1) {
      voices.push({
        wave: 'noise',
        at,
        dur: 0.015,
        freq: 0,
        gain: 0.07,
        attack: 0.001,
        decay: 0.015,
        sustain: 0,
        highpass: 6000,
        seed: 97,
      })
    }
  }

  return voices
}

/** Samples in one pass of the loop at `sampleRate`. */
export function loopSamples(sampleRate: number): number {
  return Math.round(LOOP_SECONDS * sampleRate)
}

/**
 * Render `passes` back-to-back passes of the loop plus the release tail of the last one, unscaled.
 * Each voice starts at an exact sample index, so pass two is pass one shifted by `loopSamples`.
 */
export function renderPasses(voices: readonly Voice[], sampleRate: number, passes: number): Float64Array {
  const loop = loopSamples(sampleRate)
  const out = new Float64Array(loop * passes + Math.round(TAIL_SECONDS * sampleRate))
  for (let pass = 0; pass < passes; pass++) {
    for (const v of voices) addVoice(v, sampleRate, out, Math.round(v.at * sampleRate) + pass * loop)
  }
  return out
}

/** Fold everything past `loop` samples back onto the start, so the buffer loops seamlessly. */
export function foldTail(raw: Float64Array, loop: number): Float64Array {
  const out = raw.slice(0, loop)
  for (let i = loop; i < raw.length; i++) out[i % loop] += raw[i]
  return out
}

/** The playable loop: one pass, its tail folded in, scaled to `MUSIC_PEAK`. */
export function renderMusic(sampleRate = MUSIC_SAMPLE_RATE): Float32Array {
  const folded = foldTail(renderPasses(scoreVoices(), sampleRate, 1), loopSamples(sampleRate))
  let max = 0
  for (const s of folded) max = Math.max(max, Math.abs(s))
  const scale = max > 0 ? MUSIC_PEAK / max : 0
  const out = new Float32Array(folded.length)
  for (let i = 0; i < folded.length; i++) out[i] = folded[i] * scale
  return out
}
