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

/**
 * The schema this build writes. Version 0 is G1's unversioned `{ "bestSeconds": 42 }` store;
 * version 1 added the unlock list; version 2 adds per-level Relic Coins and best times.
 */
export const SAVE_VERSION = 2

/** A per-level number keyed by level id — Relic Coins collected, or a best time in seconds. */
export type LevelCounts = Readonly<Record<string, number>>

export interface Save {
  readonly version: number
  /** The fastest clear of level 1-1 in seconds, or null before the first finish. */
  readonly bestSeconds: number | null
  /**
   * The level ids the player has unlocked, or absent before this build tracked unlocks. Absent means
   * "not tracked yet" and leaves every level open; a list narrows that to exactly the ids it holds,
   * so an explicit empty list means nothing is unlocked.
   */
  readonly unlockedLevels?: readonly string[]
  /** Relic Coins collected per level; a level with no entry has collected none. */
  readonly relics?: LevelCounts
  /**
   * The fastest clear per level, in seconds. Level 1-1 is mirrored in `bestSeconds`, which predates
   * this map and is what the results screen and the browser check read.
   */
  readonly bestTimes?: LevelCounts
}

/** A save with nothing in it: what a first run starts from. */
export const EMPTY_SAVE: Save = { version: SAVE_VERSION, bestSeconds: null }

/**
 * The save a first run writes: 1-1 open and nothing else. Seeded explicitly rather than left
 * untracked, because `isUnlocked` is default-open — an untracked save would leave the lock gate
 * inert for every new player.
 */
export function freshSave(): Save {
  return { version: SAVE_VERSION, bestSeconds: null, unlockedLevels: ['1-1'], relics: {}, bestTimes: {} }
}

/** What a store may hold before migration. Every field is unknown until it has been checked. */
interface StoredSave {
  readonly version?: unknown
  readonly bestSeconds?: unknown
  readonly unlockedLevels?: unknown
  readonly relics?: unknown
  readonly bestTimes?: unknown
}

function isRecord(value: unknown): value is StoredSave {
  return typeof value === 'object' && value !== null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
 * A stored unlock list, or undefined when the payload carries none. An absent list is how a save
 * written before unlock tracking looks, and it means "everything is open". A list holding anything
 * that is not a non-empty string is not guessed at — it degrades to undefined rather than bricking
 * every tile, the same way a malformed version falls back instead of throwing.
 */
function storedUnlocked(stored: StoredSave): readonly string[] | undefined {
  const v = stored.unlockedLevels
  if (!Array.isArray(v)) return undefined
  if (!v.every((id): id is string => typeof id === 'string' && id !== '')) return undefined
  return v
}

/**
 * A stored per-level count map, or undefined when the payload carries none or holds anything this
 * build could not have written. A negative, a non-finite number or an empty key degrades the whole
 * map to undefined rather than half-reading it.
 */
function storedCounts(value: unknown): LevelCounts | undefined {
  if (!isPlainObject(value)) return undefined
  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (key === '' || typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return undefined
    out[key] = raw
  }
  return out
}

/**
 * The per-level best-time map with level 1-1's entry materialised from `bestSeconds`. 1-1's best
 * time predates the map, so it is the one entry that can exist without a map key; keeping the two in
 * step on every read and write means a round-trip is stable.
 */
function bestTimesWithAlias(bestSeconds: number | null, bestTimes: LevelCounts | undefined): LevelCounts {
  const merged: Record<string, number> = { ...(bestTimes ?? {}) }
  if (bestSeconds !== null && merged['1-1'] === undefined) merged['1-1'] = bestSeconds
  return merged
}

/**
 * Bring any payload this build has ever written up to `SAVE_VERSION`.
 *
 * Version 0 → 1: the unversioned `{ bestSeconds }` store gains its version field and keeps its best
 * time. Version 1 → 2: the single best time becomes 1-1's entry in `bestTimes`, and a save that never
 * tracked unlocks starts with 1-1 open — so the lock gate is real for a returning player instead of
 * inert. A payload from a *newer* build is not guessed at — it becomes `EMPTY_SAVE`, and `loadSave`
 * leaves the store alone so a later build still finds what it wrote.
 */
export function migrate(raw: unknown): Save {
  if (!isRecord(raw)) return EMPTY_SAVE
  const version = storedVersion(raw)
  if (version > SAVE_VERSION) return EMPTY_SAVE

  const bestSeconds = storedBest(raw)
  const storedList = storedUnlocked(raw)
  const relics = storedCounts(raw.relics)
  const bestTimes = storedCounts(raw.bestTimes)

  // A payload carrying nothing this build understands is not a save at all: it degrades to the empty
  // save rather than inventing a 1-1-only lock state from garbage.
  const hasContent =
    version > 0 || bestSeconds !== null || storedList !== undefined || relics !== undefined || bestTimes !== undefined
  if (!hasContent) return EMPTY_SAVE

  // A v0/v1 save that never carried an unlock list starts with 1-1 open. A list that is present but
  // malformed stays untracked (every level open), so a corrupt list cannot lock a player out.
  const listAbsent = raw.unlockedLevels === undefined
  const looksLegacy = version > 0 || bestSeconds !== null
  const unlockedLevels = storedList ?? (listAbsent && version < 2 && looksLegacy ? ['1-1'] : undefined)

  return {
    version: SAVE_VERSION,
    bestSeconds,
    ...(unlockedLevels === undefined ? {} : { unlockedLevels }),
    relics: relics ?? {},
    bestTimes: bestTimesWithAlias(bestSeconds, bestTimes),
  }
}

/** True when `raw` is an older payload that `migrate` upgrades, so `loadSave` can rewrite it once. */
function isLegacy(raw: unknown): boolean {
  return isRecord(raw) && storedVersion(raw) < SAVE_VERSION
}

function write(storage: Pick<Storage, 'setItem'>, save: Save): void {
  storage.setItem(
    SAVE_KEY,
    JSON.stringify({
      version: save.version,
      bestSeconds: save.bestSeconds,
      ...(save.unlockedLevels === undefined ? {} : { unlockedLevels: save.unlockedLevels }),
      relics: save.relics ?? {},
      bestTimes: bestTimesWithAlias(save.bestSeconds, save.bestTimes),
    }),
  )
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
 * The save with `seconds` recorded if it beats the stored best for level 1-1. Returns the same
 * object when it does not, so a caller can skip the write — the same shape the settings sliders use
 * for "nothing moved". Every other field rides along, so recording a time never drops the unlock
 * list, the Relic Coins or the other levels' best times.
 */
export function recordBest(save: Save, seconds: number): Save {
  if (save.bestSeconds !== null && seconds >= save.bestSeconds) return save
  return {
    ...save,
    bestSeconds: seconds,
    bestTimes: { ...(save.bestTimes ?? {}), '1-1': seconds },
  }
}

/**
 * The save with a level's best time recorded if it beats that level's stored best. Returns the same
 * object when it does not, so a caller can skip the write. Level 1-1 also updates `bestSeconds`,
 * which stays its alias for the results screen.
 */
export function recordLevelBest(save: Save, id: string, seconds: number): Save {
  if (id === '') return save
  const times = save.bestTimes ?? {}
  const current = times[id]
  if (current !== undefined && seconds >= current) return save
  if (id === '1-1' && save.bestSeconds !== null && seconds >= save.bestSeconds) return save
  return {
    ...save,
    ...(id === '1-1' ? { bestSeconds: seconds } : {}),
    bestTimes: { ...times, [id]: seconds },
  }
}

/** The Relic Coins collected on a level; a level with no entry has none. */
export function relicsFor(save: Save, id: string): number {
  return save.relics?.[id] ?? 0
}

/** The best time on a level in seconds, or null before it has been cleared. */
export function bestTimeFor(save: Save, id: string): number | null {
  const v = save.bestTimes?.[id]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

/**
 * True when `id` may be started. A save written before unlock tracking carries no list, and then
 * every level is open — that is what keeps a first run (and the browser check) playable. A list
 * narrows the set to exactly the ids it holds, so the tile view's lock state is read from the save
 * and never from a hardcoded catalogue.
 */
export function isUnlocked(save: Save, id: string): boolean {
  return save.unlockedLevels === undefined || save.unlockedLevels.includes(id)
}

/**
 * The save with `id` added to its unlock list, or the same object when it needs nothing. An untracked
 * save already has every level open, so the first unlock is a no-op rather than a list that would
 * suddenly narrow — the list is only ever extended on a save that already tracks unlocks.
 *
 * An empty id is refused: `storedUnlocked` treats a list holding one as malformed, so writing it
 * would degrade the whole list to "untracked" on the next load.
 */
export function unlockLevel(save: Save, id: string): Save {
  if (id === '' || isUnlocked(save, id)) return save
  return { ...save, unlockedLevels: [...(save.unlockedLevels ?? []), id] }
}
