import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCliOutput, stripLogo, hasLogo } from './test-utils.ts';
import { buildUpdateInstallInvocation } from './cli.ts';

describe('skillshub CLI', () => {
  describe('--help', () => {
    it('should display help message', () => {
      const output = runCliOutput(['--help']);
      expect(output).toContain('Usage: skillsandruless <command> [options]');
      expect(output).toContain('Manage Skills:');
      expect(output).toContain('SkillAndRule');
      expect(output).toContain('init [name]');
      expect(output).toContain('add <package>');
      expect(output).toContain('check');
      expect(output).toContain('update');
      expect(output).toContain('Add Options:');
      expect(output).toContain('-g, --global');
      expect(output).toContain('-a, --agent');
      expect(output).toContain('-s, --skill');
      expect(output).toContain('--rule');
      expect(output).toContain('-l, --list');
      expect(output).toContain('-y, --yes');
      expect(output).toContain('--all');
    });

    it('should display branded remove help', () => {
      const output = runCliOutput(['remove', '--help']);
      expect(output).toContain('Usage: skillsandruless remove [skills...] [options]');
      expect(output).toContain('skillsandruless remove');
      expect(output).toContain('skillsandruless rm --agent claude-code my-skill');
      expect(output).toContain('--rule');
    });

    it('should show same output for -h alias', () => {
      const helpOutput = runCliOutput(['--help']);
      const hOutput = runCliOutput(['-h']);
      expect(hOutput).toBe(helpOutput);
    });
  });

  describe('--version', () => {
    it('should display version number', () => {
      const output = runCliOutput(['--version']);
      expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should match package.json version', () => {
      const output = runCliOutput(['--version']);
      const pkg = JSON.parse(
        readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf-8')
      );
      expect(output.trim()).toBe(pkg.version);
    });
  });

  describe('no arguments', () => {
    it('should display banner', () => {
      const output = stripLogo(runCliOutput([]));
      expect(output).toContain('SkillAndRule');
      expect(output).toContain('npx skillsandruless add');
      expect(output).toContain('npx skillsandruless add https://github.com/org/repo --rule');
      expect(output).toContain('npx skillsandruless check');
      expect(output).toContain('npx skillsandruless update');
      expect(output).toContain('npx skillsandruless init');
      expect(output).toContain('skills.sh');
    });
  });

  describe('unknown command', () => {
    it('should show error for unknown command', () => {
      const output = runCliOutput(['unknown-command']);
      expect(output).toMatchInlineSnapshot(`
        "Unknown command: unknown-command
        Run skillsandruless --help for usage.
        "
      `);
    });
  });

  describe('logo display', () => {
    it('should not display logo for list command', () => {
      const output = runCliOutput(['list']);
      expect(hasLogo(output)).toBe(false);
    });

    it('should not display logo for check command', () => {
      // Note: check command makes GitHub API calls, so we just verify initial output
      const output = runCliOutput(['check']);
      expect(hasLogo(output)).toBe(false);
    }, 60000);

    it('should not display logo for update command', () => {
      // Note: update command makes GitHub API calls, so we just verify initial output
      const output = runCliOutput(['update']);
      expect(hasLogo(output)).toBe(false);
    }, 60000);
  });

  describe('update reconstruction', () => {
    it('should reconstruct repo-root rule installs from repo-relative rule paths', () => {
      const invocation = buildUpdateInstallInvocation({
        name: 'react',
        scope: 'project',
        entry: {
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
      });

      expect(invocation.sourceUrl).toBe('https://github.com/owner/repo/tree/main');
      expect(invocation.args).toEqual([
        'add',
        'https://github.com/owner/repo/tree/main',
        '--rule',
        '--skill',
        'react',
        '--agent',
        'cline-me',
        '-y',
      ]);
    });
  });
});
