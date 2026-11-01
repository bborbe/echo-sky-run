// Pip: an orange fox-kit in brass flying goggles. Every frame faces right; the atlas mirrors them
// for the left. Small is 16×16 around the 12×14 hitbox, Super 16×28 around 12×26 (spec § 4 Hitbox
// and Sprite Sizes); both stand on the hitbox floor, so the mask's bottom row is the feet.

import type { Keys, Mask } from './mask.ts'
import { shiftDown } from './mask.ts'

export const PIP_KEYS: Keys = {
  o: 'outline',
  b: 'fur',
  s: 'furShade',
  h: 'furLight',
  w: 'cream',
  a: 'brass',
  d: 'brassDark',
  l: 'lens',
  g: 'white',
  f: 'steel',
  F: 'steelLight',
  r: 'copper',
  k: 'copperDark',
  x: 'outline',
}

export type PipPose = 'idle' | 'run' | 'sprint' | 'jump' | 'fall' | 'land' | 'skid' | 'death'
export type PipFrames = Readonly<Record<PipPose, readonly Mask[]>>

// ---- Small, 16×16 -------------------------------------------------------------------------------

/** Ears, goggles and muzzle — rows 0..10, shared by most Small frames. */
const HEAD: Mask = [
  '................',
  '...oo......oo...',
  '..owbo....obwo..',
  '..obbboooobbbo..',
  '.obhhbbbbbbbbbo.',
  '.oaaaaaaaaaaaao.',
  '.oagllaaaagllao.',
  '.oalllaaaalllao.',
  '.oddddddddddddo.',
  '..obbbbbbwwwwbo.',
  '...obbbbwwwwooo.',
]

/** Ears flattened back into the wind, for the sprint. */
const HEAD_SPRINT: Mask = [
  '................',
  '................',
  '.ooo.....ooo....',
  'owbbo...owbbo...',
  'oobbboooobbbbo..',
  '.obhhbbbbbbbbbo.',
  '.oaaaaaaaaaaaao.',
  '.oagllaaaagllao.',
  '.oalllaaaalllao.',
  '.oddddddddddddoo',
  '..obbbbbbwwwwwwo',
]

const SMALL_IDLE_0: Mask = [
  ...HEAD,
  '.oo.obbbbbbbo...',
  'owwoosbbwwbbso..',
  'owhbosbbwwbbso..',
  '.obbbofFo.ofFo..',
  '..oooooo..oooo..',
]

const SMALL_IDLE_1: Mask = [
  ...shiftDown(HEAD, 1).slice(0, 11),
  '.oo.obbbwwwwooo.',
  'owwoosbbbbbbbo..',
  'owhbosbbwwbbso..',
  '.obbbofFo.ofFo..',
  '..oooooo..oooo..',
]

const SMALL_RUN: readonly Mask[] = [
  [
    ...HEAD,
    'oo..obbbbbbbo...',
    'owooosbbwwbbso..',
    '.ohbosbbwwbbbooo',
    '..oofFooooooffFo',
    '...oooo....ooooo',
  ],
  [
    ...HEAD.slice(1),
    'ooo.obbbbbbbo...',
    'owhoosbbwwbbso..',
    '.oboosbbwwbbso..',
    '...ooobbbbbbo...',
    '....ofFoofFo....',
    '....oooooooo....',
  ],
  [
    ...HEAD,
    'oo..obbbbbbbo...',
    'owooosbbwwbbso..',
    '.ohbosbbwwbbboo.',
    '..ooffFoooofFo..',
    '..ooooo...oooo..',
  ],
  [
    ...HEAD.slice(1),
    '.oo.obbbbbbbo...',
    'owhoosbbwwbbso..',
    '.oboosbbwwbbso..',
    '...ooobbbbbbo...',
    '.....ofFofFo....',
    '.....oooooooo...',
  ],
]

const SMALL_SPRINT: readonly Mask[] = [
  [
    ...HEAD_SPRINT,
    'ooo.obbbbwwwoo..',
    'owwoosbbbbbbbo..',
    '.ooosbbwwbbbbsoo',
    '.oofFooooooooffo',
    '.oooo.......ooo.',
  ],
  [
    ...HEAD_SPRINT.slice(1),
    'ooo.obbbbwwwoo..',
    'owwoosbbbbbbbo..',
    '.ooosbbwwbbbso..',
    '...ooobbbbbbbo..',
    '....offFFffFo...',
    '....oooooooooo..',
  ],
  [
    ...HEAD_SPRINT,
    'ooo.obbbbwwwoo..',
    'owwoosbbbbbbbo..',
    '.ooosbbwwbbbbsoo',
    '..oooffFooooffFo',
    '..ooooo....oooo.',
  ],
  [
    ...HEAD_SPRINT.slice(1),
    'ooo.obbbbwwwoo..',
    'owwoosbbbbbbbo..',
    '.ooosbbwwbbbso..',
    '...ooobbbbbbbo..',
    '.....offFfFoo...',
    '.....oooooooo...',
  ],
]

const SMALL_JUMP: Mask = [
  ...HEAD.slice(0, 10),
  '...obbbbwwwwoooo',
  'oo.oobbbbbbbooFo',
  'owoobsbbwwbbsoFo',
  '.ohbosbbwwbbbooo',
  '..oofFoobbbo....',
  '...ooo..ooo.....',
]

const SMALL_FALL: Mask = [
  ...HEAD,
  '.oo.obbbbbbbo...',
  'oFo.osbbwwbbsoo.',
  'oFoososbwwbbsoFo',
  '.ooobbbbbbbbboFo',
  '....oooooooo.oo.',
]

const SMALL_LAND: Mask = [
  ...shiftDown(HEAD, 2).slice(0, 13),
  'owhoosbbwwbbbso.',
  '.obofFFoooofFFo.',
  '..oooooo..oooo..',
]

const SMALL_SKID: Mask = [
  '................',
  '....oo......oo..',
  '...owbo....obwo.',
  '...obbboooobbbo.',
  '..obhhbbbbbbbbbo',
  '..oaaaaaaaaaaaao',
  '..oagllaaaagllao',
  '..oalllaaaalllao',
  '..oddddddddddddo',
  '...obbbbbbwwwwbo',
  '....obbbbwwwwooo',
  '.oo.obbbbbbbbo..',
  'owwoosbbwwbbbso.',
  'owhbosbbwwbbbsoo',
  '.ooooffFooooofFo',
  '....ooooo....ooo',
]

const SMALL_DEATH: readonly Mask[] = [
  [
    '...oo......oo...',
    '..owbo....obwo..',
    '..obbboooobbbo..',
    '.obbbbbbbbbbbbo.',
    '.oaaaaaaaaaaaao.',
    '.oaxaxaaaaxaxao.',
    '.oaaxaaaaaaxaao.',
    '.oaxaxaaaaxaxao.',
    '.oddddddddddddo.',
    '..obbbwwwwbbbo..',
    'ooo.obwooowbo.oo',
    'oFoooobwwwbooooo',
    '.ooobbsbbbsbbooo',
    '...obsbwwbsbo...',
    '...oFFo..oFFo...',
    '...oooo..oooo...',
  ],
  [
    '..oo........oo..',
    '.owbo......obwo.',
    '.obbboooooobbbo.',
    '.obbbbbbbbbbbbo.',
    '.oaaaaaaaaaaaao.',
    '.oaxaxaaaaxaxao.',
    '.oaaxaaaaaaxaao.',
    '.oaxaxaaaaxaxao.',
    '.oddddddddddddo.',
    '..obbbwwwwbbbo..',
    '.oo.obwooowbo.o.',
    'oFoooobwwwboooFo',
    'oFoobbsbbbsbbFo.',
    '.oo.obsbwwbsbo..',
    '...ooFFo.oFFo...',
    '....ooo..oooo...',
  ],
]

export const PIP_SMALL: PipFrames = {
  idle: [SMALL_IDLE_0, SMALL_IDLE_1],
  run: SMALL_RUN,
  sprint: SMALL_SPRINT,
  jump: [SMALL_JUMP],
  fall: [SMALL_FALL],
  land: [SMALL_LAND],
  skid: [SMALL_SKID],
  death: SMALL_DEATH,
}

// ---- Super, 16×28 -------------------------------------------------------------------------------
// The Mushroom grows Pip a copper flight jacket with brass buttons: same head, taller body.

const SUPER_TORSO: Mask = [
  '...oobbbbbbboo..',
  '..orrrrrrrrrrro.',
  '.orkrrrrarrrrkro',
  '.orkrrrrrrrrrkro',
  '.okkrrrrarrrrkko',
  '.obkrrrrrrrrrkbo',
  '.obkrrrrarrrrkbo',
  '.oobkrrrrrrrkboo',
  '..okkkkkkkkkkko.',
  '...owwwwwwwwwo..',
]

const SUPER_LEGS_STAND: Mask = [
  '...obbbo.obbbo..',
  '...obbbo.obbbo..',
  '...obbbo.obbbo..',
  '...osbbo.osbbo..',
  '...osbbo.osbbo..',
  '..offFFooffFFo..',
  '..oooooo.ooooo..',
]

const SUPER_LEGS_STRIDE_A: Mask = [
  '...obbbo..obbbo.',
  '..obbbo....obbbo',
  '..obbo.....obbbo',
  '.obbo.......osbo',
  '.osbo.......osbo',
  'offFo......offFo',
  'ooooo......ooooo',
]

const SUPER_LEGS_PASS: Mask = [
  '....obbbobbbo...',
  '....obbbobbbo...',
  '....obbbobbbo...',
  '....osbbosbbo...',
  '....osbbosbbo...',
  '...offFFoffFo...',
  '...oooooooooo...',
]

const SUPER_LEGS_PASS_B: Mask = [
  '....obbbobbbo...',
  '....obbbobbbo...',
  '....obbbobbbo...',
  '....osbbosbbo...',
  '....osbbosbbo...',
  '....offFoffFFo..',
  '....ooooooooooo.',
]

const SUPER_LEGS_STRIDE_B: Mask = [
  '...obbbo.obbbo..',
  '..obbbo...obbbo.',
  '..obbo.....obbo.',
  '.obbo.......obbo',
  '.osbo.......osbo',
  '.offFo.....offFo',
  '.ooooo.....ooooo',
]

const SUPER_LEGS_JUMP: Mask = [
  '...obbbo.obbbo..',
  '...obbbooobbbo..',
  '...osbbo..obbbo.',
  '..offFFo...osbo.',
  '..oooooo...osbo.',
  '..........offFo.',
  '..........ooooo.',
]

const SUPER_LEGS_FALL: Mask = [
  '..obbbo..obbbo..',
  '..obbbo..obbbo..',
  '.obbbo....obbbo.',
  '.osbo......osbo.',
  '.osbo......osbo.',
  'offFo......offFo',
  'ooooo......ooooo',
]

const SUPER_LEGS_CROUCH: Mask = [
  '..obbbo..obbbo..',
  '.obbbo....obbbo.',
  '.osbo......osbo.',
  'offFo......offFo',
  'ooooo......ooooo',
]

/** Head (11 rows) + jacket (10) + legs (7) = 28. */
function superFrame(head: Mask, legs: Mask, lead: Mask = []): Mask {
  return [...lead, ...head, ...SUPER_TORSO, ...legs]
}

const BLANK2: Mask = ['................', '................']

export const PIP_SUPER: PipFrames = {
  idle: [superFrame(HEAD, SUPER_LEGS_STAND), superFrame(shiftDown(HEAD, 1), SUPER_LEGS_STAND)],
  run: [
    superFrame(HEAD, SUPER_LEGS_STRIDE_A),
    superFrame(HEAD, SUPER_LEGS_PASS),
    superFrame(HEAD, SUPER_LEGS_STRIDE_B),
    superFrame(HEAD, SUPER_LEGS_PASS_B),
  ],
  sprint: [
    superFrame(HEAD_SPRINT, SUPER_LEGS_STRIDE_A),
    superFrame(HEAD_SPRINT, SUPER_LEGS_PASS),
    superFrame(HEAD_SPRINT, SUPER_LEGS_STRIDE_B),
    superFrame(HEAD_SPRINT, SUPER_LEGS_PASS_B),
  ],
  jump: [superFrame(HEAD, SUPER_LEGS_JUMP)],
  fall: [superFrame(HEAD, SUPER_LEGS_FALL)],
  land: [superFrame(HEAD, SUPER_LEGS_CROUCH, BLANK2)],
  skid: [superFrame(HEAD_SPRINT.map((row) => row.split('').reverse().join('')), SUPER_LEGS_STRIDE_B)],
  death: [
    superFrame(SMALL_DEATH[0].slice(0, 11), SUPER_LEGS_STAND),
    superFrame(SMALL_DEATH[1].slice(0, 11), SUPER_LEGS_FALL),
  ],
}
