// Build identity, fed by `define` in vite.config.ts (VITE_COMMIT_SHA in CI, `git rev-parse HEAD` locally).
// The same commit value is the `<meta name="commit">` tag, which is how a deploy is verified.
declare const __COMMIT_SHA__: string
declare const __BUILD_TIME__: string
declare const __APP_VERSION__: string

export const COMMIT_SHA: string = __COMMIT_SHA__
export const BUILD_TIME: string = __BUILD_TIME__
export const APP_VERSION: string = __APP_VERSION__
export const BUILD_LABEL = `${COMMIT_SHA.slice(0, 7)} · ${BUILD_TIME.slice(0, 16).replace('T', ' ')} · v${APP_VERSION}`
