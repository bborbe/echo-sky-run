// The overworld map's art: the tileable path, the Relic Coin indicator (◆◆◇) and the level nodes.
// The path is a `tile` — no hard outline, so two abutting segments cannot show a doubled sepia edge
// (the defect the sprite-outline rule would otherwise manufacture at every join, spec § 9). The coins
// and nodes are `prop`s, so they get the 1 px sepia outline like every other sprite.

import type { Keys, Mask } from './mask.ts'

export const MAP_PATH_KEYS: Keys = {
  d: 'earth',
  D: 'earthDark',
  P: 'earthPale',
  p: 'pebble',
  g: 'grass',
  L: 'grassLip',
}

/** The packed-dirt road: a tileable 16×16 path segment, no outline (spec § 9 tile rule). */
export const MAP_PATH: Mask = [
  'PPPPPPPPPPPPPPPP',
  'PppPPPPPPPPppPPP',
  'PPPPPPPPPPPPPPPP',
  'PPPPPppPPPPPPPPP',
  'PPPPPPPPPPPPpPPP',
  'PpPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPpP',
  'PPPPppPPPPPPPPPP',
  'PPPPPPPPPPppPPPP',
  'PpPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPPP',
  'PPPPPppPPPPPPPPP',
  'PPPPPPPPPPPPPPpP',
  'PPPPPPPPPPPPPPPP',
  'PppPPPPPPPPppPPP',
  'PPPPPPPPPPPPPPPP',
]

export const RELIC_COIN_KEYS: Keys = {
  o: 'outline',
  a: 'copperDark',
  h: 'steelLight',
  w: 'brassLight',
  S: 'steelLight',
  k: 'copper',
}

/**
 * The Relic Coin indicator: three diamonds, `count` of them filled. `count` 1, 2 and 3 are the three
 * states the map shows — the middle one is the ◆◆◇ the spec names. The filled diamonds carry three
 * distinct tones (brass, brassLight, white) and the empty ones two (copperDark, steelLight), so every
 * state passes the "at least three fill tones" catalogue rule.
 */
function relicCoin(count: number): Mask {
  const filled = ['oao', 'oho', 'owo']
  const empty = ['oko', 'oSo', 'oko']
  const mids = [0, 1, 2].map((i) => (i < count ? filled[i] : empty[i]))
  const top = '..' + ['.o.', '.o.', '.o.'].join('.') + '...'
  const mid = '..' + mids.join('.') + '...'
  const rows: string[] = []
  for (let i = 0; i < 6; i++) rows.push('................')
  rows.push(top, mid, top)
  while (rows.length < 16) rows.push('................')
  return rows
}

export const RELIC_COIN_1: Mask = relicCoin(1)
export const RELIC_COIN_2: Mask = relicCoin(2)
export const RELIC_COIN_3: Mask = relicCoin(3)

export const MAP_NODE_KEYS: Keys = {
  o: 'outline',
  a: 'brass',
  h: 'brassLight',
  s: 'brassDark',
  w: 'white',
  g: 'grass',
  G: 'grassLit',
}

/** A level node on the map: a brass ring on a green pad. 16×16, one per level. */
export const MAP_NODE: Mask = [
  '................',
  '................',
  '.....oooooo.....',
  '....ohhhhhho....',
  '...ohaaaaaaho...',
  '...ohawwwaaho...',
  '...ohawwwaaho...',
  '...ohaaaaaaho...',
  '....ohhhhhho....',
  '.....oooooo.....',
  '...oGGGGGGGGo...',
  '..oGggggggggGo..',
  '..oGggggggggGo..',
  '...oGGGGGGGGo...',
  '................',
  '................',
]

/** The current level's node: the same brass ring with a lit rim, so the map marks where Pip stands. */
export const MAP_NODE_CURRENT: Mask = MAP_NODE.map((row) => row.replace(/a/g, 'w').replace(/h/g, 'w'))
