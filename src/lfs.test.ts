import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  hydrateSelectedLfsFiles,
  isLfsPointerText,
  parseLfsPointerText,
  selectedPathsContainLfs,
} from './lfs.ts';

const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function makeTempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'skillshub-lfs-'));
  createdDirs.push(dir);
  return dir;
}

function pointer(oid = 'a'.repeat(64), size = 123): string {
  return `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${size}\n`;
}

describe('Git LFS helpers', () => {
  it('parses standard Git LFS pointer text', () => {
    const parsed = parseLfsPointerText(pointer('b'.repeat(64), 2048));

    expect(parsed).toEqual({
      oid: 'b'.repeat(64),
      size: 2048,
    });
    expect(isLfsPointerText(pointer())).toBe(true);
    expect(isLfsPointerText('hello world')).toBe(false);
  });

  it('detects pointers only inside selected include paths', async () => {
    const repo = await makeTempRepo();
    await mkdir(join(repo, 'skills', 'selected'), { recursive: true });
    await mkdir(join(repo, 'skills', 'other'), { recursive: true });
    await writeFile(join(repo, 'skills', 'selected', 'SKILL.md'), '---\nname: selected\n---\n');
    await writeFile(join(repo, 'skills', 'selected', 'test.zip'), pointer());
    await writeFile(join(repo, 'skills', 'other', 'big.zip'), pointer('c'.repeat(64), 999));

    await expect(selectedPathsContainLfs(repo, ['skills/selected/**'])).resolves.toBe(true);
    await expect(selectedPathsContainLfs(repo, ['skills/other-missing/**'])).resolves.toBe(false);
  });

  it('does not require git-lfs when selected paths have no pointers', async () => {
    const repo = await makeTempRepo();
    await mkdir(join(repo, 'skills', 'small'), { recursive: true });
    await writeFile(join(repo, 'skills', 'small', 'SKILL.md'), '---\nname: small\n---\n');

    await expect(hydrateSelectedLfsFiles(repo, ['skills/small/**'])).resolves.toEqual([]);
  });
});
