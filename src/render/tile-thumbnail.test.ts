// The tile thumbnail's two structural promises, checked against the source rather than a canvas:
// it comes from the shared still renderer (no second painter in the tree), and a locked tile draws
// it too — the fade is the only difference. A canvas needs a browser, so the pixel evidence for the
// drawn thumbnail lives in the browser check (`scripts/e2e.mjs`); these probes keep the wiring honest
// in the fast tier.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RENDER_DIR = fileURLToPath(new URL('./', import.meta.url))
const SRC_DIR = fileURLToPath(new URL('../', import.meta.url))

function source(name: string): string {
  return readFileSync(join(RENDER_DIR, name), 'utf8')
}

/** Every `.ts` file under `dir`, recursively — tests included, so a probe cannot be fooled by a sibling. */
function typescriptFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...typescriptFiles(path))
    else if (entry.name.endsWith('.ts')) found.push(path)
  }
  return found
}

describe('the tile thumbnail', () => {
  it('is drawn by the shared still renderer, and the tree holds one world painter', () => {
    const renderer = source('renderer.ts')
    // Positive control: the renderer reaches the preview cache, and the cache renders the crop.
    expect(renderer).toMatch(/from '\.\/preview\.ts'/)
    expect(renderer).toMatch(/thumbnailFor\(/)
    expect(source('preview.ts')).toMatch(/heroFrameFor\(/)

    const painters = typescriptFiles(SRC_DIR)
      .filter((path) => /\bnew WorldPainter\(/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(SRC_DIR.length))
    expect(painters).toEqual(['render/renderer.ts'])
  })

  it('caches the hero still separately from the spawn still', () => {
    const preview = source('preview.ts')
    // The cache key carries the framing, so a hero crop can never be served the spawn canvas.
    expect(preview).toMatch(/levelId\}:\$\{framing\}/)
    expect(preview).toMatch(/thumbnailFor\(/)
  })

  it('draws the crop for a locked tile too, faded rather than omitted', () => {
    const renderer = source('renderer.ts')
    // The thumbnail is drawn unconditionally; only the alpha is keyed on the lock.
    expect(renderer).toMatch(/ctx\.drawImage\(thumb,/)
    expect(renderer).toMatch(/if \(locked\) ctx\.globalAlpha = LOCKED_THUMB_ALPHA/)
    expect(renderer).not.toMatch(/if \(!locked\)[^\n]*thumbnailFor/)
  })
})
