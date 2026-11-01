# Changelog

All notable changes to this project will be documented in this file.

Please choose versions by [Semantic Versioning](http://semver.org/).

* MAJOR version when you make incompatible API changes,
* MINOR version when you add functionality in a backwards-compatible manner, and
* PATCH version when you make backwards-compatible bug fixes.

## Unreleased

- feat: level 1-1 "Meadow Ledge" is playable — a 256x224 canvas scaled by a whole-number factor, a tile-string level with a 13-tile gap wider than any sprint jump, the goal flag, and the goal check
- feat: the renderer blends the last two fixed steps by the stepper's alpha, so a display faster than 60 Hz does not judder
- fix: the Echo's top edge now sits exactly at the player's feet instead of one Echo-height above them, so a mid-air Echo actually catches the player instead of being fallen through
- fix: the game no longer swallows browser shortcuts, `ArrowUp` and `W` start a jump instead of only holding one, and a key still down when the tab loses focus is released
- test: an end-to-end check drives the real page in a muted browser — real key events for the input layer, then a 1-1 playthrough through the same fixed-step simulation that must cross the gap on exactly one mid-air Echo, with no console error

## v0.2.0

- feat: fixed-timestep engine — a 60 Hz accumulator that keeps behaviour independent of frame rate, pure player physics (run 2.25 px/f, sprint 3.0 at a full P-meter, variable jump, 6 f coyote time and jump buffer) and tile collision that snaps flush to floors, walls, ceilings and one-way tops without tunnelling
- feat: the Ghost Echo — placeable mid-air for one air charge that refreshes only on solid ground, solid for 240 f, a one-way top the player stands on and rises through, and refused inside a wall

## v0.1.0

- chore: scaffold the repo — Vite + TypeScript with no framework, vitest split into fast and slow tiers, GitHub Pages deploy with a playable preview per PR, secret scanning and the maintainer-bot opt-in
