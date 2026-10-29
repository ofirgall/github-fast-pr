# Fast PR

A Chrome extension that makes large GitHub pull requests faster to review.

Big PRs mix the code that matters with lockfiles, generated code and other noise. GitHub shows it all in one long list, sorted by path. Fast PR groups the changed files by rules the repo commits in `.github/pr-groups.json`. Reviewers read the important groups first and skip the rest:

- **Grouped Files changed page**: files are ordered by group, and each diff is labeled with its group. A grouped file tree shows viewed counts per folder and group.
- **Auto-viewed groups**: noise like lockfiles is marked viewed for you. Files marked `linguist-generated` in `.gitattributes` go to a Generated group, even without a config.
- **Honest line counts**: the PR's diffstat shows only the lines left to review, with a per-group breakdown.
- **Batch viewed**: right-click a folder or group in the tree to mark all its files viewed or unviewed.

Repos without a config or `linguist-generated` files are left untouched.

---

## Installation

Get the latest zip from [Releases](https://github.com/ofirgall/github-fast-pr/releases/latest), or from the command line:

```sh
curl -fsSL https://github.com/ofirgall/github-fast-pr/releases/latest/download/github-fast-pr.zip -o /tmp/github-fast-pr.zip
unzip -o /tmp/github-fast-pr.zip -d ~/chrome-extensions/github-fast-pr
```

Then load it in Chrome:

1. Open `chrome://extensions` and turn on Developer mode (top right).
2. Click Load unpacked and select `~/chrome-extensions/github-fast-pr` (or wherever you unzipped it).
3. Open a pull request on github.com. Pages already open need a refresh.

Keep the folder. Chrome runs the extension from it, so deleting or moving it removes the extension.

Chrome may show a banner about developer-mode extensions on startup. That is expected for extensions not from the Chrome Web Store.

**Update**: unpacked extensions don't update on their own.

1. Run the same two commands again. They unzip over the same folder.
2. Click the reload icon on the Fast PR card in `chrome://extensions`.
3. Refresh open GitHub tabs.

Always use the same folder. The extension's ID comes from its path, and the menu settings belong to that ID.

---

## Config: `.github/pr-groups.json`

Read from the first of these that has it: the PR head commit, the PR's base branch, `main`, `master`.

`.github/pr-groups.jsonc` is read when there is no `pr-groups.json` at that commit or branch. Both files are JSONC, so `//` and `/* */` comments and trailing commas are allowed.

```jsonc
{
  "groups": [
    { "name": "Backend", "paths": ["^server/", "\\.go$"] },
    { "name": "Frontend", "paths": ["^web/"] },
    // Reviewed by nobody; marked viewed automatically.
    { "name": "Lockfiles", "paths": ["package-lock\\.json$"], "autoViewed": true },
    { "name": "Tests", "paths": ["_test\\.go$"], "matchPriority": 2, "viewPriority": 1 }
  ],
  "generated": { "viewPriority": -3 },
  "ungrouped": { "viewPriority": 5 }
}
```

- `groups`: array of `{ name, paths, autoViewed?, matchPriority?, viewPriority? }`.
  - `name`: non-empty string.
  - `paths`: non-empty array of regex strings.
  - `autoViewed`: optional boolean, default `false`.
  - `matchPriority`, `viewPriority`: optional numbers.
- `generated`: optional `{ matchPriority?, viewPriority? }` for the Generated group made from `.gitattributes` (below).
- `ungrouped`: optional `{ viewPriority? }` for the Ungrouped files.
- Regexes are JavaScript regexes without flags. They are unanchored and case-sensitive, so use `^` and `$` to anchor.
- An invalid config is ignored, and one `[fast-pr]` error is logged. That covers bad JSON, missing fields, a bad regex or a non-number priority.

### `.gitattributes`

Files marked `linguist-generated` in the root `.gitattributes` go to an auto-viewed "Generated" group. This works in repos without `pr-groups.json` too.

The file is looked up the same way as the config: head commit, base branch, `main`, `master`. Patterns follow git's rules, and the last matching line wins.

### Assignment and order

Higher priority goes first. Ties keep config order, with Generated last.

- `matchPriority` picks the group of a file that matches several. The highest one wins.
  - Default: `1` for auto-viewed groups, `0` otherwise.
  - A file matching nothing is "Ungrouped".
- `viewPriority` orders the groups on the page.
  - Default: `0` for normal groups, `-1` for Ungrouped, `-2` for auto-viewed groups.
  - At equal priority, Ungrouped comes after the groups.
  - Files keep their original order within a group.
- Auto-viewed files are marked viewed on GitHub, on the full diff only. Files you un-viewed at the current head commit are never marked again.

---

## Extension menu

Click the Fast PR toolbar icon (pin it from the puzzle-piece menu), or open the extension's Options for a full-page view.

- **Auto collapse groups** (on by default): the grouped tree starts with every group collapsed. When off, only auto-viewed groups start collapsed. It applies to the next PR page you open or reload.
- **Debug logging**: logs `[fast-pr]` lines to the GitHub page console.
- **Local config**: one config for every repo in this browser. It overrides each repo's `.github/pr-groups.json`, but a repo's `.gitattributes` Generated group still applies.
  - Paste JSON or use Load file…. It is validated as you type.
  - Save reloads the GitHub tab so the config applies. Remove goes back to the repos' own configs.
- **Clear cached configs**: drops cached config results, so they are fetched again on the next load.

Settings live in `chrome.storage.local`. They are copied into github.com `localStorage`, where the extension reads them at page start: `fast-pr:debug`, `fast-pr:local-config` and `fast-pr:expand-groups`. Other extension state also uses `fast-pr:`-prefixed localStorage keys.

---

## Development

```sh
make install         # npm ci + build into dist/, then opens chrome://extensions (macOS)
make check           # typecheck + tests
make package         # minified build zipped as github-fast-pr.zip
make clean           # remove dist/, node_modules/ and zips
```

Or with npm directly: `npm install`, `npm run build`, `npm test`, `npm run typecheck`.

### Testing local changes

1. `make check` runs the typecheck and unit tests.
2. `make build` writes an unminified build with source maps to `dist/`.
3. In `chrome://extensions`, enable Developer mode, click Load unpacked and select `dist/`. On macOS, `make install` builds and opens this page.
4. Remove or disable any release build you loaded, or both run on the page.
5. After each change: `make build`, click reload on the extension card, then refresh the GitHub tab.
6. Give it a config. Commit `.github/pr-groups.json` to a repo you can open PRs in, or add a local config from the [extension menu](#extension-menu).

Auto-viewed groups really mark files viewed on GitHub, as if you clicked Viewed. Try them on a PR where that doesn't matter, or leave `autoViewed` out at first.

### Releasing

Bump `version` in `manifest.json` and `package.json`, commit, then push a matching tag:

```sh
git tag v1.0.2 && git push origin v1.0.2
```

The Release workflow checks that the tag matches the manifest version, then runs the typecheck and tests. It publishes `github-fast-pr.zip` as a GitHub Release. The zip name has no version, so the latest-download URL above always works.

## License

MIT — see [LICENSE](LICENSE).
