.PHONY: install run test test-all build e2e

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
	@npx vite preview --port 4187 --strictPort > /tmp/echo-e2e-preview.log 2>&1 & echo $$! > /tmp/echo-e2e-preview.pid
	@sleep 3
	@E2E_URL=http://localhost:4187/echo-sky-run/ npm run e2e; status=$$?; kill $$(cat /tmp/echo-e2e-preview.pid) 2>/dev/null; rm -f /tmp/echo-e2e-preview.pid; exit $$status
