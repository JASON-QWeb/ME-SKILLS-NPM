import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clone: vi.fn(),
  env: vi.fn(),
  simpleGit: vi.fn(),
}));

vi.mock('simple-git', () => ({
  default: mocks.simpleGit,
}));

import { cleanupTempDir, cloneRepo } from './git.ts';

describe('cloneRepo', () => {
  const originalSkipSmudge = process.env.GIT_LFS_SKIP_SMUDGE;

  beforeEach(() => {
    delete process.env.GIT_LFS_SKIP_SMUDGE;
    mocks.clone.mockResolvedValue(undefined);
    mocks.env.mockReturnValue({ clone: mocks.clone });
    mocks.simpleGit.mockReturnValue({ env: mocks.env });
  });

  afterEach(() => {
    if (originalSkipSmudge === undefined) {
      delete process.env.GIT_LFS_SKIP_SMUDGE;
    } else {
      process.env.GIT_LFS_SKIP_SMUDGE = originalSkipSmudge;
    }
    vi.clearAllMocks();
  });

  it('skips Git LFS smudge by default when cloning', async () => {
    const tempDir = await cloneRepo('https://example.com/owner/repo.git');

    expect(mocks.env).toHaveBeenCalledWith(
      expect.objectContaining({
        GIT_TERMINAL_PROMPT: '0',
        GIT_LFS_SKIP_SMUDGE: '1',
      })
    );
    expect(mocks.clone).toHaveBeenCalledWith('https://example.com/owner/repo.git', tempDir, [
      '--depth',
      '1',
    ]);

    await cleanupTempDir(tempDir);
  });

  it('allows callers to opt into normal Git LFS smudge behavior', async () => {
    const tempDir = await cloneRepo('https://example.com/owner/repo.git', undefined, {
      skipLfs: false,
    });
    const envArg = mocks.env.mock.calls[0]?.[0] as Record<string, string | undefined>;

    expect(envArg.GIT_TERMINAL_PROMPT).toBe('0');
    expect(envArg.GIT_LFS_SKIP_SMUDGE).toBeUndefined();

    await cleanupTempDir(tempDir);
  });
});
