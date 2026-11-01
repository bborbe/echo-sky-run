/**
 * The rendered sounds: every effect recipe and the music loop as sample buffers. Pure, so the render
 * worker builds it off the main thread and a test can build it in node.
 */
import { RECIPE_IDS, RECIPES, type RecipeId } from './recipes.ts'
import { MUSIC_SAMPLE_RATE, renderMusic } from './score.ts'
import { renderSound } from './synth.ts'

export const EFFECT_SAMPLE_RATE = 32000

export interface EffectBank {
  readonly sampleRate: number
  readonly effects: Record<RecipeId, Float32Array>
}

export interface MusicBank {
  readonly sampleRate: number
  readonly music: Float32Array
}

export function renderEffects(sampleRate = EFFECT_SAMPLE_RATE): EffectBank {
  const effects = {} as Record<RecipeId, Float32Array>
  for (const id of RECIPE_IDS) effects[id] = renderSound(RECIPES[id], sampleRate)
  return { sampleRate, effects }
}

export function renderMusicBank(sampleRate = MUSIC_SAMPLE_RATE): MusicBank {
  return { sampleRate, music: renderMusic(sampleRate) }
}
