// Screenshots from the debug spawn URL at the two resolutions the slice is judged at.
//
//   SHOTS_URL   page to drive (default: the local `vite preview` build on 4189)
//   SHOTS_DIR   where to write the PNGs (default: shots/, gitignored)
//   SHOTS_SPOT  the query the page is opened with — a spawn URL plus `freeze=1`
//
// `freeze=1` is load-bearing: a shot from a live page catches whatever frame happened to be up, so
// two runs would differ. Frozen, the page renders one still frame and the shot is reproducible.
// The browser is launched muted, and the session is closed as soon as its shots are taken.

import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const URL_BASE = process.env.SHOTS_URL || 'http://localhost:4189/echo-sky-run/'
const OUT_DIR = process.env.SHOTS_DIR || 'shots'
const SPOT = process.env.SHOTS_SPOT || '?level=1-1&x=600&y=178&freeze=1'
const SIZES = [
  [960, 540],
  [1920, 1080],
]

mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ args: ['--mute-audio'] })
let failed = false

try {
  for (const [width, height] of SIZES) {
    const page = await browser.newPage({ viewport: { width, height } })
    const errors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(String(err)))

    try {
      const response = await page.goto(URL_BASE + SPOT, { waitUntil: 'load' })
      if (response?.status() !== 200) throw new Error(`page returned ${response?.status()}`)

      await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
      // The controls card is up on first load; a shot of it is a shot of the card, not the game.
      await page.evaluate(() => window.__echoSkyRun.hideControls())
      // Two frames: the first paints, the second is the still the screenshot captures.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )

      const frozen = await page.evaluate(() => window.__echoSkyRun.frozen())
      if (!frozen) throw new Error('freeze=1 did not hold the simulation — the shot would be a moving frame')

      const path = `${OUT_DIR}/1-1-${width}x${height}.png`
      await page.screenshot({ path })
      if (errors.length > 0) throw new Error(`console errors: ${errors.slice(0, 3).join(' | ')}`)
      console.log(`shot: ${path}`)
    } catch (err) {
      failed = true
      console.log(`FAIL  ${width}x${height} — ${err}`)
    } finally {
      await page.close()
    }
  }
} finally {
  await browser.close()
}

process.exit(failed ? 1 : 0)
