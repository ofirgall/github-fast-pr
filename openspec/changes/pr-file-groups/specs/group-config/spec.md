# Spec Delta

## Purpose

Defines how the extension finds, reads, validates and caches a reviewed repository's file-group configuration, and how each changed file in a PR is assigned to a group.

## ADDED Requirements

### Requirement: Config file location and source revision
The extension SHALL read the group config from `.github/pr-groups.json` at the PR's head commit. If the file does not exist at the head commit, it SHALL read the same path from the PR's base branch. If neither exists, the repo has no config.

#### Scenario: Config present at head
- **WHEN** the PR head commit contains `.github/pr-groups.json`
- **THEN** the extension uses that file's contents

#### Scenario: Config only on base branch
- **WHEN** the head commit has no `.github/pr-groups.json` and the base branch has one
- **THEN** the extension uses the base branch's file

#### Scenario: No config anywhere
- **WHEN** neither the head commit nor the base branch has the file
- **THEN** the extension makes no changes to either PR page

### Requirement: Config format
The config SHALL be a JSON object with a `groups` array. Each group SHALL have a non-empty string `name`, a non-empty array `paths` of JavaScript regular expression strings, and an optional boolean `autoViewed` defaulting to `false`.

#### Scenario: Valid config
- **WHEN** the file is `{"groups":[{"name":"Generated","paths":["\\.gen\\.ts$"],"autoViewed":true}]}`
- **THEN** the extension loads one auto-viewed group named "Generated"

#### Scenario: autoViewed omitted
- **WHEN** a group has no `autoViewed` field
- **THEN** that group is treated as not auto-viewed

### Requirement: Invalid config is ignored safely
If the config is not valid JSON, does not match the format, or contains a regex that fails to compile, the extension SHALL make no changes to either PR page and SHALL report the problem in the browser console.

#### Scenario: Malformed JSON
- **WHEN** `.github/pr-groups.json` contains invalid JSON
- **THEN** both PR pages render exactly as GitHub renders them, and a console error names the file and the parse error

#### Scenario: Bad regex
- **WHEN** a group's `paths` contains `"("`
- **THEN** both PR pages render unchanged, and a console error names the group and the pattern

### Requirement: Path matching
A group SHALL match a file when any of its `paths` regexes matches the file's full repository-relative path (unanchored search, case-sensitive).

#### Scenario: Partial match
- **WHEN** a group has `paths: ["^services/go/"]` and the file is `services/go/core/main.go`
- **THEN** the group matches the file

#### Scenario: No match
- **WHEN** no regex of a group matches the file path
- **THEN** the group does not match the file

### Requirement: Group assignment
Each changed file SHALL belong to at most one group. If any matching group is auto-viewed, the file SHALL belong to the first matching auto-viewed group in config order. Otherwise it SHALL belong to the first matching group in config order. A file with no matching group is "Ungrouped".

#### Scenario: Auto-viewed group wins over earlier normal group
- **WHEN** groups are `[Backend (paths ^services/), Generated (paths \.gen\.go$, autoViewed)]` and the file is `services/api.gen.go`
- **THEN** the file belongs to "Generated"

#### Scenario: First normal match wins
- **WHEN** groups are `[Backend (^services/), Go (\.go$)]`, neither auto-viewed, and the file is `services/main.go`
- **THEN** the file belongs to "Backend"

#### Scenario: Unmatched file
- **WHEN** no group matches `README.md`
- **THEN** `README.md` is Ungrouped

### Requirement: Config caching
The extension SHALL cache each config it reads so that a page load for a PR whose config is cached applies grouping before the page first renders, with no network wait. On every load it SHALL re-check the config in the background; if the result differs from what was applied, it SHALL update the cache and re-apply grouping, reloading the changes page at most once.

#### Scenario: Cached config applies on first render
- **WHEN** a PR's config was cached on an earlier visit and the user opens the PR's changes page
- **THEN** the file list renders already grouped, with no ungrouped flash

#### Scenario: New push without config change
- **WHEN** the PR head moves to a new commit and the config file is unchanged
- **THEN** grouping applies on first render using the PR's last known config, and no refresh occurs

#### Scenario: Config changed
- **WHEN** the background re-check finds a different config than the one applied
- **THEN** the cache is updated and the page shows the new grouping, with at most one reload of the changes page

#### Scenario: First visit to a repo
- **WHEN** no cached config exists for the PR and the user opens its changes page
- **THEN** the page first renders unchanged, and once the config is fetched the page reloads once to apply it

#### Scenario: Conversation page needs no reload
- **WHEN** no cached config exists and the user opens the PR conversation page
- **THEN** the adjusted diffstat appears once the config is fetched, without reloading the page

#### Scenario: Repo without config is not reloaded repeatedly
- **WHEN** the repo has no config file and this has been cached
- **THEN** later visits do not reload the page
