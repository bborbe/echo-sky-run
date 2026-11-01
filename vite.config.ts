import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// One source for the build identity: CI sets VITE_COMMIT_SHA (pages.yml), local builds fall back to git.
function commitSha(): string {
  if (process.env.VITE_COMMIT_SHA) return process.env.VITE_COMMIT_SHA
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}
process.env.VITE_COMMIT_SHA = commitSha()

/**
 * The build identity has to follow HEAD, not the moment the dev server started. `define` is
 * evaluated once at config load, so a long-running `make run` kept reporting the SHA it booted on —
 * a screenshot taken after a merge then named the wrong commit, which is exactly what the debug
 * overlay exists to prevent. `transformIndexHtml` runs per page load, so the meta tag is current;
 * `src/build-info.ts` prefers that tag over the frozen `define` value in a dev build.
 */
function liveCommitSha(): Plugin {
  return {
    name: 'live-commit-sha',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { name: 'commit', content: commitSha() }, injectTo: 'head' },
    ],
  }
}
const version: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

// Test tiers, same shape as driftline: slow is an explicit list, fast is every other test file.
// `npm test` runs fast only (every PR, `make test`); `npm run test:all` runs both.
const SLOW_TESTS: string[] = []

// Served from https://bborbe.github.io/echo-sky-run/ (GitHub Pages project site); PR previews build
// under /echo-sky-run/pr-<n>/ by setting VITE_BASE (pages.yml).
export default defineConfig({
  base: process.env.VITE_BASE || '/echo-sky-run/',
  plugins: [liveCommitSha()],
  server: { port: 5173, strictPort: true },
  define: {
    __COMMIT_SHA__: JSON.stringify(process.env.VITE_COMMIT_SHA),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    projects: [
      { extends: true, test: { name: 'fast', include: ['src/**/*.test.ts'], exclude: SLOW_TESTS } },
      { extends: true, test: { name: 'slow', include: SLOW_TESTS } },
    ],
  },
})
