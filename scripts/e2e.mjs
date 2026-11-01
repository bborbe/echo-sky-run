// End-to-end check for level 1-1: load the real page in a real browser, drive the input layer with
// real key events, play the level through the same fixed-step simulation the frame loop uses, and
// require that the gap is crossed on a mid-air Echo and the goal flag reached — with no console
// error anywhere.
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

  // ---- the canvas fills the window, with no letterbox bars --------------------------------
  const logicalWidths = []
  for (const vp of [
    { width: 960, height: 540 },
    { width: 1920, height: 1080 },
    { width: 1920, height: 540 },
  ]) {
    await page.setViewportSize(vp)
    await page.waitForTimeout(250)
    const box = await page.evaluate(() => {
      const c = document.querySelector('#game')
      const r = c.getBoundingClientRect()
      return {
        rectW: Math.round(r.width),
        rectH: Math.round(r.height),
        winW: window.innerWidth,
        winH: window.innerHeight,
        logicalW: c.width,
        logicalH: c.height,
        scrollW: document.documentElement.scrollWidth,
        scrollH: document.documentElement.scrollHeight,
      }
    })
    const fills = box.rectW === box.winW && box.rectH === box.winH
    const noBars = box.scrollW <= box.winW && box.scrollH <= box.winH
    check(
      fills && noBars && box.logicalH === 224,
      `canvas fills the window at ${vp.width}x${vp.height} with no bars`,
      JSON.stringify(box),
    )
    logicalWidths.push(box.logicalW)
  }
  // Same aspect at a bigger size keeps the logical width; a wider aspect shows more of the level.
  check(
    logicalWidths[2] > logicalWidths[0],
    'a wider window shows more of the level',
    `960x540=${logicalWidths[0]} 1920x1080=${logicalWidths[1]} 1920x540=${logicalWidths[2]}`,
  )

  // Back to the shot viewport for the playthrough.
  await page.setViewportSize({ width: 960, height: 540 })
  await page.waitForTimeout(150)

  // ---- input layer, driven by real events with the frame loop live -------------------------
  await page.evaluate(() => window.__echoSkyRun.reset())
  await page.waitForTimeout(120)
  await page.keyboard.down('ArrowUp')
  const jumped = await page
    .waitForFunction(() => !window.__echoSkyRun.state().grounded, null, { timeout: 3000 })
    .then(() => true)
    .catch(() => false)
  await page.keyboard.up('ArrowUp')
  check(jumped, 'ArrowUp starts a jump through the real input path')

  const ctrlR = await page.evaluate(() => {
    const game = window.__echoSkyRun
    game.reset()
    const before = game.state().x
    const ev = new KeyboardEvent('keydown', { code: 'KeyR', ctrlKey: true, cancelable: true, bubbles: true })
    window.dispatchEvent(ev)
    return { prevented: ev.defaultPrevented, sameX: game.state().x === before }
  })
  check(!ctrlR.prevented && ctrlR.sameX, 'Ctrl+R is left to the browser', JSON.stringify(ctrlR))

  const plainR = await page.evaluate(() => {
    const game = window.__echoSkyRun
    const ev = new KeyboardEvent('keydown', { code: 'KeyR', cancelable: true, bubbles: true })
    window.dispatchEvent(ev)
    return { prevented: ev.defaultPrevented, x: game.state().x }
  })
  check(plainR.prevented && plainR.x === 32, 'a plain R still resets the run', JSON.stringify(plainR))

  const blurReleased = await page.evaluate(async () => {
    const game = window.__echoSkyRun
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 250))
    window.dispatchEvent(new Event('blur'))
    await new Promise((resolve) => setTimeout(resolve, 600))
    return Math.abs(game.state().vx) < 0.2
  })
  check(blurReleased, 'a key held at focus loss is released')

  // ---- the level itself, driven deterministically ------------------------------------------
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

  // ---- what is actually on the canvas ------------------------------------------------------
  // Wait for two rendered frames first: the read otherwise races the first paint and sees a blank
  // backing store.
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
    // A distinct-colour count passes on the sky gradient alone, so assert the actual palette.
    return {
      colours: seen.size,
      sky: seen.has('127,196,232'),
      ground: seen.has('63,122,58'),
      player: seen.has('232,102,60'),
    }
  })
  check(
    painted.sky && painted.ground && painted.player,
    'the canvas shows sky, ground and the player',
    `colours=${painted.colours} ${JSON.stringify(painted)}`,
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
