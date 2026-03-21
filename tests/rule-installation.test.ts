import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { installRuleForAgent, getRuleInstallPath } from '../src/installer.ts';
import type { Rule } from '../src/types.ts';

const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('installRuleForAgent', () => {
  it('installs a rule markdown file into the target rule directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'skillshub-rule-install-'));
    createdDirs.push(cwd);

    const rule: Rule = {
      name: 'react',
      description: 'React rule',
      path: join(cwd, 'source', 'react.md'),
      content: '# React\nUse React carefully.\n',
    };

    const installPath = getRuleInstallPath(rule.name, 'cline-me', { cwd });
    expect(installPath).toBe(join(cwd, '.clinerules', 'react.md'));

    const result = await installRuleForAgent(rule, 'cline-me', { cwd });

    expect(result.success).toBe(true);
    expect(result.path).toBe(installPath);
    await expect(stat(installPath)).resolves.toBeTruthy();
    await expect(readFile(installPath, 'utf-8')).resolves.toContain('Use React carefully.');
  });
});
