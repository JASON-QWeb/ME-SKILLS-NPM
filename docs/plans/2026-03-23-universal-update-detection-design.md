# Universal Update Detection Design

**Date:** 2026-03-23

## Goal

Make `check` and `update` work for generic Git URLs, `.git` URLs, GitLab, and enterprise Git hosts without relying on GitHub-only APIs.

## Problem

The current implementation only checks updates for `sourceType === 'github'` and fetches remote hashes through GitHub APIs. That breaks for:

- generic git URLs such as `https://git.example.com/org/repo.git`
- enterprise Git servers without GitHub APIs
- installs tracked with `.git` URLs that should still be valid update sources

The current project lock entries also store local content hashes as `remoteHash`, which means old project installs cannot safely fall back to the existing GitHub remote-hash logic.

## Chosen Approach

Use a temporary shallow clone of each tracked repository, then recompute the tracked resource hash from the cloned files:

- `skill`: compute the folder hash from the tracked skill directory
- `rule`: compute the file content hash from the tracked rule file

The update checker compares that freshly computed hash with the stored lock hash.

## Why This Approach

This keeps update detection at resource granularity instead of repository granularity:

- no false positives when unrelated files change elsewhere in the repo
- no dependence on GitHub Trees or Contents APIs
- works for any reachable Git server that `git clone` can access

Compared with a pure `git ls-remote` commit comparison, this avoids reporting updates when the tracked skill or rule did not actually change.

## Scope Handling

`check` and `update` should support:

- `project`
- `global`
- `all`

Interactive terminals prompt for scope when the user did not specify one.
Non-interactive runs default to `all` so CI and scripts do not hang.

## Compatibility Rules

- New installs keep storing resource-level hashes in lock files.
- Existing global GitHub entries continue to work because they already store resource hashes.
- Existing project entries without a trustworthy remote resource hash should be skipped with a reinstall hint.
- `local`, `well-known`, and `node_modules` entries remain non-updatable.
- entries pinned to a 40-character commit SHA are treated as fixed and skipped.

## Performance

To keep the clone-based approach practical:

- deduplicate work by `(sourceUrl, sourceRef)` so one repo is cloned once per run
- use shallow clone (`--depth 1`)
- delete temp directories after inspection

## Files To Change

- `src/cli.ts`
- `src/git.ts`
- `src/add.ts`
- `src/skill-lock.ts`
- `src/local-lock.ts`
- `tests/update-tracking.test.ts`
- lock file tests as needed
