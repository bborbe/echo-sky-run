# Changelog

All notable changes to this project will be documented in this file.

Please choose versions by [Semantic Versioning](http://semver.org/).

* MAJOR version when you make incompatible API changes,
* MINOR version when you add functionality in a backwards-compatible manner, and
* PATCH version when you make backwards-compatible bug fixes.

## v0.6.1

- chore: restate the do-not-merge contract in the gate workflow

## v0.6.0

- feat: the level toolkit every later level must pass, and 1-1 passing it. `src/toolkit/` holds four checks, all pure and DOM-free: an autopilot that clears the *populated* level (enemies, ? block, checkpoint) with 0 deaths and records every take-off with its landing; a no-Echo bypass sweep over launch position × speed × vertical launch (jump, sprint jump, and a stomp or shell bounce from three heights) × power tier, proving no launch state crosses an Echo beat without the Echo; and a blind-jump check measuring each landing against the view at take-off, at 960×540. The toolkit derives its own level grammar rather than reading constants — `findPits` walks the grid, `maxJumpReach` measures a sprint jump through the real `stepPlayer`, and a pit wider than that reach is an Echo beat, so a level with an Echo beat and no declared `echoAtX` is refused. `make test` now runs the fast tier **and** the browser playthrough (`make test-unit` is the fast tier alone), because those are the guide's two required checks; a red half fails the target. Every check ships with a known-positive control, so a clean report cannot come from a check that never fires. Applied to 1-1, the checks find one real blind landing — the jump off the Echo carries Pip 42 px past the view's right edge before he comes down, which the tutorial sign is what makes readable. `logicalViewWidth` moved beside `VIEW_H` so the check measures the view the renderer actually draws.
- feat: the save is versioned, and a migration upgrades what G1 wrote. `src/save/save.ts` keeps the key `echo-sky-run.v1`, puts the schema version in the payload, and turns the unversioned `{ "bestSeconds": 42 }` store into `{ "version": 1, "bestSeconds": 42 }` — rewriting it in place so the migration runs once, and leaving a payload from a *newer* build untouched rather than overwriting progress it cannot read. A read of broken or hostile storage still yields an empty save rather than a game that will not start, and the settings key is never touched.
- test: two browser probes stopped depending on frame cadence. The death-shake probe counted rAF samples for a fixed-step effect, so a slow frame ran two steps and a fast one ran none — the same build read 7, 8 or 9 shake "frames"; it now reads the juice's steps-remaining counter, bounded above by `SHAKE_F` whatever the sampling does. The running-flicker probe compared two drawn frames at the camera's *rounded* scroll, while the frame is drawn at its unrounded position, so a one-pixel rounding difference read as thousands of mismatched pixels; it now takes the best of shifts `d-1 … d+1`, which a genuine repaint still fails on all three. Both checks had been advisory; `make test` makes them a gate, and a flaky gate is worse than none.
- feat: the game has a loop. It lands on a title screen (START, CONTROLS), the goal flag hands the run to a results screen showing that run's time and the best time (RETRY starts a fresh run, TITLE goes back), and Esc / P / Start opens a pause menu with RESUME, RESTART and SETTINGS. Settings holds the two volume sliders — moved off the pause panel — plus the controls card and a way back, still stored under `echo-sky-run.settings.v1`. Every screen draws the same brass-rimmed panel in the 5×7 pixel font, is navigable with keyboard and pad alone, and plays the existing `ui-open` / `ui-close` / `ui-tick` sounds. The pad gains LB for the controls card and sends D-pad up/down and the stick's vertical axis as menu-only `PadUp` / `PadDown` codes, so a stick nudge still cannot jump. A debug URL (`?level=`, `?x=&y=`, `?echo=`, `?freeze=1`) starts in the level and skips the title, so the screenshot and browser tools keep driving the level directly. `make e2e` covers the four transitions, each pause row by its effect, settings persistence across a reload, pad navigation, page-load-to-control ≤ 3 s, a menu p99 ≤ 16.8 ms and the menu panel staying clear of the debug strip; `make shots` gains a pose per screen.
- feat: the debug overlay carries the state a screenshot needs to be actionable. It is on by default in the dev build (`?debug=0` hides it, `?dev=1` forces it, and a production build keeps it hidden unless `?debug=1`), and it reports the version and short commit, the level, whether the checkpoint is claimed, the run state, the FPS and p99, Pip's x/y and vx/vy, his grounded and power state, and the Echo charge and timer. It is a thin, dim, 10 px monospace strip along the top edge — semi-transparent and deliberately not in the game's style — so it reads as a development readout and never covers the playfield or the ground Pip runs on. The spawn-URL copy moved from P to O, so the overlay being on by default no longer costs the play gates their pause. The `<meta name="commit">` tag is now written per page load by a `transformIndexHtml` plugin, so a long-running dev server stops reporting the SHA it booted on.
- feat: the feel and performance budgets are tests. Input-to-frame ≤ 3 frames, corner correction ≤ 4 px, camera framing (the view follows Pip and never leads the direction of travel), a p99 frame time under 18 ms measured on the live frame loop, and zero heap allocations per frame in the fixed step — each with a test, plus a golden replay of level 1-1 that must land on the same frame-exact finish. The fixed step now reuses its scratch objects and arrays instead of building new ones every frame. `?freeze=1` holds a spawn URL on a still frame, `make shots` writes 960×540 and 1920×1080 screenshots from it, and the numbers live in `AGENTS.md`.
- feat: level 1-1 is drawn in art direction C, "painted sky, crisp clockwork". Pip (Small and Super), the Echo, the Gear-Goomba, the Steam-Turtle, the ? block, the Mushroom, the flags, the sign and the auto-tiled ground are pixel masks in `src/render/art/`. A smooth `#sky` canvas under the pixel canvas paints the sky gradient and three parallax layers, which fade out before the haze line, so a gap shows only sky. Hazard sprites are drawn about 12 % larger than their unchanged hitboxes (spec § 4). The juice: squash and stretch, landing and skid dust, a 3-step hit-stop on a stomp, an 8-frame shake only on death and on a Super → Small hit, a death pop held for at most 16 steps, and the Echo's spawn ring, sparks, timer ring and fizzle. The camera is untouched. Tests check the palette, the outline, distinct animation frames, hitbox ratios, placement, juice timings and the background layout. `make e2e` probes seams, gap haze, flicker, sprite placement and the juice wiring. `make shots` adds the SC3 poses, a 1.5 logical px greyscale blur twin with per-element grey measurements, and the contact sheet. `?sheet=1` shows every frame, and `?echo=x,y` places an Echo.
- test: the style-C e2e probes now see what they claim. The placement scan reads the full canvas height, so a sprite sunk into the ground fails. The running-flicker check compares every pixel and channel. Death-to-control is measured, from the death step to the first step that moves Pip. The Echo's timer ring is read off the canvas as it drains. Each parallax layer must paint at least 20 000 pixels.
- fix: Pip stops running when the level is cleared. A finished run is frozen with his last speed still in it, and the pose animator kept reading that speed as a run cycle (play gate 1: "the char animation does not stop at level end"). He now stands idle, facing the way he finished.
- fix: the level-clear and pause text is a 5×7 pixel font in palette colours, on an opaque brass-rimmed panel, with the hint line in bright cyan. It was a system font on the 224 px canvas, so its anti-aliased greys were scaled up into soft blocks (play gate 1: "the quali of the text is not very good readable"). The e2e asserts the panel holds palette inks only.
- fix: the pause menu names the way back to the controls with "H / LB: CONTROLS". H opens the card from the pause, pad LB does the same from any screen, and closing the card returns to the screen it covered (play gate 1: "esc ... where is not option to show keybind again").
- feat: world 1 has sound, all synthesised in code with no sample files (spec § 9 Sound).
  - "Brass Clockwork Skies" is an original 16-bar F-major loop at 120 bpm with brass lead, music box, oom-pah bass and clockwork ticks. Its release tail is folded onto the start, so the wrap is seamless.
  - 17 effect recipes cover every sound event 1-1 raises, plus spin, coin and switch for later levels.
  - Vitest renders every sound and checks level, length and pairwise distinctness, the seam sample for sample, and the step-to-event mapping driven through `stepSim`.
  - The bank renders in a Web Worker. Audio unlocks on the first key or click, and the sound that input raises still plays.
  - The music stops while paused, behind the controls card, after the flag and on a hidden tab (which also suspends the AudioContext). It resumes where it stopped and plays on through a death.
  - The settings screen has MUSIC and EFFECTS slider bars (D-pad up/down moves the selection, ←/→ adjust), stored under `echo-sky-run.settings.v1`.
  - `?audiolog=1` traces every sound, and `?vol=0` mutes agent-driven browsers.
  - `make e2e` checks:
    - the unlock and the first sound;
    - a real jump on the effects analyser;
    - music pause, hidden-tab and resume;
    - the volume bars and the reload;
    - p99 with sound on;
    - all 17 events in the trace.

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
