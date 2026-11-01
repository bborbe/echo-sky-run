.PHONY: install run test test-all build e2e shots

node_modules: package.json package-lock.json
	npm install
	touch node_modules

install: node_modules

run: node_modules
	npm run dev

test: node_modules
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
