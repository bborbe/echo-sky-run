# Changelog

All notable changes to this project will be documented in this file.

Please choose versions by [Semantic Versioning](http://semver.org/).

* MAJOR version when you make incompatible API changes,
* MINOR version when you add functionality in a backwards-compatible manner, and
* PATCH version when you make backwards-compatible bug fixes.

## v0.2.0

- feat: fixed-timestep engine — a 60 Hz accumulator that keeps behaviour independent of frame rate, pure player physics (run 2.25 px/f, sprint 3.0 at a full P-meter, variable jump, 6 f coyote time and jump buffer) and tile collision that snaps flush to floors, walls, ceilings and one-way tops without tunnelling
- feat: the Ghost Echo — placeable mid-air for one air charge that refreshes only on solid ground, solid for 240 f, a one-way top the player stands on and rises through, and refused inside a wall

## v0.1.0

- chore: scaffold the repo — Vite + TypeScript with no framework, vitest split into fast and slow tiers, GitHub Pages deploy with a playable preview per PR, secret scanning and the maintainer-bot opt-in
