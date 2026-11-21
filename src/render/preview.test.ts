import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LEVEL_CATALOGUE } from '../levels/catalogue.ts'
import { findTile, parseLevel, SPAWN } from '../physics/tilemap.ts'
import { VIEW_H } from './camera.ts'
import { focusedLevelId, heroCamera, heroCropRect, previewCamera, previewSource } from './preview.ts'

/** A window wide enough to frame a level; the e2e measures the real one. */
const VIEW_W = 768

describe('preview frames', () => {
  for (const level of LEVEL_CATALOGUE) {
    it(`level ${level.id} produces a preview frame from its own data`, () => {
      const source = previewSource(level)
      // The frame's map is the level's own rows, not a hand-drawn image.
      expect(source.map.rows).toBe(level.rows.length)
      expect(source.map.cols).toBeGreaterThan(0)

      // The still is the level's real spawn, and its sim was never stepped.
      const spawn = findTile(source.map, SPAWN)
      expect(spawn).not.toBeNull()
      expect(source.state.player.x).toBe(spawn?.x)
      expect(source.state.player.y).toBe(spawn?.y)
      expect(source.sim.frames).toBe(0)
      expect(source.sim.deaths).toBe(0)

      // The camera framing the opening state is a whole-pixel scroll inside the level.
      const camera = previewCamera(source.map, source.state.player, VIEW_W)
      expect(Number.isInteger(camera.x)).toBe(true)
      expect(Number.isInteger(camera.y)).toBe(true)
      expect(camera.x).toBeGreaterThanOrEqual(0)
      expect(camera.y).toBeGreaterThanOrEqual(0)
      expect(camera.x).toBeLessThanOrEqual(source.map.cols * 16)
      expect(camera.y).toBeLessThanOrEqual(source.map.rows * 16)
    })
  }

  it('every catalogue level yields a frame — the catalogue is the only source', () => {
    expect(LEVEL_CATALOGUE.length).toBeGreaterThan(0)
    for (const level of LEVEL_CATALOGUE) {
      expect(previewSource(level).map.cols).toBeGreaterThan(0)
    }
  })

  it('the focused tile decides the preview, so a focus move swaps the level', () => {
    const view = {
      items: [
        { id: 'level' as const, label: '1-1', level: '1-1' },
        { id: 'level' as const, label: '1-2', level: '1-2' },
        { id: 'level' as const, label: '1-3', level: '1-3' },
      ],
      index: 0,
    }
    expect(focusedLevelId(view)).toBe('1-1')
    view.index = 1
    expect(focusedLevelId(view)).toBe('1-2')
    view.index = 2
    expect(focusedLevelId(view)).toBe('1-3')
    expect(focusedLevelId({ items: [], index: 0 })).toBeNull()
  })

  it('the preview module starts no simulation', () => {
    const source = readFileSync(fileURLToPath(new URL('./preview.ts', import.meta.url)), 'utf8')
    // Positive control first: the probe reads the right file and can match a real import, so the
    // absence assertions below mean something.
    expect(source).toMatch(/\bcreateSim\b/)
    expect(source).not.toMatch(/\bstepSim\b/)
    expect(source).not.toMatch(/\bFixedStepper\b/)
  })

  it('frames every level on its declared hero spot, inside the level', () => {
    for (const level of LEVEL_CATALOGUE) {
      const map = parseLevel(level.rows)
      const hero = heroCamera(map, level.hero, VIEW_W)
      expect(Number.isInteger(hero.x)).toBe(true)
      expect(Number.isInteger(hero.y)).toBe(true)
      expect(hero.x).toBeGreaterThanOrEqual(0)
      expect(hero.x).toBeLessThanOrEqual(Math.max(0, map.cols * 16 - VIEW_W))
      expect(hero.y).toBeGreaterThanOrEqual(0)
      expect(hero.y).toBeLessThanOrEqual(Math.max(0, map.rows * 16 - VIEW_H))
    }
  })

  it("frames 1-1 on the Echo gap, which is not where its spawn is", () => {
    const level = LEVEL_CATALOGUE.find((entry) => entry.id === '1-1')
    expect(level).toBeDefined()
    if (level === undefined) return
    const source = previewSource(level)
    const hero = heroCamera(source.map, level.hero, VIEW_W)
    const spawn = previewCamera(source.map, source.state.player, VIEW_W)
    // The hero spot is on screen — the crop's subject — and the spawn framing is a different view.
    expect(level.hero.x).toBeGreaterThanOrEqual(hero.x)
    expect(level.hero.x).toBeLessThanOrEqual(hero.x + VIEW_W)
    expect(hero.x).not.toBe(spawn.x)
  })

  it('centres the tile crop on the hero spot and keeps it inside the still', () => {
    const centred = heroCropRect({ x: 0, y: 0 }, { x: VIEW_W / 2, y: VIEW_H / 2 }, VIEW_W, 160, 84)
    expect(centred).toEqual({ x: VIEW_W / 2 - 80, y: VIEW_H / 2 - 42, w: 160, h: 84 })

    // A spot near the ground line clamps the crop inside the frame rather than reading past it.
    const level = LEVEL_CATALOGUE[0]
    const source = previewSource(level)
    const camera = heroCamera(source.map, level.hero, VIEW_W)
    const crop = heroCropRect({ x: camera.x, y: camera.y }, level.hero, VIEW_W, 160, 84)
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y).toBeGreaterThanOrEqual(0)
    expect(crop.x + crop.w).toBeLessThanOrEqual(VIEW_W)
    expect(crop.y + crop.h).toBeLessThanOrEqual(VIEW_H)
  })
})
