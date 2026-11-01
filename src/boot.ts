// The page's entry: the game, or — on `?sheet=1` — the sprite contact sheet in its place.
import { mountSheet, readSheet } from './debug/sheet.ts'

if (readSheet(location.search)) {
  mountSheet(document.body)
} else {
  void import('./main.ts')
}
