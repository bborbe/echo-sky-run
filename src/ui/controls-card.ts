// The controls card. A DOM overlay rather than canvas text: it has to be readable at any window
// size and the browser check asserts its labels, so real elements are worth more than pixels.

/** The keyboard mapping, from the game description § 6. */
const KEYBOARD_ROWS: readonly (readonly [string, string])[] = [
  ['Move', '← → / A D'],
  ['Jump', 'Space / K'],
  ['Run / carry', 'Shift / J'],
  ['Spin jump', 'X / L'],
  ['Echo', 'C / I'],
]

/** The same actions with an Xbox pad in hand. */
const PAD_ROWS: readonly (readonly [string, string])[] = [
  ['Move', 'Left stick / D-pad'],
  ['Jump', 'A'],
  ['Run / carry', 'X'],
  ['Spin jump', 'B'],
  ['Echo', 'Y'],
]

/** The one line that explains the twist. It is the whole reason the card exists. */
export const ECHO_HINT = 'C leaves a ghost platform where you are — jump on it'

export interface ControlsCard {
  show(): void
  hide(): void
  visible(): boolean
  /** Switch between keyboard and pad labels. */
  setPad(connected: boolean): void
  /** True when the pad labels are showing. */
  isPad(): boolean
}

const STYLE_ID = 'controls-card-style'

/** Injected once. Kept next to the markup so a change to one is hard to forget in the other. */
const STYLES = `
#controls-card {
  position: fixed; inset: 0; margin: auto;
  width: min(420px, 86vw); height: fit-content;
  padding: 18px 22px; border-radius: 10px;
  background: rgba(20, 30, 40, 0.94); color: #f2f2f2;
  font: 13px/1.5 ui-monospace, monospace;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
  z-index: 10;
}
#controls-card h2 { margin: 0 0 10px; font-size: 12px; letter-spacing: 2px; color: #c9a227; }
#controls-card dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 16px; margin: 0; }
#controls-card dt { color: #9fe8ff; }
#controls-card dd { margin: 0; }
#controls-card .echo-hint { margin: 12px 0 0; color: #5dbb63; }
#controls-card .dismiss { margin: 10px 0 0; opacity: 0.65; font-size: 12px; }
`

function installStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLES
  document.head.append(style)
}

/**
 * Build the card into `root`. It starts hidden; the caller decides when it is on screen, because
 * "first start only" and "H brings it back" are the shell's rules, not the card's.
 */
export function createControlsCard(root: HTMLElement): ControlsCard {
  installStyles()

  const card = document.createElement('div')
  card.id = 'controls-card'
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-label', 'Controls')

  const title = document.createElement('h2')
  title.textContent = 'CONTROLS'
  card.append(title)

  const list = document.createElement('dl')
  card.append(list)

  const hint = document.createElement('p')
  hint.className = 'echo-hint'
  hint.textContent = ECHO_HINT
  card.append(hint)

  const footer = document.createElement('p')
  footer.className = 'dismiss'
  footer.textContent = 'H — controls again · any key — start'
  card.append(footer)

  let pad = false
  let shown = false

  function render(): void {
    list.replaceChildren()
    for (const [action, keys] of pad ? PAD_ROWS : KEYBOARD_ROWS) {
      const dt = document.createElement('dt')
      dt.textContent = action
      const dd = document.createElement('dd')
      dd.textContent = keys
      list.append(dt, dd)
    }
    card.dataset.layout = pad ? 'pad' : 'keyboard'
  }

  render()
  card.style.display = 'none'
  root.append(card)

  return {
    show() {
      shown = true
      card.style.display = ''
    },
    hide() {
      shown = false
      card.style.display = 'none'
    },
    visible: () => shown,
    setPad(connected: boolean) {
      if (pad === connected) return
      pad = connected
      render()
    },
    isPad: () => pad,
  }
}
