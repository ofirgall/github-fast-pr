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

Read from the PR head commit, falling back to the base branch. `.github/pr-groups.jsonc` is read when there is no `pr-groups.json` at that commit or branch. Both are JSONC: `//` and `/* */` comments and trailing commas are allowed.

```json
{
  "groups": [
    { "name": "Backend", "paths": ["^server/", "\\.go$"] },
    { "name": "Frontend", "paths": ["^web/"] },
    { "name": "Lockfiles", "paths": ["package-lock\\.json$"], "autoViewed": true },
    { "name": "Tests", "paths": ["_test\\.go$"], "matchPriority": 2, "viewPriority": 1 }
  ],
  "generated": { "viewPriority": -3 },
  "ungrouped": { "viewPriority": 5 }
}
```

- `groups`: array of `{ name, paths, autoViewed?, matchPriority?, viewPriority? }`. `name` is a non-empty string, `paths` a non-empty array of regex strings, `autoViewed` an optional boolean (default `false`), and the priorities optional numbers.
- `generated`: optional `{ matchPriority?, viewPriority? }` for the Generated group made from `.gitattributes` (below).
- `ungrouped`: optional `{ viewPriority? }` for the Ungrouped files.
- Regexes are JavaScript regexes without flags: unanchored and case-sensitive. Use `^` and `$` to anchor. An invalid config (bad JSON, missing fields, bad regex, non-number priority) is ignored and one `[fast-pr]` error is logged.

### `.gitattributes`

Files marked `linguist-generated` in the root `.gitattributes` (head commit, falling back to the base branch) go to an auto-viewed "Generated" group, also in repos without `pr-groups.json`. Patterns follow git's rules, and the last matching line wins.

### Assignment and order

Higher priority goes first; ties keep config order (Generated last).

- `matchPriority` picks the group of a file that matches several: the highest one wins. Default: `1` for auto-viewed groups, `0` otherwise. A file matching nothing is "Ungrouped".
- `viewPriority` orders the groups on the page. Default: `0` for normal groups, `-1` for Ungrouped, `-2` for auto-viewed groups. At equal priority Ungrouped comes after the groups. Input order is kept within a group.
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
