# AGENTS.md

Instructions for coding agents working on Echo Sky Run. Read `VISION.md` first when it exists; until
then the game description is the source of truth.

## What this is

A 2D side-scrolling platformer in the spirit of *Super Mario World* with one twist: the player leaves a
**Ghost Echo**, a translucent copy of themselves that stays solid for 4 s. It is a browser game —
Vite + TypeScript, no framework, no game engine.

## Commands

Use the Makefile targets; each installs dependencies first when `node_modules` is missing or stale.

| Command | Wraps | What it does |
|---|---|---|
| `make run` | `npm run dev` | Start the Vite dev server |
| `make test` | `npm test` | Run the fast test tier (vitest project `fast`) — must be green before every commit |
| `make test-all` | `npm run test:all` | Run both tiers, fast + slow — run it before merging any physics change |
| `make build` | `npm run build` | Typecheck (`tsc`) and production build |

## Layout

| Path | Role |
|---|---|
| `src/physics/` | Fixed-timestep simulation: the 60 Hz accumulator loop, player movement and tile collision. Pure TypeScript. |
| `src/echo/` | Ghost Echo rules: mid-air placement, the air charge, the 240 f lifetime, the one-way top, the wall refusal. Pure and tested. |
| `src/render/` | Canvas renderer at 256×224, scaled by an integer factor with `imageSmoothingEnabled = false`. The only place that touches the DOM or a canvas context. |
| `src/levels/` | Level tile strings, one character per tile. |
| `src/main.ts` | Browser shell: wires input → simulation → renderer, and owns the `requestAnimationFrame` loop. |
| `src/build-info.ts` | Build label (short SHA · build time · version), fed by `define` in `vite.config.ts` — the same value as `<meta name="commit">`. |

## Rules

- **Physics isolation:** nothing under `src/physics/` or `src/echo/` may import the DOM, a canvas, or
  any browser API. They stay pure and deterministic — no `Math.random`, `Date`, or `performance.now`.
  Time enters only as the fixed `DT`.
- **Determinism is tested:** the same input sequence over the same number of ticks must produce
  bit-identical state. Any physics change keeps that test green.
- **Rendering is decoupled:** the renderer draws interpolated state and never advances the simulation.
  A frame-rate change must not change what the simulation does.
- **Tuning values live in one place.** `RUN_MAX` 2.25 px/f, `SPRINT_MAX` 3.0 px/f at meter 112,
  `METER_MAX` 112, coyote time `COYOTE_F` 6 f, jump buffer `JUMP_BUFFER_F` 6 f, Echo life `ECHO_LIFE_F`
  240 f, one air charge `ECHO_AIR_CHARGES` 1. Never loosen a test to make a constant pass.
- **Tests drive the real path:** go through the simulation's own step function, never a hand-set flag
  the game does not produce.
- **Driven browsers are cheap:** every browser an agent drives launches with `--mute-audio` and a
  960×540 viewport, and the session is closed as soon as its shots are taken. Audio on the operator's
  speakers is a defect, not noise.

## Workflow

Feature branch + pull request into `master`, merged with a merge commit (`gh pr merge --merge`).

- **Every PR adds a CHANGELOG bullet** under `## Unreleased` (`feat:` / `fix:` / `chore:` …), which
  drives the automatic release.
- **PRs merge on green CI:** `.github/workflows/ci.yml` runs `npm ci`, `npm test` (fast tier) and
  `npm run build` on every pull request. `pages.yml` deploys production on push to `master` and a
  playable preview per open PR at `https://bborbe.github.io/echo-sky-run/pr-<n>/`.
- **Verify a deploy by `<meta name="commit">`**, never by the Pages run's colour: a `cancelled` Pages
  run is a queued run replaced by a newer one, which deploys the live master head.

## Test tiers

Tests are split into two vitest projects in `vite.config.ts`: `slow` is an explicit `SLOW_TESTS` list,
`fast` is every other `src/**/*.test.ts`. A new test file is fast by default; if it takes ≥ 2 s in the
`ci.yml` log, add it to `SLOW_TESTS`.

| Tier | Runs | Where |
|---|---|---|
| fast | `npm test` / `make test` | every PR and master commit (`ci.yml`), before every commit locally |
| fast + slow | `npm run test:all` / `make test-all` | every `v*` tag (`release.yml`), locally before merging a physics change |
| slow | `npm run test:slow` | nightly on master (`nightly.yml`); red opens or comments a `nightly-failure` issue |

Releases are automatic (`.maintainer.yaml` `release.autoRelease`). Every PR adds a bullet under
`## Unreleased` in `CHANGELOG.md` — the releaser cuts a release only when that section is non-empty.
Never cut a release by hand.
