import { BUILD_LABEL } from './build-info.ts'

// Placeholder shell: the engine, renderer and level 1-1 land in the first feature PR.
const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('missing #game canvas')

const ctx = canvas.getContext('2d')
if (!ctx) throw new Error('no 2d context')

ctx.imageSmoothingEnabled = false
ctx.fillStyle = '#1d2b3a'
ctx.fillRect(0, 0, canvas.width, canvas.height)
ctx.fillStyle = '#f2f2f2'
ctx.font = '8px monospace'
ctx.fillText('Echo Sky Run', 8, 16)
ctx.fillText(BUILD_LABEL, 8, 28)
