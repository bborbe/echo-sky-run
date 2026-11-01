import { describe, expect, it } from 'vitest'
import {
  DEBUG_COPY_KEY,
  debugToggle,
  debugVisible,
  readEchoSpot,
  readFreeze,
  readLevel,
  readSpawn,
  spawnQuery,
} from './overlay.ts'

describe('debug overlay visibility', () => {
  it('opens on ?debug=1 and on the ?dev=1 alias', () => {
    expect(debugVisible('?debug=1', false)).toBe(true)
    expect(debugVisible('?dev=1', false)).toBe(true)
  })

  it('stays shut on a plain production URL', () => {
    expect(debugVisible('', false)).toBe(false)
    expect(debugVisible('?level=1-1&x=10&y=20', false)).toBe(false)
  })

  it('is on by default in the dev build, and ?debug=0 overrides it there', () => {
    expect(debugVisible('', true)).toBe(true)
    expect(debugVisible('?debug=0', true)).toBe(false)
    expect(debugVisible('?debug=0', false)).toBe(false)
  })

  it('toggles on a backtick, and only on a clean one', () => {
    expect(debugToggle('Backquote', false, false, false)).toBe(true)
    expect(debugToggle('Backquote', true, false, false)).toBe(false)
    expect(debugToggle('Backquote', false, true, false)).toBe(false)
    expect(debugToggle('Backquote', false, false, true)).toBe(false)
    expect(debugToggle('KeyP', false, false, false)).toBe(false)
  })

  it('copies the spawn URL on O, so P stays the pause key', () => {
    expect(DEBUG_COPY_KEY).toBe('KeyO')
    expect(DEBUG_COPY_KEY).not.toBe('KeyP')
  })
})

describe('debug level', () => {
  it('reads the level id from ?level=, defaulting to 1-1', () => {
    expect(readLevel('?level=1-2')).toBe('1-2')
    expect(readLevel('?level=1-1&x=10&y=20')).toBe('1-1')
    expect(readLevel('')).toBe('1-1')
    expect(readLevel('?level=')).toBe('1-1')
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

  it('reads an Echo spot from ?echo=x,y and nothing from a malformed one', () => {
    expect(readEchoSpot('?level=1-1&echo=870,40')).toEqual({ x: 870, y: 40 })
    expect(readEchoSpot('?level=1-1')).toBeNull()
    expect(readEchoSpot('?echo=870')).toBeNull()
    expect(readEchoSpot('?echo=870,')).toBeNull()
    expect(readEchoSpot('?echo=a,b')).toBeNull()
  })

  it('freezes only on ?freeze=1, so a shot is a still frame', () => {
    expect(readFreeze('?level=1-1&x=10&y=20&freeze=1')).toBe(true)
    expect(readFreeze('?level=1-1&x=10&y=20')).toBe(false)
    expect(readFreeze('?freeze=0')).toBe(false)
    expect(readFreeze('')).toBe(false)
  })
})
