# Echo Sky Run

A 2D side-scrolling platformer in the spirit of *Super Mario World* with one twist: the player leaves a
**Ghost Echo**, a translucent copy of themselves that stays solid for four seconds. Stand on it, jump
off it, reach what a jump alone cannot.

Pip, a red panda with an oversized mechanical visor, runs the Sky Islands — floating grass islands with
brass-and-gear ruins.

## Play

https://bborbe.github.io/echo-sky-run/

## Develop

```bash
make run     # Vite dev server
make test    # fast test tier — green before every commit
make build   # typecheck + production build
```

Vite + TypeScript, no framework. The physics and Echo rules are pure TypeScript with no DOM access,
tested with vitest; the canvas renderer runs at 256×224 scaled by an integer factor.

See `AGENTS.md` for the layout, the rules and the workflow.
