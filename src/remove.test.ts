import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  mkdtempSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runCli, runCliWithInput } from './test-utils.js';
import { readLocalLock, writeLocalLock } from './local-lock.ts';

describe('remove command', { timeout: 30000 }, () => {
  let testDir: string;
  let skillsDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'skills-remove-test-'));

    // Create .agents/skills directory (canonical location)
    skillsDir = join(testDir, '.agents', 'skills');
    mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createTestSkill(name: string, description?: string) {
    const skillDir = join(skillsDir, name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---
name: ${name}
description: ${description || `A test skill called ${name}`}
---

# ${name}

This is a test skill.
`
    );
  }

  function createAgentSkillsDir(agentName: string) {
    const agentSkillsDir = join(testDir, agentName, 'skills');
    mkdirSync(agentSkillsDir, { recursive: true });
    return agentSkillsDir;
  }

  function createSymlink(skillName: string, targetDir: string) {
    const skillPath = join(skillsDir, skillName);
    const linkPath = join(targetDir, skillName);
    try {
      // Create relative symlink
      const relativePath = join('..', '..', '.agents', 'skills', skillName);
      const { symlinkSync } = require('fs');
      symlinkSync(relativePath, linkPath);
    } catch {
      // Skip if symlinks aren't supported
    }
  }

  describe('with no skills installed', () => {
    it('should show message when no skills found', () => {
      const result = runCli(['remove', '-y'], testDir);
      expect(result.stdout).toContain('No skills or rules found to remove');
      expect(result.exitCode).toBe(0);
    });

    it('should show error for non-existent skill name', () => {
      const result = runCli(['remove', 'non-existent-skill', '-y'], testDir);
      expect(result.stdout).toContain('No skills or rules found to remove');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('with skills installed', () => {
    beforeEach(() => {
      createTestSkill('skill-one', 'First test skill');
      createTestSkill('skill-two', 'Second test skill');
      createTestSkill('skill-three', 'Third test skill');

      // Create symlinks in agent directories
      const claudeSkillsDir = createAgentSkillsDir('.claude');
      createSymlink('skill-one', claudeSkillsDir);
      createSymlink('skill-two', claudeSkillsDir);

      const clineSkillsDir = createAgentSkillsDir('.cline');
      createSymlink('skill-one', clineSkillsDir);
      createSymlink('skill-three', clineSkillsDir);
    });

    it('should remove specific skill by name with -y flag', () => {
      const result = runCli(['remove', '--skill', 'skill-one', '-y'], testDir);

      expect(result.stdout).toContain('Successfully removed');
      expect(result.stdout).toContain('1 skill');

      // Verify skill was removed from canonical location
      expect(existsSync(join(skillsDir, 'skill-one'))).toBe(false);

      // Verify other skills still exist
      expect(existsSync(join(skillsDir, 'skill-two'))).toBe(true);
      expect(existsSync(join(skillsDir, 'skill-three'))).toBe(true);
    });

    it('should remove multiple skills by name', () => {
      const result = runCli(['remove', '--skill', 'skill-one', 'skill-two', '-y'], testDir);

      expect(result.stdout).toContain('Successfully removed');
      expect(result.stdout).toContain('2 skill');

      expect(existsSync(join(skillsDir, 'skill-one'))).toBe(false);
      expect(existsSync(join(skillsDir, 'skill-two'))).toBe(false);
      expect(existsSync(join(skillsDir, 'skill-three'))).toBe(true);
    });

    it('should remove all skills with --all flag', () => {
      const result = runCli(['remove', '--all', '-y'], testDir);

      expect(result.stdout).toContain('Successfully removed');
      expect(result.stdout).toContain('3 resource');

      // All skills removed
      expect(existsSync(join(skillsDir, 'skill-one'))).toBe(false);
      expect(existsSync(join(skillsDir, 'skill-two'))).toBe(false);
      expect(existsSync(join(skillsDir, 'skill-three'))).toBe(false);
    });

    it('should remove all skills and rules with --all flag by default', () => {
      const rulesDir = join(testDir, '.agents', 'rules');
      mkdirSync(rulesDir, { recursive: true });
      writeFileSync(join(rulesDir, 'react.md'), '# React Rule\n');

      const result = runCli(['remove', '--all', '-y'], testDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Successfully removed 4 resource');
      expect(existsSync(join(skillsDir, 'skill-one'))).toBe(false);
      expect(existsSync(join(skillsDir, 'skill-two'))).toBe(false);
      expect(existsSync(join(skillsDir, 'skill-three'))).toBe(false);
      expect(existsSync(join(rulesDir, 'react.md'))).toBe(false);
    });

    it("should remove all skills with '--skill *' flag", () => {
      const result = runCli(['remove', '--skill', '*', '-y'], testDir);

      expect(result.stdout).toContain('Successfully removed');
      expect(result.stdout).toContain('3 skill');

      expect(existsSync(join(skillsDir, 'skill-one'))).toBe(false);
      expect(existsSync(join(skillsDir, 'skill-two'))).toBe(false);
      expect(existsSync(join(skillsDir, 'skill-three'))).toBe(false);
    });

    it('should show error for non-existent skill name when skills exist', () => {
      const result = runCli(['remove', '--skill', 'non-existent', '-y'], testDir);

      expect(result.stdout).toContain('No matching skills');
      expect(result.exitCode).toBe(0);
    });

    it('should be case-insensitive when matching skill names', () => {
      const result = runCli(['remove', '--skill', 'SKILL-ONE', '-y'], testDir);

      expect(result.stdout).toContain('Successfully removed');
      expect(existsSync(join(skillsDir, 'skill-one'))).toBe(false);
    });

    it('should remove only the specified skill and leave others', () => {
      runCli(['remove', '--skill', 'skill-two', '-y'], testDir);

      // skill-two removed
      expect(existsSync(join(skillsDir, 'skill-two'))).toBe(false);

      // Others still exist
      expect(existsSync(join(skillsDir, 'skill-one'))).toBe(true);
      expect(existsSync(join(skillsDir, 'skill-three'))).toBe(true);
    });

    it('should not support positional names in default mixed removal mode', () => {
      const result = runCli(['remove', 'skill-one', '-y'], testDir);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Ignoring positional names without --skill or --rule');
      expect(result.stdout).toContain('Interactive mixed removal requires a TTY');
      expect(existsSync(join(skillsDir, 'skill-one'))).toBe(true);
    });

    it('should list skills to remove before confirmation', () => {
      // Answer 'n' to cancel the confirmation prompt
      const result = runCliWithInput(['remove', '--skill', 'skill-one', 'skill-two'], 'n', testDir);

      // Should show the skills that will be removed
      expect(result.stdout).toContain('Skills to remove');
      expect(result.stdout).toContain('skill-one');
      expect(result.stdout).toContain('skill-two');
      expect(result.stdout).toContain('uninstall');

      // Skills should NOT be removed since we cancelled
      expect(existsSync(join(skillsDir, 'skill-one'))).toBe(true);
      expect(existsSync(join(skillsDir, 'skill-two'))).toBe(true);
    });
  });

  describe('agent filtering', () => {
    beforeEach(() => {
      createTestSkill('test-skill');
      createAgentSkillsDir('.claude');
      createAgentSkillsDir('.cline');
    });

    it('should show error for invalid agent name', () => {
      const result = runCli(
        ['remove', '--skill', 'test-skill', '--agent', 'invalid-agent', '-y'],
        testDir
      );

      expect(result.stdout).toContain('Invalid agents');
      expect(result.stdout).toContain('invalid-agent');
      expect(result.stdout).toContain('Valid agents');
      expect(result.exitCode).toBe(1);
    });

    it('should accept valid agent names', () => {
      // This should not error on agent validation
      const result = runCli(
        ['remove', '--skill', 'test-skill', '--agent', 'claude-code', '-y'],
        testDir
      );
      expect(result.stdout).not.toContain('Invalid agents');
    });

    it('should accept multiple agent names', () => {
      const result = runCli(
        ['remove', '--skill', 'test-skill', '--agent', 'claude-code', 'cursor', '-y'],
        testDir
      );
      expect(result.stdout).not.toContain('Invalid agents');
    });
  });

  describe('global flag', () => {
    beforeEach(() => {
      createTestSkill('global-skill');
    });

    it('should accept --global flag without error', () => {
      const result = runCli(['remove', '--skill', 'global-skill', '--global', '-y'], testDir);
      // Command should run without error (skill may not be found in global scope from test dir)
      expect(result.exitCode).toBe(0);
    });
  });

  describe('command aliases', () => {
    beforeEach(() => {
      createTestSkill('alias-test-skill');
    });

    it('should support "rm" alias', () => {
      const result = runCli(['rm', '--skill', 'alias-test-skill', '-y'], testDir);
      expect(result.stdout).toContain('Successfully removed');
      expect(result.exitCode).toBe(0);
    });

    it('should support "r" alias', () => {
      const result = runCli(['r', '--skill', 'alias-test-skill', '-y'], testDir);
      expect(result.stdout).toContain('Successfully removed');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle skill names with special characters', () => {
      createTestSkill('skill-with-dashes');
      createTestSkill('skill_with_underscores');

      const result = runCli(['remove', '--skill', 'skill-with-dashes', '-y'], testDir);
      expect(result.stdout).toContain('Successfully removed');
      expect(existsSync(join(skillsDir, 'skill-with-dashes'))).toBe(false);
      expect(existsSync(join(skillsDir, 'skill_with_underscores'))).toBe(true);
    });

    it('should handle removing last remaining skill', () => {
      createTestSkill('last-skill');

      const result = runCli(['remove', '--skill', 'last-skill', '-y'], testDir);
      expect(result.stdout).toContain('Successfully removed');
      expect(result.stdout).toContain('1 skill');

      // Directory should be empty or removed
      const remaining = readdirSync(skillsDir);
      expect(remaining.length).toBe(0);
    });

    it('should handle directory without SKILL.md file', () => {
      // Create a directory without SKILL.md
      const invalidSkillDir = join(skillsDir, 'invalid-skill');
      mkdirSync(invalidSkillDir, { recursive: true });
      writeFileSync(join(invalidSkillDir, 'README.md'), 'Just a readme');

      createTestSkill('valid-skill');

      const result = runCli(['remove', '--skill', 'valid-skill', '-y'], testDir);
      expect(result.stdout).toContain('Successfully removed');

      // Invalid directory should still be removed
      expect(existsSync(join(skillsDir, 'invalid-skill'))).toBe(true);
    });
  });

  describe('help and info', () => {
    it('should show help with --help', () => {
      const result = runCli(['remove', '--help'], testDir);
      expect(result.stdout).toContain('Usage');
      expect(result.stdout).toContain('remove');
      expect(result.stdout).toContain('--global');
      expect(result.stdout).toContain('--agent');
      expect(result.stdout).toContain('--yes');
      expect(result.exitCode).toBe(0);
    });

    it('should show help with -h', () => {
      const result = runCli(['remove', '-h'], testDir);
      expect(result.stdout).toContain('Usage');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('option parsing', () => {
    beforeEach(() => {
      createTestSkill('parse-test-skill');
    });

    it('should parse -g as global', () => {
      const result = runCli(['remove', '--skill', 'parse-test-skill', '-g', '-y'], testDir);
      expect(result.stdout).not.toContain('error');
      expect(result.stdout).not.toContain('unrecognized');
    });

    it('should parse --yes flag', () => {
      const result = runCli(['remove', '--skill', 'parse-test-skill', '--yes'], testDir);
      expect(result.exitCode).toBe(0);
    });

    it('should parse -a as agent', () => {
      const result = runCli(
        ['remove', '--skill', 'parse-test-skill', '-a', 'claude-code', '-y'],
        testDir
      );
      expect(result.stdout).not.toContain('Invalid agents');
    });

    it('should handle multiple values for --agent', () => {
      const result = runCli(
        ['remove', '--skill', 'parse-test-skill', '--agent', 'claude-code', 'cursor', '-y'],
        testDir
      );
      expect(result.stdout).not.toContain('Invalid agents');
    });
  });

  describe('rule lock cleanup', () => {
    it('should remove project rule lock entries when removing rules', async () => {
      const canonicalRulesDir = join(testDir, '.agents', 'rules');
      const clineRulesDir = join(testDir, '.clinerules');
      mkdirSync(canonicalRulesDir, { recursive: true });
      mkdirSync(clineRulesDir, { recursive: true });
      writeFileSync(join(canonicalRulesDir, 'react.md'), '# React\n');
      writeFileSync(join(clineRulesDir, 'react.md'), '# React\n');

      await writeLocalLock(
        {
          version: 2,
          skills: {
            'rule:react': {
              source: 'owner/repo',
              sourceType: 'github',
              sourceUrl: 'https://github.com/owner/repo.git',
              resourceType: 'rule',
              targetType: 'cline-me',
              targetTypes: ['cline-me'],
              sourceRef: 'main',
              resourcePath: 'rules/react.md',
              remoteHash: 'hash',
              computedHash: 'hash',
            },
          },
        },
        testDir
      );

      const result = runCli(['remove', 'react', '--rule', '-y'], testDir);

      expect(result.stdout).toContain('Successfully removed');
      const lock = await readLocalLock(testDir);
      expect(lock.skills['rule:react']).toBeUndefined();
    });

    it('should remove global rule lock entries when removing rules', () => {
      const globalHome = join(testDir, 'global-home');
      const globalStateHome = join(testDir, 'global-state');
      const globalRulesDir = join(globalHome, '.agents', 'rules');
      const globalClineRulesDir = join(globalHome, '.clinerules');
      const globalLockPath = join(globalStateHome, '.skillshub', 'skillshub-lock.json');

      mkdirSync(globalRulesDir, { recursive: true });
      mkdirSync(globalClineRulesDir, { recursive: true });
      mkdirSync(join(globalStateHome, '.skillshub'), { recursive: true });
      writeFileSync(join(globalRulesDir, 'react.md'), '# React\n');
      writeFileSync(join(globalClineRulesDir, 'react.md'), '# React\n');
      writeFileSync(
        globalLockPath,
        JSON.stringify(
          {
            version: 4,
            skills: {
              'rule:react': {
                source: 'owner/repo',
                sourceType: 'github',
                sourceUrl: 'https://github.com/owner/repo.git',
                resourceType: 'rule',
                targetType: 'cline-me',
                targetTypes: ['cline-me'],
                sourceRef: 'main',
                resourcePath: 'rules/react.md',
                remoteHash: 'hash',
                skillFolderHash: 'hash',
                installedAt: '2026-03-21T00:00:00.000Z',
                updatedAt: '2026-03-21T00:00:00.000Z',
              },
            },
          },
          null,
          2
        )
      );

      const result = runCli(['remove', 'react', '--rule', '--global', '-y'], testDir, {
        HOME: globalHome,
        USERPROFILE: globalHome,
        XDG_STATE_HOME: globalStateHome,
      });

      expect(result.stdout).toContain('Successfully removed');
      const lock = JSON.parse(readFileSync(globalLockPath, 'utf-8'));
      expect(lock.skills['rule:react']).toBeUndefined();
    });
  });
});
