/**
 * The Web Audio side: unlock, the two buses, playback, the music loop's pause and resume, the hidden
 * tab, and the `?audiolog=1` trace. The only audio module that touches the browser; what it plays is
 * decided by the pure modules beside it.
 *
 * Graph: effect source → effects analyser → effects volume ─┐
 *        music source → music fader → music analyser → music volume ─┴→ master → compressor → out
 *
 * The analysers sit before the volume gains, so the browser check reads what is played whatever the
 * sliders or `?vol=0` say. The compressor keeps rapid repeats from clipping.
 */
import { renderEffects, renderMusicBank, type EffectBank, type MusicBank } from './bank.ts'
import { EVENT_RECIPE, type RecipeId, type SoundEvent } from './recipes.ts'
import type { VolumeRow, Volumes } from './settings.ts'

export type BankMessage = { kind: 'effects'; bank: EffectBank } | { kind: 'music'; bank: MusicBank }

/** One line of the `?audiolog=1` trace: a sound started on its bus, or dropped before it could be. */
export interface AudioLogEntry {
  /** Milliseconds since page load. */
  readonly t: number
  readonly event: SoundEvent
  readonly recipe: RecipeId
  readonly played: boolean
}

/** An event raised before the context or the buffers exist plays late rather than not at all. */
const PENDING_MAX_AGE_MS = 500
const PENDING_MAX = 16
const MUSIC_FADE_S = 0.06
/** Long enough for the music fade to reach the analyser before the context freezes. */
const SUSPEND_DELAY_MS = 150

export interface AudioEngineOptions {
  readonly volumes: Volumes
  /** `?vol=0`: the master is silent, everything else runs. */
  readonly muted: boolean
  /** `?audiolog=1`: keep the trace. */
  readonly log: boolean
  /** Builds the render worker; null renders on the main thread instead. */
  readonly worker: (() => Worker) | null
  readonly now: () => number
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private effectsIn: AnalyserNode | null = null
  private effectsGain: GainNode | null = null
  private musicFader: GainNode | null = null
  private musicAnalyser: AnalyserNode | null = null
  private musicGain: GainNode | null = null

  private effectBank: EffectBank | null = null
  private musicBank: MusicBank | null = null
  private readonly effectBuffers = new Map<RecipeId, AudioBuffer>()
  private musicBuffer: AudioBuffer | null = null
  private readonly sounding = new Map<RecipeId, AudioBufferSourceNode>()
  private readonly pending: { event: SoundEvent; at: number }[] = []

  private musicSource: AudioBufferSourceNode | null = null
  private musicStartedAt = 0
  private musicOffset = 0
  private hidden = false
  private suspendTimer: ReturnType<typeof setTimeout> | null = null
  private scratch: Float32Array<ArrayBuffer> | null = null

  private vols: Volumes
  private readonly muted: boolean
  private readonly now: () => number
  readonly log: AudioLogEntry[] | null

  constructor(options: AudioEngineOptions) {
    this.vols = options.volumes
    this.muted = options.muted
    this.now = options.now
    this.log = options.log ? [] : null
    this.render(options.worker)
  }

  /** True once a user gesture created the context. */
  get unlocked(): boolean {
    return this.ctx !== null
  }

  /** `locked` before the first gesture, then the context's own state. */
  get state(): 'locked' | AudioContextState {
    return this.ctx === null ? 'locked' : this.ctx.state
  }

  /** Both banks rendered. */
  get ready(): boolean {
    return this.effectBank !== null && this.musicBank !== null
  }

  volumes(): Volumes {
    return this.vols
  }

  /**
   * Create the context. Call it from a trusted key or click handler, before raising that input's own
   * sound: browsers start audio only inside a user gesture.
   */
  unlock(): void {
    if (this.ctx !== null) {
      if (this.ctx.state === 'suspended' && !this.hidden) void this.ctx.resume()
      return
    }
    let ctx: AudioContext
    try {
      ctx = new AudioContext()
    } catch {
      return
    }
    this.ctx = ctx

    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -10
    compressor.ratio.value = 6
    compressor.connect(ctx.destination)

    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 1
    this.master.connect(compressor)

    this.effectsGain = ctx.createGain()
    this.effectsGain.gain.value = this.vols.effects
    this.effectsGain.connect(this.master)
    this.effectsIn = ctx.createAnalyser()
    this.effectsIn.fftSize = 2048
    this.effectsIn.connect(this.effectsGain)

    this.musicGain = ctx.createGain()
    this.musicGain.gain.value = this.vols.music
    this.musicGain.connect(this.master)
    this.musicAnalyser = ctx.createAnalyser()
    this.musicAnalyser.fftSize = 2048
    this.musicAnalyser.connect(this.musicGain)
    this.musicFader = ctx.createGain()
    this.musicFader.gain.value = 0
    this.musicFader.connect(this.musicAnalyser)

    if (ctx.state === 'suspended') void ctx.resume()
    this.buildBuffers()
    this.flush()
  }

  /** Play an event's sound now, or as soon as the context and its buffer exist. */
  play(event: SoundEvent): void {
    if (this.ctx === null || !this.effectBuffers.has(EVENT_RECIPE[event])) {
      if (this.pending.length >= PENDING_MAX) this.drop(this.pending.shift()!.event)
      this.pending.push({ event, at: this.now() })
      return
    }
    this.start(event)
  }

  /**
   * Whether the music should be sounding: called every frame with the game's state, it acts only on a
   * change. Stopping keeps the position, so a resume picks up where the pause left it.
   */
  setMusic(on: boolean): void {
    const ctx = this.ctx
    if (ctx === null || this.musicFader === null) return
    if (on && this.musicSource === null && this.musicBuffer !== null && !this.hidden) {
      const src = ctx.createBufferSource()
      src.buffer = this.musicBuffer
      src.loop = true
      src.connect(this.musicFader)
      const t = ctx.currentTime
      src.start(t, this.musicOffset)
      this.musicFader.gain.cancelScheduledValues(t)
      this.musicFader.gain.setValueAtTime(0, t)
      this.musicFader.gain.linearRampToValueAtTime(1, t + MUSIC_FADE_S)
      this.musicSource = src
      this.musicStartedAt = t - this.musicOffset
    } else if (!on && this.musicSource !== null) {
      const t = ctx.currentTime
      this.musicOffset = this.musicTime()
      this.musicFader.gain.cancelScheduledValues(t)
      this.musicFader.gain.setValueAtTime(this.musicFader.gain.value, t)
      this.musicFader.gain.linearRampToValueAtTime(0, t + MUSIC_FADE_S)
      this.musicSource.stop(t + MUSIC_FADE_S)
      this.musicSource = null
    }
  }

  /** A new run: the music starts from the top the next time it plays. */
  restartMusic(): void {
    this.setMusic(false)
    this.musicOffset = 0
  }

  /** Seconds into the loop the music is at — frozen while it is stopped or the context suspended. */
  musicTime(): number {
    const ctx = this.ctx
    if (ctx === null || this.musicSource === null || this.musicBuffer === null) return this.musicOffset
    const d = this.musicBuffer.duration
    return (((ctx.currentTime - this.musicStartedAt) % d) + d) % d
  }

  /** The tab was hidden or shown: stop the music, then freeze the whole context until it returns. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden
    if (this.suspendTimer !== null) clearTimeout(this.suspendTimer)
    this.suspendTimer = null
    const ctx = this.ctx
    if (ctx === null) return
    if (hidden) {
      this.setMusic(false)
      this.suspendTimer = setTimeout(() => void ctx.suspend(), SUSPEND_DELAY_MS)
    } else {
      void ctx.resume()
    }
  }

  setVolume(row: VolumeRow, value: number): void {
    this.vols = { ...this.vols, [row]: value }
    const gain = row === 'music' ? this.musicGain : this.effectsGain
    const ctx = this.ctx
    if (gain === null || ctx === null) return
    gain.gain.cancelScheduledValues(ctx.currentTime)
    gain.gain.setValueAtTime(value, ctx.currentTime)
  }

  /** The two bus gains as the audio graph holds them, or null before the unlock. */
  gains(): Volumes | null {
    if (this.musicGain === null || this.effectsGain === null) return null
    return { music: this.musicGain.gain.value, effects: this.effectsGain.gain.value }
  }

  /** Peak level on each bus right now, read before the volume gain. For the browser check. */
  levels(): { music: number; effects: number } {
    return { music: this.peakOf(this.musicAnalyser), effects: this.peakOf(this.effectsIn) }
  }

  private peakOf(analyser: AnalyserNode | null): number {
    if (analyser === null) return 0
    if (this.scratch === null || this.scratch.length !== analyser.fftSize) {
      this.scratch = new Float32Array(analyser.fftSize)
    }
    analyser.getFloatTimeDomainData(this.scratch)
    let max = 0
    for (const s of this.scratch) max = Math.max(max, Math.abs(s))
    return max
  }

  private start(event: SoundEvent): void {
    const ctx = this.ctx!
    const recipe = EVENT_RECIPE[event]
    const buffer = this.effectBuffers.get(recipe)!
    // A recipe retriggered while still sounding cuts its previous instance: repeats stay crisp
    // instead of stacking into a clip.
    const previous = this.sounding.get(recipe)
    if (previous !== undefined) {
      try {
        previous.stop()
      } catch {
        // already ended
      }
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.effectsIn!)
    src.onended = () => {
      if (this.sounding.get(recipe) === src) this.sounding.delete(recipe)
    }
    src.start()
    this.sounding.set(recipe, src)
    this.log?.push({ t: Math.round(this.now()), event, recipe, played: true })
  }

  private drop(event: SoundEvent): void {
    this.log?.push({ t: Math.round(this.now()), event, recipe: EVENT_RECIPE[event], played: false })
  }

  /** Play what waited for the unlock or the render, if it is still recent enough to belong. */
  private flush(): void {
    if (this.ctx === null || this.effectBuffers.size === 0) return
    const now = this.now()
    const waiting = this.pending.splice(0)
    for (const p of waiting) {
      if (now - p.at <= PENDING_MAX_AGE_MS) this.start(p.event)
      else this.drop(p.event)
    }
  }

  private buildBuffers(): void {
    const ctx = this.ctx
    if (ctx === null) return
    if (this.effectBank !== null && this.effectBuffers.size === 0) {
      const { sampleRate, effects } = this.effectBank
      for (const id of Object.keys(effects) as RecipeId[]) {
        this.effectBuffers.set(id, toBuffer(ctx, effects[id], sampleRate))
      }
    }
    if (this.musicBank !== null && this.musicBuffer === null) {
      this.musicBuffer = toBuffer(ctx, this.musicBank.music, this.musicBank.sampleRate)
    }
  }

  private receive(message: BankMessage): void {
    if (message.kind === 'effects') this.effectBank = message.bank
    else this.musicBank = message.bank
    this.buildBuffers()
    this.flush()
  }

  /** Start the render: in the worker when there is one, else on the main thread after load. */
  private render(makeWorker: (() => Worker) | null): void {
    let worker: Worker | null = null
    try {
      worker = makeWorker === null ? null : makeWorker()
    } catch {
      worker = null
    }
    if (worker !== null) {
      worker.onmessage = (e: MessageEvent<BankMessage>) => this.receive(e.data)
      worker.postMessage('render')
      return
    }
    setTimeout(() => {
      this.receive({ kind: 'effects', bank: renderEffects() })
      setTimeout(() => this.receive({ kind: 'music', bank: renderMusicBank() }), 0)
    }, 0)
  }
}

function toBuffer(ctx: BaseAudioContext, samples: Float32Array, sampleRate: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, samples.length, sampleRate)
  buffer.getChannelData(0).set(samples)
  return buffer
}
