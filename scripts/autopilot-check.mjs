// The `?autopilot=1` check: load a level with the autopilot on, let it play itself, and require that
// it reaches the results screen with no console error — recording the whole thing to a video so the
// operator can watch it afterwards.
//
// Looping is opt-in via `&loop=1`, so a plain `?autopilot=1` page load is the single recorded clear
// and `&loop=1` clears the level over and over: the results screen holds for ~1.5 s, then the run
// restarts. This check proves both halves — the plain URL stays on the results screen (the one-shot
// run the recording captures), and the `loop=1` URL restarts so one page load yields three
// consecutive clears.
//
//   AUTOPILOT_URL  page to drive (default: the dev server's 1-1 autopilot URL)
//   VIDEO_PATH     where to write the recording (default: /tmp/echo-sky-run-autopilot.webm)
//
// The browser is launched muted: audio on the operator's speakers is a defect, not noise. It is also
// closed as soon as the run finishes, so no browser outlives the check.

import { chromium } from 'playwright'

const BASE_URL = process.env.AUTOPILOT_URL || 'http://localhost:5173/echo-sky-run/?level=1-1&autopilot=1&vol=0'
/** The plain autopilot URL is the one-shot run; `&loop=1` is the only thing that turns looping on. */
const ONE_SHOT_URL = BASE_URL
const LOOP_URL = `${BASE_URL}&loop=1`
const VIDEO_PATH = process.env.VIDEO_PATH || '/tmp/echo-sky-run-autopilot.webm'
const CLEAR_TIMEOUT_MS = 120_000
/** The hold `src/main.ts` keeps on the results screen before a looping run restarts. */
const RESULTS_HOLD_MS = 1500

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

const browser = await chromium.launch({ args: ['--mute-audio'] })

/** Wait until the page has booted and exposed the test seam. */
async function boot(page) {
  await page.waitForFunction(() => window.__echoSkyRun !== undefined, undefined, { timeout: 10_000 })
}
const screenOf = (page) => page.evaluate(() => window.__echoSkyRun.screen())

/** Poll until the screen is `want`, or give up after `timeoutMs`. */
async function waitForScreen(page, want, timeoutMs) {
  const started = Date.now()
  let screen = await screenOf(page)
  while (screen !== want && Date.now() - started < timeoutMs) {
    await page.waitForTimeout(100)
    screen = await screenOf(page)
  }
  return { screen, seconds: (Date.now() - started) / 1000 }
}

function watchErrors(page) {
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  return errors
}

// ---- one-shot: the plain autopilot URL reaches the results screen and stays there — the recorded single run ----
const shotContext = await browser.newContext({
  viewport: { width: 960, height: 540 },
  recordVideo: { dir: '/tmp/echo-sky-run-autopilot-video', size: { width: 960, height: 540 } },
})
const shotPage = await shotContext.newPage()
const shotErrors = watchErrors(shotPage)

const shotResponse = await shotPage.goto(ONE_SHOT_URL, { waitUntil: 'load' })
check('page returns 200', shotResponse !== null && shotResponse.status() === 200, `status=${shotResponse?.status()}`)
await boot(shotPage)
check(
  'the autopilot URL boots straight into the level, not the title',
  (await screenOf(shotPage)) === 'level',
)

const oneShot = await waitForScreen(shotPage, 'results', CLEAR_TIMEOUT_MS)
check('the one-shot URL plays the level to the results screen', oneShot.screen === 'results', `${oneShot.seconds}s`)
// Looping is off by default, so it must not restart: still on the results screen well past the hold.
await shotPage.waitForTimeout(RESULTS_HOLD_MS + 1200)
const stillResults = await screenOf(shotPage)
check('the one-shot URL stays on the results screen — no restart', stillResults === 'results', stillResults)
const oneShotState = await shotPage.evaluate(() => window.__echoSkyRun.state())
check(
  'the one-shot run reached the goal',
  oneShotState.goalReached === true,
  `deaths=${oneShotState.deaths} frames=${oneShotState.frames}`,
)
check('no console error anywhere in the one-shot run', shotErrors.length === 0, shotErrors.slice(0, 3).join(' | '))

// Close in this order so the video is flushed before its path is read.
await shotPage.close()
const videoPath = await shotPage.video().path()
await shotContext.close()

const { copyFile } = await import('node:fs/promises')
await copyFile(videoPath, VIDEO_PATH)

// ---- looping: `&loop=1` restarts after the results screen, three clears from one page ----
const loopContext = await browser.newContext({ viewport: { width: 960, height: 540 } })
const loopPage = await loopContext.newPage()
const loopErrors = watchErrors(loopPage)

const loopResponse = await loopPage.goto(LOOP_URL, { waitUntil: 'load' })
check('the looping page returns 200', loopResponse !== null && loopResponse.status() === 200, `status=${loopResponse?.status()}`)
await boot(loopPage)
check('the looping URL boots straight into the level', (await screenOf(loopPage)) === 'level')

// Count the results screens from one page load. `resultsAt`/`levelAt` are the wall-clock times of
// each transition, so the hold between them is measurable: results → level → results → level → results.
const resultsAt = []
const levelAt = []
let prev = 'level'
const loopStarted = Date.now()
while (resultsAt.length < 3 && Date.now() - loopStarted < CLEAR_TIMEOUT_MS * 3) {
  await loopPage.waitForTimeout(50)
  const screen = await screenOf(loopPage)
  if (screen !== prev) {
    const now = Date.now()
    if (screen === 'results') resultsAt.push(now)
    else if (screen === 'level') levelAt.push(now)
    prev = screen
  }
}

check(
  'the default autopilot loops: three results screens from one page load',
  resultsAt.length === 3,
  `results=${resultsAt.length}`,
)

// Each results screen holds long enough to read the time and best time before the restart.
const holds = resultsAt.slice(0, -1).map((at, i) => levelAt[i] - at)
check(
  `the results screen holds ~${RESULTS_HOLD_MS} ms before each restart`,
  holds.length === 2 && holds.every((ms) => ms >= 1200 && ms <= 3000),
  `holds=${holds.join(',')} ms`,
)
check('no console error anywhere in the looping run', loopErrors.length === 0, loopErrors.slice(0, 3).join(' | '))

await loopContext.close()
await browser.close()

console.log(`VIDEO  ${VIDEO_PATH}`)
console.log(failures === 0 ? 'AUTOPILOT OK' : `AUTOPILOT FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
