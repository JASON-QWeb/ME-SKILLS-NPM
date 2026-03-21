import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { discoverRules } from '../src/rules.ts';

const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('discoverRules', () => {
  it('discovers direct markdown rules from rules/', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillshub-rules-'));
    createdDirs.push(root);

    await mkdir(join(root, 'rules'), { recursive: true });
    await writeFile(join(root, 'rules', 'react.md'), '# React\nReact rule body\n', 'utf-8');
    await writeFile(join(root, 'rules', 'angular.md'), 'Angular rule body\n', 'utf-8');
    await writeFile(join(root, 'rules', 'ignore.txt'), 'nope', 'utf-8');
    await mkdir(join(root, 'rules', 'nested'), { recursive: true });
    await writeFile(join(root, 'rules', 'nested', 'vue.md'), 'nested nope\n', 'utf-8');

    const rules = await discoverRules(root);

    expect(rules.map((rule) => rule.name)).toEqual(['angular', 'react']);
    expect(rules.map((rule) => rule.path)).toEqual([
      join(root, 'rules', 'angular.md'),
      join(root, 'rules', 'react.md'),
    ]);
  });

  it('discovers markdown rules when the source already points at rules/', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillshub-rules-subpath-'));
    createdDirs.push(root);

    await mkdir(join(root, 'rules'), { recursive: true });
    await writeFile(join(root, 'rules', 'react.md'), '# React\nReact rule body\n', 'utf-8');

    const rules = await discoverRules(root, 'rules');

    expect(rules.map((rule) => rule.name)).toEqual(['react']);
    expect(rules[0]?.path).toBe(join(root, 'rules', 'react.md'));
  });
});
