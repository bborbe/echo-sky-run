/**
 * The save: everything the game remembers between runs. Versioned, and migrated on read.
 *
 * The storage key keeps the name it has carried since G1 (`echo-sky-run.v1`), so a store written by
 * the previous build is found exactly where it was left. The version lives in the *payload*, not in
 * the key: bumping the schema must not orphan a player's best time.
 *
 * Settings are deliberately not here. They sit under their own key (`echo-sky-run.settings.v1`), so
 * a save migration never has to know about them — and a settings change never has to bump the save.
 *
 * Pure and DOM-free: the storage is passed in, so the migration rules are unit tests.
 */

export const SAVE_KEY = 'echo-sky-run.v1'

/** The schema this build writes. Version 0 is G1's unversioned `{ "bestSeconds": 42 }` store. */
export const SAVE_VERSION = 1

export interface Save {
  readonly version: number
  /** The fastest clear of level 1-1 in seconds, or null before the first finish. */
  readonly bestSeconds: number | null
}

/** A save with nothing in it: what a first run starts from. */
export const EMPTY_SAVE: Save = { version: SAVE_VERSION, bestSeconds: null }

/** What a store may hold before migration. Every field is unknown until it has been checked. */
interface StoredSave {
  readonly version?: unknown
  readonly bestSeconds?: unknown
}

function isRecord(value: unknown): value is StoredSave {
  return typeof value === 'object' && value !== null
}

/**
 * A version the payload declares, or 0 for a payload that has none. A non-integer, a negative or a
 * string is treated as "no version" rather than as a version this build understands.
 */
function storedVersion(stored: StoredSave): number {
  const v = stored.version
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0
}

/**
 * A stored best time, or null. Only a finite positive number counts: a zero or a negative could not
 * have come from a finished run, and a string is a shape this build never wrote.
 */
function storedBest(stored: StoredSave): number | null {
  const v = stored.bestSeconds
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

/**
 * Bring any payload this build has ever written up to `SAVE_VERSION`.
 *
 * Version 0 → 1: the unversioned `{ bestSeconds }` store gains its version field and keeps its best
 * time. A payload from a *newer* build is not guessed at — it becomes `EMPTY_SAVE`, and `loadSave`
 * leaves the store alone so a later build still finds what it wrote.
 */
export function migrate(raw: unknown): Save {
  if (!isRecord(raw)) return EMPTY_SAVE
  if (storedVersion(raw) > SAVE_VERSION) return EMPTY_SAVE
  return { version: SAVE_VERSION, bestSeconds: storedBest(raw) }
}

/** True when `raw` is an older payload that `migrate` upgrades, so `loadSave` can rewrite it once. */
function isLegacy(raw: unknown): boolean {
  return isRecord(raw) && storedVersion(raw) < SAVE_VERSION
}

function write(storage: Pick<Storage, 'setItem'>, save: Save): void {
  storage.setItem(SAVE_KEY, JSON.stringify({ version: save.version, bestSeconds: save.bestSeconds }))
}

/**
 * The stored save, or `EMPTY_SAVE`. Every access is guarded: a browser in private mode, or with
 * storage disabled, throws on the first read, and a game that cannot start is worse than one that
 * forgets its best time.
 *
 * A legacy payload is written back in the current shape, so the migration runs once rather than on
 * every load. A payload from a newer build is never written back.
 */
export function loadSave(storage: Pick<Storage, 'getItem' | 'setItem'> | null): Save {
  try {
    const raw = storage?.getItem(SAVE_KEY)
    if (raw == null) return EMPTY_SAVE
    const parsed: unknown = JSON.parse(raw)
    const save = migrate(parsed)
    if (storage !== null && isLegacy(parsed)) write(storage, save)
    return save
  } catch {
    return EMPTY_SAVE
  }
}

/** Persist a save. Storage being unavailable is not an error: the run still counts, it is not kept. */
export function storeSave(storage: Pick<Storage, 'setItem'> | null, save: Save): void {
  try {
    if (storage !== null) write(storage, save)
  } catch {
    // Storage unavailable: the run still counts, it just is not remembered.
  }
}

/**
 * The save with `seconds` recorded if it beats the stored best. Returns the same object when it does
 * not, so a caller can skip the write — the same shape the settings sliders use for "nothing moved".
 */
export function recordBest(save: Save, seconds: number): Save {
  if (save.bestSeconds !== null && seconds >= save.bestSeconds) return save
  return { version: SAVE_VERSION, bestSeconds: seconds }
}
