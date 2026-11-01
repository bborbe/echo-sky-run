/**
 * The two volume sliders and how they persist: pure, so the menu logic and the storage rules are
 * unit tests. The engine applies the values; the pause panel draws them.
 *
 * Settings live under their own key, apart from the save (`echo-sky-run.v1`), so the save schema's
 * versioning and migration never have to know about them.
 */

export interface Volumes {
  readonly music: number
  readonly effects: number
}

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

/** What a key press on the pause panel did. */
export type MenuAction = 'row' | 'volume' | 'none'

/**
 * The pause panel's volume rows. Space (the pad's A) or ↑/↓ moves between the rows, ←/→ (the pad's
 * D-pad) moves the selected slider one step. The pad sends no up/down, which is why Space also
 * picks the row.
 */
export class VolumeMenu {
  row: VolumeRow = 'music'
  volumes: Volumes

  constructor(volumes: Volumes) {
    this.volumes = volumes
  }

  key(code: string): MenuAction {
    switch (code) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'KeyW':
      case 'KeyS':
      case 'Space':
        this.row = this.row === 'music' ? 'effects' : 'music'
        return 'row'
      case 'ArrowLeft':
      case 'KeyA':
        return this.nudge(-1)
      case 'ArrowRight':
      case 'KeyD':
        return this.nudge(1)
      default:
        return 'none'
    }
  }

  /** Keys the menu owns while it is up; the game never sees them. */
  static owns(code: string): boolean {
    return MENU_KEYS.has(code)
  }

  private nudge(dir: -1 | 1): MenuAction {
    const current = this.volumes[this.row]
    const next = snapVolume(current + dir / VOLUME_STEPS)
    if (next === current) return 'none'
    this.volumes = { ...this.volumes, [this.row]: next }
    return 'volume'
  }
}

const MENU_KEYS = new Set(['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'Space', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'])
