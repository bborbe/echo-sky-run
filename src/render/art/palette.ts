// Style C, "painted sky, crisp clockwork" — the art direction in the game description § 9. Every
// colour the play layer and the painted background use is named here once; the sprite masks map
// their letters onto these names, so a palette change is one edit and the palette test can prove
// no sprite reaches for a colour outside it.

/** The play layer: tiles, sprites, pickups. Pixel art, drawn nearest-neighbour. */
export const INK = {
  /** The 1 px sprite outline (spec § 9). */
  outline: '#2A1E14',

  // Pip
  fur: '#E0582A',
  furShade: '#A63A1C',
  furLight: '#F28A52',
  cream: '#FFF3E2',
  lens: '#6FE6FF',
  white: '#FFFFFF',

  // clockwork
  brass: '#D4A52A',
  brassDark: '#8E6A12',
  brassLight: '#FFE07A',
  copper: '#B5562E',
  copperDark: '#7A3218',
  steel: '#3F4A5C',
  steelLight: '#6B7A90',

  // Steam-Turtle skin
  leaf: '#7DBA6A',
  leafDark: '#3F7A44',

  // ground
  grassLip: '#2F5E33',
  grass: '#4F9A4E',
  grassLit: '#8FCB76',
  earth: '#5E4436',
  earthDark: '#46322A',
  earthLight: '#7A5A48',
  pebble: '#94705A',

  // the Echo: cyan glass with a bright rim, held by a dark edge so it reads over every layer
  echo: '#9FE8FF',
  echoRim: '#E9FBFF',
  echoEdge: '#15394F',

  // the Mushroom
  capRed: '#C8402A',
} as const

/**
 * The painted background: smooth gradients and blurred shapes, not on the pixel grid. Lifted toward
 * the sky (atmospheric haze), so every play-layer solid sits darker than whatever is behind it.
 */
export const SKY = {
  top: '#86A9E0',
  mid: '#CFCBE8',
  horizon: '#F7DDBA',
  sunGlow: '#FFE8C2',
  cloud: '#FFFFFF',
  farIsland: '#C9BDE2',
  farIslandShade: '#B4A7D6',
  hill: '#C7DCC2',
  hillShade: '#B2CCAC',
  ruin: '#DCC9A6',
  bush: '#A9C8A2',
  bushShade: '#94B98D',
  haze: '#F4EEF2',
} as const

export type InkName = keyof typeof INK

/** Every hex the play layer may use. */
export const INK_HEX: ReadonlySet<string> = new Set(Object.values(INK))
