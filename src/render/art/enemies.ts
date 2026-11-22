// The two 1-1 hazards. Every frame faces left (their walking direction at spawn); the atlas mirrors
// them for the right. Sprites are drawn 18 px wide around 16 px hitboxes and stand on the hitbox
// floor (spec § 4 Hitbox and Sprite Sizes).

import type { Keys, Mask } from './mask.ts'

export const GOOMBA_KEYS: Keys = {
  o: 'outline',
  a: 'brass',
  h: 'brassLight',
  s: 'brassDark',
  w: 'white',
  f: 'steel',
  F: 'steelLight',
  r: 'copper',
}

/** Gear-Goomba: a walking brass cog with a grumpy face. 18×18. */
export const GOOMBA_WALK: readonly Mask[] = [
  [
    '......oo..oo......',
    '...oo.oaooao.oo...',
    '..ohaooahhaaooaso.',
    '...ohaaaaaaaaaso..',
    '.ooahaaaaaaaaaasoo',
    'ohaaaoooaaaoooaaso',
    'oaaaawwoaaowwaaaso',
    '.oaaawooaaoowaaso.',
    'ohaaaaaaaaaaaaaaso',
    '.ooaaaorrrrroaasoo',
    '..oaaaaoooooaaaso.',
    '.ohaaaaaaaaaaaaso.',
    '..oo.osaaaaso.oo..',
    '......oooooo......',
    '.....offo.offo....',
    '....offFo..ofFo...',
    '....offFo..ofFFo..',
    '....ooooo..ooooo..',
  ],
  [
    '..................',
    '......oo..oo......',
    '...oo.oaooao.oo...',
    '..ohaooahhaaooaso.',
    '...ohaaaaaaaaaso..',
    '.ooahaaaaaaaaaasoo',
    'ohaaaoooaaaoooaaso',
    'oaaaawwoaaowwaaaso',
    '.oaaawooaaoowaaso.',
    'ohaaaaaaaaaaaaaaso',
    '.ooaaaorrrrroaasoo',
    '..oaaaaoooooaaaso.',
    '.ohaaaaaaaaaaaaso.',
    '..oo.osaaaaso.oo..',
    '.....ooooooo......',
    '....offFoofFo.....',
    '...offFo..offFo...',
    '...oooo....oooo...',
  ],
]

/** Flattened under a stomp: 18 wide, pressed onto the floor. */
export const GOOMBA_SQUASH: Mask = [
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '..o.oo.oo.oo.oo...',
  '.ohoahoahoahoaho..',
  'ooaaaaaaaaaaaaasoo',
  'oaaaoxoaaaaoxoaaso',
  'osssssssssssssssso',
  '.offFo.......offo.',
  '.ooooo.......oooo.',
].map((row) => row.replace(/x/g, 'o'))

export const TURTLE_KEYS: Keys = {
  o: 'outline',
  g: 'leaf',
  G: 'leafDark',
  w: 'white',
  e: 'outline',
  a: 'brass',
  r: 'copper',
  k: 'copperDark',
  h: 'brassLight',
  f: 'steel',
  F: 'steelLight',
}

/** Steam-Turtle: a copper-shelled turtle with a steam stack. 18×27, faces left. */
export const TURTLE_WALK: readonly Mask[] = [
  [
    '...........ooo....',
    '..........owwwo...',
    '...oooo...owwwo...',
    '..ogggGo...owo....',
    '.oggggGGo..ofFo...',
    'owwgggggo..ofFo...',
    'oweggggGo.oofFoo..',
    'oweggggGo.oaaaao..',
    'oggggggGooarrrrao.',
    '.oGgggGoaarrhhrrao',
    '..ooggGoarrhrrrrko',
    '...oggGoarrrrarrko',
    '...oggggarrrrrrrko',
    '..oggggoarrarrrrko',
    '..ogwwgoarrrrrrrko',
    '..ogwwgoarrrarrkko',
    '..ogwwgoarrrrrrkko',
    '..oggggoakkkkkkkao',
    '...oggGoaaaaaaaaoo',
    '...ogggGoooooooo..',
    '...oggGGo..ogggo..',
    '...oggGo...oggGo..',
    '..ogggGo...oggGo..',
    '..offfo...offfo...',
    '.offFFo..offFFo...',
    '.offFFo..offFFo...',
    '.oooooo..oooooo...',
  ],
  [
    '..................',
    '.........ooo......',
    '........owwwo.....',
    '...oooo..owwwo....',
    '..ogggGo..ooo.....',
    '.oggggGGo..ofFo...',
    'owwgggggo..ofFo...',
    'oweggggGo.oofFoo..',
    'oweggggGo.oaaaao..',
    'oggggggGooarrrrao.',
    '.oGgggGoaarrhhrrao',
    '..ooggGoarrhrrrrko',
    '...oggGoarrrrarrko',
    '...oggggarrrrrrrko',
    '..oggggoarrarrrrko',
    '..ogwwgoarrrrrrrko',
    '..ogwwgoarrrarrkko',
    '..oggggoakkkkkkkao',
    '...oggGoaaaaaaaaoo',
    '...ogggGoooooooo..',
    '....oggGo.ogggo...',
    '....oggGo.oggGo...',
    '...oggGo...oggGo..',
    '...offo....offfo..',
    '..offFo...offFFo..',
    '..offFo...offFFo..',
    '..ooooo...oooooo..',
  ],
]

/**
 * The stomped shell: a copper dome on a brass rim with its steam stack. 18×18, filling its box so
 * the 16×16 hitbox is never larger than what the player sees.
 */
function shell(stackDx: number, glintX: number): Mask {
  const top = (row: string): string => {
    const chars = '..................'.split('')
    const start = Math.floor((18 - row.length) / 2) + stackDx
    for (let i = 0; i < row.length; i++) if (row[i] !== '.') chars[start + i] = row[i]
    return chars.join('')
  }
  const body = [
    '....oaaaaaaaao....',
    '...oarrrrrrrrao...',
    '..oarrrrrrrrrrao..',
    '..oarrarrrrrarao..',
    '.oarrrrrrarrrrrao.',
    '.oarrrarrrrrrarao.',
    'oarrrrrrrrrrrrrrao',
    'oarrrarrrrrrrarrao',
    'oarrrrrrrarrrrrrao',
    'oakkkkkkkkkkkkkkao',
    'oaaaaaaaaaaaaaaaao',
    '.owwwwwwwwwwwwwwo.',
    '.owwwwwwwwwwwwwwo.',
    '..owwwwwwwwwwwwo..',
    '...oooooooooooo...',
  ].map((row, y) => {
    // The brass glint: two pixels on the dome's upper rows, swept round by the spin.
    if (y !== 1 && y !== 2) return row
    const chars = row.split('')
    for (const x of [glintX, glintX + 1]) if (chars[x] === 'r') chars[x] = 'h'
    return chars.join('')
  })
  return [top('oo'), top('ofFo'), top('ooofFooo'), ...body]
}

export const SHELL_REST: Mask = shell(0, 9)

/** A kicked shell spinning: the stack and the glint sweep round. 4 frames. */
export const SHELL_SPIN: readonly Mask[] = [shell(0, 9), shell(2, 11), shell(0, 5), shell(-2, 7)]

// ---- World 1's new enemies and Nimbus (spec § 4 Enemies, Nimbus) --------------------------------
// Each is drawn 18×18 around its 16×16 hitbox (89 % per axis, spec § 4 Hitbox and Sprite Sizes) and
// faces left; the atlas mirrors it for the right. Feet stand on the hitbox floor (bottom row).

export const SPIKE_BEETLE_KEYS: Keys = {
  o: 'outline',
  b: 'brass',
  c: 'copperLight',
  k: 'copperDark',
  s: 'steel',
  S: 'steelLight',
  w: 'white',
}

/** Spike-Beetle: a copper beetle with a steel-spiked back. 18×18, faces left, walks on legs. */
export const SPIKE_BEETLE_WALK: readonly Mask[] = [
  [
    '......o...o...o...',
    '.....oso.osoo.....',
    '....osssosssso....',
    '...osssssssssso...',
    '..obbbbbbbbbbbbo..',
    '.obccccccccccccbo.',
    'obccccccccccccccbo',
    'occcccccccccccccco',
    'occwccccccccwcccco',
    'occcccccccccccccco',
    'obcccckkkkkkccccbo',
    '.obccccccccccccbo.',
    '..obbbbbbbbbbbbo..',
    '...o.o......o.o...',
    '...o.o......o.o...',
    '..o..o......o..o..',
    '..o..o......o..o..',
    '.ooo.oo....oo.ooo.',
  ],
  [
    '......o...o...o...',
    '.....oso.osoo.....',
    '....osssosssso....',
    '...osssssssssso...',
    '..obbbbbbbbbbbbo..',
    '.obccccccccccccbo.',
    'obccccccccccccccbo',
    'occcccccccccccccco',
    'occwccccccccwcccco',
    'occcccccccccccccco',
    'obcccckkkkkkccccbo',
    '.obccccccccccccbo.',
    '..obbbbbbbbbbbbo..',
    '..o.o........o.o..',
    '..o.o........o.o..',
    '.o..o........o..o.',
    '.o..o........o..o.',
    'ooo.oo......oo.ooo',
  ],
]

export const GUST_WING_KEYS: Keys = {
  o: 'outline',
  b: 'brass',
  s: 'steel',
  S: 'steelLight',
  w: 'white',
}

/** Gust-Wing: a brass-winged flyer, wings up then down. 18×18, faces left. */
export const GUST_WING_FLY: readonly Mask[] = [
  [
    'oo..............oo',
    'osso..........osso',
    'osSso........osSso',
    '.osSso......osSso.',
    '.osSSso....osSSso.',
    '..osSSso..osSSso..',
    '..osSbbbbbbbbSso..',
    '...obwwbbbbwwbo...',
    '...obbbbbbbbbbo...',
    '...obbbbbbbbbbo...',
    '..oobbbbbbbbbboo..',
    '..obbbbbbbbbbbbo..',
    '..obbbbbbbbbbbbo..',
    '...obbbbbbbbbbo...',
    '...obbbbbbbbbbo...',
    '....oobbbbbboo....',
    '....oooooooooo....',
    '.....oo....oo.....',
  ],
  [
    '..................',
    'oo..............oo',
    'osso..........osso',
    'osSso........osSso',
    '.osSso......osSso.',
    '.osSSso....osSSso.',
    '..osSSso..osSSso..',
    '...osSbbbbbbSsso..',
    '...obwwbbbbwwbo...',
    '...obbbbbbbbbbo...',
    '..oobbbbbbbbbboo..',
    '..obbbbbbbbbbbbo..',
    '..obbbbbbbbbbbbo..',
    '...obbbbbbbbbbo...',
    '..oobbbbbbbbbboo..',
    '...obbbbbbbbbbo...',
    '....oooooooooo....',
    '.....oo....oo.....',
  ],
]

export const CHASER_BOT_KEYS: Keys = {
  o: 'outline',
  s: 'steelMid',
  S: 'steelPale',
  w: 'white',
  c: 'copperLight',
  k: 'copperLight',
}

/** Chaser-Bot: a boxy steel hunter with copper treads and two white optics. 18×18, faces left. */
export const CHASER_BOT_WALK: readonly Mask[] = [
  [
    '...oooooooooooo...',
    '..osssssssssssso..',
    '.osSSSSSSSSSSSSso.',
    '.oswwsssssswwsso..',
    '.oswwsssssswwsso..',
    'osssssssssssssssso',
    '.ossskkkkkkkssssso',
    '.osssssssssssssso.',
    '..osssssssssssso..',
    '..oscccssssccsso..',
    '..oscccssssccsso..',
    '...oooooooooooo...',
    '..okk........kko..',
    '..okk........kko..',
    '..okk........kko..',
    '..okk........kko..',
    '..okk........kko..',
    '.okkk........kkko.',
  ],
  [
    '...oooooooooooo...',
    '..osssssssssssso..',
    '.osSSSSSSSSSSSSso.',
    '.oswwsssssswwsso..',
    '.oswwsssssswwsso..',
    'osssssssssssssssso',
    '.ossskkkkkkkssssso',
    '.osssssssssssssso.',
    '..osssssssssssso..',
    '..oscccssssccsso..',
    '..oscccssssccsso..',
    '...oooooooooooo...',
    '...okk......kko...',
    '...okk......kko...',
    '...okk......kko...',
    '...okk......kko...',
    '...okk......kko...',
    '..okkk......kkko..',
  ],
]

export const NIMBUS_KEYS: Keys = {
  o: 'outline',
  w: 'cloudShade',
  W: 'white',
  S: 'steelLight',
  e: 'echo',
}

/** Nimbus: a small white cloud with steel goggle-bands and cyan eyes. 18×18, floats. */
export const NIMBUS_FLY: readonly Mask[] = [
  [
    '.....oooooooo.....',
    '...oowwwwwwwwoo...',
    '..owwwwwwwwwwwwo..',
    '.owwSSwwwwwwSSwwo.',
    '.owwSewwwwwwSewwo.',
    '.owwwwwwwwwwwwwwo.',
    'owwwwwwwwwwwwwwwwo',
    'owwwwwwwwwwwwwwwwo',
    '.owwwwwwwwwwwwwwo.',
    '.oowwwwwwwwwwwwoo.',
    '..oowwwwwwwwwwoo..',
    '...oowwwwwwwwoo...',
    '..ooowwwwwwwwooo..',
    '.owwwwwwwwwwwwwwo.',
    '.owwWWWWWWWWWWwwo.',
    '.owwwwwwwwwwwwwwo.',
    '..owwwwwwwwwwwwo..',
    '..oowwwoooowwwoo..',
  ],
  [
    '.....oooooooo.....',
    '...oowwwwwwwwoo...',
    '..owwwwwwwwwwwwo..',
    '.owwwwSSwwSSwwwwo.',
    '.owwwwSewwSewwwwo.',
    '.owwwwwwwwwwwwwwo.',
    'owwwwwwwwwwwwwwwwo',
    'owwwwwwwwwwwwwwwwo',
    '.owwwwwwwwwwwwwwo.',
    '.oowwwwwwwwwwwwoo.',
    '..oowwwwwwwwwwoo..',
    '...oowwwwwwwwoo...',
    '..ooowwwwwwwwooo..',
    '.owwwwwwwwwwwwwwo.',
    '.owwWWWWWWWWWWwwo.',
    '.owwwwwwwwwwwwwwo.',
    '..owwwwwwwwwwwwo..',
    '..oowwwoooowwwoo..',
  ],
]
