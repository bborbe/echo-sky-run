# Changelog

All notable changes to this project will be documented in this file.

Please choose versions by [Semantic Versioning](http://semver.org/).

* MAJOR version when you make incompatible API changes,
* MINOR version when you add functionality in a backwards-compatible manner, and
* PATCH version when you make backwards-compatible bug fixes.

## Unreleased

- feat: the feel and performance budgets are tests. Input-to-frame ≤ 3 frames, corner correction ≤ 4 px, camera look-ahead (≥ 60% of the view ahead above 75% of max speed), a p99 frame time under 18 ms measured on the live frame loop, and zero heap allocations per frame in the fixed step — each with a test, plus a golden replay of level 1-1 that must land on the same frame-exact finish. The fixed step now reuses its scratch objects and arrays instead of building new ones every frame. `?freeze=1` holds a spawn URL on a still frame, `make shots` writes 960×540 and 1920×1080 screenshots from it, and the numbers live in `AGENTS.md`.

## v0.5.1

- fix: the tutorial sign before the Echo gap reads `C/Y` — a player holding a pad sees their own button on it, not only the keyboard's. It drew `C` alone.

## v0.5.0

- feat: controller support, ported from Driftline's `gamepad-shell.ts`. The pad presses the game's own keys, so the spec's § 6 mapping lands in the one input path the keyboard already uses — A jump, B spin, X run/carry, Y Echo, Start pause, stick and D-pad to move. The pad is polled every frame (hot-plug needs no event), and a button already down when the pad appears counts as a press: browsers reveal a pad only once a button is pressed, so that press is the player's first input and must not be swallowed.
- feat: a debug overlay, modelled on Driftline's `src/debug/overlay.ts` — `?debug=1` or a backtick, showing fps, frame time (last and p99), sim steps per frame, Pip's x/y/velocity, the speed meter, Echo count / charge / lifetime and the build commit. P copies the current spot as a `?level=1-1&x=&y=` URL, and that URL starts the level there.
- feat: pause on Esc / P / Start, with a PAUSED plate. A pause the player asked for is kept across a tab switch; the tab's own pause still lifts when the tab comes back.
- feat: `F` toggles browser fullscreen, reusing Driftline's `fullscreen.ts` — the canvas re-fits on every fullscreen change, and an Esc that leaves fullscreen is not also read as a pause request
- fix: touching the goal freezes the run. The tally shows the time the flag was touched and Pip stops taking input; before, the timer kept counting and Pip walked on behind the tally ("level finishs ... but i can still move and the time did not stop"). The tally now also says how to leave it — "Jump / A: retry · H: controls".

## v0.4.1

- fix: the Echo platform is visible. It was pale blue at 55% opacity over a pale blue sky, which is invisible rather than subtle — play gate 2 reported "I can't see them". It now draws a dark outline, a solid fill that survives a greyscale read, a ghost body above it, and a bright flash for its first six frames. A test asserts the outline and fill contrast against the sky colour.
- fix: the Echo platform holds a landing. It was 12 px — exactly Pip's width, anchored at his left edge — so a landing at speed carried him off it in a few frames. It is now 32 px and centred, and an Echo grips harder than the level's tiles, because at ground friction a sprint needs ~72 px to stop, far more than a foothold has. A test lands Pip on it at run and sprint speed and asserts he is still standing 90 frames later; it failed against the first, width-only fix, which is how the insufficiency was caught.
- fix: the camera used a hardcoded 16 px player height, so it sat 6 px high while Pip was Super.

## v0.4.0

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
