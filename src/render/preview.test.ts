import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LEVEL_CATALOGUE } from '../levels/catalogue.ts'
import { findTile, SPAWN } from '../physics/tilemap.ts'
import { focusedLevelId, previewCamera, previewSource } from './preview.ts'

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
})
