/**
 * Pure synthesis: recipes in, samples out. No DOM and no Web Audio, so vitest renders and measures
 * every sound in node, and the render worker runs the very same code off the main thread.
 *
 * A voice depends only on time since its own start: phases, glides, envelopes and noise all restart
 * at the voice's first sample. That is what makes a voice render the same samples wherever it is
 * placed, and what lets the music loop's folded tail match a second pass sample for sample.
 */

export type Wave = 'sine' | 'triangle' | 'square' | 'saw' | 'noise'

export interface Voice {
  readonly wave: Wave
  /** Start, in seconds from the start of the sound (or of the loop). */
  readonly at: number
  /** Held length before the release, in seconds. */
  readonly dur: number
  /**
   * Pitch at the start, in Hz. For noise it is the sample-and-hold rate, which pitches the noise;
   * 0 means fresh white noise every sample.
   */
  readonly freq: number
  /** Pitch at the end of `dur`, reached by an exponential glide. Defaults to `freq`. */
  readonly freqEnd?: number
  readonly gain: number
  /** Seconds to full level. Default 2 ms, which keeps the onset free of a click. */
  readonly attack?: number
  /** Seconds from full level down to `sustain`. Default 0. */
  readonly decay?: number
  /** Level held after the decay, 0..1. Default 1. */
  readonly sustain?: number
  /** Seconds from the held level to silence after `dur`. Default 20 ms. */
  readonly release?: number
  /** Square pulse width, 0..1. Default 0.5. */
  readonly duty?: number
  /** A second saw or square, this many cents sharp, mixed in equally — the brass section's width. */
  readonly detune?: number
  readonly vibratoRate?: number
  /** Vibrato depth in semitones. */
  readonly vibratoDepth?: number
  /** Seconds before the vibrato starts. Default 0. */
  readonly vibratoDelay?: number
  /** Two-pole low-pass cutoff in Hz. Absent means no low-pass. */
  readonly lowpass?: number
  /** Extra cutoff, in Hz, at full envelope level: the filter opens with the note, like brass. */
  readonly lowpassEnv?: number
  /** One-pole high-pass cutoff in Hz. Absent means no high-pass. */
  readonly highpass?: number
  /** Noise seed. Default 1. */
  readonly seed?: number
}

const TAU = Math.PI * 2
const DEFAULT_ATTACK = 0.002
const DEFAULT_RELEASE = 0.02

/** Seconds from the voice's start to its last non-zero sample. */
export function voiceLength(v: Voice): number {
  return v.dur + (v.release ?? DEFAULT_RELEASE)
}

/** Seconds from the sound's start to the end of its last voice. */
export function soundLength(voices: readonly Voice[]): number {
  let end = 0
  for (const v of voices) end = Math.max(end, v.at + voiceLength(v))
  return end
}

/** The envelope level `t` seconds into the held part of a voice (before its release). */
function heldLevel(t: number, attack: number, decay: number, sustain: number): number {
  if (t < attack) return t / attack
  if (decay > 0 && t < attack + decay) return 1 - ((1 - sustain) * (t - attack)) / decay
  return sustain
}

/** PolyBLEP residual: rounds the step of a saw or square so it does not alias into a fizz. */
function polyBlep(p: number, dt: number): number {
  if (p < dt) {
    const x = p / dt
    return x + x - x * x - 1
  }
  if (p > 1 - dt) {
    const x = (p - 1) / dt
    return x * x + x + x + 1
  }
  return 0
}

function oscillator(wave: Wave, p: number, dt: number, duty: number): number {
  switch (wave) {
    case 'sine':
      return Math.sin(TAU * p)
    case 'triangle':
      return 4 * Math.abs(p - 0.5) - 1
    case 'saw':
      return 2 * p - 1 - polyBlep(p, dt)
    case 'square': {
      let s = p < duty ? 1 : -1
      s += polyBlep(p, dt)
      let q = p - duty
      if (q < 0) q += 1
      s -= polyBlep(q, dt)
      return s
    }
    default:
      return 0
  }
}

/** One step of a xorshift32 generator: deterministic noise, seeded per voice. */
function xorshift(state: number): number {
  let x = state
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  return x >>> 0
}

/**
 * Add one voice into `out`, starting at sample `start`. `out` is a Float64Array so a dense mix
 * accumulates without float32 rounding; samples past the end of `out` are dropped.
 */
export function addVoice(v: Voice, sampleRate: number, out: Float64Array, start: number): void {
  const attack = Math.max(v.attack ?? DEFAULT_ATTACK, 1 / sampleRate)
  const decay = v.decay ?? 0
  const sustain = v.sustain ?? 1
  const release = Math.max(v.release ?? DEFAULT_RELEASE, 1 / sampleRate)
  const duty = v.duty ?? 0.5
  const f0 = v.freq
  const f1 = v.freqEnd ?? v.freq
  const heldSamples = Math.max(1, Math.round(v.dur * sampleRate))
  const total = heldSamples + Math.round(release * sampleRate)
  const endLevel = heldLevel(v.dur, attack, decay, sustain)
  const glidePerSample = f0 > 0 && f1 > 0 ? Math.pow(f1 / f0, 1 / heldSamples) : 1
  const detuneRatio = v.detune ? Math.pow(2, v.detune / 1200) : 0
  const vibRate = v.vibratoRate ?? 0
  const vibDepth = ((v.vibratoDepth ?? 0) / 12) * Math.LN2
  const vibDelay = v.vibratoDelay ?? 0
  const lpBase = v.lowpass
  const lpEnv = v.lowpassEnv ?? 0
  const hpW = v.highpass === undefined ? 0 : (TAU * v.highpass) / sampleRate
  const hpA = hpW / (1 + hpW)

  let seed = (v.seed ?? 1) >>> 0 || 1
  let noise = 0
  let p1 = 0
  let p2 = 0
  let freq = f0
  let lp1 = 0
  let lp2 = 0
  let hpState = 0

  for (let i = 0; i < total; i++) {
    const idx = start + i
    if (idx >= out.length) break
    const t = i / sampleRate

    const level =
      i < heldSamples ? heldLevel(t, attack, decay, sustain) : endLevel * (1 - (i - heldSamples) / (total - heldSamples))

    let f = freq
    if (vibRate > 0 && t >= vibDelay) f *= Math.exp(vibDepth * Math.sin(TAU * vibRate * (t - vibDelay)))
    const dt = f / sampleRate

    let s: number
    if (v.wave === 'noise') {
      if (f <= 0) {
        seed = xorshift(seed)
        noise = seed / 4294967296 - 0.5
      } else {
        p1 += dt
        if (p1 >= 1 || i === 0) {
          p1 -= Math.floor(p1)
          seed = xorshift(seed)
          noise = seed / 4294967296 - 0.5
        }
      }
      s = noise * 2
    } else {
      s = oscillator(v.wave, p1, dt, duty)
      p1 += dt
      if (p1 >= 1) p1 -= Math.floor(p1)
      if (detuneRatio > 0) {
        const dt2 = dt * detuneRatio
        s = 0.5 * (s + oscillator(v.wave, p2, dt2, duty))
        p2 += dt2
        if (p2 >= 1) p2 -= Math.floor(p2)
      }
    }

    if (lpBase !== undefined) {
      const fc = Math.min(lpBase + lpEnv * level, sampleRate * 0.45)
      const w = (TAU * fc) / sampleRate
      const a = w / (1 + w)
      lp1 += a * (s - lp1)
      lp2 += a * (lp1 - lp2)
      s = lp2
    }
    if (hpW > 0) {
      hpState += hpA * (s - hpState)
      s -= hpState
    }

    out[idx] += s * level * v.gain
    if (i < heldSamples) freq *= glidePerSample
  }
}

/** Render a whole sound — every voice at its own `at` — into a fresh buffer. */
export function renderSound(voices: readonly Voice[], sampleRate: number): Float32Array {
  const length = Math.ceil(soundLength(voices) * sampleRate) + 1
  const mix = new Float64Array(length)
  for (const v of voices) addVoice(v, sampleRate, mix, Math.round(v.at * sampleRate))
  return Float32Array.from(mix)
}

/** The largest absolute sample. */
export function peak(samples: ArrayLike<number>): number {
  let max = 0
  for (let i = 0; i < samples.length; i++) max = Math.max(max, Math.abs(samples[i]))
  return max
}

/** Root mean square over `samples[from, to)`. */
export function rms(samples: ArrayLike<number>, from = 0, to = samples.length): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += samples[i] * samples[i]
  return to > from ? Math.sqrt(sum / (to - from)) : 0
}

/**
 * What a sound is, measured from its samples rather than its recipe: how long it sounds, its pitch
 * near the start and near the end (a zero-crossing estimate over 30 ms), and its brightness (the RMS
 * frequency, sr/2π · √(E[Δx²] / E[x²])). Two recipes with near-equal numbers sound alike.
 */
export interface Fingerprint {
  readonly length: number
  readonly startPitch: number
  readonly endPitch: number
  readonly centroid: number
}

function zeroCrossingHz(samples: Float32Array, from: number, to: number, sampleRate: number): number {
  const lo = Math.max(1, from)
  let crossings = 0
  for (let i = lo; i < to; i++) {
    if (samples[i - 1] < 0 !== samples[i] < 0) crossings += 1
  }
  const span = (to - lo) / sampleRate
  return span > 0 ? crossings / 2 / span : 0
}

export function fingerprint(samples: Float32Array, sampleRate: number): Fingerprint {
  const threshold = peak(samples) * 0.02
  let first = 0
  while (first < samples.length && Math.abs(samples[first]) < threshold) first += 1
  let last = samples.length - 1
  while (last > first && Math.abs(samples[last]) < threshold) last -= 1

  const window = Math.round(0.03 * sampleRate)
  const startEnd = Math.min(last, first + window)
  const endStart = Math.max(first, last - window)

  let energy = 0
  let diffEnergy = 0
  for (let i = first + 1; i <= last; i++) {
    energy += samples[i] * samples[i]
    const d = samples[i] - samples[i - 1]
    diffEnergy += d * d
  }

  return {
    length: (last - first + 1) / sampleRate,
    startPitch: zeroCrossingHz(samples, first, startEnd, sampleRate),
    endPitch: zeroCrossingHz(samples, endStart, last, sampleRate),
    centroid: energy > 0 ? (sampleRate / TAU) * Math.sqrt(diffEnergy / energy) : 0,
  }
}

/** True when two fingerprints differ by at least `ratio` in at least one component. */
export function distinct(a: Fingerprint, b: Fingerprint, ratio = 0.15): boolean {
  const differs = (x: number, y: number): boolean => {
    const hi = Math.max(Math.abs(x), Math.abs(y))
    return hi > 0 && Math.abs(x - y) / hi >= ratio
  }
  return (
    differs(a.length, b.length) ||
    differs(a.startPitch, b.startPitch) ||
    differs(a.endPitch, b.endPitch) ||
    differs(a.centroid, b.centroid)
  )
}
