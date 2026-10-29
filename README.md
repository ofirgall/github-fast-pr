# Fast PR

Chrome (MV3) extension that groups the files of a GitHub pull request using a per-repo config: adjusted diffstat on the conversation page, and grouped ordering, labels, auto-viewed files and a grouped tree on the Files changed page. Repos without a config are left untouched.

## Build and install

```sh
npm install
npm run build        # writes dist/
npm test             # vitest
npm run typecheck
```

Load it: open `chrome://extensions`, enable Developer mode, click Load unpacked, select the `dist/` folder. Rebuild and click reload on the extension card after changes.

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

## Debugging

Run in the DevTools console on github.com (then reload):

```js
// verbose [fast-pr] logs
localStorage["fast-pr:debug"] = "1";

// override the fetched config for one repo (only read while debug is on)
localStorage["fast-pr:dev-config:OWNER/REPO"] = JSON.stringify({
  groups: [{ name: "Docs", paths: ["\\.md$"], autoViewed: true }],
});
```

All extension state lives in `fast-pr:`-prefixed localStorage keys; clear them to reset.

## License

MIT — see [LICENSE](LICENSE).
