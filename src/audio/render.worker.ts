/**
 * Renders the sound bank off the main thread: the effects first (small, needed at the first input),
 * then the 32 s music loop. Rendering the music on the main thread would stall a frame by ~100 ms.
 */
import { renderEffects, renderMusicBank } from './bank.ts'
import type { BankMessage } from './engine.ts'

interface WorkerScope {
  postMessage(message: BankMessage, transfer: Transferable[]): void
  onmessage: ((event: MessageEvent) => void) | null
}

const scope = self as unknown as WorkerScope

scope.onmessage = () => {
  const fx = renderEffects()
  scope.postMessage(
    { kind: 'effects', bank: fx },
    Object.values(fx.effects).map((samples) => samples.buffer),
  )
  const music = renderMusicBank()
  scope.postMessage({ kind: 'music', bank: music }, [music.music.buffer])
}
