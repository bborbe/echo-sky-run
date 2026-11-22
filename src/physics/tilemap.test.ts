import { describe, expect, it } from 'vitest'
import {
  CHASER_BOT_H,
  GEAR_GOOMBA_H,
  GUST_WING_H,
  SPIKE_BEETLE_H,
  STEAM_TURTLE_H,
} from '../game/enemies.ts'
import { TILE } from './constants.ts'
import {
  findChaserBotSpawns,
  findDoorSpawns,
  findEnemySpawns,
  findGustWingSpawns,
  findNimbusSpawns,
  findSpikeBeetleSpawns,
  findSwitchSpawns,
  parseLevel,
} from './tilemap.ts'

describe('level entities', () => {
  // One of each on row 2, at known columns: n(1), s(5), D(8).
  const LEVEL = parseLevel(['..........', '..........', '.n...s..D.', '..........'])

  it('finds the Nimbus spawn at its cell', () => {
    expect(findNimbusSpawns(LEVEL)).toEqual([{ x: 1 * TILE, y: 2 * TILE }])
  })

  it('finds the Echo switch spawn at its cell', () => {
    expect(findSwitchSpawns(LEVEL)).toEqual([{ x: 5 * TILE, y: 2 * TILE }])
  })

  it('anchors a three-tile door by its feet', () => {
    // The D cell's bottom is the next row's top; the 48 px door reaches two tiles above it.
    expect(findDoorSpawns(LEVEL)).toEqual([{ x: 8 * TILE, y: 2 * TILE + TILE - 3 * TILE }])
  })

  it('returns an empty list for a row without them', () => {
    const bare = parseLevel(['..........'])

    expect(findNimbusSpawns(bare)).toEqual([])
    expect(findSwitchSpawns(bare)).toEqual([])
    expect(findDoorSpawns(bare)).toEqual([])
  })
})

describe('enemy tiles', () => {
  // Each of the three new kinds twice — a different column AND a different row — so a finder pinned
  // to one fixture's literals fails the second position.
  //   spike-beetle b: (col 1, row 1), (col 6, row 2)
  //   gust-wing    w: (col 5, row 1), (col 8, row 2)
  //   chaser-bot   r: (col 9, row 1), (col 2, row 2)
  const LEVEL = parseLevel(['..........', '.b...w...r', '..r...b.w.'])

  it('finds both Spike-Beetle spawns, feet-anchored', () => {
    expect(findSpikeBeetleSpawns(LEVEL)).toEqual([
      { x: 1 * TILE, y: 1 * TILE + TILE - SPIKE_BEETLE_H },
      { x: 6 * TILE, y: 2 * TILE + TILE - SPIKE_BEETLE_H },
    ])
  })

  it('finds both Gust-Wing spawns, feet-anchored', () => {
    expect(findGustWingSpawns(LEVEL)).toEqual([
      { x: 5 * TILE, y: 1 * TILE + TILE - GUST_WING_H },
      { x: 8 * TILE, y: 2 * TILE + TILE - GUST_WING_H },
    ])
  })

  it('finds both Chaser-Bot spawns, feet-anchored', () => {
    expect(findChaserBotSpawns(LEVEL)).toEqual([
      { x: 9 * TILE, y: 1 * TILE + TILE - CHASER_BOT_H },
      { x: 2 * TILE, y: 2 * TILE + TILE - CHASER_BOT_H },
    ])
  })

  it('returns an empty list for a level without them', () => {
    const bare = parseLevel(['..........'])

    expect(findSpikeBeetleSpawns(bare)).toEqual([])
    expect(findGustWingSpawns(bare)).toEqual([])
    expect(findChaserBotSpawns(bare)).toEqual([])
  })
})

describe('findEnemySpawns', () => {
  // One of each of the five kinds on one row: g(0) t(2) b(4) w(6) r(8).
  const LEVEL = parseLevel(['..........', 'g.t.b.w.r.', '..........'])

  it('returns the matching kind for every enemy character', () => {
    expect(findEnemySpawns(LEVEL)).toEqual([
      { kind: 'gear-goomba', x: 0, y: 1 * TILE + TILE - GEAR_GOOMBA_H },
      { kind: 'steam-turtle', x: 2 * TILE, y: 1 * TILE + TILE - STEAM_TURTLE_H },
      { kind: 'spike-beetle', x: 4 * TILE, y: 1 * TILE + TILE - SPIKE_BEETLE_H },
      { kind: 'gust-wing', x: 6 * TILE, y: 1 * TILE + TILE - GUST_WING_H },
      { kind: 'chaser-bot', x: 8 * TILE, y: 1 * TILE + TILE - CHASER_BOT_H },
    ])
  })

  it('returns nothing for a row without an enemy', () => {
    expect(findEnemySpawns(parseLevel(['..........']))).toEqual([])
  })
})
