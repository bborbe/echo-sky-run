// Every animation the game draws, in one list. The tests walk it (palette, outline, distinct frames)
// and the `?sheet=1` contact sheet draws it, so a sprite that is not listed here is neither checked
// nor shown.

import {
  GOOMBA_KEYS,
  GOOMBA_SQUASH,
  GOOMBA_WALK,
  SHELL_REST,
  SHELL_SPIN,
  TURTLE_KEYS,
  TURTLE_WALK,
} from './enemies.ts'
import {
  DUST,
  DUST_KEYS,
  ECHO_KEYS,
  ECHO_PLATFORM,
  FIZZLE,
  FIZZLE_KEYS,
  RING_SEGMENTS,
  SPARK,
  SPARK_KEYS,
  SPAWN_RING_RADII,
  ghostMask,
  spawnRingMask,
  timerRingMask,
} from './fx.ts'
import { outlined, type Keys, type Mask } from './mask.ts'
import { PIP_KEYS, PIP_SMALL, PIP_SUPER, type PipFrames, type PipPose } from './pip.ts'
import {
  BLOCK_KEYS,
  CHECKPOINT_CLAIMED,
  CHECKPOINT_OPEN,
  FLAG_KEYS,
  GOAL_FLAG,
  MUSHROOM,
  MUSHROOM_KEYS,
  QBLOCK_FULL,
  QBLOCK_USED,
  SIGN,
  SIGN_KEYS,
} from './props.ts'
import { GROUND_FILL, GROUND_TOP, TILE_KEYS, tileMask } from './tiles.ts'

/**
 * What the spec § 9 outline rule applies to. Characters and props get the 1 px sepia outline;
 * tiles have only a grass lip, the Echo is glass with a bright rim, and effects are loose pixels.
 */
export type SpriteKind = 'character' | 'prop' | 'tile' | 'echo' | 'fx'

export interface Animation {
  readonly name: string
  readonly kind: SpriteKind
  readonly keys: Keys
  readonly frames: readonly Mask[]
  /** Moving animations need ≥ 2 distinct frames; held poses have exactly one. */
  readonly moves: boolean
}

const PIP_MOVING: ReadonlySet<PipPose> = new Set(['idle', 'run', 'sprint', 'death'])
const PIP_POSES: readonly PipPose[] = ['idle', 'run', 'sprint', 'jump', 'fall', 'land', 'skid', 'death']

function pip(form: string, frames: PipFrames): Animation[] {
  return PIP_POSES.map((pose) => ({
    name: `pip-${form}-${pose}`,
    kind: 'character' as const,
    keys: PIP_KEYS,
    frames: frames[pose],
    moves: PIP_MOVING.has(pose),
  }))
}

/** The fading platform: rim and core dimmed to the core colour, for the blink's "off" beat. */
export const ECHO_PLATFORM_FADING: Mask = ECHO_PLATFORM.map((row) => row.replace(/r/g, 'c'))

const DRAWN: readonly Animation[] = [
  ...pip('small', PIP_SMALL),
  ...pip('super', PIP_SUPER),

  { name: 'echo-platform', kind: 'echo', keys: ECHO_KEYS, frames: [ECHO_PLATFORM], moves: false },
  { name: 'echo-ghost', kind: 'echo', keys: ECHO_KEYS, frames: [ghostMask(PIP_SMALL.idle[0])], moves: false },
  { name: 'echo-fading', kind: 'echo', keys: ECHO_KEYS, frames: [ECHO_PLATFORM, ECHO_PLATFORM_FADING], moves: true },
  { name: 'echo-refused', kind: 'fx', keys: FIZZLE_KEYS, frames: FIZZLE, moves: true },
  {
    name: 'echo-spawn-ring',
    kind: 'echo',
    keys: ECHO_KEYS,
    frames: SPAWN_RING_RADII.filter((r, i, all) => all.indexOf(r) === i).map(spawnRingMask),
    moves: true,
  },
  {
    name: 'echo-timer-ring',
    kind: 'echo',
    keys: ECHO_KEYS,
    frames: Array.from({ length: RING_SEGMENTS + 1 }, (_, lit) => timerRingMask(lit)),
    moves: true,
  },
  { name: 'echo-spark', kind: 'fx', keys: SPARK_KEYS, frames: SPARK, moves: true },

  { name: 'goomba-walk', kind: 'character', keys: GOOMBA_KEYS, frames: GOOMBA_WALK, moves: true },
  { name: 'goomba-squash', kind: 'character', keys: GOOMBA_KEYS, frames: [GOOMBA_SQUASH], moves: false },
  { name: 'turtle-walk', kind: 'character', keys: TURTLE_KEYS, frames: TURTLE_WALK, moves: true },
  { name: 'turtle-shell', kind: 'character', keys: TURTLE_KEYS, frames: [SHELL_REST], moves: false },
  { name: 'turtle-shell-kicked', kind: 'character', keys: TURTLE_KEYS, frames: SHELL_SPIN, moves: true },

  { name: 'qblock-full', kind: 'prop', keys: BLOCK_KEYS, frames: QBLOCK_FULL, moves: true },
  { name: 'qblock-used', kind: 'prop', keys: BLOCK_KEYS, frames: [QBLOCK_USED], moves: false },
  { name: 'mushroom', kind: 'prop', keys: MUSHROOM_KEYS, frames: [MUSHROOM], moves: false },
  { name: 'checkpoint-open', kind: 'prop', keys: FLAG_KEYS, frames: CHECKPOINT_OPEN, moves: true },
  { name: 'checkpoint-claimed', kind: 'prop', keys: FLAG_KEYS, frames: CHECKPOINT_CLAIMED, moves: true },
  { name: 'goal-flag', kind: 'prop', keys: FLAG_KEYS, frames: GOAL_FLAG, moves: true },
  { name: 'sign', kind: 'prop', keys: SIGN_KEYS, frames: [SIGN], moves: false },

  { name: 'tile-top', kind: 'tile', keys: TILE_KEYS, frames: [GROUND_TOP], moves: false },
  { name: 'tile-fill', kind: 'tile', keys: TILE_KEYS, frames: GROUND_FILL, moves: false },
  {
    name: 'tile-edges',
    kind: 'tile',
    keys: TILE_KEYS,
    frames: [
      tileMask({ top: true, left: true, right: false, bottom: false, variant: 0 }),
      tileMask({ top: true, left: false, right: true, bottom: false, variant: 0 }),
      tileMask({ top: false, left: true, right: false, bottom: false, variant: 0 }),
      tileMask({ top: false, left: false, right: true, bottom: false, variant: 1 }),
      tileMask({ top: true, left: true, right: true, bottom: true, variant: 0 }),
    ],
    moves: false,
  },

  { name: 'dust', kind: 'fx', keys: DUST_KEYS, frames: DUST, moves: true },
]

/** One animation by name. Throws on a typo, so the renderer cannot silently draw nothing. */
export function animation(name: string): Animation {
  const found = CATALOGUE.find((a) => a.name === name)
  if (found === undefined) throw new Error(`no animation named ${name}`)
  return found
}

/**
 * The catalogue as drawn: characters and props get their outline closed (`outlined`), so the
 * spec § 9 rule holds for every frame on screen.
 */
export const CATALOGUE: readonly Animation[] = DRAWN.map((anim) =>
  anim.kind === 'character' || anim.kind === 'prop' ? { ...anim, frames: anim.frames.map((f) => outlined(f)) } : anim,
)
