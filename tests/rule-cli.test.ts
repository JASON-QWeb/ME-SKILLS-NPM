import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runCli } from '../src/test-utils.ts';

describe('rule-aware CLI', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skillshub-rule-cli-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    const skillsDir = join(testDir, '.agents', 'skills');
    const rulesDir = join(testDir, '.clinerules');
    mkdirSync(join(skillsDir, 'skill-one'), { recursive: true });
    mkdirSync(rulesDir, { recursive: true });

    writeFileSync(
      join(skillsDir, 'skill-one', 'SKILL.md'),
      `---\nname: skill-one\ndescription: Skill one\n---\n# Skill One\n`,
      'utf-8'
    );

    writeFileSync(join(rulesDir, 'react.md'), '# React\nUse React carefully.\n', 'utf-8');
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('lists rules when --rule is provided', () => {
    const result = runCli(['list', '--rule'], testDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('react');
    expect(result.stdout).not.toContain('skill-one');
  });

  it('removes rules from the rule directory when --rule is provided', () => {
    const result = runCli(['remove', '--rule', 'react', '-y'], testDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Successfully removed');
    expect(existsSync(join(testDir, '.clinerules', 'react.md'))).toBe(false);
    expect(existsSync(join(testDir, '.agents', 'skills', 'skill-one', 'SKILL.md'))).toBe(true);
  });
});
