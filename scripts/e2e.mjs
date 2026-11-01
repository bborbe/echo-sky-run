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

// A pad and a fullscreen API the check can drive. Both are stubbed before any page script runs:
// headless Chromium has no controller, and a real requestFullscreen needs a user gesture.
await page.addInitScript(() => {
  window.__pads = []
  window.__makePad = (pressed = []) => ({
    id: 'Xbox Wireless Controller',
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, (_, i) => ({
      pressed: pressed.includes(i),
      value: pressed.includes(i) ? 1 : 0,
    })),
  })
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => window.__pads,
  })

  let fullscreen = null
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreen,
  })
  Element.prototype.requestFullscreen = function () {
    fullscreen = this
    document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  }
  document.exitFullscreen = () => {
    fullscreen = null
    document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  }

  // Every synthetic key the pad shell presses, in order, so the mapping can be asserted directly.
  window.__keyCodes = []
  window.addEventListener('keydown', (e) => window.__keyCodes.push(e.code), true)
})

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

  // ---- the controls card -------------------------------------------------------------------
  // Checked before anything else, because it is on screen at load and swallows the first key: the
  // input checks below would otherwise be measuring the card rather than the game.
  const card = await page.evaluate(() => window.__echoSkyRun.controls())
  check(card.visible, 'the controls card is shown on first start')
  check(
    card.labels.includes('Echo') && card.labels.includes('Jump') && card.labels.includes('Move'),
    'the card lists the mappings',
    JSON.stringify(card.labels),
  )

  await page.keyboard.press('z')
  const dismissed = await page.evaluate(() => window.__echoSkyRun.controls())
  check(!dismissed.visible, 'any key dismisses the card')

  await page.keyboard.press('h')
  const reopened = await page.evaluate(() => window.__echoSkyRun.controls())
  check(reopened.visible, 'H brings the card back')

  await page.keyboard.press('z')
  const closedAgain = await page.evaluate(() => window.__echoSkyRun.controls())
  check(!closedAgain.visible, 'the card closes again')

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
    // Move first, so "reset" is proven by the position coming back rather than by it never leaving.
    game.step({ right: true })
    game.step({ right: true })
    const ev = new KeyboardEvent('keydown', { code: 'KeyR', cancelable: true, bubbles: true })
    window.dispatchEvent(ev)
    return { prevented: ev.defaultPrevented, x: game.state().x, spawnX: game.spawnX() }
  })
  check(
    plainR.prevented && plainR.x === plainR.spawnX,
    'a plain R still resets the run',
    JSON.stringify(plainR),
  )

  const blurReleased = await page.evaluate(async () => {
    const game = window.__echoSkyRun
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 250))
    window.dispatchEvent(new Event('blur'))
    await new Promise((resolve) => setTimeout(resolve, 600))
    return Math.abs(game.state().vx) < 0.2
  })
  check(blurReleased, 'a key held at focus loss is released')

  // The seam drives the simulation deterministically; this proves the shipped frame loop plus
  // readInput actually moves the player, so the level is exercised through the live path too.
  await page.evaluate(() => {
    window.__echoSkyRun.reset()
    window.__echoSkyRun.resume()
  })
  await page.waitForTimeout(150)
  const x0 = await page.evaluate(() => window.__echoSkyRun.state().x)
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(600)
  await page.keyboard.up('ArrowRight')
  const x1 = await page.evaluate(() => window.__echoSkyRun.state().x)
  check(x1 > x0 + 5, 'the live frame loop advances the simulation', `x ${x0.toFixed(1)} -> ${x1.toFixed(1)}`)

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
      // Jump from the lip and over the walkers, the way a player who can see what is coming plays.
      // Jumping on a fixed rhythm instead walks straight into the Gear-Goomba, and a hit while Small
      // is now death — which is the level working, not the bot failing.
      const enemyNear = game.enemyXs().some((ex) => ex > s.x && ex - s.x < 40)
      const jumpPressed = s.grounded && (game.lipMissingAt(s.x) || enemyNear)

      // Mid-gap, airborne, past the point where a plain hop comes up short. `echoAtX` is the level's
      // own answer, so a level tweak cannot desynchronise the browser check from the unit test.
      const wantEcho = !wantEchoOnce && !s.grounded && s.x >= game.echoAtX && s.airCharges > 0
      if (wantEcho) wantEchoOnce = true

      const next = game.step({
        right: true,
        jump: true,
        jumpPressed,
        sprint: true,
        echoPressed: wantEcho,
      })

      // Count Echoes that actually appeared, not placements the driver asked for.
      if (next.echoes > previousEchoes) echoesPlaced += 1
      previousEchoes = next.echoes

      if (next.goalReached) return { won: true, frames: i + 1, echoesPlaced, x: next.x }
      // A pit now respawns Pip at the checkpoint rather than letting him leave the world, so a
      // death — not a runaway y — is what says the run failed.
      if (next.deaths > 0) return { won: false, died: true, frames: i + 1, x: next.x }
    }
    return { won: false, timedOut: true }
  })

  check(run.won, 'level 1-1 is cleared', JSON.stringify(run))
  check(run.echoesPlaced === 1, 'the gap is crossed on exactly one mid-air Echo', `placed=${run.echoesPlaced}`)

  // The tally records the run from the frame loop, so give it a frame to see goalReached.
  await page.waitForTimeout(200)
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('echo-sky-run.v1')
    return raw ? JSON.parse(raw) : null
  })
  check(
    typeof stored?.bestSeconds === 'number' && stored.bestSeconds > 0,
    'the best time is stored under echo-sky-run.v1',
    JSON.stringify(stored),
  )

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

    // Read the palette from the page rather than repeating the literals: a colour tweak must not
    // fail this check for the wrong reason. A distinct-colour count passes on the sky gradient
    // alone, so assert the actual palette.
    const rgb = (hex) => {
      const n = parseInt(hex.slice(1), 16)
      return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
    }
    const palette = window.__echoSkyRun.palette
    return {
      colours: seen.size,
      sky: seen.has(rgb(palette.sky)),
      ground: seen.has(rgb(palette.ground)),
      player: seen.has(rgb(palette.pip)),
    }
  })
  check(
    painted.sky && painted.ground && painted.player,
    'the canvas shows sky, ground and the player',
    `colours=${painted.colours} ${JSON.stringify(painted)}`,
  )

  await page.screenshot({ path: SHOT_PATH })
  console.log(`screenshot: ${SHOT_PATH}`)

  // ---- the debug overlay, hidden on a plain URL ---------------------------------------------
  const plainDebug = await page.evaluate(() => window.__echoSkyRun.debug())
  check(!plainDebug.visible, 'the debug overlay is hidden on a plain URL')

  // With the overlay hidden, P is the spec's pause key. Resume first: the playthrough above left the
  // simulation paused, and a pause key pressed on an already-paused game reads as a resume.
  await page.evaluate(() => {
    window.__echoSkyRun.reset()
    window.__echoSkyRun.resume()
  })
  await page.waitForTimeout(100)
  await page.keyboard.press('p')
  const pausedByP = await page.evaluate(() => window.__echoSkyRun.paused())
  await page.keyboard.press('p')
  const resumedByP = await page.evaluate(() => window.__echoSkyRun.paused())
  check(pausedByP && !resumedByP, 'P pauses and resumes with the overlay hidden', `${pausedByP} -> ${resumedByP}`)

  // ---- controller ----------------------------------------------------------------------------
  await page.evaluate(() => {
    window.__echoSkyRun.reset()
    window.__echoSkyRun.resume()
  })
  await page.waitForTimeout(120)

  const noPad = await page.evaluate(() => window.__echoSkyRun.pad())
  check(noPad.id === null, 'no pad is reported before one is connected', JSON.stringify(noPad))

  // Hot-plug: the pad appears mid-run, with no event from the browser (the stub only changes what
  // getGamepads returns), so this also proves the poll notices it.
  await page.evaluate(() => {
    window.__pads = [window.__makePad()]
  })
  await page.waitForTimeout(150)
  const hotPlug = await page.evaluate(() => ({
    pad: window.__echoSkyRun.pad(),
    card: window.__echoSkyRun.controls(),
    toast: document.getElementById('pad-toast')?.textContent ?? '',
  }))
  check(hotPlug.pad.id !== null, 'hot-plugging a pad is noticed', JSON.stringify(hotPlug.pad))
  check(hotPlug.toast.includes('connected'), 'a connection toast is shown', hotPlug.toast)
  check(hotPlug.card.pad, 'the controls card switches to pad labels')

  // The spec § 6 mapping, one button at a time. Each press must reach the game as its key code.
  const MAPPING = [
    [0, 'Space', 'A jump'],
    [1, 'KeyX', 'B spin'],
    [2, 'ShiftLeft', 'X run'],
    [3, 'KeyC', 'Y Echo'],
  ]
  for (const [button, code, label] of MAPPING) {
    const pressed = await page.evaluate(async ({ button }) => {
      window.__keyCodes = []
      window.__pads = [window.__makePad([button])]
      await new Promise((resolve) => setTimeout(resolve, 150))
      const codes = window.__keyCodes
      window.__pads = [window.__makePad()]
      await new Promise((resolve) => setTimeout(resolve, 100))
      return codes
    }, { button })
    check(pressed.includes(code), `pad ${label} presses ${code}`, JSON.stringify(pressed))
  }

  // Start → Escape → pause. Pressed twice, so the run is left unpaused for the checks below.
  const startPauses = await page.evaluate(async () => {
    window.__pads = [window.__makePad([9])]
    await new Promise((resolve) => setTimeout(resolve, 150))
    const paused = window.__echoSkyRun.paused()
    window.__pads = [window.__makePad()]
    await new Promise((resolve) => setTimeout(resolve, 120))
    window.__pads = [window.__makePad([9])]
    await new Promise((resolve) => setTimeout(resolve, 150))
    const resumed = window.__echoSkyRun.paused()
    window.__pads = [window.__makePad()]
    await new Promise((resolve) => setTimeout(resolve, 120))
    return { paused, resumed }
  })
  check(startPauses.paused && !startPauses.resumed, 'pad Start pauses and resumes', JSON.stringify(startPauses))

  // The first press after connect must not be swallowed. The pad appears already holding A — which
  // is exactly what a browser reports when the player presses a button to wake a pad — and Pip has
  // to leave the ground on that press, not wait for a second one.
  const firstPress = await page.evaluate(async () => {
    window.__pads = []
    await new Promise((resolve) => setTimeout(resolve, 150))
    window.__echoSkyRun.reset()
    window.__echoSkyRun.resume()
    window.__echoSkyRun.hideControls()
    await new Promise((resolve) => setTimeout(resolve, 120))
    const before = window.__echoSkyRun.state()
    window.__pads = [window.__makePad([0])]
    await new Promise((resolve) => setTimeout(resolve, 180))
    const after = window.__echoSkyRun.state()
    window.__pads = [window.__makePad()]
    return { beforeGrounded: before.grounded, afterGrounded: after.grounded, vy: after.vy }
  })
  check(
    firstPress.beforeGrounded && !firstPress.afterGrounded && firstPress.vy < 0,
    'the first press after connect is not swallowed',
    JSON.stringify(firstPress),
  )

  // ---- fullscreen ----------------------------------------------------------------------------
  const fullscreen = await page.evaluate(async () => {
    const press = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }))
    press()
    await new Promise((resolve) => setTimeout(resolve, 120))
    const on = document.fullscreenElement !== null
    press()
    await new Promise((resolve) => setTimeout(resolve, 120))
    return { on, off: document.fullscreenElement === null }
  })
  check(fullscreen.on && fullscreen.off, 'F toggles fullscreen', JSON.stringify(fullscreen))

  // ---- the debug overlay, on ?debug=1 --------------------------------------------------------
  await page.goto(`${URL}?debug=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
  await page.waitForTimeout(400)

  const debugOn = await page.evaluate(() => window.__echoSkyRun.debug())
  check(debugOn.visible, '?debug=1 shows the overlay')

  // Every field the task names renders a label and a number; p99 in particular must be a real one.
  const REQUIRED_FIELDS = ['fps', 'frame', 'p99', 'steps', 'pose', 'speed', 'echo', 'commit']
  const missing = REQUIRED_FIELDS.filter((field) => !(field in debugOn.fields))
  check(missing.length === 0, 'the overlay renders every field', `missing=${missing.join(',')}`)
  const nonNumeric = REQUIRED_FIELDS.filter((field) => !/-?\d/.test(debugOn.fields[field] ?? ''))
  check(nonNumeric.length === 0, 'every field carries a numeric value', `not-numeric=${nonNumeric.join(',')}`)
  check(/-?\d/.test(debugOn.fields.p99 ?? ''), 'the p99 frame time is present', debugOn.fields.p99)

  const toggled = await page.evaluate(async () => {
    // The controls card is up on a fresh load and swallows the first key, so clear it first — this
    // check is about the overlay, not the card.
    window.__echoSkyRun.hideControls()
    const press = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', bubbles: true }))
    press()
    await new Promise((resolve) => setTimeout(resolve, 80))
    const off = window.__echoSkyRun.debug().visible
    press()
    await new Promise((resolve) => setTimeout(resolve, 80))
    return { off, backOn: window.__echoSkyRun.debug().visible }
  })
  check(!toggled.off && toggled.backOn, 'backtick toggles the overlay', JSON.stringify(toggled))

  // P copies the current spot as a spawn URL. The clipboard is the product path; the overlay's own
  // record is the fallback, because a headless browser may refuse the clipboard outright.
  // `URL` here is the page URL string, so the origin is built with the global constructor.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(URL).origin })
  // Walk Pip away from the spawn first: a copy that always returned the level start would pass the
  // round-trip check below without ever reading the player's position.
  await page.evaluate(() => {
    for (let i = 0; i < 40; i++) window.__echoSkyRun.step({ right: true })
  })
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true })))
  await page.waitForTimeout(150)
  const spawn = await page.evaluate(async () => ({
    copied: window.__echoSkyRun.debug().spawnUrl,
    clipboard: await navigator.clipboard.readText().catch(() => ''),
    spot: window.__echoSkyRun.state(),
  }))
  check(
    /\?level=1-1&x=-?\d+&y=-?\d+/.test(spawn.copied ?? ''),
    'P builds a debug-spawn URL',
    String(spawn.copied),
  )
  check(
    spawn.clipboard === spawn.copied,
    'P copies that URL to the clipboard',
    `${spawn.clipboard} vs ${spawn.copied}`,
  )

  // And the URL does what it says: the level starts Pip at that spot.
  await page.goto(spawn.copied, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
  const spawned = await page.evaluate(() => window.__echoSkyRun.state())
  check(
    spawn.spot.x > 32 && Math.abs(spawned.x - spawn.spot.x) <= 2,
    'the spawn URL starts the level at that spot, not at the level start',
    `x ${spawned.x} vs ${spawn.spot.x}`,
  )

  // ---- death respawns, in the browser, with no key press -------------------------------------
  // Two pits, because the respawn point is the thing that changes: before the checkpoint Pip comes
  // back where he started, after it he comes back at the flag. The spawn URL sets the start, so the
  // second case only passes if the flag actually claimed the respawn.
  const pitAt = async (x) => {
    await page.goto(`${URL}?level=1-1&x=${x}&y=176`, { waitUntil: 'load' })
    await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
    return page.evaluate(() => {
      const game = window.__echoSkyRun
      const spawnX = game.spawnX()
      game.pause()
      let s = game.state()
      let frames = 0
      for (; frames < 400 && s.deaths === 0; frames++) s = game.step({ right: true })
      // The frame the pit takes him is the frame he is already back — no key press, no delay.
      const backAtSpawn = Math.abs(s.x - spawnX) < 1
      // In control again: the very next input moves him.
      const next = game.step({ right: true })
      return { deaths: s.deaths, frames, spawnX, x: s.x, backAtSpawn, moved: next.x > s.x }
    })
  }

  const pitBefore = await pitAt(440)
  check(pitBefore.deaths === 1, 'a pit kills Pip', JSON.stringify(pitBefore))
  check(
    pitBefore.backAtSpawn && pitBefore.moved,
    'before the checkpoint he is back at the start and in control, same frame',
    JSON.stringify(pitBefore),
  )

  const pitAfter = await pitAt(600)
  check(pitAfter.deaths === 1, 'the Echo gap kills Pip', JSON.stringify(pitAfter))
  check(
    Math.abs(pitAfter.x - 688) < 1 && pitAfter.moved,
    'after the checkpoint he comes back at the flag, not where he started',
    JSON.stringify(pitAfter),
  )

  check(errors.length === 0, 'no console errors', errors.slice(0, 3).join(' | '))
} catch (err) {
  failed = true
  console.log(`FAIL  run threw — ${err}`)
} finally {
  await browser.close()
}

process.exit(failed ? 1 : 0)
