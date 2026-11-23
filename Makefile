.PHONY: install run test test-unit test-all build e2e shots solve level-check

node_modules: package.json package-lock.json
	npm install
	touch node_modules

install: node_modules

run: node_modules
	npm run dev

# The level toolkit's two required checks (Platformer Level Rating Guide § Required on Every Level
# Change), on every run: the fast tier — which carries the autopilot clear, the no-Echo bypass search
# and the blind-jump check — and the browser playthrough against the production build. Either half
# going red fails this target. Slower than the tier alone, and deliberately so: these are the checks
# that caught a goal flag triggering over one tile and a level too short to land on.
test: test-unit e2e

test-unit: node_modules
	npm test

test-all: node_modules
	npm run test:all

build: node_modules
	npm run build

# Plays level 1-1 in a headless browser against the production build. Needs the browser binary once:
# `npx playwright install chromium`.
e2e: node_modules
	npm run build
	@npx vite preview --port 4187 --strictPort > /tmp/echo-e2e-preview.log 2>&1 & pid=$$!; trap "kill $$pid 2>/dev/null" EXIT INT TERM; for i in $$(seq 1 30); do curl -sf -o /dev/null http://localhost:4187/echo-sky-run/ && break; sleep 1; done; E2E_URL=http://localhost:4187/echo-sky-run/ npm run e2e

# Screenshots from the debug spawn URL at 960x540 and 1920x1080, written to shots/ (gitignored).
shots: node_modules
	npm run build
	@npx vite preview --port 4189 --strictPort > /tmp/echo-shots-preview.log 2>&1 & pid=$$!; trap "kill $$pid 2>/dev/null" EXIT INT TERM; for i in $$(seq 1 30); do curl -sf -o /dev/null http://localhost:4189/echo-sky-run/ && break; sleep 1; done; SHOTS_URL=http://localhost:4189/echo-sky-run/ npm run shots

# The reachability solver's own checks. Deliberately separate from `make test`: the solver is slow, and a
# solver in the default suite gets deleted the first time it is slow. Runs the slow tier only.
solve: node_modules
	npm run test:slow

# One report per level, read against the level's spec (src/levels/<id>.spec.ts): structure, reachability,
# the no-Echo result, each Echo beat, each forbidden solution and the Echo timing margin (check M).
# Exits non-zero when a check fails. Usage: make level-check LEVEL=1-2
level-check: node_modules
	@test -n "$(LEVEL)" || { echo "usage: make level-check LEVEL=<id>  (e.g. LEVEL=1-2)"; exit 2; }
	node --experimental-strip-types src/toolkit/level-check-cli.ts $(LEVEL)
