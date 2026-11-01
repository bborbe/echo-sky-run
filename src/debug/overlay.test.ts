import { describe, expect, it } from 'vitest'
import { debugToggle, debugVisible, readSpawn, spawnQuery } from './overlay.ts'

describe('debug overlay visibility', () => {
  it('opens on ?debug=1 and stays shut on a plain URL', () => {
    expect(debugVisible('?debug=1')).toBe(true)
    expect(debugVisible('')).toBe(false)
    expect(debugVisible('?debug=0')).toBe(false)
    expect(debugVisible('?level=1-1&x=10&y=20')).toBe(false)
  })

  it('toggles on a backtick, and only on a clean one', () => {
    expect(debugToggle('Backquote', false, false, false)).toBe(true)
    expect(debugToggle('Backquote', true, false, false)).toBe(false)
    expect(debugToggle('Backquote', false, true, false)).toBe(false)
    expect(debugToggle('Backquote', false, false, true)).toBe(false)
    expect(debugToggle('KeyP', false, false, false)).toBe(false)
  })
})

describe('debug spawn', () => {
  it('round-trips a spot through the URL', () => {
    const query = spawnQuery(123.4, 96.6)
    expect(query).toBe('?level=1-1&x=123&y=97')
    expect(readSpawn(query)).toEqual({ x: 123, y: 97 })
  })

  it('reads no spawn from a URL without a complete spot', () => {
    expect(readSpawn('')).toBeNull()
    expect(readSpawn('?level=1-1')).toBeNull()
    expect(readSpawn('?level=1-1&x=10')).toBeNull()
    expect(readSpawn('?level=1-1&x=abc&y=10')).toBeNull()
  })
})
