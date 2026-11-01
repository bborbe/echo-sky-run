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

  // A build whose Vite define never substituted would carry the literal '%VITE_COMMIT_SHA%', which
  // is non-empty — so the check has to be SHA-shaped, not merely present.
  const meta = await page.getAttribute('meta[name="commit"]', 'content')
  check(/^[0-9a-f]{7,40}$/.test(meta || ''), 'page carries a real commit SHA', meta || 'missing')

  const run = await page.evaluate(() => {
    const game = window.__echoSkyRun
    game.reset()
    game.pause()

    let wantEchoOnce = false
    let echoesPlaced = 0
    let previousEchoes = game.state().echoes

    for (let i = 0; i < 3000; i++) {
      const s = game.state()
      // Mid-gap, airborne, past the point where a plain hop comes up short. `echoAtX` is the level's
      // own answer, so a level tweak cannot desynchronise the browser check from the unit test.
      const wantEcho = !wantEchoOnce && !s.grounded && s.x >= game.echoAtX && s.airCharges > 0
      if (wantEcho) wantEchoOnce = true

      const next = game.step({
        right: true,
        jump: true,
        jumpPressed: true,
        sprint: true,
        echoPressed: wantEcho,
      })

      // Count Echoes that actually appeared, not placements the driver asked for.
      if (next.echoes > previousEchoes) echoesPlaced += 1
      previousEchoes = next.echoes

      if (next.goalReached) return { won: true, frames: i + 1, echoesPlaced, x: next.x }
      if (next.y > 400) return { won: false, fell: true, frames: i + 1, x: next.x }
    }
    return { won: false, timedOut: true }
  })

  check(run.won, 'level 1-1 is cleared', JSON.stringify(run))
  check(run.echoesPlaced === 1, 'the gap is crossed on exactly one mid-air Echo', `placed=${run.echoesPlaced}`)
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
    return { ok: seen.size > 2, colours: seen.size, size: `${canvas.width}x${canvas.height}` }
  })
  check(painted.ok, 'the canvas rendered more than a flat fill', `colours=${painted.colours} size=${painted.size}`)

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
