import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, lstat, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { removeCommand } from '../src/remove.ts';
import * as agentsModule from '../src/agents.ts';
import { getCanonicalPath, getInstallPath } from '../src/installer.ts';

// Mock detectInstalledAgents
vi.mock('../src/agents.ts', async () => {
  const actual = await vi.importActual('../src/agents.ts');
  return {
    ...actual,
    detectInstalledAgents: vi.fn(),
  };
});

describe('removeCommand canonical protection', () => {
  let tempDir: string;
  let oldCwd: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'skills-remove-test-'));
    oldCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(oldCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should NOT remove canonical storage if other agents still have the skill installed', async () => {
    const skillName = 'test-skill';
    const canonicalPath = getCanonicalPath(skillName, { cwd: tempDir });
    const claudePath = getInstallPath(skillName, 'claude-code', { cwd: tempDir });
    const continuePath = getInstallPath(skillName, 'continue', { cwd: tempDir });

    // 1. Create canonical storage
    await mkdir(canonicalPath, { recursive: true });
    await writeFile(join(canonicalPath, 'SKILL.md'), '# Test');

    // 2. Install (symlink) to Claude and Continue
    await mkdir(dirname(claudePath), { recursive: true });
    await mkdir(dirname(continuePath), { recursive: true });
    await symlink(canonicalPath, claudePath, 'junction');
    await symlink(canonicalPath, continuePath, 'junction');

    // Verify setup
    expect(
      (await lstat(claudePath)).isSymbolicLink() || (await lstat(claudePath)).isDirectory()
    ).toBe(true);
    expect(
      (await lstat(continuePath)).isSymbolicLink() || (await lstat(continuePath)).isDirectory()
    ).toBe(true);

    // Mock agents: Claude and Continue are installed
    vi.mocked(agentsModule.detectInstalledAgents).mockResolvedValue(['claude-code', 'continue']);

    // 3. Remove from Claude only
    await removeCommand([skillName], { agent: ['claude-code'], yes: true, resourceType: 'skill' });

    // 4. Verify results
    // Claude path should be gone
    await expect(lstat(claudePath)).rejects.toThrow();

    // Canonical path SHOULD STILL EXIST because Continue uses it
    expect((await lstat(canonicalPath)).isDirectory()).toBe(true);

    // Continue path should still be valid
    expect(
      (await lstat(continuePath)).isSymbolicLink() || (await lstat(continuePath)).isDirectory()
    ).toBe(true);
  });

  it('should remove canonical storage if NO other agents are using it', async () => {
    const skillName = 'test-skill-2';
    const canonicalPath = getCanonicalPath(skillName, { cwd: tempDir });
    const claudePath = getInstallPath(skillName, 'claude-code', { cwd: tempDir });

    await mkdir(canonicalPath, { recursive: true });
    await writeFile(join(canonicalPath, 'SKILL.md'), '# Test');
    await mkdir(dirname(claudePath), { recursive: true });
    await symlink(canonicalPath, claudePath, 'junction');

    // Mock agents: Only Claude is installed
    vi.mocked(agentsModule.detectInstalledAgents).mockResolvedValue(['claude-code']);

    // Remove from Claude
    await removeCommand([skillName], { agent: ['claude-code'], yes: true, resourceType: 'skill' });

    // Both should be gone
    await expect(lstat(claudePath)).rejects.toThrow();
    await expect(lstat(canonicalPath)).rejects.toThrow();
  });
});
