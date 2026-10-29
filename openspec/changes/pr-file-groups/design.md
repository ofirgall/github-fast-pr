# Design

## Context

See proposal.md for motivation and specs/ for required behavior. The repo is empty apart from OpenSpec, so this design also sets the project's stack.

What we observed on github.com (October 2026, new React PR experience), which shapes everything below:

- Both PR pages are one React app (`<react-app app-name="repo">`). The initial route data is a JSON `<script data-target="react-app.embeddedData">`. Moving between PR tabs without a full load fetches the same JSON from the tab URL with `Accept: application/json`.
- `payload.pullRequestsChangesRoute.diffSummaries` lists every changed file: `path`, `pathDigest`, `linesAdded`, `linesDeleted`, `markedAsViewed`, and more. Both the file list and the file tree render in this array's order.
- `payload.pullRequestsLayoutRoute.pullRequest` holds `headSha`, `baseBranch` and `number`. `pullRequestsChangesRoute.user.viewedFilesCount` drives the "N / M viewed" counter.
- Route JSON fetched on in-app navigation contains **only** the changes route (no `pullRequestsLayoutRoute`). The changes route alone carries what the hook needs: `comparison.fullDiff.headOid` (PR head SHA), `pullRequest.number`, `pullRequest.baseBranch`, `repository.ownerLogin` and `repository.name`. The hook takes PR identity only from the changes route. (Spike 2.2.)
- Commit-range views (`/pull/<n>/changes/<sha>` or `<a>..<b>`) use the route key `pullRequestsChangesWithRangeRoute`, which has the same shape. `comparison.viewing` is `"FULL"` for the full diff (`selectedRange: null`) and `"COMMIT"` for a range (`selectedRange: {baseOid, headOid}`).
- The file list is virtualized: only rows on screen exist in the DOM (`[data-path-digest]`, `data-index`). The file tree is not virtualized, and it merges files into directories by first appearance.
- Changing `diffSummaries` before React reads it worked in a live test: reordering moved files in the list, and setting `markedAsViewed: true` rendered files as Viewed and collapsed.
- The Viewed button sends `POST {prUrl}/file_review` with `{path, viewed: "viewed"}`, or `DELETE` to undo. GitHub disables it when a commit range is selected ("can only be marked as viewed on the All files page").
- `GET /pull/<n>/changes` with `Accept: application/json` returns the full route data for all files (~200 KB for 178 files). The browser's session cookie is enough; no token is needed.
- `GET /<owner>/<repo>/raw/<ref>/<path>` returns raw file contents with session cookies, including for private repos (it redirects to raw.githubusercontent.com).
- Setting `location.hash = "diff-<pathDigest>"` scrolls the virtualized list to that file.

## Goals / Non-Goals

**Goals:**
- Grouping is applied to GitHub's own data before render, so GitHub's components draw it natively, with no flicker when the config is cached.
- Use stable hooks (data attributes, ARIA roles, route JSON field names), never GitHub's hashed CSS class names.
- If anything unexpected happens, show GitHub's page unchanged.

**Non-Goals:**
- The classic `/files` page, GitHub Enterprise Server, and browsers other than Chrome.
- Making GitHub's file filter box and extension filter menu apply to the grouped tree. They keep filtering GitHub's original tree and list.
- An options page or UI for editing the config. The config lives in the repo.
- Group labels in single-file mode.

## Decisions

### D1. Stack: TypeScript, esbuild, Vitest, no UI framework
Manifest V3. esbuild bundles each entry point into one file. Vitest tests the pure modules. Injected UI is plain DOM: the UI is small, and a framework would add size and a second React on a React page.
*Alternatives:* Vite with CRXJS (more setup than needed), Plasmo (heavier and more opinionated).

### D2. Two content scripts, split by world

```
  document_start, world: MAIN            document_idle, world: ISOLATED
  +------------------------------+       +-----------------------------------+
  | data-hook.js                 |       | content.js                        |
  |  wrap JSON.parse and         | event |  route detection (SPA aware)      |
  |  Response.prototype.json     |------>|  config fetch + cache write       |
  |  read config cache (sync)    |       |  file_review POSTs                |
  |  patch changes route data    |       |  diffstat widget (conversation)   |
  |  emit "fast-pr:files" event  |       |  labels, hints, tree (changes)    |
  +------------------------------+       +-----------------------------------+
                \                               /
                 +--- github.com localStorage --+  (shared by both worlds)
```

The data hook must run in the page world, before GitHub's scripts, to see the route JSON. Everything else runs isolated, which keeps it away from page globals, including our own `JSON.parse` wrap. The hook sends its results in a `CustomEvent` on `document`, with a JSON-string `detail`. It also keeps the latest result on a DOM attribute, because the isolated script may start after the event has fired.
*Alternative:* everything in MAIN. Simpler messaging, but our UI code would run next to GitHub's globals and could be affected by changes to them.

### D3. Patch by wrapping `JSON.parse` and `Response.prototype.json`
The wrapper checks every parsed result cheaply: is there a `payload.pullRequestsChangesRoute.diffSummaries` array of objects with string `path`? If not, it returns the result untouched. If yes, it patches the object in place, once (marked with a non-enumerable flag), inside a try/catch that leaves the data unchanged on any error.
The patch:
1. Assign groups (D5) and reorder `diffSummaries` stably: normal groups, then ungrouped, then auto.
2. If the full diff is shown (D9), set `markedAsViewed = true` on auto files. This skips files the user un-viewed at the current head (D8).
3. Recompute `user.viewedFilesCount` from the patched array.
4. Emit the file list with each file's group, original viewed state, and line counts.

*Alternatives:* reorder DOM nodes (impossible with the virtualized list), click Viewed buttons (only on-screen rows exist), or block GitHub's script and re-inject the data (fragile).

### D4. Config source, fetch and cache
- Fetch `raw/<headSha>/.github/pr-groups.json`. On 404, fetch `raw/<baseBranch>/.github/pr-groups.json`. On a second 404, the result is "none". PR head commits are reachable by SHA from the base repo, including from forks.
- Cache in `localStorage`. Both worlds can read it, and the hook needs synchronous access.
  - `fast-pr:cfg:<owner>/<repo>@<headSha>` stores `{status: "ok"|"none"|"invalid", config?, hash, at}`. A commit never changes, so this entry is final once written.
  - `fast-pr:cfg-pr:<owner>/<repo>#<n>` stores the same shape for the last config seen on this PR. A new push has no SHA entry yet, and this one lets it render grouped immediately.
- The hook looks up the SHA key first, then the PR key, else does nothing.
- The isolated script re-checks unless the SHA key exists. It writes both keys, then compares the new `hash` with the one the hook applied, which is recorded on the DOM attribute.
  - Changes page: reload once if they differ. A `sessionStorage` guard (`fast-pr:reloaded:<url>@<headSha>`) prevents loops.
  - Conversation page: just redraw.
- Eviction: when there are more than 300 `fast-pr:cfg:` keys, drop the oldest by `at`.
- Validation (format, regex compile) happens when the config is fetched. Invalid configs are cached as `invalid`, so the error is logged once per head commit rather than on every load.

*Alternative:* `chrome.storage`. It is asynchronous, and the hook must decide synchronously.

### D5. Group assignment is a pure module
`assignGroup(path, groups)` returns the first auto group whose regexes match; otherwise the first group whose regexes match; otherwise Ungrouped. Regexes compile once per config, with no flags. `orderFiles` and `buildGroupTree` are pure too. Both bundles share them, and they hold most of the unit tests.

### D6. Conversation page diffstat
- Locate the native diffstat as the element containing the `sr-only` text "Lines changed:" inside `[data-component="PH_Navigation"]`.
- Hide the visible `+N`/`-M` spans with a class; keep the screen-reader text.
- Insert a widget: adjusted `+A -D`, the original numbers in a smaller font beneath, and an info icon. Hovering or focusing the icon opens a popover with a per-group table.
- Data: `fetch("/pull/<n>/changes", {Accept: application/json})`, then `diffSummaries` grouped with the config for `pullRequestsLayoutRoute.pullRequest.headSha` (read from the page's embedded data).
- A `MutationObserver` on the native diffstat text triggers a re-fetch when GitHub updates it after a push. It also re-inserts the widget if React re-renders the header.

### D7. Changes page decorations
- **Group labels:** a `MutationObserver` on the virtualized list container (`[data-testid="virtualized-diffs-list"]`, falling back to the nearest parent of `[data-path-digest]` rows). It decorates any row whose `data-path-digest` is the first of a group by inserting a label element inside the row. The virtualizer measures row heights, so a taller row is fine. If a spike shows labels causing scroll jumps, fall back to an inline badge in the file header.
- **Auto-viewed hint:** a badge "Auto-viewed: <group>" inside `[data-diff-header-wrapper]` next to the file name, added by the same observer.
- **Grouped tree:** our own panel inserted beside GitHub's tree in the file-tree pane, which is the scroll container around `[role="tree"][aria-label="File Tree"]`. Groups, then directories (with single-child directories collapsed into one node, as GitHub does), then files. Group and directory nodes collapse. Clicking a file sets `location.hash = "diff-<pathDigest>"`. It's plain DOM with ARIA tree roles and keyboard navigation for arrows and Enter.
- **Toggle:** a button at the top of the tree pane switches between our tree and GitHub's by toggling a class that hides one of them. It's stored in `localStorage["fast-pr:tree-mode"]`.
- **SPA navigation:** the isolated script watches URL changes (Navigation API `navigate` event, with `popstate` as fallback) and route events from the hook, then tears down and re-applies decorations.

### D8. Saving auto-viewed state and un-view memory
- After the hook emits, for each auto file whose original `markedAsViewed` was false and that wasn't skipped as un-viewed: `POST {prUrl}/file_review` with JSON `{path, viewed: "viewed"}`. Send it same-origin with headers `Accept: application/json`, `Content-Type: application/json`, `X-Requested-With: XMLHttpRequest`, `GitHub-Verified-Fetch: true`. No CSRF token is needed. Spike 2.1 confirmed this on a live PR: the POST returns 200 with an empty body and the file shows as viewed. `DELETE` with body `{path, _method: "delete"}` un-marks it. Up to 4 requests run at a time.
- On success, add the path to `fast-pr:auto:<owner>/<repo>#<n>`, which stores `{headSha, paths[]}`. When `headSha` changes, the entry resets.
- **Un-view detection:** a file is in the record for the current head, but GitHub's original data says not viewed. Only the user could have un-viewed it, so the hook leaves it alone and no POST is sent. After a push the record resets, so the file is auto-viewed again if GitHub cleared it.
- **Failure:** log the error with the path, and leave it out of the record so the next load retries.

### D9. Full diff only
Auto-viewing applies only when the route shows the PR's full diff: `comparison.viewing === "FULL"` and `comparison.selectedRange` is null. The hook patches both `pullRequestsChangesRoute` and `pullRequestsChangesWithRangeRoute` (ordering always; auto-viewing only on full diff). If the data can't be read, assume a partial range, which means no auto-viewing.

### D10. Fail-safe and diagnostics
Every entry point is wrapped. On a missing field or unexpected shape, the extension logs one `[fast-pr]` warning and does nothing. Turning on `localStorage["fast-pr:debug"] = "1"` adds verbose logs.
For testing on repos without a committed config, `localStorage["fast-pr:dev-config:<owner>/<repo>"]` holds a config JSON that overrides the fetched one. It is read only when debug is on.

## Risks / Trade-offs

- [GitHub changes route field names or the `file_review` endpoint] → Validate the shape before patching and do nothing on mismatch. Keep fixture tests that document the expected shape, so a break is obvious when re-checked against the live site.
- [Hashed class names change] → Select only via `data-*`, `role` and `aria-*`.
- [Wrapping `JSON.parse` slows the page] → The check is a few property reads per call. Big parses are rare, and a non-matching object returns at once.
- [First visit to a repo shows ungrouped data, then reloads] → Accepted. It happens once per repo, and after that once only when a push changes the config.
- [Auto-viewing writes to the user's real review state] → Writes happen only for auto files, never in partial-range views, and never for files the user un-viewed. Failures are logged and retried rather than looping.
- [Inserting labels into virtualized rows causes scroll jumps] → A spike in task 5.1 checks this, with the header-badge fallback.
- [The grouped tree ignores GitHub's filter box] → Documented non-goal. The toggle gives back GitHub's filterable tree.
- [Private repo data in test fixtures] → Fixtures are synthetic, shaped like the observed payload. No real PR data is committed.

## Migration Plan

This is a new extension with no data to migrate. Load it unpacked from `dist/` during development. Rollback means disabling the extension: all state is in `fast-pr:`-prefixed `localStorage` keys, which can be cleared.
