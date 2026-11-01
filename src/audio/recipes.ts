/**
 * Every sound effect as a synth recipe — the spec's § 9 Sound table in code. Nothing here is a
 * sample: each recipe is a handful of oscillator or noise voices, rendered by `synth.ts`.
 *
 * The mood follows the art direction, "painted sky, crisp clockwork": brassy tones, wooden and
 * metal clicks, glass for the Echo.
 */
import type { Voice } from './synth.ts'

/** Equal-tempered pitch of a MIDI note, A4 = 69 = 440 Hz. */
export function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** The 17 sound events level 1-1 can raise. */
export const GAME_EVENTS = [
  'jump',
  'land',
  'echo-place',
  'echo-expire',
  'echo-refuse',
  'stomp',
  'block',
  'mushroom-appear',
  'mushroom-collect',
  'shell-kick',
  'power-down',
  'death',
  'checkpoint',
  'goal',
  'ui-open',
  'ui-close',
  'ui-tick',
] as const

export type SoundEvent = (typeof GAME_EVENTS)[number]

/** Recipes for actions not in 1-1 yet. They are rendered and unit-tested now, and fire once built. */
export const LATER_RECIPES = ['spin', 'coin', 'switch'] as const

export type RecipeId = SoundEvent | (typeof LATER_RECIPES)[number]

/** Which recipe each event plays. One recipe per event — a test holds it injective. */
export const EVENT_RECIPE: Readonly<Record<SoundEvent, RecipeId>> = {
  jump: 'jump',
  land: 'land',
  'echo-place': 'echo-place',
  'echo-expire': 'echo-expire',
  'echo-refuse': 'echo-refuse',
  stomp: 'stomp',
  block: 'block',
  'mushroom-appear': 'mushroom-appear',
  'mushroom-collect': 'mushroom-collect',
  'shell-kick': 'shell-kick',
  'power-down': 'power-down',
  death: 'death',
  checkpoint: 'checkpoint',
  goal: 'goal',
  'ui-open': 'ui-open',
  'ui-close': 'ui-close',
  'ui-tick': 'ui-tick',
}

/** A brass note: two detuned saws through a low-pass that opens with the envelope. */
function brass(at: number, midi: number, dur: number, gain: number, extra: Partial<Voice> = {}): Voice {
  return {
    wave: 'saw',
    at,
    dur,
    freq: hz(midi),
    gain,
    detune: 7,
    attack: 0.012,
    decay: 0.08,
    sustain: 0.7,
    release: 0.08,
    lowpass: 900,
    lowpassEnv: 2600,
    ...extra,
  }
}

/** A square note with a short pluck envelope. */
function chip(at: number, midi: number, dur: number, gain: number, extra: Partial<Voice> = {}): Voice {
  return {
    wave: 'square',
    at,
    dur,
    freq: hz(midi),
    gain,
    attack: 0.003,
    decay: 0.05,
    sustain: 0.5,
    release: 0.05,
    lowpass: 4000,
    ...extra,
  }
}

export const RECIPES: Readonly<Record<RecipeId, readonly Voice[]>> = {
  // An upward sweep: the spec's jump since the first draft.
  jump: [
    {
      wave: 'square',
      at: 0,
      dur: 0.09,
      freq: 280,
      freqEnd: 620,
      gain: 0.35,
      duty: 0.25,
      decay: 0.05,
      sustain: 0.6,
      release: 0.05,
      lowpass: 3500,
    },
  ],
  // A soft thump with a puff of dust: heard on every landing, so it stays quiet and low.
  land: [
    { wave: 'sine', at: 0, dur: 0.07, freq: 140, freqEnd: 55, gain: 0.5, decay: 0.07, sustain: 0 },
    { wave: 'noise', at: 0, dur: 0.04, freq: 0, gain: 0.25, decay: 0.04, sustain: 0, lowpass: 700, seed: 11 },
  ],
  // Glass: three bell partials (G6, D7, G7) ringing out, with a slight upward lift.
  'echo-place': [
    { wave: 'sine', at: 0, dur: 0.38, freq: hz(91), freqEnd: hz(91) * 1.02, gain: 0.3, decay: 0.38, sustain: 0 },
    { wave: 'sine', at: 0, dur: 0.25, freq: hz(98), gain: 0.15, decay: 0.25, sustain: 0 },
    { wave: 'sine', at: 0, dur: 0.15, freq: hz(103), gain: 0.08, decay: 0.15, sustain: 0 },
  ],
  // The place sound played backwards: a swell from D7 down to G6, then cut.
  'echo-expire': [
    { wave: 'sine', at: 0, dur: 0.25, freq: hz(98), freqEnd: hz(91), gain: 0.25, attack: 0.24, release: 0.03 },
    { wave: 'sine', at: 0, dur: 0.25, freq: hz(86), freqEnd: hz(79), gain: 0.12, attack: 0.24, release: 0.03 },
  ],
  // A fizzle: pitched noise sweeping down over a low buzz.
  'echo-refuse': [
    {
      wave: 'noise',
      at: 0,
      dur: 0.2,
      freq: 2400,
      freqEnd: 300,
      gain: 0.35,
      attack: 0.003,
      decay: 0.2,
      sustain: 0,
      lowpass: 5000,
      seed: 23,
    },
    { wave: 'square', at: 0, dur: 0.15, freq: 110, gain: 0.08, attack: 0.003, decay: 0.15, sustain: 0, lowpass: 900 },
  ],
  // A thud, a puff and a short gear clank: the Gear-Goomba is clockwork.
  stomp: [
    { wave: 'sine', at: 0, dur: 0.13, freq: 170, freqEnd: 48, gain: 0.55, attack: 0.001, decay: 0.13, sustain: 0 },
    { wave: 'noise', at: 0, dur: 0.05, freq: 0, gain: 0.3, decay: 0.05, sustain: 0, lowpass: 1400, seed: 5 },
    { wave: 'square', at: 0.005, dur: 0.05, freq: 740, freqEnd: 700, gain: 0.1, decay: 0.05, sustain: 0 },
  ],
  // A wood-and-brass bonk under the head.
  block: [
    { wave: 'triangle', at: 0, dur: 0.14, freq: hz(72), freqEnd: hz(71), gain: 0.45, attack: 0.001, decay: 0.14, sustain: 0 },
    { wave: 'sine', at: 0, dur: 0.06, freq: hz(84), gain: 0.2, attack: 0.001, decay: 0.06, sustain: 0 },
    { wave: 'noise', at: 0, dur: 0.015, freq: 0, gain: 0.15, decay: 0.015, sustain: 0, lowpass: 3000, seed: 7 },
  ],
  // A bubbly sprout as the Mushroom rises.
  'mushroom-appear': [
    {
      wave: 'triangle',
      at: 0,
      dur: 0.42,
      freq: 220,
      freqEnd: 880,
      gain: 0.3,
      attack: 0.02,
      decay: 0.05,
      sustain: 0.8,
      release: 0.06,
      vibratoRate: 12,
      vibratoDepth: 0.6,
    },
  ],
  // The power-up arpeggio, F major up to F6.
  'mushroom-collect': [
    chip(0, 77, 0.06, 0.25),
    chip(0.06, 81, 0.06, 0.25),
    chip(0.12, 84, 0.06, 0.25),
    chip(0.18, 89, 0.2, 0.25, { release: 0.12 }),
  ],
  // A wooden tok as the shell slides off.
  'shell-kick': [
    { wave: 'square', at: 0, dur: 0.07, freq: 330, freqEnd: 210, gain: 0.35, decay: 0.07, sustain: 0, lowpass: 2500 },
    { wave: 'noise', at: 0, dur: 0.012, freq: 0, gain: 0.2, decay: 0.012, sustain: 0, lowpass: 4000, seed: 13 },
  ],
  // The hurt sound: a downward buzz with a shake in it.
  'power-down': [
    {
      wave: 'saw',
      at: 0,
      dur: 0.38,
      freq: 440,
      freqEnd: 110,
      gain: 0.3,
      attack: 0.005,
      decay: 0.1,
      sustain: 0.7,
      release: 0.05,
      vibratoRate: 16,
      vibratoDepth: 1,
      lowpass: 1800,
    },
  ],
  // A chromatic fall, the last note sliding down a third with vibrato.
  death: [
    chip(0, 72, 0.1, 0.28, { lowpass: 2200 }),
    chip(0.12, 71, 0.1, 0.28, { lowpass: 2200 }),
    chip(0.24, 70, 0.1, 0.28, { lowpass: 2200 }),
    chip(0.36, 69, 0.32, 0.28, {
      freqEnd: hz(65),
      lowpass: 2200,
      sustain: 0.7,
      release: 0.06,
      vibratoRate: 7,
      vibratoDepth: 0.5,
    }),
  ],
  // Brass up a fourth with a bell on top: progress kept.
  checkpoint: [
    brass(0, 72, 0.09, 0.25, { release: 0.04 }),
    brass(0.1, 77, 0.3, 0.25, { release: 0.15 }),
    { wave: 'sine', at: 0.1, dur: 0.4, freq: hz(89), gain: 0.12, decay: 0.4, sustain: 0 },
  ],
  // The fanfare: F A C up into a held F major chord, a kick under it and two music-box sparkles.
  goal: [
    brass(0, 65, 0.1, 0.22),
    brass(0.11, 69, 0.1, 0.22),
    brass(0.22, 72, 0.1, 0.22),
    brass(0.33, 77, 1.0, 0.16, { release: 0.4, vibratoRate: 5.5, vibratoDepth: 0.15, vibratoDelay: 0.2 }),
    brass(0.33, 81, 1.0, 0.13, { release: 0.4, vibratoRate: 5.5, vibratoDepth: 0.15, vibratoDelay: 0.2 }),
    brass(0.33, 84, 1.0, 0.11, { release: 0.4, vibratoRate: 5.5, vibratoDepth: 0.15, vibratoDelay: 0.2 }),
    { wave: 'sine', at: 0.33, dur: 0.15, freq: 110, freqEnd: 45, gain: 0.4, attack: 0.001, decay: 0.15, sustain: 0 },
    { wave: 'sine', at: 0.4, dur: 0.3, freq: hz(96), gain: 0.08, decay: 0.3, sustain: 0 },
    { wave: 'sine', at: 0.5, dur: 0.3, freq: hz(101), gain: 0.08, decay: 0.3, sustain: 0 },
  ],
  // UI: a rising pair to open, the same pair falling to close, and a tick for each step.
  'ui-open': [
    { wave: 'triangle', at: 0, dur: 0.04, freq: 660, gain: 0.22, release: 0.03 },
    { wave: 'triangle', at: 0.05, dur: 0.05, freq: 990, gain: 0.22, release: 0.04 },
  ],
  'ui-close': [
    { wave: 'triangle', at: 0, dur: 0.04, freq: 990, gain: 0.22, release: 0.03 },
    { wave: 'triangle', at: 0.05, dur: 0.05, freq: 660, gain: 0.22, release: 0.04 },
  ],
  'ui-tick': [{ wave: 'square', at: 0, dur: 0.05, freq: 1320, gain: 0.12, decay: 0.05, sustain: 0, lowpass: 4000 }],

  // --- recipes for actions that arrive after 1-1
  spin: [
    {
      wave: 'triangle',
      at: 0,
      dur: 0.22,
      freq: 600,
      freqEnd: 750,
      gain: 0.3,
      attack: 0.01,
      decay: 0.05,
      sustain: 0.8,
      release: 0.05,
      vibratoRate: 22,
      vibratoDepth: 3,
    },
  ],
  coin: [
    chip(0, 83, 0.06, 0.22, { release: 0.01, lowpass: 5000 }),
    chip(0.07, 88, 0.3, 0.22, { decay: 0.3, sustain: 0, lowpass: 5000 }),
  ],
  switch: [
    { wave: 'square', at: 0, dur: 0.015, freq: 1800, gain: 0.2, decay: 0.015, sustain: 0 },
    { wave: 'noise', at: 0, dur: 0.01, freq: 0, gain: 0.15, decay: 0.01, sustain: 0, lowpass: 6000, seed: 17 },
    { wave: 'square', at: 0.05, dur: 0.02, freq: 900, gain: 0.2, decay: 0.02, sustain: 0 },
  ],
}

/** Every recipe id, the 17 events' own first. */
export const RECIPE_IDS: readonly RecipeId[] = [...GAME_EVENTS, ...LATER_RECIPES]
