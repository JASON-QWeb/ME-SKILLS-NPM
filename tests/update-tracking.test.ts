import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildUpdateInstallInvocation, collectTrackedUpdateEntries } from '../src/cli.ts';
import {
  computeContentHash,
  fetchRuleFileHash,
  fetchSkillFolderHash,
  writeSkillLock,
} from '../src/skill-lock.ts';
import { writeLocalLock } from '../src/local-lock.ts';

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

      expect(
        tracked.map(({ name, scope, entry }) => ({
          name,
          scope,
          resourceType: entry.resourceType,
        }))
      ).toEqual([
        { name: 'global-skill', scope: 'global', resourceType: 'skill' },
        { name: 'project-rule', scope: 'project', resourceType: 'rule' },
      ]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(stateDir, { recursive: true, force: true });
    }
  });

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
