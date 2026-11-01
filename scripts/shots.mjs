// Screenshots from debug spawn URLs at the two resolutions the slice is judged at, each with a
// greyscale + blur twin, plus the sprite contact sheet.
//
//   SHOTS_URL   page to drive (default: the local `vite preview` build on 4189)
//   SHOTS_DIR   where to write the PNGs (default: shots/, gitignored)
//   SHOTS_POSES comma-separated pose names to limit the run (default: all)
//
// `freeze=1` is load-bearing: a shot from a live page catches whatever frame happened to be up, so
// two runs would differ. Frozen, the page renders one still frame and the shot is reproducible.
//
// The blur twin is the readability check (Rating Guide check I): CSS `grayscale(1) blur(…)` over the
// scaled render. The blur is 1.5 logical px — the strength of the operator's art-direction check,
// 3 CSS px on a 2× scene — so 3.6 px at 960×540 and 7.2 px at 1920×1080. Each blurred shot is also
// measured: the mean grey of every element's box against the ring of background around it, written
// to readability.json. Those numbers are evidence; the verdict is the operator's.
//
// The browser is launched muted, and the session is closed as soon as its shots are taken.

import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const URL_BASE = process.env.SHOTS_URL || 'http://localhost:4189/echo-sky-run/'
const OUT_DIR = process.env.SHOTS_DIR || 'shots'
const ONLY = (process.env.SHOTS_POSES || '').split(',').filter(Boolean)
const SIZES = [
  [960, 540],
  [1920, 1080],
]
/** The readability blur, in logical pixels. */
const BLUR_LOGICAL_PX = 1.5

/**
 * The poses: a spawn spot (pixel coordinates; Pip Small stands at y = 178 on the ground), an
 * optional Echo spot, and a script run through the test seam before the shot.
 */
const POSES = [
  { name: '1-1', query: '?level=1-1&x=600&y=178' },
  { name: 'gear-goomba', query: '?level=1-1&x=236&y=178' },
  { name: 'steam-turtle', query: '?level=1-1&x=520&y=178' },
  { name: 'shell', query: '?level=1-1&x=568&y=100', script: 'stomp' },
  { name: 'qblock', query: '?level=1-1&x=356&y=178' },
  { name: 'small-gap', query: '?level=1-1&x=420&y=178' },
  { name: 'echo-gap', query: '?level=1-1&x=770&y=178' },
  // The Echo over each parallax layer: high (sky and the far islands), middle (the hills and the
  // gear ruin), low (the near bushes). 100 idle steps drain its timer ring to just over half.
  { name: 'echo-far', query: '?level=1-1&x=760&y=178&echo=880,52', idle: 100 },
  { name: 'echo-mid', query: '?level=1-1&x=760&y=178&echo=880,148', idle: 100 },
  { name: 'echo-near', query: '?level=1-1&x=760&y=178&echo=880,174', idle: 100 },
].filter((p) => ONLY.length === 0 || ONLY.includes(p.name))

mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ args: ['--mute-audio'] })
let failed = false
const readability = []

/** Run in the page: composite both canvases, apply the blur twin's filter, measure each element. */
function measure(blurPx) {
  const sky = document.querySelector('#sky')
  const game = document.querySelector('#game')
  const W = window.innerWidth
  const H = window.innerHeight
  const comp = document.createElement('canvas')
  comp.width = W
  comp.height = H
  const c = comp.getContext('2d')
  c.imageSmoothingEnabled = true
  c.drawImage(sky, 0, 0, W, H)
  c.imageSmoothingEnabled = false
  c.drawImage(game, 0, 0, W, H)
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const o = out.getContext('2d')
  o.filter = `grayscale(1) blur(${blurPx}px)`
  o.drawImage(comp, 0, 0)
  const data = o.getImageData(0, 0, W, H).data

  const api = window.__echoSkyRun
  const scale = H / 224
  const camX = api.cameraX()
  const grey = (x, y) => data[(y * W + x) * 4]
  const inside = (r, x, y) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1
  const rect = (e, pad) => ({
    x0: Math.max(0, Math.round((e.x - camX - pad) * scale)),
    y0: Math.max(0, Math.round((e.y - pad) * scale)),
    x1: Math.min(W, Math.round((e.x + e.w - camX + pad) * scale)),
    y1: Math.min(H, Math.round((e.y + e.h + pad) * scale)),
  })
  const results = []
  for (const e of api.elements()) {
    const inner = rect(e, 0)
    if (inner.x1 - inner.x0 < 2 || inner.y1 - inner.y0 < 2) continue
    const outer = rect(e, 6)
    let si = 0
    let ni = 0
    let so = 0
    let no = 0
    for (let y = outer.y0; y < outer.y1; y++) {
      for (let x = outer.x0; x < outer.x1; x++) {
        if (inside(inner, x, y)) {
          si += grey(x, y)
          ni++
        } else {
          so += grey(x, y)
          no++
        }
      }
    }
    if (ni === 0 || no === 0) continue
    const element = si / ni
    const ring = so / no
    results.push({ name: e.name, element: Math.round(element), ring: Math.round(ring), delta: Math.round(element - ring) })
  }
  return results
}

try {
  for (const [width, height] of SIZES) {
    const blurPx = (BLUR_LOGICAL_PX * height) / 224
    for (const pose of POSES) {
      const page = await browser.newPage({ viewport: { width, height } })
      const errors = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', (err) => errors.push(String(err)))

      try {
        const response = await page.goto(URL_BASE + pose.query + '&freeze=1', { waitUntil: 'load' })
        if (response?.status() !== 200) throw new Error(`page returned ${response?.status()}`)

        await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
        // The controls card is up on first load; a shot of it is a shot of the card, not the game.
        await page.evaluate(() => window.__echoSkyRun.hideControls())
        await page.evaluate(
          ({ script, idle }) => {
            const api = window.__echoSkyRun
            if (script === 'stomp') {
              // Fall onto the Steam-Turtle until the stomp lands, then a few frames of the bounce.
              for (let i = 0; i < 120 && api.state().score === 0; i++) api.step({})
              if (api.state().score === 0) throw new Error('the stomp never landed')
              for (let i = 0; i < 6; i++) api.step({})
            }
            for (let i = 0; i < (idle ?? 0); i++) api.step({})
            // Seam steps pause; hold() turns that into a freeze without the PAUSED plate.
            if (script || idle) api.hold()
          },
          { script: pose.script ?? null, idle: pose.idle ?? 0 },
        )
        // Two frames: the first paints, the second is the still the screenshot captures.
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        )

        const frozen = await page.evaluate(() => window.__echoSkyRun.frozen())
        if (!frozen) throw new Error('freeze=1 did not hold the simulation — the shot would be a moving frame')

        const base = `${OUT_DIR}/${pose.name}-${width}x${height}`
        await page.screenshot({ path: `${base}.png` })
        await page.evaluate((px) => {
          document.documentElement.style.filter = `grayscale(1) blur(${px}px)`
        }, blurPx)
        await page.screenshot({ path: `${base}-blur.png` })
        await page.evaluate(() => {
          document.documentElement.style.filter = ''
        })
        const measured = await page.evaluate(measure, blurPx)
        readability.push({ pose: pose.name, size: `${width}x${height}`, blurPx: Number(blurPx.toFixed(2)), elements: measured })

        if (errors.length > 0) throw new Error(`console errors: ${errors.slice(0, 3).join(' | ')}`)
        console.log(`shot: ${base}.png + -blur.png  ${measured.map((m) => `${m.name} Δ${m.delta}`).join('  ')}`)
      } catch (err) {
        failed = true
        console.log(`FAIL  ${pose.name} ${width}x${height} — ${err}`)
      } finally {
        await page.close()
      }
    }
  }

  // The contact sheet: every animation, every frame, over the sky and the hill colour.
  if (ONLY.length === 0) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
    try {
      await page.goto(URL_BASE + '?sheet=1', { waitUntil: 'load' })
      await page.waitForSelector('#sheet')
      await page.screenshot({ path: `${OUT_DIR}/contact-sheet.png`, fullPage: true })
      console.log(`shot: ${OUT_DIR}/contact-sheet.png`)
    } catch (err) {
      failed = true
      console.log(`FAIL  contact sheet — ${err}`)
    } finally {
      await page.close()
    }
  }
} finally {
  await browser.close()
}

writeFileSync(`${OUT_DIR}/readability.json`, JSON.stringify(readability, null, 2) + '\n')
console.log(`readability: ${OUT_DIR}/readability.json`)
process.exit(failed ? 1 : 0)
