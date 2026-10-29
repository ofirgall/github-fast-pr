# Proposal

## Why

Large GitHub PRs mix the code a reviewer must read with files nobody needs to read line by line: generated code, lockfiles, docs, migration sums. GitHub's `+N -M` diffstat and its directory-sorted file list treat all of them alike, so reviewers misjudge the real size of a PR and spend time finding and dismissing noise. A per-repo, checked-in grouping config lets a team say once which files are noise and how the rest should be ordered.

## What Changes

- New Chrome extension (Manifest V3) that runs on `github.com/<owner>/<repo>/pull/<n>` (conversation) and `.../pull/<n>/changes` (changes) pages.
- Reads a group config from `.github/pr-groups.json` in the reviewed repo: a list of groups, each with a `name`, a list of path regexes (`paths`) and an `autoViewed` flag. The config is read from the PR head commit, falling back to the base branch.
- Assigns every changed file to at most one group. A file matching an auto-viewed group goes to the first such group; otherwise to the first matching group in config order; otherwise it is ungrouped.
- Conversation page: the diffstat shows (A) `+/-` excluding auto-viewed groups, (B) the original `+/-` in smaller text below, and (C) an info icon whose hover shows `+/-` per group, including "Ungrouped", with each group's auto-viewed state.
- Changes page:
  - Files are ordered by group: normal groups in config order, then ungrouped, then auto-viewed groups.
  - Each group's start is labelled in the file list.
  - Auto-viewed files are shown as viewed and collapsed. They are saved to GitHub as viewed, the same way the Viewed button does. Each carries a hint naming the group that auto-viewed it.
  - A file the user un-views is not auto-viewed again until the PR head changes.
  - A grouped file tree replaces GitHub's tree, with a toggle back to GitHub's original tree.
- Repos without a config file are left unchanged.

## Capabilities

### New Capabilities
- `group-config`: Locating, parsing, validating and caching a repo's `.github/pr-groups.json`, and assigning PR files to groups.
- `pr-summary-diffstat`: The adjusted diffstat and per-group breakdown on the PR conversation page.
- `changes-page-grouping`: Group ordering, group labels and the grouped file tree with its toggle on the PR changes page.
- `auto-viewed-files`: Marking auto-viewed files as viewed (on screen and on GitHub), the auto-viewed hint, and respecting a user's un-view.

### Modified Capabilities
<!-- None: this is the project's first change. -->

## Impact

- New codebase: a Chrome MV3 extension (manifest, page-world script, isolated content script, styles, build and tests). The repo currently contains only OpenSpec scaffolding.
- Depends on GitHub's undocumented, internal PR page data (route JSON embedded in the page and served as JSON by `/pull/<n>/changes`) and its `file_review` endpoint. GitHub can change these without notice, so the extension must fail safe.
- Writes to GitHub on the user's behalf: marks files as viewed on the user's own review state.
- Uses github.com `localStorage` under a `fast-pr:` prefix for the config cache and un-view records.
