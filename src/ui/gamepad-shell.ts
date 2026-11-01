// Polls navigator.getGamepads() once per animation frame and holds the key codes the pad stands for
// (src/ui/gamepad.ts). Holding, not tapping: this is a platformer, so the run key and the stick are
// held for as long as the button is. A connection change shows a toast.
import { keyForCode, padCodes, pickPad } from './gamepad.ts'

export interface GamepadShell {
  /** The connected pad's id, or null. */
  id(): string | null
  /** How many codes the pad holds this frame — the debug overlay shows it. */
  heldCount(): number
  stop(): void
}

export interface GamepadOptions {
  /** Called on connect and on disconnect, so the controls card can switch its labels. */
  onConnect?: (connected: boolean) => void
  /** Overridable for a test that does not want an animation frame loop. */
  requestFrame?: (cb: () => void) => void
}

const TOAST_MS = 2500

function dispatch(code: string, down: boolean): void {
  window.dispatchEvent(
    new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code,
      key: keyForCode(code),
      bubbles: true,
      cancelable: true,
    }),
  )
}

/**
 * Mount the pad. Every frame reads the pad fresh, so a released button or a disconnected pad can
 * never leave a key stuck down — the same reason the keyboard path clears `held` on blur.
 */
export function mountGamepad(nav: Navigator = navigator, options: GamepadOptions = {}): GamepadShell {
  const read = (): ReturnType<typeof pickPad<Gamepad>> =>
    typeof nav.getGamepads === 'function' ? pickPad([...nav.getGamepads()]) : null
  const requestFrame = options.requestFrame ?? ((cb: () => void) => requestAnimationFrame(cb))

  let held = new Set<string>()
  let connected: string | null = null
  let toastAt = 0

  const toast = document.createElement('div')
  toast.id = 'pad-toast'
  toast.hidden = true
  toast.style.cssText =
    'position:fixed;left:50%;top:16px;transform:translateX(-50%);padding:8px 14px;border-radius:8px;' +
    'background:rgba(20,30,40,.92);color:#f2f2f2;font:12px ui-monospace,monospace;z-index:12'
  document.body.append(toast)

  const poll = (now: number): void => {
    const pad = read()
    const id = pad?.id ?? null

    if (id !== connected) {
      connected = id
      toast.textContent = id === null ? 'Controller disconnected' : 'Controller connected'
      toast.hidden = false
      toastAt = now + TOAST_MS
      options.onConnect?.(id !== null)
    }
    if (!toast.hidden && now >= toastAt) toast.hidden = true

    // The first frame after a pad appears sees every button already down as a new press. That is
    // deliberate: browsers reveal a pad only once one of its buttons is pressed, so that press is
    // the player's first input and must not be thrown away waiting for a second one.
    const current = new Set(pad === null ? [] : padCodes(pad))
    for (const code of current) if (!held.has(code)) dispatch(code, true)
    for (const code of held) if (!current.has(code)) dispatch(code, false)
    held = current

    requestFrame(() => poll(performance.now()))
  }

  requestFrame(() => poll(performance.now()))

  return {
    id: () => connected,
    heldCount: () => held.size,
    stop() {
      for (const code of held) dispatch(code, false)
      held = new Set<string>()
      toast.remove()
    },
  }
}
