import { describe, expect, it } from 'vitest'
import { escapeLeavesFullscreen } from './fullscreen.ts'

describe('escapeLeavesFullscreen', () => {
  it('treats Esc inside fullscreen as the exit, not a pause', () => {
    expect(escapeLeavesFullscreen(true, 1000, -Infinity)).toBe(true)
  })

  it('treats Esc just after leaving fullscreen as the exit that caused it', () => {
    // The browser fires fullscreenchange and the keydown in the same gesture.
    expect(escapeLeavesFullscreen(false, 1000, 900)).toBe(true)
  })

  it('treats a later Esc as a real pause request', () => {
    expect(escapeLeavesFullscreen(false, 2000, 900)).toBe(false)
  })
})
