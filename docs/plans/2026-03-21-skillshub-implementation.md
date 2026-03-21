# SkillsHub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fork the upstream `skills` CLI into a publishable `skillshub` package with custom branding, a new `cline-me` target, a new `rule` resource type, and unified update tracking for both skills and rules.

**Architecture:** Start from the upstream TypeScript CLI as the baseline, then refactor the install and update pipeline around a `resourceType` abstraction. Keep the command surface and most skill behavior stable while adding `rule` discovery from `rules/*.md`, target-specific rule directories, and a unified lock model that supports both project and global updates. Preserve the original source URL for reinstall behavior while normalizing GitHub sources for remote hash lookups.

**Tech Stack:** Node.js 18+, TypeScript, Vitest, simple-git, gray-matter, obuild

---

## Execution Prerequisite

Before Task 1, create an isolated worktree from this repository now that the initial design commit exists. Use the `using-git-worktrees` skill when execution begins. The plan below assumes implementation happens inside that worktree, not directly on `main`.

### Task 1: Bootstrap the Fork from Upstream

**Files:**
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/package.json`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/README.md`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/ThirdPartyNoticeText.txt`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/build.config.mjs`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/tsconfig.json`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/bin/cli.mjs`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/scripts/`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/tests/`

**Step 1: Copy the upstream codebase into this repository**

Run:

```bash
rsync -a --exclude '.git' /Users/qianjianghao/Desktop/skills/ /Users/qianjianghao/Desktop/ME-SKILLS-NPM/
```

Expected: the current repository now contains the upstream CLI files without copying upstream git history.

**Step 2: Verify the imported tree**

Run:

```bash
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM status --short
```

Expected: the copied upstream files appear as new tracked candidates, with the existing docs retained.

**Step 3: Install dependencies**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm install
```

Expected: dependencies install successfully and a lockfile is present.

**Step 4: Run the upstream test baseline**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm test
```

Expected: upstream tests pass before product-specific changes begin.

**Step 5: Commit the baseline import**

```bash
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM add .
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM commit -m "chore: import upstream skills cli"
```

### Task 2: Rebrand the Package and CLI Surface

**Files:**
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/package.json`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/README.md`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/bin/cli.mjs`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/cli.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/cli.test.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/init.test.ts`

**Step 1: Write the failing test**

Update banner and help assertions so they expect:

```ts
expect(output).toContain('SkillsHub');
expect(output).toContain('npx skillshub add');
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run src/cli.test.ts src/init.test.ts
```

Expected: FAIL because the imported CLI still prints `skills`.

**Step 3: Write minimal implementation**

Implement:

```json
{
  "name": "skillshub",
  "bin": {
    "skillshub": "./bin/cli.mjs"
  }
}
```

Also update visible CLI text, examples, banner copy, and README references from `skills` to `skillshub`.

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run src/cli.test.ts src/init.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM add package.json README.md bin/cli.mjs src/cli.ts src/cli.test.ts src/init.test.ts
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM commit -m "feat: rebrand cli as skillshub"
```

### Task 3: Introduce Resource-Aware Target Metadata

**Files:**
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/types.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/agents.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/installer.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/tests/cross-platform-paths.test.ts`

**Step 1: Write the failing test**

Add assertions for the new target and per-resource directories:

```ts
expect(targets['cline-me'].resources.skill.projectDir).toBe('.cline/skills');
expect(targets['cline-me'].resources.rule.projectDir).toBe('.clinerules');
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/cross-platform-paths.test.ts
```

Expected: FAIL because the target model is still skill-only.

**Step 3: Write minimal implementation**

Refactor the target model to include resource directories:

```ts
type ResourceType = 'skill' | 'rule';

interface TargetResourceConfig {
  projectDir: string;
  globalDir?: string;
}
```

Add `cline-me` with:

```ts
skill: { projectDir: '.cline/skills', globalDir: '~/.cline/skills' }
rule: { projectDir: '.clinerules', globalDir: '~/.clinerules' }
```

Update installer path resolution to accept `resourceType`.

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/cross-platform-paths.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM add src/types.ts src/agents.ts src/installer.ts tests/cross-platform-paths.test.ts
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM commit -m "feat: add resource-aware target metadata"
```

### Task 4: Add Rule Discovery and Rule Installation

**Files:**
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/rules.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/types.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/add.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/installer.ts`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/tests/rule-discovery.test.ts`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/tests/rule-installation.test.ts`

**Step 1: Write the failing test**

Cover direct discovery from `rules/*.md`:

```ts
expect(ruleNames).toEqual(['angular', 'react']);
```

Also assert non-Markdown files and nested files are ignored.

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/rule-discovery.test.ts tests/rule-installation.test.ts
```

Expected: FAIL because no rule module exists yet.

**Step 3: Write minimal implementation**

Implement direct file discovery:

```ts
export async function discoverRules(basePath: string): Promise<Rule[]> {
  // enumerate only direct rules/*.md files
}
```

Install rules as single Markdown files into the selected target rule directory.

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/rule-discovery.test.ts tests/rule-installation.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM add src/rules.ts src/types.ts src/add.ts src/installer.ts tests/rule-discovery.test.ts tests/rule-installation.test.ts
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM commit -m "feat: support rule discovery and installation"
```

### Task 5: Make Add, List, and Remove Resource-Aware

**Files:**
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/cli.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/add.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/list.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/remove.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/cli.test.ts`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/tests/rule-cli.test.ts`

**Step 1: Write the failing test**

Add CLI assertions for:

```ts
skillshub add https://github.com/org/repo --rule
skillshub list --rule
skillshub remove --rule react
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run src/cli.test.ts tests/rule-cli.test.ts
```

Expected: FAIL because the CLI does not understand resource modes.

**Step 3: Write minimal implementation**

Thread `resourceType` through command parsing, add `--rule` and `--skill` filters, and ensure list/remove resolve the right directory roots.

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run src/cli.test.ts tests/rule-cli.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM add src/cli.ts src/add.ts src/list.ts src/remove.ts src/cli.test.ts tests/rule-cli.test.ts
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM commit -m "feat: add resource-aware cli commands"
```

### Task 6: Replace Locking with a Unified SkillsHub Model

**Files:**
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/skill-lock.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/local-lock.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/add.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/list.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/tests/local-lock.test.ts`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/tests/skillshub-lock.test.ts`

**Step 1: Write the failing test**

Add assertions for the new schema:

```ts
expect(entry.resourceType).toBe('rule');
expect(entry.targetType).toBe('cline-me');
expect(getLocalLockPath(cwd)).toContain('skillshub-lock.json');
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/local-lock.test.ts tests/skillshub-lock.test.ts
```

Expected: FAIL because the lock schema and file names are still upstream-specific.

**Step 3: Write minimal implementation**

Add fields for:

```ts
resourceType: 'skill' | 'rule';
targetType: string;
sourceRef?: string;
resourcePath: string;
remoteHash: string;
```

Rename the project lock to `skillshub-lock.json` and move global state naming under `skillshub`.

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/local-lock.test.ts tests/skillshub-lock.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM add src/skill-lock.ts src/local-lock.ts src/add.ts src/list.ts tests/local-lock.test.ts tests/skillshub-lock.test.ts
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM commit -m "feat: unify skillshub lock tracking"
```

### Task 7: Fix Update Detection for Skills and Rules

**Files:**
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/source-parser.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/skill-lock.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/cli.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/src/add.ts`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/tests/source-parser.test.ts`
- Create: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/tests/update-tracking.test.ts`

**Step 1: Write the failing test**

Cover:

```ts
parseSource('git@github.com:org/repo.git');
// stored ref should be used for update lookups
// project installs should participate in check/update
// rule hashes should be file-based
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/source-parser.test.ts tests/update-tracking.test.ts
```

Expected: FAIL because the imported update logic still skips these cases.

**Step 3: Write minimal implementation**

Add:

- GitHub SSH normalization for remote hash lookups
- `sourceRef` persistence on install
- ref-aware remote hash resolution
- file-hash lookup for rules
- project-scope participation in `check` and `update`

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm vitest run tests/source-parser.test.ts tests/update-tracking.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM add src/source-parser.ts src/skill-lock.ts src/cli.ts src/add.ts tests/source-parser.test.ts tests/update-tracking.test.ts
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM commit -m "fix: unify update tracking for skills and rules"
```

### Task 8: Finish Verification and Publish Readiness

**Files:**
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/README.md`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/package.json`
- Modify: `/Users/qianjianghao/Desktop/ME-SKILLS-NPM/scripts/execute-tests.ts`

**Step 1: Write the final documentation updates**

Document:

- `skillshub add`
- `skillshub add --rule`
- `cline-me` support
- update behavior for skills and rules

**Step 2: Run full verification**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm type-check
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm test
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && pnpm build
```

Expected: PASS for all three commands.

**Step 3: Run publish dry-run**

Run:

```bash
cd /Users/qianjianghao/Desktop/ME-SKILLS-NPM && npm pack --dry-run
```

Expected: the tarball contains the `skillshub` package name and expected distributable files.

**Step 4: Commit**

```bash
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM add README.md package.json scripts/execute-tests.ts
git -C /Users/qianjianghao/Desktop/ME-SKILLS-NPM commit -m "docs: finalize skillshub package"
```
