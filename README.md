# Fast PR

Chrome (MV3) extension that groups the files of a GitHub pull request using a per-repo config: adjusted diffstat on the conversation page, and grouped ordering, labels, auto-viewed files and a grouped tree on the Files changed page. Repos without a config are left untouched.

## Install from a release

Download `github-fast-pr-<version>.zip` from [Releases](https://github.com/ofirgall/github-fast-pr/releases), unzip it, then in `chrome://extensions` enable Developer mode, click Load unpacked and select the unzipped folder. No Node or npm needed.

## Build and install

```sh
make install         # npm ci + build into dist/, then opens chrome://extensions (macOS)
make check           # typecheck + tests
make package         # minified build zipped as github-fast-pr-<version>.zip
make clean           # remove dist/, node_modules/ and zips
```

Or with npm directly: `npm install`, `npm run build`, `npm test`, `npm run typecheck`.

## Testing local changes

1. `make check` runs the typecheck and unit tests.
2. `make build` writes an unminified build with source maps to `dist/`.
3. In `chrome://extensions`, enable Developer mode, click Load unpacked and select `dist/` (`make install` builds and opens this page on macOS). Remove or disable any release build you loaded, or both run on the page.
4. After each change: `make build`, click reload on the extension card, then refresh the GitHub tab.
5. Give it a config: commit `.github/pr-groups.json` to a repo you can open PRs in, or add a local config from the [extension menu](#extension-menu) without committing anything.

Auto-viewed groups really mark files viewed on GitHub, as if you clicked Viewed. Try them on a PR where that doesn't matter, or leave `autoViewed` out at first.

## Config: `.github/pr-groups.json`

Read from the PR head commit, falling back to the base branch.

```json
{
  "groups": [
    { "name": "Backend", "paths": ["^server/", "\\.go$"] },
    { "name": "Frontend", "paths": ["^web/"] },
    { "name": "Generated", "paths": ["\\.gen\\.", "package-lock\\.json$"], "autoViewed": true }
  ]
}
```

- `groups`: array of `{ name, paths, autoViewed? }`. `name` is a non-empty string, `paths` a non-empty array of regex strings, `autoViewed` an optional boolean (default `false`).
- Regexes are JavaScript regexes without flags: unanchored and case-sensitive. Use `^` and `$` to anchor. An invalid config (bad JSON, missing fields, bad regex) is ignored and one `[fast-pr]` error is logged.

### Assignment and order

- A file goes to the first matching auto-viewed group in config order; otherwise to the first matching group in config order; otherwise it is "Ungrouped".
- Files are ordered: normal groups in config order, then Ungrouped, then auto-viewed groups. Input order is kept within a group.
- Auto-viewed files are marked viewed (saved to GitHub) on the full diff only, never for files you un-viewed at the current head commit.

## Extension menu

Click the Fast PR toolbar icon (pin it from the puzzle-piece menu), or open the extension's Options for a full-page view.

- **Debug logging**: logs `[fast-pr]` lines to the GitHub page console.
- **Local config**: one config applied to every repo in this browser, overriding each repo's `.github/pr-groups.json`. Paste JSON or use Load file…; it is validated as you type. Save reloads the GitHub tab so it applies; Remove goes back to the repos' own configs.
- **Clear cached configs**: drops cached `.github/pr-groups.json` results so they are fetched again on the next load.

Settings live in `chrome.storage.local` and are copied into github.com `localStorage` (`fast-pr:debug`, `fast-pr:local-config`), where the extension reads them at page start. Other extension state also uses `fast-pr:`-prefixed localStorage keys.

## Releasing

Bump `version` in `manifest.json` and `package.json`, commit, then push a matching tag:

```sh
git tag v0.1.1 && git push origin v0.1.1
```

The Release workflow checks the tag matches the manifest version, runs typecheck and tests, and publishes the zip as a GitHub Release.

## License

MIT — see [LICENSE](LICENSE).
