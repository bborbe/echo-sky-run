/**
 * The two volume sliders and how they persist: pure, so the storage rules and the slider maths are
 * unit tests. The engine applies the values; the settings screen draws them and the shell moves them
 * one step at a time.
 *
 * Settings live under their own key, apart from the save (`echo-sky-run.v1`), so the save schema's
 * versioning and migration never have to know about them.
 */

export interface Volumes {
  readonly music: number
  readonly effects: number
}

/** Which slider a step moves. */
export type VolumeRow = 'music' | 'effects'

export const SETTINGS_KEY = 'echo-sky-run.settings.v1'
/** Music sits under the effects, so a jump is never lost in the band. */
export const DEFAULT_VOLUMES: Volumes = { music: 0.5, effects: 0.8 }
/** Each slider has this many steps; a press moves one. */
export const VOLUME_STEPS = 10

/** Clamp to 0..1 and snap to the slider's steps, so a stored value always lands on a drawn segment. */
export function snapVolume(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round(Math.min(1, Math.max(0, v)) * VOLUME_STEPS) / VOLUME_STEPS
}

/**
 * One slider moved one step. The result is snapped, so a press always lands on a drawn segment and a
 * press past either end changes nothing — the shell plays no tick when the object comes back the same.
 */
export function nudgeVolume(v: Volumes, row: VolumeRow, dir: -1 | 1): Volumes {
  const next = snapVolume(v[row] + dir / VOLUME_STEPS)
  return next === v[row] ? v : { ...v, [row]: next }
}

/**
 * The stored volumes, or the defaults. Every access is guarded: a browser in private mode, or with
 * storage disabled, throws on the first read, and a game that cannot start is worse than one that
 * forgets its volume.
 */
export function loadVolumes(storage: Pick<Storage, 'getItem'> | null): Volumes {
  try {
    const raw = storage?.getItem(SETTINGS_KEY)
    if (raw == null) return DEFAULT_VOLUMES
    const parsed = JSON.parse(raw) as Partial<Volumes>
    return {
      music: typeof parsed.music === 'number' ? snapVolume(parsed.music) : DEFAULT_VOLUMES.music,
      effects: typeof parsed.effects === 'number' ? snapVolume(parsed.effects) : DEFAULT_VOLUMES.effects,
    }
  } catch {
    return DEFAULT_VOLUMES
  }
}

export function saveVolumes(storage: Pick<Storage, 'setItem'> | null, v: Volumes): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify({ music: v.music, effects: v.effects }))
  } catch {
    // Storage unavailable: the volume still applies, it just is not remembered.
  }
}
