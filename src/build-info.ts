// Build identity, fed by `define` in vite.config.ts (VITE_COMMIT_SHA in CI, `git rev-parse HEAD` locally).
// The same commit value is the `<meta name="commit">` tag, which is how a deploy is verified.
declare const __COMMIT_SHA__: string
declare const __BUILD_TIME__: string
declare const __APP_VERSION__: string

/**
 * `define` freezes this at config load, which on a long-running dev server is the SHA it booted on.
 * The `live-commit-sha` plugin rewrites the meta tag per page load, so that tag wins when present —
 * a screenshot then names the commit actually checked out. A production build has no divergence:
 * both values come from the same build.
 */
const metaCommit: string =
  typeof document === 'undefined'
    ? ''
    : (document.querySelector('meta[name="commit"]')?.getAttribute('content') ?? '')

export const COMMIT_SHA: string = metaCommit === '' || metaCommit === 'unknown' ? __COMMIT_SHA__ : metaCommit
export const BUILD_TIME: string = __BUILD_TIME__
export const APP_VERSION: string = __APP_VERSION__
export const BUILD_LABEL = `${COMMIT_SHA.slice(0, 7)} · ${BUILD_TIME.slice(0, 16).replace('T', ' ')} · v${APP_VERSION}`
