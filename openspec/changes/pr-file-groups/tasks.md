# Tasks

## 1. Project setup

- [x] 1.1 Scaffold the extension: `package.json` (TypeScript, esbuild, Vitest), `tsconfig.json`, `src/` and `manifest.json` (MV3; `data-hook` in MAIN world at `document_start`, `content` in ISOLATED world at `document_idle`, both on `https://github.com/*/*/pull/*`). Verify `npm run build` writes `dist/` with the manifest, both bundles and the CSS.
- [x] 1.2 Add `npm test` (Vitest) and `npm run typecheck`. Verify both pass on an empty test.
- [ ] 1.3 Write `README.md`: how to build, load unpacked, the config format with an example, the debug and dev-config `localStorage` keys. Verify by following it to load the extension in Chrome.

## 2. Spikes against live GitHub (read-only unless stated)

- [x] 2.1 Confirm the `file_review` request format. Ask the user for a PR and file to use, mark that file viewed from page context with the planned headers, check it shows as viewed after reload, then un-mark it. Record the working headers in design.md D8.
- [x] 2.2 Confirm that route JSON fetched on in-app navigation (conversation → Files changed) includes `pullRequestsLayoutRoute.pullRequest.headSha`. If not, record the fallback (PR-number key only) in design.md D4.

## 3. Config and grouping core (pure modules)

- [x] 3.1 Implement `config` parsing and validation per specs/group-config (format, `autoViewed` default, regex compile errors, config hash). Verify unit tests cover valid, missing-field, bad-JSON and bad-regex inputs.
- [x] 3.2 Implement `assignGroup` and `orderFiles` (auto group wins, otherwise first match, otherwise Ungrouped; stable order: normal, ungrouped, auto). Verify unit tests cover every group-config and changes-page-grouping ordering scenario.
- [x] 3.3 Implement `computeDiffstat`: adjusted totals, original totals, per-group rows (omitting empty groups, marking auto). Verify unit tests cover the pr-summary-diffstat scenarios.
- [x] 3.4 Implement `buildGroupTree`: group, then directories with single-child directories merged, then files. Verify unit tests cover a directory split across two groups.
- [x] 3.5 Implement the full-diff check (D9) from the route data, using synthetic fixtures shaped like the observed payload, for full diff, single commit and commit range. Verify unit tests pass, and that an unreadable shape counts as a partial range.

## 4. Storage and data hook

- [x] 4.1 Implement the `storage` module: config cache keys (SHA key and PR key), auto-viewed record per PR (resets when `headSha` changes), tree mode, eviction above 300 config keys, all with `fast-pr:` prefixes and try/catch around `localStorage`. Verify with unit tests on a fake `localStorage`.
- [x] 4.2 Implement the `data-hook` entry: wrap `JSON.parse` and `Response.prototype.json`, detect the changes route, patch once (reorder, mark auto files viewed when the full diff is shown, skip un-viewed files, recount `viewedFilesCount`), emit the event and set the result attribute, and leave data unchanged on any error. Verify unit tests on a synthetic payload, including the no-config, invalid-shape and un-viewed cases.
- [x] 4.3 Implement config fetch in the `content` entry: try the head SHA, then the base branch, write both cache keys, compare the hash with the applied one, reload the changes page at most once (`sessionStorage` guard), and honour the dev-config override when debug is on. Verify on a live PR with a dev-config: the first visit reloads once and later visits don't reload.

## 5. Changes page UI

- [x] 5.1 Group labels in the virtualized list via `MutationObserver`. Verify on a live PR of 150+ files: labels appear at each group start, survive scrolling away and back, and scrolling doesn't jump. If it jumps, switch to the header-badge fallback and note it in design.md D7.
- [x] 5.2 "Auto-viewed: <group>" hint in the file header of auto files. Verify on a live PR that every auto file's header shows its group.
- [x] 5.3 Grouped tree panel with ARIA tree roles, collapsible nodes, keyboard navigation, and click-to-scroll via `location.hash`. Verify on a live PR: the tree order matches the list, and clicking a file deep in an auto group scrolls to it.
- [x] 5.4 Tree toggle, remembered across loads. Verify switching shows GitHub's original tree, and that the choice holds on another PR.
- [x] 5.5 Handle in-page navigation: re-apply on URL change or a new hook event, and tear down on leaving the PR. Verify that going conversation → Files changed → Conversation → Files changed shows correct grouping each time, with no duplicate labels or trees.

## 6. Auto-viewed persistence

- [ ] 6.1 After the hook event, POST `file_review` for auto files GitHub had as not viewed (4 at a time), record successes in the auto-viewed record, and log failures. Verify on a live PR: after a reload the files stay viewed even with the extension disabled.
- [ ] 6.2 Verify the un-view behaviour on a live PR: un-view an auto file, reload, and it stays un-viewed with no request sent. After a new push (or a simulated new `headSha` in a unit test) it is auto-viewed again.
- [x] 6.3 Verify partial-range behaviour on a live PR: select a single commit, and no files are auto-viewed and no requests are sent, while grouping still shows.

## 7. Conversation page diffstat

- [x] 7.1 Fetch `/pull/<n>/changes` JSON, group it with the cached or fetched config, and render the widget (adjusted numbers, original numbers smaller beneath, info icon) in place of the native numbers, keeping the screen-reader text. Verify on PR 6433 with a dev-config: the numbers match a hand calculation from `diffSummaries`.
- [x] 7.2 Per-group breakdown popover on hover and focus. Verify it lists only non-empty groups plus Ungrouped, with auto groups marked, and that it's reachable by keyboard.
- [x] 7.3 Keep the widget current: re-insert it if React re-renders the header, and re-fetch when the native diffstat text changes. Verify by forcing a re-render (switch tabs and back) and by changing the native text in DevTools.

## 8. Integration checks

- [x] 8.1 Repo without config: verify both pages are byte-for-byte GitHub's own (no widget, labels, tree or toggle) and that no reload happens on repeat visits.
- [x] 8.2 Invalid config (bad JSON, bad regex) via dev-config: verify both pages are unchanged and a single `[fast-pr]` console error names the problem.
- [ ] 8.3 Full pass on a large live PR (150+ files) across both pages with a realistic config. Verify there are no console errors from the extension and that page load isn't visibly slower.
