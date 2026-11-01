import { describe, expect, it } from 'vitest'
import {
  BARS,
  EIGHTHS_PER_BAR,
  foldTail,
  HARMONY,
  LOOP_SECONDS,
  loopSamples,
  MELODY,
  MUSIC_PEAK,
  renderMusic,
  renderPasses,
  scoreVoices,
} from './score.ts'
import { peak, rms } from './synth.ts'

// A low rate keeps the two-pass render quick; the fold is exact at any rate where a pass is a whole
// number of samples.
const RATE = 8000

describe('world 1 music', () => {
  it('is at least 16 bars, and the melody and harmony fill every bar exactly', () => {
    expect(BARS).toBeGreaterThanOrEqual(16)
    expect(MELODY).toHaveLength(BARS)
    for (const [i, bar] of MELODY.entries()) {
      expect(bar.reduce((sum, [, len]) => sum + len, 0), `bar ${i + 1}`).toBe(EIGHTHS_PER_BAR)
    }
    expect(HARMONY).toHaveLength(BARS * 2)
    expect(LOOP_SECONDS).toBe(32)
    expect(Number.isInteger(LOOP_SECONDS * RATE)).toBe(true)
  })

  it('wraps seamlessly: the folded loop equals the steady-state second pass, sample for sample', () => {
    const voices = scoreVoices()
    const loop = loopSamples(RATE)
    const folded = foldTail(renderPasses(voices, RATE, 1), loop)
    const twoPasses = renderPasses(voices, RATE, 2)
    let worst = 0
    for (let i = 0; i < loop; i++) worst = Math.max(worst, Math.abs(folded[i] - twoPasses[loop + i]))
    expect(worst).toBeLessThanOrEqual(1e-6)
  })

  it('the seam check catches a hard cut: without the fold the wrap differs from a second pass', () => {
    // Known positive for the probe above: a loop that just drops its tail must fail it.
    const voices = scoreVoices()
    const loop = loopSamples(RATE)
    const cut = renderPasses(voices, RATE, 1).slice(0, loop)
    const twoPasses = renderPasses(voices, RATE, 2)
    let worst = 0
    for (let i = 0; i < loop; i++) worst = Math.max(worst, Math.abs(cut[i] - twoPasses[loop + i]))
    expect(worst).toBeGreaterThan(0.01)
  })

  it('plays in every bar: no bar of the loop falls below RMS 0.05', () => {
    const music = renderMusic(RATE)
    const perBar = music.length / BARS
    for (let bar = 0; bar < BARS; bar++) {
      expect(rms(music, Math.round(bar * perBar), Math.round((bar + 1) * perBar)), `bar ${bar + 1}`).toBeGreaterThanOrEqual(0.05)
    }
  })

  it('is scaled to its headroom peak and one loop long', () => {
    const music = renderMusic(RATE)
    expect(music).toHaveLength(loopSamples(RATE))
    expect(peak(music)).toBeCloseTo(MUSIC_PEAK, 5)
  })
})
