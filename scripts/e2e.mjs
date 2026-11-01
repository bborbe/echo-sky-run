// End-to-end check for level 1-1: load the real page in a real browser, play the level through the
// same fixed-step simulation the frame loop uses, and require that the gap is crossed on a mid-air
// Echo and the goal flag reached — with no console error anywhere.
//
//   E2E_URL   page to drive (default: the local `vite preview` build)
//   SHOT_PATH where to write the screenshot (default: /tmp/echo-sky-run-1-1.png)
//
// The browser is launched muted: audio on the operator's speakers is a defect, not noise.

import { chromium } from 'playwright'

const URL = process.env.E2E_URL || 'http://localhost:4173/echo-sky-run/'
const SHOT_PATH = process.env.SHOT_PATH || '/tmp/echo-sky-run-1-1.png'

const browser = await chromium.launch({ args: ['--mute-audio'] })
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })

const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(String(err)))

let failed = false
function check(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed = true
}

try {
  const response = await page.goto(URL, { waitUntil: 'load' })
  check(response?.status() === 200, 'page returns 200', `status=${response?.status()}`)

  await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
  check(true, 'game booted and exposed its simulation')

  const meta = await page.getAttribute('meta[name="commit"]', 'content')
  check(Boolean(meta), 'page carries a commit meta tag', meta || 'missing')

  const run = await page.evaluate(() => {
    const game = window.__echoSkyRun
    game.reset()
    game.pause()
    let placed = false
    let echoesUsed = 0
    for (let i = 0; i < 3000; i++) {
      const s = game.state()
      // Mid-gap, airborne, past the point where a plain hop comes up short.
      const wantEcho = !placed && !s.grounded && s.x >= 370 && s.airCharges > 0
      if (wantEcho) {
        placed = true
        echoesUsed += 1
      }
      const next = game.step({
        right: true,
        jump: true,
        jumpPressed: true,
        sprint: true,
        echoPressed: wantEcho,
      })
      if (next.goalReached) return { won: true, frames: i + 1, echoesUsed, x: next.x }
      if (next.y > 400) return { won: false, fell: true, frames: i + 1, x: next.x }
    }
    return { won: false, timedOut: true }
  })

  check(run.won, 'level 1-1 is cleared', JSON.stringify(run))
  check(run.echoesUsed === 1, 'the gap is crossed on exactly one mid-air Echo', `used=${run.echoesUsed}`)
  check((run.frames || 0) > 60, 'the run takes more than a single hop', `frames=${run.frames}`)

  // Prove the canvas actually painted, not just that the simulation ran. Wait for two rendered
  // frames first: the read otherwise races the first paint and sees a blank backing store.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('#game')
    if (!canvas) return { ok: false, why: 'no canvas' }
    const ctx = canvas.getContext('2d')
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const seen = new Set()
    for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
    const mid = 4 * (Math.floor(canvas.height / 2) * canvas.width + Math.floor(canvas.width / 2))
    return {
      ok: seen.size > 2,
      colours: seen.size,
      size: `${canvas.width}x${canvas.height}`,
      sample: `${data[0]},${data[1]},${data[2]},${data[3]}`,
      mid: `${data[mid]},${data[mid + 1]},${data[mid + 2]},${data[mid + 3]}`,
    }
  })
  check(
    painted.ok,
    'the canvas rendered more than a flat fill',
    `colours=${painted.colours} size=${painted.size} px0=${painted.sample} mid=${painted.mid}`,
  )

  await page.screenshot({ path: SHOT_PATH })
  console.log(`screenshot: ${SHOT_PATH}`)

  check(errors.length === 0, 'no console errors', errors.slice(0, 3).join(' | '))
} catch (err) {
  failed = true
  console.log(`FAIL  run threw — ${err}`)
} finally {
  await browser.close()
}

process.exit(failed ? 1 : 0)
