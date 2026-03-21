import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  addSkillToLock,
  dismissPrompt,
  getAllLockedSkills,
  getLastSelectedAgents,
  getSkillLockPath,
  readSkillLock,
  removeSkillFromLock,
  saveSelectedAgents,
  writeSkillLock,
} from '../src/skill-lock.ts';

describe('skillshub-lock', () => {
  let xdgStateHome: string | undefined;
  let homeDir: string | undefined;

  beforeEach(() => {
    xdgStateHome = process.env.XDG_STATE_HOME;
    homeDir = process.env.HOME;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (xdgStateHome === undefined) {
      delete process.env.XDG_STATE_HOME;
    } else {
      process.env.XDG_STATE_HOME = xdgStateHome;
    }

    if (homeDir === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = homeDir;
    }
  });

  it('uses skillshub state paths', () => {
    const home = homedir();
    expect(getSkillLockPath()).toBe(join(home, '.skillshub', 'skillshub-lock.json'));
  });

  it('uses XDG_STATE_HOME when set', async () => {
    const dir = await mkdtemp(join(process.cwd(), 'skillshub-lock-test-'));
    try {
      vi.stubEnv('XDG_STATE_HOME', dir);
      vi.stubEnv('HOME', join(dir, 'home'));

      expect(getSkillLockPath()).toBe(join(dir, '.skillshub', 'skillshub-lock.json'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes and reads unified lock entries plus global state', async () => {
    const dir = await mkdtemp(join(process.cwd(), 'skillshub-lock-test-'));
    try {
      vi.stubEnv('XDG_STATE_HOME', dir);
      vi.stubEnv('HOME', join(dir, 'home'));

      await writeSkillLock({
        version: 4,
        skills: {
          'react-rules': {
            source: 'vercel-labs/skills',
            sourceType: 'github',
            sourceUrl: 'https://github.com/vercel-labs/skills',
            resourceType: 'rule',
            targetType: 'cline-me',
            targetTypes: ['cline-me', 'codex'],
            sourceRef: 'main',
            resourcePath: 'rules/react.md',
            remoteHash: 'hash-1',
            skillPath: 'rules/react.md',
            skillFolderHash: 'hash-1',
            installedAt: '2026-03-21T00:00:00.000Z',
            updatedAt: '2026-03-21T00:00:00.000Z',
          },
        },
        dismissed: { findSkillsPrompt: true },
        lastSelectedAgents: ['codex', 'cline-me'],
      });

      const lock = await readSkillLock();
      expect(lock).toMatchObject({
        version: 4,
        dismissed: { findSkillsPrompt: true },
        lastSelectedAgents: ['codex', 'cline-me'],
      });
      expect(lock.skills['rule:react-rules']).toMatchObject({
        resourceType: 'rule',
        targetType: 'cline-me',
        targetTypes: ['cline-me', 'codex'],
        sourceRef: 'main',
        resourcePath: 'rules/react.md',
        remoteHash: 'hash-1',
      });
      expect(await getAllLockedSkills()).toHaveProperty('rule:react-rules');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('adds and removes skills using the unified lock entry', async () => {
    const dir = await mkdtemp(join(process.cwd(), 'skillshub-lock-test-'));
    try {
      vi.stubEnv('XDG_STATE_HOME', dir);
      vi.stubEnv('HOME', join(dir, 'home'));

      await addSkillToLock('angular', {
        source: 'vercel-labs/skills',
        sourceType: 'github',
        sourceUrl: 'https://github.com/vercel-labs/skills',
        resourceType: 'rule',
        targetType: 'cline-me',
        targetTypes: ['cline-me'],
        sourceRef: 'main',
        resourcePath: 'rules/angular.md',
        remoteHash: 'hash-angular',
        skillPath: 'rules/angular.md',
        skillFolderHash: 'hash-angular',
        pluginName: 'frontend',
      });

      const lock = await readSkillLock();
      expect(lock.skills['rule:angular']).toMatchObject({
        resourceType: 'rule',
        targetType: 'cline-me',
        targetTypes: ['cline-me'],
        sourceRef: 'main',
        resourcePath: 'rules/angular.md',
        remoteHash: 'hash-angular',
      });

      const removed = await removeSkillFromLock('angular', 'rule');
      expect(removed).toBe(true);
      expect(await getAllLockedSkills()).not.toHaveProperty('rule:angular');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps skill and rule entries with the same name separate', async () => {
    const dir = await mkdtemp(join(process.cwd(), 'skillshub-lock-test-'));
    try {
      vi.stubEnv('XDG_STATE_HOME', dir);
      vi.stubEnv('HOME', join(dir, 'home'));

      await addSkillToLock('react', {
        source: 'vercel-labs/skills',
        sourceType: 'github',
        sourceUrl: 'https://github.com/vercel-labs/skills',
        resourceType: 'skill',
        targetType: 'codex',
        targetTypes: ['codex'],
        sourceRef: 'main',
        resourcePath: 'skills/react/SKILL.md',
        remoteHash: 'skill-hash',
        skillPath: 'skills/react/SKILL.md',
        skillFolderHash: 'skill-hash',
      });

      await addSkillToLock('react', {
        source: 'vercel-labs/skills',
        sourceType: 'github',
        sourceUrl: 'https://github.com/vercel-labs/skills',
        resourceType: 'rule',
        targetType: 'cline-me',
        targetTypes: ['cline-me'],
        sourceRef: 'main',
        resourcePath: 'rules/react.md',
        remoteHash: 'rule-hash',
        skillPath: 'rules/react.md',
        skillFolderHash: 'rule-hash',
      });

      const lock = await readSkillLock();
      expect(Object.keys(lock.skills).sort()).toEqual(['rule:react', 'skill:react']);
      expect(lock.skills['skill:react']).toMatchObject({
        resourceType: 'skill',
        resourcePath: 'skills/react/SKILL.md',
      });
      expect(lock.skills['rule:react']).toMatchObject({
        resourceType: 'rule',
        resourcePath: 'rules/react.md',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('persists last selected agents through the unified lock file', async () => {
    const dir = await mkdtemp(join(process.cwd(), 'skillshub-lock-test-'));
    try {
      vi.stubEnv('XDG_STATE_HOME', dir);
      vi.stubEnv('HOME', join(dir, 'home'));

      await saveSelectedAgents(['codex', 'cline-me']);
      expect(await getLastSelectedAgents()).toEqual(['codex', 'cline-me']);

      await dismissPrompt('findSkillsPrompt');
      const lock = await readSkillLock();
      expect(lock.dismissed?.findSkillsPrompt).toBe(true);
      expect(lock.lastSelectedAgents).toEqual(['codex', 'cline-me']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
