# Changelog

All notable changes to this project will be documented in this file.

Please choose versions by [Semantic Versioning](http://semver.org/).

* MAJOR version when you make incompatible API changes,
* MINOR version when you add functionality in a backwards-compatible manner, and
* PATCH version when you make backwards-compatible bug fixes.

## Unreleased

- feat: Gear-Goomba and Steam-Turtle — 16×16 and 16×24 walkers at 0.5 px/f that turn at walls, die to a stomp, and turn a stomped turtle into a shell that slides at 3 px/f when kicked and follows Pip when carried with Shift
- feat: stomp bounce at −4.5 px/f and the combo score, 100, 200, 400, 800, 1000… per chain without landing
- feat: level 1-1 is rebuilt to the spec's shape — a flat start with no enemies, then a Gear-Goomba, a ? block, a Steam-Turtle, a small gap, the checkpoint and the 13-tile Echo gap — with a 19-tile floor between the two gaps so a sprint jump out of the small one lands before the Echo gap rather than on its lip
- feat: the checkpoint flag claims the respawn point the first time Pip reaches it
- feat: a pit kills regardless of tier and puts Pip back at the last checkpoint on the same frame, with no key press; a death ends every Echo and breaks the stomp chain
- feat: Pip has two tiers — Small at 12x14 and Super at 12x26 — and the hitbox height follows the tier, so he grows upward from his feet instead of into the floor
- feat: the ? block is solid and releases a Mushroom when hit from below, once; collecting it turns Small into Super
- feat: a hit while Super drops Pip to Small with 90 f of invincibility; a hit while Small is death and respawns at the checkpoint
- feat: the checkpoint flag grants Super if Pip is still Small, so the second half is played with the tier the first half earned
- feat: a level-clear tally shows the run time and the best time, and the best time persists in `localStorage` under `echo-sky-run.v1`
- feat: the game pauses when the tab is hidden, so a player who switches away does not come back to a run that carried on without him
- feat: a controls card on first start lists the keyboard and pad mappings and the one line that explains the Echo — "C leaves a ghost platform where you are — jump on it"; any key dismisses it, H brings it back, and it switches to pad labels the moment a controller is connected
- feat: a sign before the Echo gap shows the `C` key and its hint the first time Pip walks past it, so the one move the level is about is taught before it is demanded
- feat: a practice ledge before the checkpoint sits above what a plain jump can reach, with the floor left intact below it — the place to learn the mid-air Echo where falling costs nothing
- fix: the goal flag now triggers over its drawn height, not a single tile — the second jump off an Echo lands a player high enough to sail over a one-tile trigger, so touching the flag meant less than it looked
- fix: level 1-1 is 80 tiles wide instead of 72, so there is floor to land on after the Echo gap; at the old width the Echo jump carried Pip clean over the goal and into the closing wall
- fix: the tab-hidden pause resumes when the tab comes back — it was a one-way latch, so switching away once froze the game until a reload
- fix: the shell kick and carry are wired into the simulation. They were implemented and exported but never called, so carrying was unreachable and a resting shell damaged Pip on contact; a resting shell is now an object to pick up or kick, and only a sliding one hurts
- fix: an enemy that walks off a ledge is removed instead of falling forever as an invisible body
- fix: the run-time formatter uses integer maths, so a time like 5.1 s no longer renders as `0:05.0`

## v0.3.0

- feat: level 1-1 "Meadow Ledge" is playable — a tile-string level with a 13-tile gap wider than any sprint jump, the goal flag, and the goal check
- feat: the canvas fills the whole browser window with no letterbox bars — a fixed 224 px logical height, a fractional scale drawn nearest-neighbour, and a logical width that follows the window, so a wider window shows more of the level; the camera follows with a 16 px deadzone and re-fits on resize
- feat: the renderer blends the last two fixed steps by the stepper's alpha, so a display faster than 60 Hz does not judder
- fix: the Echo's top edge now sits exactly at the player's feet instead of one Echo-height above them, so a mid-air Echo actually catches the player instead of being fallen through
- fix: the game no longer swallows browser shortcuts, `ArrowUp` and `W` start a jump instead of only holding one, and a key still down when the tab loses focus is released
- fix: pressing `R` while holding a direction no longer strands that key — the held-key set mirrors the physical keyboard and survives a reset, so the player keeps moving
- test: an end-to-end check drives the real page in a muted browser — real key events for the input layer, then a 1-1 playthrough through the same fixed-step simulation that must cross the gap on exactly one mid-air Echo, with no console error

## v0.2.0

- feat: fixed-timestep engine — a 60 Hz accumulator that keeps behaviour independent of frame rate, pure player physics (run 2.25 px/f, sprint 3.0 at a full P-meter, variable jump, 6 f coyote time and jump buffer) and tile collision that snaps flush to floors, walls, ceilings and one-way tops without tunnelling
- feat: the Ghost Echo — placeable mid-air for one air charge that refreshes only on solid ground, solid for 240 f, a one-way top the player stands on and rises through, and refused inside a wall

## v0.1.0

- chore: scaffold the repo — Vite + TypeScript with no framework, vitest split into fast and slow tiers, GitHub Pages deploy with a playable preview per PR, secret scanning and the maintainer-bot opt-in
