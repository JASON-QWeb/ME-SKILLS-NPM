# Universal Update Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace GitHub-only update detection with shallow-clone resource hashing that works for generic Git servers and `.git` install URLs.

**Architecture:** The CLI will collect tracked lock entries by scope, group remote checks by `(sourceUrl, sourceRef)`, shallow-clone each distinct repository once, and recompute the tracked resource hash from cloned files. Update decisions stay resource-scoped for both skills and rules.

**Tech Stack:** TypeScript, Vitest, simple-git, Node.js fs/path APIs

---

### Task 1: Add failing tests for clone-based update inspection

**Files:**

- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/tests/update-tracking.test.ts`

**Step 1: Write the failing test**

Add tests that expect:

- `collectTrackedUpdateEntries(cwd, 'project')` only returns project entries
- update detection can compare a generic `.git` source by hashing cloned files
- old project entries without a trustworthy remote hash are skipped

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/update-tracking.test.ts
```

Expected: FAIL because the current implementation has no scope filtering or clone-based inspector.

### Task 2: Implement reusable remote resource inspection helpers

**Files:**

- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/git.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/cli.ts`

**Step 1: Write the minimal implementation**

Add helpers to:

- identify pinned commit refs
- shallow-clone a remote repo to a temp dir
- compute a tracked resource hash from cloned files
- cache cloned inspections per `(sourceUrl, sourceRef)`

**Step 2: Run focused tests**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/update-tracking.test.ts
```

Expected: previously failing tests move toward PASS.

### Task 3: Refactor check/update to use scope-aware clone-based inspection

**Files:**

- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/cli.ts`

**Step 1: Implement scope parsing and interactive selection**

Add a `--scope` option plus interactive prompt fallback for TTY usage.

**Step 2: Replace GitHub-only checks**

Update `runCheck()` and `runUpdate()` to:

- collect entries by scope
- skip unsupported entries with precise reasons
- inspect supported git-backed entries through the clone-based helper

**Step 3: Run focused tests**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/update-tracking.test.ts src/cli.test.ts
```

Expected: PASS.

### Task 4: Align lock writing for future installs

**Files:**

- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/add.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/skill-lock.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/local-lock.ts`

**Step 1: Keep resource hashes explicit**

Ensure new lock entries preserve the resource hash needed by clone-based checking and do not blur local content hashes with remote compatibility semantics.

**Step 2: Run related tests**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/update-tracking.test.ts tests/local-lock.test.ts tests/skillshub-lock.test.ts
```

Expected: PASS.

### Task 5: Final verification

**Files:**

- Modify only if verification reveals issues

**Step 1: Run full targeted verification**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/update-tracking.test.ts src/cli.test.ts tests/local-lock.test.ts tests/skillshub-lock.test.ts
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm build
```

Expected: all commands succeed.
