// The `?autopilot=1` check: load a level with the autopilot on, let it play itself, and require that
// the run reaches the results screen with no console error — recording the whole thing to a video so
// the operator can watch it afterwards.
//
//   AUTOPILOT_URL  page to drive (default: the dev server's 1-1 autopilot URL)
//   VIDEO_PATH     where to write the recording (default: /tmp/echo-sky-run-autopilot.webm)
//
// The browser is launched muted: audio on the operator's speakers is a defect, not noise. It is also
// closed as soon as the run finishes, so no browser outlives the check.

import { chromium } from 'playwright'

const URL = process.env.AUTOPILOT_URL || 'http://localhost:5173/echo-sky-run/?level=1-1&autopilot=1&vol=0'
const VIDEO_PATH = process.env.VIDEO_PATH || '/tmp/echo-sky-run-autopilot.webm'
const TIMEOUT_MS = 60_000

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

const browser = await chromium.launch({ args: ['--mute-audio'] })
const context = await browser.newContext({
  viewport: { width: 960, height: 540 },
  recordVideo: { dir: '/tmp/echo-sky-run-autopilot-video', size: { width: 960, height: 540 } },
})
const page = await context.newPage()

const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(String(error)))

const response = await page.goto(URL, { waitUntil: 'load' })
check('page returns 200', response !== null && response.status() === 200, `status=${response?.status()}`)

// The seam is the check's only window into the run; without it nothing can be observed.
await page.waitForFunction(() => window.__echoSkyRun !== undefined, undefined, { timeout: 10_000 })
check('the autopilot URL boots straight into the level, not the title', (await page.evaluate(() => window.__echoSkyRun.screen())) === 'level')

// Play itself. The frame loop is what steps the sim here — the check never calls `step()`.
const started = Date.now()
let screen = 'level'
while (Date.now() - started < TIMEOUT_MS) {
  screen = await page.evaluate(() => window.__echoSkyRun.screen())
  if (screen === 'results') break
  await page.waitForTimeout(100)
}

const seconds = ((Date.now() - started) / 1000).toFixed(1)
check('the autopilot plays the level to the results screen', screen === 'results', `${seconds}s`)
check('no console error anywhere in the run', errors.length === 0, errors.slice(0, 3).join(' | '))

const state = await page.evaluate(() => window.__echoSkyRun.state())
check('the run reached the goal', state.goalReached === true, `deaths=${state.deaths} frames=${state.frames} echoes=${state.echoes}`)

// Close in this order so the video is flushed before its path is read.
await page.close()
const videoPath = await page.video().path()
await context.close()
await browser.close()

const { copyFile } = await import('node:fs/promises')
await copyFile(videoPath, VIDEO_PATH)
console.log(`VIDEO  ${VIDEO_PATH}`)
console.log(failures === 0 ? 'AUTOPILOT OK' : `AUTOPILOT FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
