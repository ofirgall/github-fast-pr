# Spec Delta

## Purpose

Marks files in auto-viewed groups as viewed for the reviewer, both on screen and in their GitHub review state, while respecting a reviewer's decision to un-view a file.

## ADDED Requirements

### Requirement: Auto-viewed files shown as viewed
On a PR changes page with a valid config, every file in an auto-viewed group SHALL render as viewed and collapsed on first render, and the page's viewed-files counter SHALL include them.

#### Scenario: Shown viewed on load
- **WHEN** the changes page opens for a PR where `atlas.sum` is in an auto-viewed group and GitHub has it as not viewed
- **THEN** `atlas.sum` renders with its Viewed control checked and its diff collapsed

#### Scenario: Counter includes auto-viewed files
- **WHEN** 42 of 178 files are in auto-viewed groups and none were viewed before
- **THEN** the counter reads `42 / 178 viewed`

### Requirement: Auto-viewed state saved to GitHub
For each file in an auto-viewed group that GitHub has as not viewed, the extension SHALL mark it viewed in the user's GitHub review state, with the same effect as the user clicking its Viewed control.

#### Scenario: Persisted across devices
- **WHEN** the extension auto-views `atlas.sum` and the user later opens the PR in a browser without the extension
- **THEN** `atlas.sum` is shown as viewed there

#### Scenario: Already viewed files untouched
- **WHEN** a file in an auto-viewed group is already viewed on GitHub
- **THEN** the extension sends no request for it

#### Scenario: Save failure
- **WHEN** GitHub rejects the request to mark a file viewed
- **THEN** a console error names the file, and the extension tries again on the next page load

### Requirement: Only when viewing all commits
Auto-viewing (on screen and on GitHub) SHALL apply only when the changes page shows the PR's full diff. When the user views a subset of commits, auto-viewed files SHALL keep GitHub's viewed state, while ordering, labels and hints still apply.

#### Scenario: Single commit selected
- **WHEN** the user selects one commit in the changes page's commit picker
- **THEN** no file is marked viewed by the extension and no request is sent, but files are still grouped

### Requirement: Auto-viewed hint
Each file in an auto-viewed group SHALL show, in its file header, a hint naming the group that auto-viewed it.

#### Scenario: Hint visible
- **WHEN** `client/src/permissions.gen.ts` is in auto-viewed group "Generated"
- **THEN** its file header shows a hint such as "Auto-viewed: Generated"

### Requirement: User un-view is respected
If the user un-views a file the extension auto-viewed, the extension SHALL NOT auto-view that file again while the PR head commit is unchanged. Once the head commit changes, the file SHALL be auto-viewed again if GitHub has it as not viewed.

#### Scenario: Un-view sticks on reload
- **WHEN** the user un-views auto-viewed `atlas.sum` and reloads the page with no new push
- **THEN** `atlas.sum` stays not viewed and no request is sent for it

#### Scenario: New push re-applies
- **WHEN** the user had un-viewed `atlas.sum`, then a new commit is pushed to the PR, and GitHub has `atlas.sum` as not viewed
- **THEN** the extension auto-views `atlas.sum` again

### Requirement: Manual viewing unaffected
Files not in an auto-viewed group SHALL keep GitHub's default Viewed behavior.

#### Scenario: Normal file
- **WHEN** the user clicks Viewed on a file in a normal group
- **THEN** the file is marked viewed exactly as GitHub does without the extension
