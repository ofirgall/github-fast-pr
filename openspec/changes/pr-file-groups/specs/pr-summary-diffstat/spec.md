# Spec Delta

## Purpose

Shows reviewers the size of a PR that actually needs reading, by adjusting the conversation page's `+/-` diffstat for auto-viewed groups and exposing a per-group breakdown.

## ADDED Requirements

### Requirement: Adjusted diffstat
On a PR conversation page with a valid config, the diffstat SHALL show as its primary numbers the lines added and deleted across all changed files except files in auto-viewed groups.

#### Scenario: Auto-viewed lines excluded
- **WHEN** a PR has +1,000 -100 in total and files in auto-viewed groups account for +800 -20
- **THEN** the primary diffstat reads `+200 -80`

#### Scenario: No auto-viewed groups match
- **WHEN** no changed file belongs to an auto-viewed group
- **THEN** the primary diffstat equals GitHub's original numbers

### Requirement: Original diffstat shown below
The diffstat SHALL show GitHub's original added and deleted line counts beneath the adjusted numbers, in a visibly smaller font.

#### Scenario: Both numbers visible
- **WHEN** the adjusted diffstat is `+200 -80` and the original is `+1,000 -100`
- **THEN** `+200 -80` is displayed with `+1,000 -100` below it in smaller text

### Requirement: Per-group breakdown on hover
The diffstat SHALL include an info icon. Hovering it SHALL show one row per group that has at least one changed file, plus an "Ungrouped" row when ungrouped files exist, each with its added and deleted line counts and whether the group is auto-viewed.

#### Scenario: Breakdown contents
- **WHEN** the user hovers the info icon on a PR with files in "Backend", "Generated" (auto-viewed) and some ungrouped files
- **THEN** the popup lists Backend, Ungrouped and Generated with their `+/-` counts, and Generated is marked auto-viewed

#### Scenario: Groups with no files omitted
- **WHEN** a configured group matches no changed file
- **THEN** that group does not appear in the breakdown

### Requirement: Diffstat stays current
When GitHub updates the PR's diffstat while the page is open (for example after a new push), the adjusted numbers and breakdown SHALL be recomputed to match.

#### Scenario: New push while viewing
- **WHEN** the page is open and GitHub's displayed diffstat changes after a push
- **THEN** the adjusted numbers, the original numbers and the breakdown update to reflect the new set of changed files

### Requirement: No config leaves diffstat unchanged
On a PR without a valid config, the conversation page diffstat SHALL be shown exactly as GitHub renders it.

#### Scenario: Repo without config
- **WHEN** the reviewed repo has no `.github/pr-groups.json`
- **THEN** no adjusted numbers or info icon are added
