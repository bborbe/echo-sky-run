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
  h: 'brass',
  w: 'brassLight',
  s: 'steel',
  S: 'steelLight',
}

/**
 * The Relic Coin indicator: three tokens, `count` of them filled. `count` 1, 2 and 3 are the three
 * states the map shows — the middle one is the ◆◆◇ the spec names. Each token is a 4×3 block with a
 * 1 px tip above and below, so the group still reads as ◆◆◇ while covering enough of the 16×16 box
 * to clear the SC4 readability band: the probe averages the whole box, and a hairline sprite that is
 * 95 % transparent sits within a few grey levels of the background however dark its few pixels are.
 * A filled token is warm (copperDark, brass, brassLight) and an empty one cool (steelLight, steel),
 * so 1, 2 and 3 filled read differently and every state passes the "at least three fill tones" rule.
 */
function relicCoin(count: number): Mask {
  const filled = ['a', 'h', 'w']
  const empty = ['S', 's', 'S']
  const fills = [0, 1, 2].map((i) => (i < count ? filled[i] : empty[i]))
  const blockX = [1, 6, 11]
  const blank = (): string[] => Array<string>(16).fill('.')
  const rows: string[] = Array.from({ length: 16 }, () => '.'.repeat(16))
  const tip = blank()
  for (const bx of blockX) tip[bx + 1] = 'o'
  rows[4] = tip.join('')
  rows[10] = tip.join('')
  for (const y of [5, 6, 7, 8, 9]) {
    const r = blank()
    blockX.forEach((bx, i) => {
      r[bx] = 'o'
      r[bx + 3] = 'o'
      const body = y !== 5 && y !== 9
      r[bx + 1] = body ? fills[i] : 'o'
      r[bx + 2] = body ? fills[i] : 'o'
    })
    rows[y] = r.join('')
  }
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
