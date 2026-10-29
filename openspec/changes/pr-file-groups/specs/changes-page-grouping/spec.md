# Spec Delta

## Purpose

Organizes the PR changes page by the repo's configured groups, so reviewers read files group by group and reach auto-viewed noise last.

## ADDED Requirements

### Requirement: File list ordered by group
On a PR changes page with a valid config, the file list SHALL show files grouped: normal groups in config order, then Ungrouped files, then auto-viewed groups in config order. Within a group, files SHALL keep GitHub's original relative order.

#### Scenario: Group order
- **WHEN** the config lists `Docs (autoViewed)`, `Backend`, `Frontend` and the PR has files in all three plus ungrouped files
- **THEN** the list shows Backend files, then Frontend files, then ungrouped files, then Docs files

#### Scenario: Order within a group
- **WHEN** a group contains `a/x.go` and `b/y.go`, which GitHub lists in that order
- **THEN** they appear in the same order within the group

### Requirement: Group labels in the file list
The file list SHALL show a label with the group name (or "Ungrouped") before the first file of each group, and the label SHALL indicate whether the group is auto-viewed.

#### Scenario: Label shown at group start
- **WHEN** the user scrolls to the first file of group "Backend"
- **THEN** a "Backend" label is visible immediately above that file

#### Scenario: Labels persist while scrolling
- **WHEN** the user scrolls away from a group's first file and back again
- **THEN** the group's label is shown again

### Requirement: Grouped file tree
The changes page SHALL show a file tree with one top-level node per non-empty group (and "Ungrouped" when applicable), in the same order as the file list, with each group's files nested by directory beneath it. Selecting a file in the tree SHALL scroll the file list to that file.

#### Scenario: Tree mirrors list order
- **WHEN** the file list order is Backend, Ungrouped, Docs
- **THEN** the tree's top-level nodes are Backend, Ungrouped, Docs in that order

#### Scenario: Directory split across groups
- **WHEN** `client/src/a.ts` is in Frontend and `client/src/a.gen.ts` is in Generated
- **THEN** `client/src` appears under both Frontend and Generated, each containing only its own file

#### Scenario: Navigate from tree
- **WHEN** the user selects `services/go/main.go` in the grouped tree
- **THEN** the file list scrolls to `services/go/main.go`

### Requirement: Tree toggle
The changes page SHALL provide a toggle that switches between the grouped tree and GitHub's original file tree. The choice SHALL be remembered across page loads in the same browser.

#### Scenario: Switch to original tree
- **WHEN** the user switches the toggle to the original tree
- **THEN** GitHub's own file tree is shown and the grouped tree is hidden, while the file list stays grouped

#### Scenario: Choice remembered
- **WHEN** the user chose the original tree and opens another PR changes page
- **THEN** the original tree is shown

### Requirement: Grouping survives in-page navigation
Grouping SHALL apply both when the changes page is loaded directly and when the user reaches it from another tab of the same PR without a full page load.

#### Scenario: From conversation tab
- **WHEN** the user clicks "Files changed" on the conversation page
- **THEN** the changes page renders grouped

### Requirement: No config leaves changes page unchanged
On a PR without a valid config, the changes page SHALL render exactly as GitHub renders it, with no labels, tree replacement or toggle.

#### Scenario: Repo without config
- **WHEN** the reviewed repo has no `.github/pr-groups.json`
- **THEN** the changes page is unchanged
