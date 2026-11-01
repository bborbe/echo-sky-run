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

  // ---- the title screen, and the way into the game -----------------------------------------
  // The game lands on a title screen and nothing steps until the player starts. Checked before
  // anything else because a menu swallows keys: the input checks below would otherwise be measuring
  // the menu rather than the game.
  const title = await page.evaluate(() => ({
    menu: window.__echoSkyRun.menu(),
    card: window.__echoSkyRun.controls().visible,
    paused: window.__echoSkyRun.paused(),
  }))
  check(title.menu?.screen === 'title', 'the game lands on the title screen', JSON.stringify(title.menu))
  check(
    JSON.stringify(title.menu?.items) === JSON.stringify(['START', 'CONTROLS']),
    'the title offers START and CONTROLS',
    JSON.stringify(title.menu?.items),
  )
  check(!title.card, 'the controls card does not cover the title: it is a row on it')
  check(title.paused, 'nothing steps on the title screen')

  // The 3 s budget covers the whole way in: page load, then the one press that hands over control.
  await page.keyboard.press('Space')
  const started = await page.evaluate(() => ({
    screen: window.__echoSkyRun.screen(),
    ms: Math.round(performance.now()),
  }))
  check(started.screen === 'level', 'START begins the run', JSON.stringify(started))
  check(started.ms <= 3000, 'page load to the player in control is 3 s or less', `${started.ms} ms`)

  // ---- the controls card --------------------------------------------------------------------
  await page.keyboard.press('h')
  const card = await page.evaluate(() => window.__echoSkyRun.controls())
  check(card.visible, 'H opens the controls card')
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
    // No pause here: a seam step already halts the frame loop, and pausing would leave the screen on
    // the pause menu, so the goal could never hand the run to the results screen.

    let wantEchoOnce = false
    let echoesPlaced = 0
    let previousEchoes = game.state().echoes

    // Every sim-derived overlay field, sampled each step: a hardcoded readout shows one value only,
    // so a field that never changes across a whole clear is a field that is not reading the game.
    const watched = ['vx', 'vy', 'grounded', 'power', 'charge', 'timer', 'checkpoint', 'state']
    const seen = Object.fromEntries(watched.map((k) => [k, new Set()]))
    const note = () => {
      const f = game.debug().fields
      for (const k of watched) seen[k].add(f[k])
    }
    const summarize = () => Object.fromEntries(watched.map((k) => [k, seen[k].size]))
    note()

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
      note()

      if (next.goalReached) {
        return { won: true, frames: i + 1, echoesPlaced, x: next.x, transitions: summarize() }
      }
      // A pit now respawns Pip at the checkpoint rather than letting him leave the world, so a
      // death — not a runaway y — is what says the run failed.
      if (next.deaths > 0) return { won: false, died: true, frames: i + 1, x: next.x, transitions: summarize() }
    }
    return { won: false, timedOut: true, transitions: summarize() }
  })

  check(run.won, 'level 1-1 is cleared', JSON.stringify(run))

  // The overlay's readout is only worth a screenshot if the numbers move with the game. A field that
  // held one value across a whole clear is a constant wearing a field name.
  const staticFields = Object.entries(run.transitions ?? {})
    .filter(([, n]) => n < 2)
    .map(([k]) => k)
  check(
    staticFields.length === 0,
    'every sim-derived overlay field changes during the run',
    `static=${staticFields.join(',')} ${JSON.stringify(run.transitions)}`,
  )

  // Play gate 1: "the char animation does not stop at level end". After the flag, Pip stands idle
  // even with right still held — the frozen run must not keep animating a stride.
  const afterGoal = await page.evaluate(() => {
    const game = window.__echoSkyRun
    const poses = new Set()
    const frames = new Set()
    for (let i = 0; i < 40; i++) {
      const s = game.step({ right: true, sprint: true })
      poses.add(s.pose)
      frames.add(s.poseFrame)
    }
    return { poses: [...poses], frames: [...frames] }
  })
  check(
    afterGoal.poses.length === 1 && afterGoal.poses[0] === 'idle' && afterGoal.frames.length <= 2,
    'after the goal Pip stands idle instead of running in place',
    JSON.stringify(afterGoal),
  )
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

  // Play gate 1: "the quali of the text is not very good readable". The tally is a pixel font on an
  // opaque panel, so every pixel inside the panel is one of a handful of palette inks — an
  // anti-aliased grey from a system font would show up here as a colour outside the set.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const tallyText = await page.evaluate(() => {
    const api = window.__echoSkyRun
    const box = api.overlayBox()
    if (!box) return { ok: false, why: 'no overlay panel' }
    const game = document.querySelector('#game')
    const { data } = game.getContext('2d').getImageData(box.x, box.y, box.w, box.h)
    const hex = (i) => '#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
    const allowed = new Set(api.overlayInks())
    const stray = new Map()
    const inks = new Set()
    for (let i = 0; i < data.length; i += 4) {
      const h = hex(i)
      if (allowed.has(h) && data[i + 3] === 255) inks.add(h)
      else stray.set(h, (stray.get(h) ?? 0) + 1)
    }
    return { ok: true, box, inks: [...inks], stray: [...stray.entries()].slice(0, 5) }
  })
  check(
    tallyText.ok && tallyText.stray.length === 0 && tallyText.inks.length >= 4,
    'the level-clear text is crisp pixel font: palette inks only, no anti-aliased greys',
    JSON.stringify(tallyText),
  )

  // ---- the results screen: the run's time, the best time, and the two ways on ----------------
  const results = await page.evaluate(() => ({
    screen: window.__echoSkyRun.screen(),
    menu: window.__echoSkyRun.menu(),
    lines: window.__echoSkyRun.overlayLines(),
    frames: window.__echoSkyRun.state().frames,
    stored: JSON.parse(localStorage.getItem('echo-sky-run.v1') ?? 'null'),
  }))
  /** A `M:SS.t` panel line back to seconds, so the check compares numbers rather than formatting. */
  const panelSeconds = (line, prefix) => {
    const [m, s] = line.slice(prefix.length).split(':')
    return Number(m) * 60 + Number(s)
  }
  const timeLine = results.lines.find((l) => l.startsWith('TIME '))
  const bestLine = results.lines.find((l) => l.startsWith('BEST '))
  check(
    results.screen === 'results' && JSON.stringify(results.menu?.items) === JSON.stringify(['RETRY', 'TITLE']),
    'the flag hands the run to the results screen, offering RETRY and TITLE',
    JSON.stringify({ screen: results.screen, menu: results.menu }),
  )
  check(
    timeLine !== undefined && Math.abs(panelSeconds(timeLine, 'TIME ') - results.frames / 60) <= 0.1,
    'the results TIME is the run timer read at the goal frame',
    JSON.stringify({ timeLine, seconds: results.frames / 60 }),
  )
  check(
    bestLine !== undefined &&
      typeof results.stored?.bestSeconds === 'number' &&
      Math.abs(panelSeconds(bestLine, 'BEST ') - results.stored.bestSeconds) <= 0.1,
    'the results BEST is the best time the save holds',
    JSON.stringify({ bestLine, stored: results.stored }),
  )

  // RETRY starts a fresh run: the timer goes back to its start, not the run it just finished.
  await page.keyboard.press('Space')
  const retried = await page.evaluate(() => {
    const api = window.__echoSkyRun
    const screen = api.screen()
    api.pause()
    return { screen, frames: api.state().frames }
  })
  check(
    retried.screen === 'level' && retried.frames < 30,
    'RETRY starts a fresh run with the timer back at its start',
    JSON.stringify({ retried, finishedFrames: results.frames }),
  )

  // TITLE returns to the title panel, from the results.
  await page.evaluate(() => window.__echoSkyRun.openScreen('results'))
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  const atTitle = await page.evaluate(() => ({
    screen: window.__echoSkyRun.screen(),
    menu: window.__echoSkyRun.menu(),
  }))
  check(
    atTitle.screen === 'title' && atTitle.menu?.items?.[0] === 'START',
    'TITLE returns to the title panel',
    JSON.stringify(atTitle),
  )

  // Back to a running level for the checks below.
  await page.evaluate(() => {
    window.__echoSkyRun.reset()
    window.__echoSkyRun.resume()
  })

  // ---- what is actually on the canvas ------------------------------------------------------
  // Wait for two rendered frames first: the read otherwise races the first paint and sees a blank
  // backing store.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const painted = await page.evaluate(() => {
    // Two layers since style C: the sky is painted on #sky, the ground and Pip on #game.
    const colours = (selector) => {
      const canvas = document.querySelector(selector)
      const seen = new Set()
      if (!canvas) return seen
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
      return seen
    }
    const skySeen = colours('#sky')
    const seen = colours('#game')

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
      sky: skySeen.has(rgb(palette.sky)),
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

  // Play gate 1: "esc ... where is not option to show keybind again". The pause menu names the
  // controls key, H opens the card from the pause, and dismissing the card leaves the game paused.
  await page.keyboard.press('p')
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const pausePanel = await page.evaluate(() => ({
    paused: window.__echoSkyRun.paused(),
    lines: window.__echoSkyRun.overlayLines(),
  }))
  check(
    pausePanel.paused && pausePanel.lines.includes('H / LB: CONTROLS'),
    'the pause panel shows how to bring the controls back',
    JSON.stringify(pausePanel),
  )
  await page.keyboard.press('h')
  const cardFromPause = await page.evaluate(() => ({
    card: window.__echoSkyRun.controls().visible,
    paused: window.__echoSkyRun.paused(),
  }))
  await page.keyboard.press('Space')
  const backToPause = await page.evaluate(() => ({
    card: window.__echoSkyRun.controls().visible,
    paused: window.__echoSkyRun.paused(),
  }))
  check(
    cardFromPause.card && cardFromPause.paused && !backToPause.card && backToPause.paused,
    'H opens the controls from the pause, and closing them returns to the pause',
    JSON.stringify({ cardFromPause, backToPause }),
  )
  await page.keyboard.press('p')

  // ---- the pause menu, each row by its effect -------------------------------------------------
  const pauseMenu = await page.evaluate(() => {
    const api = window.__echoSkyRun
    api.reset()
    api.resume()
    api.pause()
    return api.menu()
  })
  check(
    JSON.stringify(pauseMenu?.items) === JSON.stringify(['RESUME', 'RESTART', 'SETTINGS']),
    'the pause menu offers RESUME, RESTART and SETTINGS',
    JSON.stringify(pauseMenu),
  )

  // RESUME returns to play with the run still advancing — the timer keeps counting.
  const resumedRun = await page.evaluate(async () => {
    const api = window.__echoSkyRun
    api.reset()
    api.resume()
    api.pause()
    return api.state().frames
  })
  await page.keyboard.press('Space')
  const afterResume = await page.evaluate(async () => {
    const api = window.__echoSkyRun
    await new Promise((r) => setTimeout(r, 300))
    return { screen: api.screen(), frames: api.state().frames }
  })
  check(
    afterResume.screen === 'level' && afterResume.frames > resumedRun,
    'RESUME returns to play with the run timer still advancing',
    JSON.stringify({ atPause: resumedRun, ...afterResume }),
  )

  // RESTART returns to play with the level and the timer back at their start values.
  const beforeRestart = await page.evaluate(() => {
    const api = window.__echoSkyRun
    api.reset()
    api.resume()
    for (let i = 0; i < 30; i++) api.step({ right: true })
    const s = api.state()
    api.pause()
    return { x: s.x, frames: s.frames, spawnX: api.spawnX() }
  })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  const afterRestart = await page.evaluate(() => {
    const api = window.__echoSkyRun
    return { screen: api.screen(), x: api.state().x, frames: api.state().frames }
  })
  check(
    afterRestart.screen === 'level' &&
      afterRestart.frames === 0 &&
      afterRestart.x === beforeRestart.spawnX &&
      beforeRestart.x > beforeRestart.spawnX,
    'RESTART returns to play with the level and the timer reset to their start',
    JSON.stringify({ beforeRestart, afterRestart }),
  )

  // SETTINGS opens the settings screen: both sliders, the card and the way back.
  await page.evaluate(() => {
    const api = window.__echoSkyRun
    api.reset()
    api.resume()
    api.pause()
  })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const settingsScreen = await page.evaluate(() => ({
    screen: window.__echoSkyRun.screen(),
    menu: window.__echoSkyRun.menu(),
    lines: window.__echoSkyRun.overlayLines(),
  }))
  check(
    settingsScreen.screen === 'settings' &&
      JSON.stringify(settingsScreen.menu?.items) === JSON.stringify(['MUSIC', 'EFFECTS', 'CONTROLS', 'BACK']),
    'SETTINGS opens the settings screen with both sliders, the card and back',
    JSON.stringify(settingsScreen),
  )
  // The sliders draw as `MUSIC 50` / `EFFECTS 80`, the same lines the reload check reads.
  check(
    settingsScreen.lines.some((l) => l.startsWith('MUSIC ')) && settingsScreen.lines.some((l) => l.startsWith('EFFECTS ')),
    'the settings screen draws both volume bars',
    JSON.stringify(settingsScreen.lines),
  )

  // BACK returns to the pause, and the back key leaves the settings for the pause too.
  await page.keyboard.press('Escape')
  const backFromSettings = await page.evaluate(() => window.__echoSkyRun.screen())
  check(backFromSettings === 'pause', 'the back key leaves the settings for the pause', backFromSettings)
  await page.keyboard.press('Escape')

  // ---- the menus are cheap ---------------------------------------------------------------------
  // The overlap half of "no overlapping HUD" needs a strip to measure against, so it runs on the
  // ?debug=1 page below. Here the budget: a menu frame is the cheapest frame the game draws, so it
  // must hold one 60 Hz frame, not the 18 ms the busy in-game frames are allowed.
  await page.evaluate(() => {
    const api = window.__echoSkyRun
    api.reset()
    api.resume()
    api.pause()
  })
  await page.waitForTimeout(1500)
  const menuFrame = await page.evaluate(() => window.__echoSkyRun.frameTimings())
  check(
    menuFrame.samples >= 60 && menuFrame.p99Ms <= 16.8 + 1e-6,
    'a menu frame holds the 16.8 ms 60 Hz budget',
    JSON.stringify(menuFrame),
  )
  await page.keyboard.press('p')

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

  // The menus on the pad: the D-pad moves the selection, A confirms, LB opens the controls card.
  const padMenu = await page.evaluate(async () => {
    const api = window.__echoSkyRun
    api.reset()
    api.resume()
    api.pause()
    const first = api.menu().index
    window.__pads = [window.__makePad([13])]
    await new Promise((r) => setTimeout(r, 180))
    const second = api.menu().index
    window.__pads = [window.__makePad([0])]
    await new Promise((r) => setTimeout(r, 180))
    const screen = api.screen()
    window.__pads = [window.__makePad()]
    await new Promise((r) => setTimeout(r, 120))
    return { first, second, screen }
  })
  check(padMenu.second === padMenu.first + 1, 'the pad D-pad moves the menu selection', JSON.stringify(padMenu))
  check(padMenu.screen === 'level', 'pad A confirms the selected row', JSON.stringify(padMenu))

  const padControls = await page.evaluate(async () => {
    const api = window.__echoSkyRun
    api.reset()
    api.resume()
    api.hideControls()
    window.__pads = [window.__makePad([4])]
    await new Promise((r) => setTimeout(r, 180))
    const visible = api.controls().visible
    window.__pads = [window.__makePad()]
    await new Promise((r) => setTimeout(r, 120))
    api.hideControls()
    return visible
  })
  check(padControls, 'pad LB opens the controls card', String(padControls))

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

  // "No overlapping HUD" (goal SC2) is only checkable where a HUD exists: the debug strip runs along
  // the top edge, so a menu panel must stay entirely below it. The panel box is in logical pixels,
  // the strip is a DOM element in CSS pixels.
  const overlap = await page.evaluate(async () => {
    const api = window.__echoSkyRun
    api.openScreen('pause')
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const box = api.overlayBox()
    const strip = document.getElementById('debug-overlay')
    const scale = window.innerHeight / 224
    const rect = strip && !strip.hidden ? strip.getBoundingClientRect() : null
    return {
      visible: api.debug().visible,
      box,
      strip: rect ? { top: rect.top / scale, bottom: (rect.top + rect.height) / scale } : null,
    }
  })
  check(
    overlap.visible &&
      overlap.box !== null &&
      overlap.strip !== null &&
      (overlap.box.y >= overlap.strip.bottom || overlap.box.y + overlap.box.h <= overlap.strip.top),
    'the menu panel never overlaps the HUD strip',
    JSON.stringify(overlap),
  )

  // Every field the task names renders. The numeric check is per field rather than universal: the
  // run state, the power tier and the level id are text by design, and requiring a digit of them
  // would force the executor to fake a number.
  const REQUIRED_FIELDS = [
    'version', 'commit', 'level', 'checkpoint', 'state',
    'fps', 'frame', 'p99', 'steps',
    'x', 'y', 'vx', 'vy',
    'grounded', 'power', 'charge', 'timer', 'speed',
  ]
  const TEXT_FIELDS = ['version', 'commit', 'level', 'checkpoint', 'state', 'grounded', 'power']
  const missing = REQUIRED_FIELDS.filter((field) => !(field in debugOn.fields))
  check(missing.length === 0, 'the overlay renders every field', `missing=${missing.join(',')}`)
  const nonNumeric = REQUIRED_FIELDS.filter((field) => !TEXT_FIELDS.includes(field)).filter(
    (field) => !/-?\d/.test(debugOn.fields[field] ?? ''),
  )
  check(nonNumeric.length === 0, 'every numeric field carries a numeric value', `not-numeric=${nonNumeric.join(',')}`)
  check(/-?\d/.test(debugOn.fields.p99 ?? ''), 'the p99 frame time is present', debugOn.fields.p99)

  const toggled = await page.evaluate(async () => {
    // A fresh load lands on the title; clear any card first — this check is about the overlay.
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

  // The readout follows live state, not a constant. Two pinned spawns 40 px apart on both axes: a
  // hardcoded value cannot produce a 40 px delta on both.
  const fieldsAt = async (query) => {
    await page.goto(`${URL}${query}`, { waitUntil: 'load' })
    await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
    await page.waitForTimeout(200)
    return page.evaluate(() => window.__echoSkyRun.debug().fields)
  }
  const atA = await fieldsAt('?debug=1&freeze=1&x=100&y=200')
  const atB = await fieldsAt('?debug=1&freeze=1&x=140&y=160')
  check(
    Number(atB.x) - Number(atA.x) === 40 && Number(atA.y) - Number(atB.y) === 40,
    'x and y follow the pinned spawn',
    `${atA.x},${atA.y} -> ${atB.x},${atB.y}`,
  )

  // The overlay is on by default in the dev build, so a copy bound to P would take pause away exactly
  // where the level is played. P must still pause with the overlay up — only the hidden case was
  // covered before.
  const pauseWithOverlayUp = await page.evaluate(async () => {
    const api = window.__echoSkyRun
    // The controls card is up on a fresh load and swallows the first key.
    api.hideControls()
    api.resume()
    const before = api.paused()
    const press = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true }))
    press()
    await new Promise((resolve) => setTimeout(resolve, 80))
    const during = api.paused()
    press()
    await new Promise((resolve) => setTimeout(resolve, 80))
    return { visible: api.debug().visible, before, during, after: api.paused() }
  })
  check(
    pauseWithOverlayUp.visible &&
      !pauseWithOverlayUp.before &&
      pauseWithOverlayUp.during &&
      !pauseWithOverlayUp.after,
    'P pauses and resumes while the overlay is visible',
    JSON.stringify(pauseWithOverlayUp),
  )

  // O copies the current spot as a spawn URL. The clipboard is the product path; the overlay's own
  // record is the fallback, because a headless browser may refuse the clipboard outright.
  // `URL` here is the page URL string, so the origin is built with the global constructor.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(URL).origin })
  // Walk Pip away from the spawn first: a copy that always returned the level start would pass the
  // round-trip check below without ever reading the player's position.
  await page.evaluate(() => {
    for (let i = 0; i < 40; i++) window.__echoSkyRun.step({ right: true })
  })
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyO', bubbles: true })))
  await page.waitForTimeout(150)
  const spawn = await page.evaluate(async () => ({
    copied: window.__echoSkyRun.debug().spawnUrl,
    clipboard: await navigator.clipboard.readText().catch(() => ''),
    spot: window.__echoSkyRun.state(),
  }))
  check(
    /\?level=1-1&x=-?\d+&y=-?\d+/.test(spawn.copied ?? ''),
    'O builds a debug-spawn URL',
    String(spawn.copied),
  )
  check(
    spawn.clipboard === spawn.copied,
    'O copies that URL to the clipboard',
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

  // ---- feel and performance budgets, measured on the live frame loop -------------------------
  await page.goto(URL, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
  await page.evaluate(() => {
    window.__echoSkyRun.hideControls()
    window.__echoSkyRun.reset()
    window.__echoSkyRun.resume()
  })
  // Let the rolling window fill with real frames before reading it.
  await page.waitForTimeout(2000)

  const timings = await page.evaluate(() => window.__echoSkyRun.frameTimings())
  check(
    timings.samples >= 60 && timings.p99Ms < 18,
    'p99 frame time is under the 18 ms budget',
    JSON.stringify(timings),
  )

  // Input-to-frame: a real key press must reach the fixed step within 3 rendered frames.
  const latency = await page.evaluate(async () => {
    const game = window.__echoSkyRun
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const before = game.state().frames
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }))
    const rafs = await new Promise((resolve) => {
      let count = 0
      const tick = () => {
        count += 1
        if (game.state().frames > before) return resolve(count)
        if (count >= 20) return resolve(-1)
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', bubbles: true }))
    return { rafs }
  })
  check(
    latency.rafs > 0 && latency.rafs <= 3,
    'a key press reaches the simulation within 3 frames',
    JSON.stringify(latency),
  )

  // ---- the debug spawn URL freezes the page, so a screenshot is a still frame ---------------
  await page.goto(`${URL}?level=1-1&x=600&y=178&freeze=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
  await page.evaluate(() => window.__echoSkyRun.hideControls())
  await page.waitForTimeout(250)
  const frozenA = await page.evaluate(() => ({
    frozen: window.__echoSkyRun.frozen(),
    paused: window.__echoSkyRun.paused(),
    frames: window.__echoSkyRun.state().frames,
  }))
  await page.waitForTimeout(400)
  const frozenB = await page.evaluate(() => window.__echoSkyRun.state().frames)
  check(
    frozenA.frozen && !frozenA.paused && frozenB === frozenA.frames,
    'freeze=1 holds the simulation without drawing the pause banner',
    JSON.stringify({ ...frozenA, after: frozenB }),
  )

  // ---- style C: what goal SC2 lists as defects, and that the juice is actually wired ----------
  // Every probe reads the real canvases. The play canvas is logical pixels (viewW × 224); the
  // painted #sky canvas is BG_SCALE (3) times that.
  const openFrozen = async (query) => {
    await page.goto(`${URL}${query}&freeze=1`, { waitUntil: 'load' })
    await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
    await page.evaluate(() => window.__echoSkyRun.hideControls())
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  }

  await openFrozen('?level=1-1&x=236&y=178')
  const layers = await page.evaluate(() => {
    const sky = document.querySelector('#sky')
    const game = document.querySelector('#game')
    return {
      order: sky && game ? Boolean(sky.compareDocumentPosition(game) & Node.DOCUMENT_POSITION_FOLLOWING) : false,
      pixelated: game ? game.style.imageRendering : '',
      coverage: window.__echoSkyRun.layers(),
    }
  })
  check(layers.order, 'the painted #sky canvas sits under the pixel #game canvas', JSON.stringify(layers.order))
  check(layers.pixelated === 'pixelated', 'the play canvas keeps image-rendering: pixelated', layers.pixelated)
  check(
    layers.coverage.length === 3 && layers.coverage.every((l) => l.above >= 20000 && l.below === 0),
    'three parallax layers paint, and none of them below the haze line',
    JSON.stringify(layers.coverage),
  )

  // Seams: every pixel of every solid tile in view is opaque.
  const seams = await page.evaluate(() => {
    const api = window.__echoSkyRun
    const game = document.querySelector('#game')
    const ctx = game.getContext('2d')
    const { data } = ctx.getImageData(0, 0, game.width, game.height)
    const camX = api.cameraX()
    const tiles = api.tiles()
    let holes = 0
    let checked = 0
    for (let row = 0; row < tiles.length; row++) {
      for (let col = 0; col < tiles[row].length; col++) {
        if (tiles[row][col] !== '#') continue
        const x0 = col * 16 - camX
        if (x0 + 16 <= 0 || x0 >= game.width) continue
        for (let y = row * 16; y < row * 16 + 16; y++) {
          for (let x = Math.max(0, x0); x < Math.min(game.width, x0 + 16); x++) {
            checked++
            if (data[(y * game.width + x) * 4 + 3] !== 255) holes++
          }
        }
      }
    }
    return { holes, checked }
  })
  check(seams.checked > 1000 && seams.holes === 0, 'no seams: every solid tile pixel is opaque', JSON.stringify(seams))

  // Drawn into a tile: Pip and the Gear-Goomba, standing, have their lowest outline row on the
  // ground's top row minus one (y = 191) — never inside the tile. The scan runs the full height:
  // ground tiles carry no outline ink (only an open underside does, and 1-1's ground runs off the
  // bottom), so any outline pixel at y ≥ 192 in these columns is a sprite drawn into the ground.
  const feet = await page.evaluate(() => {
    const api = window.__echoSkyRun
    const game = document.querySelector('#game')
    const { data } = game.getContext('2d').getImageData(0, 0, game.width, game.height)
    const camX = api.cameraX()
    const lowestOutline = (e) => {
      let lowest = -1
      for (let y = 0; y < game.height; y++) {
        for (let x = Math.max(0, Math.floor(e.x - camX) - 2); x < Math.min(game.width, Math.ceil(e.x + e.w - camX) + 2); x++) {
          const i = (y * game.width + x) * 4
          if (data[i] === 0x2a && data[i + 1] === 0x1e && data[i + 2] === 0x14) lowest = Math.max(lowest, y)
        }
      }
      return lowest
    }
    return api
      .elements()
      .filter((e) => e.name === 'pip' || e.name === 'gear-goomba')
      .map((e) => ({ name: e.name, lowest: lowestOutline(e) }))
  })
  check(
    feet.length === 2 && feet.every((f) => f.lowest === 191),
    'Pip and the Gear-Goomba stand on the ground, not in it (lowest outline row 191)',
    JSON.stringify(feet),
  )

  // Background in a gap: behind the Echo gap, below the ground's top, only the sky gradient shows.
  await openFrozen('?level=1-1&x=770&y=178')
  const gap = await page.evaluate(() => {
    const api = window.__echoSkyRun
    const sky = document.querySelector('#sky')
    const k = sky.height / 224
    const { data } = sky.getContext('2d').getImageData(0, 0, sky.width, sky.height)
    const camX = api.cameraX()
    let worst = 0
    let samples = 0
    for (let col = 51; col <= 61; col++) {
      const sx = Math.round((col * 16 + 8 - camX) * k)
      if (sx < 0 || sx >= sky.width) continue
      for (let y = 192; y < 224; y += 2) {
        const i = (Math.round((y + 0.5) * k) * sky.width + sx) * 4
        const want = api.skyAt(y + 0.5)
        for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(data[i + c] - want[c]))
        samples++
      }
    }
    return { worst, samples }
  })
  check(gap.samples > 20 && gap.worst <= 6, 'a gap shows only the sky gradient (±6 per channel)', JSON.stringify(gap))

  // Flicker, standing: with the live loop running and Pip still, the ground band never changes.
  await page.goto(`${URL}?level=1-1&x=120&y=178`, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
  const standing = await page.evaluate(async () => {
    const api = window.__echoSkyRun
    api.hideControls()
    api.resume()
    const game = document.querySelector('#game')
    const ctx = game.getContext('2d')
    const band = () => Array.from(ctx.getImageData(0, 192, game.width, 32).data).join(',')
    await new Promise((r) => setTimeout(r, 300))
    const first = band()
    let changed = 0
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      if (band() !== first) changed++
    }
    return { changed }
  })
  check(standing.changed === 0, 'no flicker while standing: the ground band holds over 10 frames', JSON.stringify(standing))

  // Flicker, running: frame to frame, the ground band only shifts by the camera's own move.
  const running = await page.evaluate(async () => {
    const api = window.__echoSkyRun
    const game = document.querySelector('#game')
    const ctx = game.getContext('2d')
    const W = game.width
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }))
    await new Promise((r) => setTimeout(r, 500))
    let prev = null
    let mismatched = 0
    let compared = 0
    let moved = 0
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      const cam = api.cameraX()
      const data = ctx.getImageData(0, 192, W, 32).data
      if (prev) {
        const d = cam - prev.cam
        if (d !== 0) moved++
        // Every pixel of the overlap, every channel.
        for (let y = 0; y < 32; y++) {
          for (let x = Math.max(0, -d); x < Math.min(W, W - d); x++) {
            const a = (y * W + x + d) * 4
            const b = (y * W + x) * 4
            compared++
            if (
              prev.data[a] !== data[b] ||
              prev.data[a + 1] !== data[b + 1] ||
              prev.data[a + 2] !== data[b + 2] ||
              prev.data[a + 3] !== data[b + 3]
            ) {
              mismatched++
            }
          }
        }
      }
      prev = { cam, data }
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', bubbles: true }))
    return { moved, compared, mismatched }
  })
  check(
    running.moved > 5 && running.compared > 1000 && running.mismatched === 0,
    'no flicker while running: the ground band moves only with the camera',
    JSON.stringify(running),
  )

  // Juice wiring, on the live loop: a stomp holds the fixed step for exactly 3 steps.
  await page.goto(`${URL}?level=1-1&x=282&y=120`, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
  const stomp = await page.evaluate(async () => {
    const api = window.__echoSkyRun
    api.hideControls()
    const before = api.juice().heldSteps
    api.resume()
    for (let i = 0; i < 180 && api.state().score === 0; i++) await new Promise((r) => requestAnimationFrame(r))
    for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(r))
    return { score: api.state().score, held: api.juice().heldSteps - before }
  })
  check(stomp.score > 0 && stomp.held === 3, 'a stomp holds the live fixed step for exactly 3 steps', JSON.stringify(stomp))

  // A death: the screen shakes for 1–8 frames, the pop holds ≤ 16 steps, control is back within 18.
  // Pip starts on the ground just before the small gap and walks into it; the spawn URL makes that
  // ground spot the respawn, so he dies exactly once.
  await page.goto(`${URL}?level=1-1&x=420&y=178`, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
  const death = await page.evaluate(async () => {
    const api = window.__echoSkyRun
    api.hideControls()
    const before = api.juice().heldSteps
    api.resume()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }))
    for (let i = 0; i < 240 && api.state().deaths === 0; i++) await new Promise((r) => requestAnimationFrame(r))
    // Right stays held through the death: control is back on the first fixed step that moves Pip
    // off his respawn spot. Counted in fixed steps — simulated ones plus held ones — from the death.
    const atDeath = api.state()
    const heldAtDeath = api.juice().heldSteps
    let shakeFrames = 0
    let peak = 0
    let controlSteps = -1
    let held = 0
    // Sample until Pip answers the stick, then let go at once — held any longer, he walks back into
    // the pit. The shake (8 steps) falls entirely inside the hold, so it is counted in this window.
    for (let i = 0; i < 60 && controlSteps < 0; i++) {
      const j = api.juice()
      if (j.shakeX !== 0 || j.shakeY !== 0) shakeFrames++
      peak = Math.max(peak, Math.abs(j.shakeX), Math.abs(j.shakeY))
      const s = api.state()
      if (s.x > atDeath.x + 0.01) {
        controlSteps = s.frames - atDeath.frames + (j.heldSteps - heldAtDeath)
        held = j.heldSteps - before
      }
      await new Promise((r) => requestAnimationFrame(r))
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', bubbles: true }))
    return { deaths: api.state().deaths, held, shakeFrames, peak, controlSteps }
  })
  check(
    death.deaths === 1 && death.shakeFrames >= 1 && death.shakeFrames <= 8 && death.peak <= 2,
    'a death shakes the screen for 1–8 frames, at most 2 px',
    JSON.stringify(death),
  )
  check(
    death.held > 0 && death.held <= 16 && death.controlSteps > 0 && death.controlSteps <= 18,
    'the death pop holds ≤ 16 steps, and Pip answers the stick within 18 steps of dying',
    JSON.stringify(death),
  )

  // The timer ring is drawn and drains: its bright segments at placement against 120 steps later.
  await openFrozen('?level=1-1&x=760&y=178&echo=880,100')
  const ring = await page.evaluate(() => {
    const api = window.__echoSkyRun
    const game = document.querySelector('#game')
    const ctx = game.getContext('2d')
    const lit = () => {
      const box = api.elements().find((e) => e.name === 'echo-ring')
      if (!box) return -1
      const camX = api.cameraX()
      const { data } = ctx.getImageData(Math.round(box.x - camX), Math.round(box.y), box.w, box.h)
      let n = 0
      for (let i = 0; i < data.length; i += 4) if (data[i] === 0xe9 && data[i + 1] === 0xfb && data[i + 2] === 0xff) n++
      return n
    }
    const full = lit()
    for (let i = 0; i < 120; i++) api.step({})
    api.hold()
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve({ full, half: lit() }))),
    )
  })
  check(
    ring.full > 0 && ring.half > 0 && ring.half / ring.full >= 0.3 && ring.half / ring.full <= 0.7,
    'the Echo timer ring is drawn and halves as the Echo ages 120 of its 240 frames',
    JSON.stringify(ring),
  )

  // Squash, stretch and dust, through the same advance() the loop uses.
  await page.goto(`${URL}?level=1-1&x=120&y=178`, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
  const squash = await page.evaluate(() => {
    const api = window.__echoSkyRun
    api.hideControls()
    api.pause()
    for (let i = 0; i < 30 && !api.state().grounded; i++) api.step({})
    api.step({ jump: true, jumpPressed: true })
    const stretch = api.juice()
    let landed = api.juice()
    for (let i = 0; i < 120; i++) {
      const s = api.step({})
      if (s.grounded) {
        landed = api.juice()
        break
      }
    }
    return { stretchSy: stretch.sy, landSy: landed.sy, dust: landed.dust }
  })
  check(
    squash.stretchSy > 1 && squash.landSy < 1 && squash.dust > 0,
    'a jump stretches Pip, a landing squashes him and kicks up dust',
    JSON.stringify(squash),
  )

  // ---- sound (spec § 9 Sound, goal SC3) ------------------------------------------------------
  // Every page below loads with ?audiolog=1. The traces are pooled across pages: the union must hold
  // all 17 events 1-1 can raise, each started on the effects bus (played: true) with its own recipe.
  const SOUND_EVENTS = [
    'jump', 'land', 'echo-place', 'echo-expire', 'echo-refuse', 'stomp', 'block', 'mushroom-appear',
    'mushroom-collect', 'shell-kick', 'power-down', 'death', 'checkpoint', 'goal', 'ui-open', 'ui-close',
    'ui-tick',
  ]
  const trace = []
  const audioState = () => page.evaluate(() => window.__echoSkyRun.audio())
  const keepTrace = async () => {
    const a = await audioState()
    if (a.log) trace.push(...a.log)
  }
  const openAudioPage = async (query = '') => {
    await page.goto(`${URL}?audiolog=1${query}`, { waitUntil: 'load' })
    await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
  }
  /** Poll a bus level in the page for up to `ms`; returns the max, or the min when `want` is 'min'. */
  const busLevel = (bus, ms, want = 'max') =>
    page.evaluate(
      ({ bus, ms, want }) =>
        new Promise((resolve) => {
          const api = window.__echoSkyRun
          const t0 = performance.now()
          let best = want === 'max' ? 0 : Infinity
          const tick = () => {
            const v = api.audio().levels[bus]
            best = want === 'max' ? Math.max(best, v) : Math.min(best, v)
            if (performance.now() - t0 >= ms) return resolve(best)
            requestAnimationFrame(tick)
          }
          tick()
        }),
      { bus, ms, want },
    )
  /** Time until a bus falls below `level`, polled per frame up to `ms`; -1 when it never does. */
  const quietWithin = (bus, level, ms) =>
    page.evaluate(
      ({ bus, level, ms }) =>
        new Promise((resolve) => {
          const api = window.__echoSkyRun
          const t0 = performance.now()
          const tick = () => {
            const dt = performance.now() - t0
            if (api.audio().levels[bus] < level) return resolve(Math.round(dt))
            if (dt >= ms) return resolve(-1)
            requestAnimationFrame(tick)
          }
          tick()
        }),
      { bus, level, ms },
    )

  // Locked until a gesture, then the first input's own sound plays.
  await openAudioPage()
  const locked = await audioState()
  check(
    locked.state === 'locked' && !locked.unlocked,
    'before any input the sound engine is locked, with no AudioContext',
    JSON.stringify({ state: locked.state, unlocked: locked.unlocked }),
  )
  // The first press is START on the title: it closes the title into the level, so it raises `ui-close`
  // — and that sound has to play, not be dropped by the unlock that happens in the same press.
  await page.keyboard.press('Space')
  await page.waitForTimeout(300)
  const unlocked = await audioState()
  const firstSound = (unlocked.log ?? []).find((e) => e.event === 'ui-close')
  check(
    unlocked.unlocked && unlocked.state === 'running',
    'the first key unlocks audio: the context is running',
    JSON.stringify({ state: unlocked.state }),
  )
  check(
    firstSound?.played === true && firstSound.recipe === 'ui-close',
    'the sound that first key raised was played, not dropped',
    JSON.stringify(firstSound ?? null),
  )
  await page.waitForFunction(() => window.__echoSkyRun.audio().ready, null, { timeout: 10000 })

  // A real jump, in real time, reaches the effects bus. The analyser sits before the volume gain.
  await page.evaluate(() => {
    window.__echoSkyRun.reset()
    window.__echoSkyRun.resume()
  })
  await page.waitForTimeout(400)
  const preJump = await busLevel('effects', 120, 'min')
  await page.keyboard.down('ArrowUp')
  const jumpLevel = await busLevel('effects', 150)
  await page.keyboard.up('ArrowUp')
  check(
    preJump < 0.01 && jumpLevel >= 0.05,
    'a real jump sounds on the effects bus within 150 ms (silent before it)',
    JSON.stringify({ preJump, jumpLevel }),
  )

  // The music plays while the game runs, and the frame budget holds with it on.
  const musicOn = await busLevel('music', 1500)
  check(musicOn >= 0.05, 'the world 1 music plays while the game runs', `peak=${musicOn.toFixed(3)}`)
  await page.waitForTimeout(1500)
  const audioTimings = await page.evaluate(() => window.__echoSkyRun.frameTimings())
  check(
    audioTimings.samples >= 60 && audioTimings.p99Ms < 18,
    'p99 frame time stays under 18 ms with the music and effects running',
    JSON.stringify(audioTimings),
  )

  // Pause: the music stops within 500 ms and its position freezes; resume picks up where it stopped.
  await page.keyboard.press('Escape')
  const pauseQuietMs = await quietWithin('music', 0.005, 500)
  const tPaused = (await audioState()).musicTime
  await page.waitForTimeout(500)
  const tStill = (await audioState()).musicTime
  check(
    pauseQuietMs >= 0 && Math.abs(tStill - tPaused) < 1e-6,
    'pausing stops the music within 500 ms and freezes its position',
    JSON.stringify({ pauseQuietMs, tPaused, tStill }),
  )

  // The volume sliders, driven with the pad-reachable keys only: the D-pad moves the selection and
  // ←/→ moves a slider. They live on the settings screen now, two rows below the pause menu's top.
  const menuShown = await audioState()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  const adjusted = await audioState()
  const pauseLines = await page.evaluate(() => window.__echoSkyRun.overlayLines())
  check(
    menuShown.menu.open &&
      adjusted.volumes.music === 0.3 &&
      adjusted.volumes.effects === 0.9 &&
      Math.abs(adjusted.gains.music - 0.3) < 1e-6 &&
      Math.abs(adjusted.gains.effects - 0.9) < 1e-6 &&
      pauseLines.includes('MUSIC 30') &&
      pauseLines.includes('EFFECTS 90'),
    'the D-pad and ←/→ set both volume bars, and the bus gains follow',
    JSON.stringify({ volumes: adjusted.volumes, gains: adjusted.gains, pauseLines }),
  )

  // Two backs: settings → pause, pause → the level.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const tResumed = (await audioState()).musicTime
  const musicBack = await busLevel('music', 1000)
  check(
    tResumed > tPaused && tResumed < tPaused + 1 && musicBack >= 0.05,
    'resuming continues the music from where it paused',
    JSON.stringify({ tPaused, tResumed, musicBack }),
  )

  // A hidden tab stops the music and suspends the context; showing the tab brings it back.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const hiddenQuietMs = await quietWithin('music', 0.005, 500)
  await page.waitForTimeout(300)
  const hiddenState = (await audioState()).state
  check(
    hiddenQuietMs >= 0 && hiddenState === 'suspended',
    'a hidden tab silences the music within 500 ms and suspends the AudioContext',
    JSON.stringify({ hiddenQuietMs, hiddenState }),
  )
  await page.evaluate(() => {
    delete document.hidden
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(300)
  check((await audioState()).state === 'running', 'showing the tab again resumes the AudioContext')
  await keepTrace()

  // The volumes survive a reload: read back through the engine and the drawn rows. The reload lands
  // on the title, so the way to the sliders is START, pause, SETTINGS.
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__echoSkyRun), null, { timeout: 15000 })
  const reloaded = await audioState()
  await page.keyboard.press('z')
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  const reloadedGains = (await audioState()).gains
  const reloadedLines = await page.evaluate(() => window.__echoSkyRun.overlayLines())
  check(
    reloaded.volumes.music === 0.3 &&
      reloaded.volumes.effects === 0.9 &&
      Math.abs((reloadedGains?.music ?? -1) - 0.3) < 1e-6 &&
      Math.abs((reloadedGains?.effects ?? -1) - 0.9) < 1e-6 &&
      reloadedLines.includes('MUSIC 30') &&
      reloadedLines.includes('EFFECTS 90'),
    'both volumes survive a reload',
    JSON.stringify({ volumes: reloaded.volumes, gains: reloadedGains, lines: reloadedLines }),
  )
  await keepTrace()

  // ---- the menus raise the existing UI sounds (spec § 9) -------------------------------------
  // The 17-event in-level trace is the audio task's; this one owns the three UI events its own menus
  // raise, so a menu that silently changes screens is a failure here rather than at a play gate.
  await openAudioPage()
  await page.waitForFunction(() => window.__echoSkyRun.audio().ready, null, { timeout: 10000 })
  await page.keyboard.press('z')
  const uiTrace = await page.evaluate(async () => {
    const api = window.__echoSkyRun
    const press = (code) =>
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }))
    const before = api.audio().log.length
    press('Space') // START: the title closes into the level
    await new Promise((r) => setTimeout(r, 80))
    press('Escape') // the level opens the pause
    await new Promise((r) => setTimeout(r, 80))
    press('ArrowDown') // a row move ticks
    await new Promise((r) => setTimeout(r, 80))
    return api.audio().log.slice(before).map((e) => e.event)
  })
  check(
    uiTrace.includes('ui-close') && uiTrace.includes('ui-open') && uiTrace.includes('ui-tick'),
    'menu actions raise the existing UI sounds: a screen change and a row move',
    JSON.stringify(uiTrace),
  )

  // The scripted 1-1 run, through the same advance() the frame loop uses.
  await openAudioPage()
  await page.evaluate(() => window.__echoSkyRun.pause())
  await page.keyboard.press('z')
  await page.waitForFunction(() => window.__echoSkyRun.audio().ready, null, { timeout: 10000 })
  const soundRun = await page.evaluate(() => {
    const game = window.__echoSkyRun
    game.reset()
    game.pause()
    let echoed = false
    for (let i = 0; i < 3000; i++) {
      const s = game.state()
      const enemyNear = game.enemyXs().some((ex) => ex > s.x && ex - s.x < 40)
      const jumpPressed = s.grounded && (game.lipMissingAt(s.x) || enemyNear)
      const echoPressed = !echoed && !s.grounded && s.x >= game.echoAtX && s.airCharges > 0
      if (echoPressed) echoed = true
      const next = game.step({ right: true, jump: true, jumpPressed, sprint: true, echoPressed })
      if (next.goalReached) return { won: true }
    }
    return { won: false }
  })
  check(soundRun.won, 'the sound run clears 1-1', JSON.stringify(soundRun))
  await keepTrace()

  // Short segments for the events the clean run avoids, each from a debug spawn URL.
  const segment = async (query, script) => {
    await openAudioPage(query)
    await page.evaluate(() => window.__echoSkyRun.pause())
    await page.keyboard.press('z')
    await page.waitForFunction(() => window.__echoSkyRun.audio().ready, null, { timeout: 10000 })
    const out = await page.evaluate(script)
    await keepTrace()
    return out
  }
  // Echo placed, refused (no charge left) and expired, on the flat start.
  await segment('&level=1-1&x=40&y=178', () => {
    const g = window.__echoSkyRun
    for (let i = 0; i < 30 && !g.state().grounded; i++) g.step({})
    g.step({ jump: true, jumpPressed: true })
    for (let i = 0; i < 8; i++) g.step({ jump: true })
    g.step({ echoPressed: true })
    g.step({ echoPressed: true })
    for (let i = 0; i < 300; i++) g.step({})
  })
  // A stomp, falling onto the Gear-Goomba.
  await segment('&level=1-1&x=282&y=120', () => {
    const g = window.__echoSkyRun
    for (let i = 0; i < 120; i++) g.step({})
  })
  // The ? block and its Mushroom rising, then taken: the power tests' driver — jump into the block,
  // and chase the Mushroom the moment it appears, before it walks into the first pit.
  const mushroomRun = await segment('&level=1-1&x=386&y=178', () => {
    const g = window.__echoSkyRun
    for (let i = 0; i < 30 && !g.state().grounded; i++) g.step({})
    for (let i = 0; i < 90 && g.state().mushrooms === 0; i++) g.step({ jump: true, jumpPressed: i === 0 })
    for (let i = 0; i < 400 && g.state().power !== 'super' && g.state().deaths === 0; i++) g.step({ right: true })
    return { power: g.state().power, deaths: g.state().deaths }
  })
  // A hit on Super Pip: the checkpoint grants Super, then he walks back into the Steam-Turtle.
  const hitRun = await segment('&level=1-1&x=692&y=178', () => {
    const g = window.__echoSkyRun
    for (let i = 0; i < 30 && g.state().power !== 'super'; i++) g.step({})
    const superAtStart = g.state().power === 'super'
    for (let i = 0; i < 600 && g.state().power === 'super'; i++) g.step({ left: true })
    return { superAtStart, power: g.state().power }
  })
  // A shell: drop onto the Steam-Turtle where it will be when he lands, then walk into the shell.
  const shellRun = await segment('&level=1-1&x=552&y=100', () => {
    const g = window.__echoSkyRun
    for (let i = 0; i < 60; i++) g.step({})
    const shellX = g.enemyXs()[1] ?? null
    for (let i = 0; i < 120; i++) g.step({ left: shellX !== null && g.state().x > shellX })
    return { shellX, x: g.state().x, deaths: g.state().deaths }
  })
  check(
    mushroomRun.power === 'super' && hitRun.superAtStart && hitRun.power === 'small',
    'the sound segments reach the Mushroom and the Super → Small hit',
    JSON.stringify({ mushroomRun, hitRun, shellRun }),
  )
  // A death in the first pit.
  await segment('&level=1-1&x=430&y=178', () => {
    const g = window.__echoSkyRun
    for (let i = 0; i < 300 && g.state().deaths === 0; i++) g.step({ right: true })
  })

  const heard = new Set(trace.filter((e) => e.played).map((e) => e.event))
  const missingSounds = SOUND_EVENTS.filter((e) => !heard.has(e))
  check(missingSounds.length === 0, 'every one of the 17 sound events of 1-1 is in the audiolog, played', `missing=${JSON.stringify(missingSounds)}`)
  const wrongRecipe = trace.filter((e) => e.recipe !== e.event)
  check(
    trace.length > 0 && wrongRecipe.length === 0,
    'each audiolog entry carries its event\'s own recipe id',
    `entries=${trace.length} wrong=${JSON.stringify(wrongRecipe.slice(0, 3))}`,
  )

  check(errors.length === 0, 'no console errors', errors.slice(0, 3).join(' | '))
} catch (err) {
  failed = true
  console.log(`FAIL  run threw — ${err}`)
} finally {
  await browser.close()
}

process.exit(failed ? 1 : 0)
