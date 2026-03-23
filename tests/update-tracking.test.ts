import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildUpdateInstallInvocation,
  collectTrackedUpdateEntries,
  detectTrackedUpdates,
} from '../src/cli.ts';
import {
  computeContentHash,
  fetchRuleFileHash,
  fetchSkillFolderHash,
  writeSkillLock,
} from '../src/skill-lock.ts';
import { getCanonicalPath } from '../src/installer.ts';
import { computeSkillFolderHash, writeLocalLock } from '../src/local-lock.ts';

function git(cmd: string, cwd: string): void {
  execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

async function createBareRemoteRepo(): Promise<{
  bareDir: string;
  workDir: string;
  sourceUrl: string;
  skillPath: string;
}> {
  const bareDir = await mkdtemp(join(tmpdir(), 'skillshub-update-remote-'));
  const workDir = await mkdtemp(join(tmpdir(), 'skillshub-update-work-'));

  git('init --bare', bareDir);
  git('init -b main', workDir);
  git('config user.name "Test User"', workDir);
  git('config user.email "test@example.com"', workDir);
  git(`remote add origin file://${bareDir}`, workDir);

  await writeFile(join(workDir, '.gitattributes'), '* text eol=lf\n');

  const skillDir = join(workDir, 'skills', 'demo-skill');
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, 'SKILL.md'),
    ['---', 'name: demo-skill', 'description: Demo skill', '---', '', 'Initial body'].join('\n')
  );

  git('add .', workDir);
  git('commit -m "initial skill"', workDir);
  git('push -u origin main', workDir);

  return {
    bareDir,
    workDir,
    sourceUrl: `file://${bareDir}`,
    skillPath: join(workDir, 'skills', 'demo-skill'),
  };
}

describe('update tracking', () => {
  let originalXdgStateHome: string | undefined;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalXdgStateHome = process.env.XDG_STATE_HOME;
    originalHome = process.env.HOME;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();

    if (originalXdgStateHome === undefined) {
      delete process.env.XDG_STATE_HOME;
    } else {
      process.env.XDG_STATE_HOME = originalXdgStateHome;
    }

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  it('includes both global and project installs in update tracking', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'skillshub-update-project-'));
    const stateDir = await mkdtemp(join(tmpdir(), 'skillshub-update-state-'));

    try {
      vi.stubEnv('XDG_STATE_HOME', stateDir);
      vi.stubEnv('HOME', join(stateDir, 'home'));

      await mkdir(join(stateDir, '.skillshub'), { recursive: true });

      await writeSkillLock({
        version: 4,
        skills: {
          'global-skill': {
            source: 'vercel-labs/skills',
            sourceType: 'github',
            sourceUrl: 'https://github.com/vercel-labs/skills.git',
            resourceType: 'skill',
            targetType: 'codex',
            targetTypes: ['codex', 'cursor'],
            sourceRef: 'main',
            resourcePath: 'skills/global-skill/SKILL.md',
            remoteHash: 'global-hash',
            skillFolderHash: 'global-hash',
            installedAt: '2026-03-21T00:00:00.000Z',
            updatedAt: '2026-03-21T00:00:00.000Z',
          },
        },
      });

      await writeLocalLock(
        {
          version: 2,
          skills: {
            'project-rule': {
              source: 'vercel-labs/skills',
              sourceType: 'github',
              resourceType: 'rule',
              targetType: 'cline-me',
              targetTypes: ['cline-me', 'codex'],
              sourceRef: 'feature/rules',
              resourcePath: 'rules/project-rule.md',
              remoteHash: 'project-hash',
              computedHash: 'project-hash',
            },
          },
        },
        cwd
      );

      const tracked = await collectTrackedUpdateEntries(cwd);
      const projectOnly = await collectTrackedUpdateEntries(cwd, 'project');
      const globalOnly = await collectTrackedUpdateEntries(cwd, 'global');

      expect(
        tracked.map(({ name, scope, entry }) => ({
          name,
          scope,
          resourceType: entry.resourceType,
          targetTypes: entry.targetTypes,
        }))
      ).toEqual([
        {
          name: 'global-skill',
          scope: 'global',
          resourceType: 'skill',
          targetTypes: ['codex', 'cursor'],
        },
        {
          name: 'project-rule',
          scope: 'project',
          resourceType: 'rule',
          targetTypes: ['cline-me', 'codex'],
        },
      ]);

      expect(projectOnly).toHaveLength(1);
      expect(projectOnly[0]!.name).toBe('project-rule');
      expect(projectOnly[0]!.scope).toBe('project');

      expect(globalOnly).toHaveLength(1);
      expect(globalOnly[0]!.name).toBe('global-skill');
      expect(globalOnly[0]!.scope).toBe('global');
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it('detects generic git updates by hashing the tracked resource from a shallow clone', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'skillshub-update-project-'));
    const { bareDir, workDir, sourceUrl, skillPath } = await createBareRemoteRepo();

    try {
      const initialHash = await computeSkillFolderHash(skillPath);

      await writeLocalLock(
        {
          version: 2,
          skills: {
            'demo-skill': {
              source: sourceUrl,
              sourceType: 'git',
              sourceUrl,
              resourceType: 'skill',
              targetType: 'codex',
              targetTypes: ['codex'],
              sourceRef: 'main',
              resourcePath: 'skills/demo-skill/SKILL.md',
              remoteHash: initialHash,
              computedHash: initialHash,
            },
          },
        },
        cwd
      );

      await writeFile(join(workDir, 'README.md'), 'Unrelated change\n');
      git('add README.md', workDir);
      git('commit -m "docs: unrelated change"', workDir);
      git('push origin main', workDir);

      let tracked = await collectTrackedUpdateEntries(cwd, 'project');
      let result = await detectTrackedUpdates(tracked);
      expect(result.updates).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
      expect(result.errors).toHaveLength(0);

      await writeFile(
        join(workDir, 'skills', 'demo-skill', 'SKILL.md'),
        ['---', 'name: demo-skill', 'description: Demo skill', '---', '', 'Updated body'].join('\n')
      );
      git('add skills/demo-skill/SKILL.md', workDir);
      git('commit -m "feat: update tracked skill"', workDir);
      git('push origin main', workDir);

      tracked = await collectTrackedUpdateEntries(cwd, 'project');
      result = await detectTrackedUpdates(tracked);
      expect(result.updates).toHaveLength(1);
      expect(result.updates[0]!.name).toBe('demo-skill');
      expect(result.updates[0]!.scope).toBe('project');
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(workDir, { recursive: true, force: true });
      await rm(bareDir, { recursive: true, force: true });
    }
  }, 15000);

  it('falls back to the installed global resource hash for legacy generic git entries with no lock hash', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'skillshub-update-state-'));
    const { bareDir, workDir, sourceUrl } = await createBareRemoteRepo();

    try {
      vi.stubEnv('XDG_STATE_HOME', stateDir);
      vi.stubEnv('HOME', join(stateDir, 'home'));

      const canonicalSkillDir = getCanonicalPath('demo-skill', { global: true });
      await mkdir(canonicalSkillDir, { recursive: true });
      await writeFile(
        join(canonicalSkillDir, 'SKILL.md'),
        ['---', 'name: demo-skill', 'description: Demo skill', '---', '', 'Initial body'].join('\n')
      );

      await writeSkillLock({
        version: 4,
        skills: {
          'demo-skill': {
            source: sourceUrl,
            sourceType: 'git',
            sourceUrl,
            resourceType: 'skill',
            targetType: 'codex',
            targetTypes: ['codex'],
            sourceRef: 'main',
            resourcePath: 'skills/demo-skill/SKILL.md',
            remoteHash: '',
            skillFolderHash: '',
            installedAt: '2026-03-21T00:00:00.000Z',
            updatedAt: '2026-03-21T00:00:00.000Z',
          },
        },
      });

      await writeFile(join(workDir, 'README.md'), 'Unrelated change\n');
      git('add README.md', workDir);
      git('commit -m "docs: unrelated change"', workDir);
      git('push origin main', workDir);

      let tracked = await collectTrackedUpdateEntries(process.cwd(), 'global');
      let result = await detectTrackedUpdates(tracked);
      expect(result.updates).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
      expect(result.errors).toHaveLength(0);

      await writeFile(
        join(workDir, 'skills', 'demo-skill', 'SKILL.md'),
        ['---', 'name: demo-skill', 'description: Demo skill', '---', '', 'Updated body'].join('\n')
      );
      git('add skills/demo-skill/SKILL.md', workDir);
      git('commit -m "feat: update tracked skill"', workDir);
      git('push origin main', workDir);

      tracked = await collectTrackedUpdateEntries(process.cwd(), 'global');
      result = await detectTrackedUpdates(tracked);
      expect(result.updates).toHaveLength(1);
      expect(result.updates[0]!.name).toBe('demo-skill');
      expect(result.updates[0]!.scope).toBe('global');
    } finally {
      await rm(stateDir, { recursive: true, force: true });
      await rm(workDir, { recursive: true, force: true });
      await rm(bareDir, { recursive: true, force: true });
    }
  }, 15000);

  it('builds ref-aware reinstall commands for skills and rules', () => {
    const skillUpdate = buildUpdateInstallInvocation({
      name: 'global-skill',
      scope: 'global',
      entry: {
        source: 'vercel-labs/skills',
        sourceType: 'github',
        sourceUrl: 'https://github.com/vercel-labs/skills.git',
        resourceType: 'skill',
        targetType: 'codex',
        targetTypes: ['codex', 'cursor'],
        sourceRef: 'release/v1',
        resourcePath: 'skills/global-skill/SKILL.md',
        remoteHash: 'global-hash',
        skillFolderHash: 'global-hash',
        installedAt: '2026-03-21T00:00:00.000Z',
        updatedAt: '2026-03-21T00:00:00.000Z',
      },
    });

    expect(skillUpdate.sourceUrl).toBe(
      'https://github.com/vercel-labs/skills/tree/release/v1/skills/global-skill'
    );
    expect(skillUpdate.args).toEqual([
      'add',
      'https://github.com/vercel-labs/skills/tree/release/v1/skills/global-skill',
      '--agent',
      'codex',
      'cursor',
      '-g',
      '-y',
    ]);
    expect(skillUpdate.args).toContain('-g');
    expect(skillUpdate.args).toContain('-y');

    const ruleUpdate = buildUpdateInstallInvocation({
      name: 'angular',
      scope: 'project',
      entry: {
        source: 'vercel-labs/skills',
        sourceType: 'github',
        sourceUrl: 'https://github.com/vercel-labs/skills.git',
        resourceType: 'rule',
        targetType: 'cline-me',
        targetTypes: ['cline-me'],
        sourceRef: 'feature/rules',
        resourcePath: 'packages/ui/rules/angular.md',
        remoteHash: 'rule-hash',
        skillFolderHash: 'rule-hash',
        computedHash: 'rule-hash',
      },
    });

    expect(ruleUpdate.sourceUrl).toBe(
      'https://github.com/vercel-labs/skills/tree/feature/rules/packages/ui'
    );
    expect(ruleUpdate.args).toContain('--rule');
    expect(ruleUpdate.args).toContain('--skill');
    expect(ruleUpdate.args).toContain('angular');
    expect(ruleUpdate.args).toContain('--agent');
    expect(ruleUpdate.args).toContain('cline-me');
    expect(ruleUpdate.args).not.toContain('-g');
  });

  it('uses sourceRef for remote hash lookups and hashes rule files by content', async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);

        if (url.includes('/git/trees/feature-ref?recursive=1')) {
          return new Response(
            JSON.stringify({
              sha: 'tree-sha',
              tree: [{ path: 'skills/global-skill', type: 'tree', sha: 'folder-sha' }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (url.includes('/contents/rules/angular.md?ref=feature-ref')) {
          return new Response(
            JSON.stringify({
              content: Buffer.from('Rule body\n').toString('base64'),
              encoding: 'base64',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
      })
    );

    const folderHash = await fetchSkillFolderHash(
      'vercel-labs/skills',
      'skills/global-skill/SKILL.md',
      undefined,
      'feature-ref'
    );
    const ruleHash = await fetchRuleFileHash(
      'vercel-labs/skills',
      'rules/angular.md',
      undefined,
      'feature-ref'
    );

    expect(folderHash).toBe('folder-sha');
    expect(ruleHash).toBe(computeContentHash('Rule body\n'));
    expect(requests[0]).toContain('/git/trees/feature-ref?recursive=1');
    expect(requests[1]).toContain('/contents/rules/angular.md?ref=feature-ref');
  });
});
