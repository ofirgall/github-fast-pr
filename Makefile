.PHONY: install deps build test typecheck check package clean

VERSION := $(shell node -p "require('./manifest.json').version")
ZIP := github-fast-pr-$(VERSION).zip

# Build the extension and show how to load it into Chrome.
install: build
	@echo ""
	@echo "Built $(CURDIR)/dist"
	@echo "Load it: chrome://extensions -> Developer mode -> Load unpacked -> select the dist/ folder."
	@echo "After later rebuilds, click reload on the extension card."
	@if [ "$$(uname)" = "Darwin" ]; then open -a "Google Chrome" "chrome://extensions" 2>/dev/null || true; fi

node_modules: package.json package-lock.json
	npm ci
	@touch node_modules

deps: node_modules

build: node_modules
	npm run build

test: node_modules
	npm test

typecheck: node_modules
	npm run typecheck

check: typecheck test

# Minified build zipped for a GitHub Release (unzip, then Load unpacked).
package: node_modules
	node build.mjs --release
	rm -f $(ZIP)
	cd dist && zip -qr ../$(ZIP) .
	@echo "Wrote $(ZIP)"

clean:
	rm -rf dist node_modules github-fast-pr-*.zip
