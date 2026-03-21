import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readLocalLock,
  writeLocalLock,
  addSkillToLocalLock,
  removeSkillFromLocalLock,
  computeSkillFolderHash,
  getLocalLockPath,
} from '../src/local-lock.ts';

describe('local-lock', () => {
  describe('getLocalLockPath', () => {
    it('returns skillshub-lock.json in given directory', () => {
      const result = getLocalLockPath('/some/project');
      expect(result).toBe(join('/some/project', 'skillshub-lock.json'));
    });

    it('uses cwd when no directory given', () => {
      const result = getLocalLockPath();
      expect(result).toBe(join(process.cwd(), 'skillshub-lock.json'));
    });
  });

  describe('readLocalLock', () => {
    it('returns empty lock when file does not exist', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        const lock = await readLocalLock(dir);
        expect(lock).toEqual({ version: 2, skills: {} });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('reads a valid lock file', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        const content = {
          version: 2,
          skills: {
            'my-skill': {
              source: 'vercel-labs/skills',
              sourceType: 'github',
              resourceType: 'skill',
              targetType: 'claude-code',
              sourceRef: 'main',
              resourcePath: 'skills/my-skill/SKILL.md',
              remoteHash: 'abc123',
              computedHash: 'abc123',
            },
          },
        };
        await writeFile(join(dir, 'skillshub-lock.json'), JSON.stringify(content), 'utf-8');

        const lock = await readLocalLock(dir);
        expect(lock.version).toBe(2);
        expect(lock.skills['skill:my-skill']).toMatchObject({
          source: 'vercel-labs/skills',
          sourceType: 'github',
          resourceType: 'skill',
          targetType: 'claude-code',
          sourceRef: 'main',
          resourcePath: 'skills/my-skill/SKILL.md',
          remoteHash: 'abc123',
          computedHash: 'abc123',
        });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns empty lock for corrupted JSON (merge conflict markers)', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        const conflicted = `{
  "version": 1,
  "skills": {
<<<<<<< HEAD
    "skill-a": { "source": "org/repo-a", "sourceType": "github", "computedHash": "aaa" }
=======
    "skill-b": { "source": "org/repo-b", "sourceType": "github", "computedHash": "bbb" }
>>>>>>> feature-branch
  }
}`;
        await writeFile(join(dir, 'skillshub-lock.json'), conflicted, 'utf-8');

        const lock = await readLocalLock(dir);
        expect(lock).toEqual({ version: 2, skills: {} });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns empty lock for invalid structure (missing skills key)', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        await writeFile(join(dir, 'skillshub-lock.json'), '{"version": 1}', 'utf-8');
        const lock = await readLocalLock(dir);
        expect(lock).toEqual({ version: 2, skills: {} });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('writeLocalLock', () => {
    it('writes sorted JSON with trailing newline', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        await writeLocalLock(
          {
            version: 2,
            skills: {
              'zebra-skill': {
                source: 'org/z',
                sourceType: 'github',
                resourceType: 'skill',
                targetType: 'cursor',
                sourceRef: 'main',
                resourcePath: 'skills/zebra-skill/SKILL.md',
                remoteHash: 'zzz',
                computedHash: 'zzz',
              },
              'alpha-skill': {
                source: 'org/a',
                sourceType: 'github',
                resourceType: 'skill',
                targetType: 'cursor',
                sourceRef: 'main',
                resourcePath: 'skills/alpha-skill/SKILL.md',
                remoteHash: 'aaa',
                computedHash: 'aaa',
              },
              'middle-skill': {
                source: 'org/m',
                sourceType: 'github',
                resourceType: 'skill',
                targetType: 'cursor',
                sourceRef: 'main',
                resourcePath: 'skills/middle-skill/SKILL.md',
                remoteHash: 'mmm',
                computedHash: 'mmm',
              },
            },
          },
          dir
        );

        const raw = await readFile(join(dir, 'skillshub-lock.json'), 'utf-8');
        expect(raw.endsWith('\n')).toBe(true);

        const parsed = JSON.parse(raw);
        const keys = Object.keys(parsed.skills);
        expect(keys).toEqual(['skill:alpha-skill', 'skill:middle-skill', 'skill:zebra-skill']);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('addSkillToLocalLock', () => {
    it('adds a new skill to an empty lock', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        await addSkillToLocalLock(
          'new-skill',
          {
            source: 'org/repo',
            sourceType: 'github',
            resourceType: 'skill',
            targetType: 'claude-code',
            targetTypes: ['claude-code', 'cursor'],
            sourceRef: 'main',
            resourcePath: 'skills/new-skill/SKILL.md',
            remoteHash: 'hash123',
            computedHash: 'hash123',
          },
          dir
        );

        const lock = await readLocalLock(dir);
        expect(lock.skills['skill:new-skill']).toMatchObject({
          source: 'org/repo',
          sourceType: 'github',
          resourceType: 'skill',
          targetType: 'claude-code',
          targetTypes: ['claude-code', 'cursor'],
          sourceRef: 'main',
          resourcePath: 'skills/new-skill/SKILL.md',
          remoteHash: 'hash123',
          computedHash: 'hash123',
        });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('updates an existing skill hash', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        await addSkillToLocalLock(
          'my-skill',
          {
            source: 'org/repo',
            sourceType: 'github',
            resourceType: 'skill',
            targetType: 'cursor',
            sourceRef: 'main',
            resourcePath: 'skills/my-skill/SKILL.md',
            remoteHash: 'old-hash',
            computedHash: 'old-hash',
          },
          dir
        );
        await addSkillToLocalLock(
          'my-skill',
          {
            source: 'org/repo',
            sourceType: 'github',
            resourceType: 'skill',
            targetType: 'cursor',
            sourceRef: 'main',
            resourcePath: 'skills/my-skill/SKILL.md',
            remoteHash: 'new-hash',
            computedHash: 'new-hash',
          },
          dir
        );

        const lock = await readLocalLock(dir);
        expect(lock.skills['skill:my-skill']!.computedHash).toBe('new-hash');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('preserves other skills when adding', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        await addSkillToLocalLock(
          'skill-a',
          {
            source: 'org/a',
            sourceType: 'github',
            resourceType: 'skill',
            targetType: 'cursor',
            sourceRef: 'main',
            resourcePath: 'skills/skill-a/SKILL.md',
            remoteHash: 'aaa',
            computedHash: 'aaa',
          },
          dir
        );
        await addSkillToLocalLock(
          'skill-b',
          {
            source: 'org/b',
            sourceType: 'github',
            resourceType: 'skill',
            targetType: 'cursor',
            sourceRef: 'main',
            resourcePath: 'skills/skill-b/SKILL.md',
            remoteHash: 'bbb',
            computedHash: 'bbb',
          },
          dir
        );

        const lock = await readLocalLock(dir);
        expect(Object.keys(lock.skills)).toHaveLength(2);
        expect(lock.skills['skill:skill-a']!.computedHash).toBe('aaa');
        expect(lock.skills['skill:skill-b']!.computedHash).toBe('bbb');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('keeps skill and rule entries with the same name separate', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        await addSkillToLocalLock(
          'react',
          {
            source: 'org/repo',
            sourceType: 'github',
            resourceType: 'skill',
            targetType: 'codex',
            targetTypes: ['codex'],
            sourceRef: 'main',
            resourcePath: 'skills/react/SKILL.md',
            remoteHash: 'skill-hash',
            computedHash: 'skill-hash',
          },
          dir
        );
        await addSkillToLocalLock(
          'react',
          {
            source: 'org/repo',
            sourceType: 'github',
            resourceType: 'rule',
            targetType: 'cline-me',
            targetTypes: ['cline-me'],
            sourceRef: 'main',
            resourcePath: 'rules/react.md',
            remoteHash: 'rule-hash',
            computedHash: 'rule-hash',
          },
          dir
        );

        const lock = await readLocalLock(dir);
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
  });

  describe('removeSkillFromLocalLock', () => {
    it('removes an existing skill', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        await addSkillToLocalLock(
          'my-skill',
          {
            source: 'org/repo',
            sourceType: 'github',
            resourceType: 'skill',
            targetType: 'claude-code',
            sourceRef: 'main',
            resourcePath: 'skills/my-skill/SKILL.md',
            remoteHash: 'hash',
            computedHash: 'hash',
          },
          dir
        );

        const removed = await removeSkillFromLocalLock('my-skill', dir);
        expect(removed).toBe(true);

        const lock = await readLocalLock(dir);
        expect(lock.skills['skill:my-skill']).toBeUndefined();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('returns false for non-existent skill', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        const removed = await removeSkillFromLocalLock('no-such-skill', dir);
        expect(removed).toBe(false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('computeSkillFolderHash', () => {
    it('produces a deterministic SHA-256 hash', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        const skillDir = join(dir, 'my-skill');
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          join(skillDir, 'SKILL.md'),
          '---\nname: test\ndescription: test\n---\n# Test\n',
          'utf-8'
        );

        const hash1 = await computeSkillFolderHash(skillDir);
        const hash2 = await computeSkillFolderHash(skillDir);
        expect(hash1).toBe(hash2);
        expect(hash1).toMatch(/^[a-f0-9]{64}$/);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('changes when file content changes', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        const skillDir = join(dir, 'my-skill');
        await mkdir(skillDir, { recursive: true });
        await writeFile(join(skillDir, 'SKILL.md'), 'version 1', 'utf-8');

        const hash1 = await computeSkillFolderHash(skillDir);

        await writeFile(join(skillDir, 'SKILL.md'), 'version 2', 'utf-8');

        const hash2 = await computeSkillFolderHash(skillDir);
        expect(hash1).not.toBe(hash2);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('changes when a file is added', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        const skillDir = join(dir, 'my-skill');
        await mkdir(skillDir, { recursive: true });
        await writeFile(join(skillDir, 'SKILL.md'), 'content', 'utf-8');

        const hash1 = await computeSkillFolderHash(skillDir);

        await writeFile(join(skillDir, 'extra.txt'), 'extra file', 'utf-8');

        const hash2 = await computeSkillFolderHash(skillDir);
        expect(hash1).not.toBe(hash2);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('changes when a file is renamed', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        const skillDir1 = join(dir, 'skill-v1');
        await mkdir(skillDir1, { recursive: true });
        await writeFile(join(skillDir1, 'old-name.md'), 'content', 'utf-8');

        const skillDir2 = join(dir, 'skill-v2');
        await mkdir(skillDir2, { recursive: true });
        await writeFile(join(skillDir2, 'new-name.md'), 'content', 'utf-8');

        const hash1 = await computeSkillFolderHash(skillDir1);
        const hash2 = await computeSkillFolderHash(skillDir2);
        expect(hash1).not.toBe(hash2);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('includes nested files in subdirectories', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        const skillDir = join(dir, 'my-skill');
        await mkdir(join(skillDir, 'sub'), { recursive: true });
        await writeFile(join(skillDir, 'SKILL.md'), 'root', 'utf-8');
        await writeFile(join(skillDir, 'sub', 'helper.md'), 'nested', 'utf-8');

        const hash1 = await computeSkillFolderHash(skillDir);

        // Changing nested file should change hash
        await writeFile(join(skillDir, 'sub', 'helper.md'), 'changed', 'utf-8');

        const hash2 = await computeSkillFolderHash(skillDir);
        expect(hash1).not.toBe(hash2);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('ignores .git and node_modules directories', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        const skillDir = join(dir, 'my-skill');
        await mkdir(skillDir, { recursive: true });
        await writeFile(join(skillDir, 'SKILL.md'), 'content', 'utf-8');

        const hash1 = await computeSkillFolderHash(skillDir);

        // Adding files in .git and node_modules should NOT change hash
        await mkdir(join(skillDir, '.git'), { recursive: true });
        await writeFile(join(skillDir, '.git', 'HEAD'), 'ref: refs/heads/main', 'utf-8');
        await mkdir(join(skillDir, 'node_modules', 'foo'), { recursive: true });
        await writeFile(join(skillDir, 'node_modules', 'foo', 'index.js'), 'noop', 'utf-8');

        const hash2 = await computeSkillFolderHash(skillDir);
        expect(hash1).toBe(hash2);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('merge conflict friendliness', () => {
    it('produces no-conflict output when two skills are added independently', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'lock-test-'));
      try {
        // Simulate branch A adding skill-a
        await addSkillToLocalLock(
          'skill-a',
          {
            source: 'org/a',
            sourceType: 'github',
            resourceType: 'skill',
            targetType: 'cursor',
            sourceRef: 'main',
            resourcePath: 'skills/skill-a/SKILL.md',
            remoteHash: 'aaa',
            computedHash: 'aaa',
          },
          dir
        );
        const branchA = await readFile(join(dir, 'skillshub-lock.json'), 'utf-8');

        // Reset to empty
        await writeFile(join(dir, 'skillshub-lock.json'), '{"version":2,"skills":{}}', 'utf-8');

        // Simulate branch B adding skill-b
        await addSkillToLocalLock(
          'skill-b',
          {
            source: 'org/b',
            sourceType: 'github',
            resourceType: 'skill',
            targetType: 'cursor',
            sourceRef: 'main',
            resourcePath: 'skills/skill-b/SKILL.md',
            remoteHash: 'bbb',
            computedHash: 'bbb',
          },
          dir
        );
        const branchB = await readFile(join(dir, 'skillshub-lock.json'), 'utf-8');

        // Both branches produce valid JSON with no timestamps to conflict on
        const parsedA = JSON.parse(branchA);
        const parsedB = JSON.parse(branchB);
        expect(parsedA.skills['skill:skill-a']).toBeDefined();
        expect(parsedA.skills['skill:skill-a'].computedHash).toBeDefined();
        expect(parsedB.skills['skill:skill-b']).toBeDefined();
        expect(parsedB.skills['skill:skill-b'].computedHash).toBeDefined();

        // No timestamps present
        expect(parsedA.skills['skill:skill-a'].installedAt).toBeUndefined();
        expect(parsedA.skills['skill:skill-a'].updatedAt).toBeUndefined();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
