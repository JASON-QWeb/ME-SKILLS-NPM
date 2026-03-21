# SkillsHub Design

**Date:** 2026-03-21

## Goal

Fork the upstream `skills` CLI into a publishable `skillshub` package that:

- renames the CLI, package branding, and examples to `SkillsHub`
- preserves the existing skill installation model
- adds a new `Cline-Me` target with skill installs in `.cline/skills`
- adds a second resource type, `rule`, installable from repository `rules/*.md`
- reserves update support for both `skills` and `rules`
- supports customized target directories by tool and resource type

## Product Scope

### Commands

The first version keeps the upstream command family:

- `skillshub add`
- `skillshub list`
- `skillshub remove`
- `skillshub check`
- `skillshub update`

`add` defaults to installing `skill` resources.

`add --rule` switches discovery and installation to `rule` resources.

`list`, `remove`, `check`, and `update` will operate on both resource types and gain filtering flags for `--skill` and `--rule`.

### Resources

Two resource types are supported:

1. `skill`
   - discovered from `SKILL.md`
   - installed as directories
2. `rule`
   - discovered only from `rules/*.md`
   - each Markdown file is one independent rule
   - the filename without `.md` is the install name and selection label

## Recommended Architecture

### 1. Resource-Type Driven Core

Refactor the current `skill`-specific flow into a generic resource pipeline:

- source parsing
- repository cloning or remote fetch
- resource discovery
- interactive selection
- target resolution
- installation
- lockfile tracking
- update detection

The pipeline receives a `resourceType` and dispatches to type-specific implementations for discovery, metadata extraction, install payload, and remote hashing.

This keeps the CLI surface stable while avoiding a second parallel implementation for rules.

### 2. Target Mapping Model

Replace the current agent-only directory mapping with a target model keyed by:

- `targetType`
- `resourceType`
- `scope` (`project` or `global`)

The existing skill mappings stay as the baseline.

Additional first-version target support:

- `cline-me`
  - project `skill` directory: `.cline/skills`
  - global `skill` directory: `~/.cline/skills`
  - project `rule` directory: `.clinerules`
  - global `rule` directory: `~/.clinerules`

The model must allow future tools to define skill and rule directories independently without changing command code.

### 3. Locking and Updates

Unify tracking into a single SkillsHub lock model for both scopes.

Global state:

- move from the upstream lock naming to a `skillshub`-owned global state path

Project state:

- move from `skills-lock.json` to `skillshub-lock.json`

Each tracked record stores at least:

- `resourceType`
- `targetType`
- `sourceType`
- `sourceUrl`
- `sourceRef`
- `resourcePath`
- `remoteHash`
- install timestamps for global state

Hashing rules:

- `skill`: use directory-level remote hash
- `rule`: use file-level remote hash

Update behavior:

- support both project and global installs
- preserve the original source URL for reinstall/update
- normalize GitHub SSH and HTTPS URLs into a GitHub-capable source identifier for hash lookups
- persist the selected ref so updates do not assume only `main` or `master`

## Discovery Rules

### Skills

Keep the upstream `SKILL.md` discovery behavior with minimal regression risk.

### Rules

For `add --rule`:

- inspect only `rules/*.md`
- do not recurse into subdirectories for v1
- present rule names from filenames
- install selected files as individual rule assets

## Installation Rules

### Skills

Reuse the upstream install behavior where practical:

- canonical storage and symlink/copy behavior for skills
- target selection UI
- per-target installation summaries

### Rules

Rules are installed as files instead of directories.

The rule installer should:

- sanitize the derived rule name
- copy or link the `.md` file into the target rule directory
- participate in the same target-selection UI model as skills
- share the same lock/update pipeline with a `resourceType` marker

## CLI and Branding

The fork must replace upstream branding in:

- package name
- binary name
- banner text
- help output
- examples
- README
- test snapshots and assertions where relevant

Primary command examples:

- `npx skillshub add owner/repo`
- `npx skillshub add https://github.com/org/repo --rule`
- `npx skillshub check`
- `npx skillshub update`

## Compatibility Decisions

- Start from the upstream `skills` codebase rather than rewriting from scratch.
- Preserve as much proven behavior as possible for existing skill installs.
- Introduce abstractions only where needed to support `rule` resources and custom targets.
- Fix the known update limitations during the fork:
  - SSH GitHub URLs should not drop out of hash tracking
  - project installs should be eligible for check/update
  - stored refs should guide update lookups

## Testing Strategy

The initial fork should add or update tests covering:

- branding and command examples for `skillshub`
- `cline-me` target mapping
- skill install behavior regression coverage
- rule discovery from `rules/*.md`
- rule installation into the correct target directory
- project and global lockfile generation
- `check/update` for both `skill` and `rule`
- GitHub HTTPS and SSH update tracking

## Out of Scope for V1

- nested rule discovery under `rules/**`
- non-Markdown rule file formats
- a marketplace or online search flow for rules
- broad redesign of the upstream interactive UX beyond required branding and resource-type support
