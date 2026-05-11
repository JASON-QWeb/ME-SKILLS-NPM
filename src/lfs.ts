import pc from 'picocolors';
import simpleGit from 'simple-git';
import { open, readdir, stat, type FileHandle } from 'fs/promises';
import { join, normalize, resolve, sep } from 'path';

const LFS_POINTER_HEADER = 'version https://git-lfs.github.com/spec/v1';
const POINTER_READ_BYTES = 512;

export interface LfsPointerInfo {
  path: string;
  absolutePath: string;
  oid: string;
  size: number;
}

interface SpinnerLike {
  start(message?: string): void;
  stop(message?: string): void;
}

export function parseLfsPointerText(content: string): { oid: string; size: number } | null {
  if (!content.startsWith(`${LFS_POINTER_HEADER}\n`)) {
    return null;
  }

  const oidMatch = content.match(/\noid sha256:([a-f0-9]{64})\n/i);
  const sizeMatch = content.match(/\nsize (\d+)(?:\n|$)/);
  if (!oidMatch || !sizeMatch) {
    return null;
  }

  const size = Number(sizeMatch[1]);
  if (!Number.isSafeInteger(size) || size < 0) {
    return null;
  }

  return {
    oid: oidMatch[1]!.toLowerCase(),
    size,
  };
}

export function isLfsPointerText(content: string): boolean {
  return parseLfsPointerText(content) !== null;
}

export async function listLfsFiles(repoDir: string): Promise<string[]> {
  try {
    const output = await simpleGit(repoDir).raw(['lfs', 'ls-files', '-n']);
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function selectedPathsContainLfs(
  repoDir: string,
  includePaths: string[]
): Promise<boolean> {
  const pointers = await findLfsPointers(repoDir, includePaths);
  return pointers.length > 0;
}

export async function pullLfsPaths(repoDir: string, includePaths: string[]): Promise<void> {
  const normalized = normalizeIncludePaths(includePaths);
  if (normalized.length === 0) return;

  await simpleGit(repoDir)
    .env({ ...process.env, GIT_TERMINAL_PROMPT: '0' })
    .raw(['lfs', 'pull', '--include', normalized.join(','), '--exclude', '']);
}

export async function hydrateSelectedLfsFiles(
  repoDir: string,
  includePaths: string[],
  spinner?: SpinnerLike
): Promise<LfsPointerInfo[]> {
  const normalized = normalizeIncludePaths(includePaths);
  if (normalized.length === 0) {
    return [];
  }

  const pointers = await findLfsPointers(repoDir, normalized);
  if (pointers.length === 0) {
    return [];
  }

  if (!(await hasGitLfs(repoDir))) {
    throw new Error(
      'Selected resource contains Git LFS files, but git-lfs is not installed.\n' +
        'Install Git LFS and retry:\n' +
        '  brew install git-lfs\n' +
        '  git lfs install'
    );
  }

  spinner?.start(
    `Downloading ${pointers.length} Git LFS file${pointers.length === 1 ? '' : 's'}...`
  );
  try {
    await pullLfsPaths(repoDir, normalized);
  } catch (error) {
    spinner?.stop(pc.red('Git LFS download failed'));
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to download Git LFS files: ${message}`);
  }

  const unresolved = (
    await Promise.all(
      pointers.map(async (pointer) =>
        (await readLfsPointerInfo(pointer.absolutePath)) ? pointer : null
      )
    )
  ).filter((pointer): pointer is LfsPointerInfo => pointer !== null);

  if (unresolved.length > 0) {
    spinner?.stop(pc.red('Git LFS download incomplete'));
    throw new Error(
      `Git LFS files were not hydrated: ${unresolved.map((file) => file.path).join(', ')}`
    );
  }

  spinner?.stop(`Downloaded ${pointers.length} Git LFS file${pointers.length === 1 ? '' : 's'}`);
  return pointers;
}

function normalizeIncludePaths(includePaths: string[]): string[] {
  const seen = new Set<string>();
  for (const includePath of includePaths) {
    let normalizedPath = includePath.trim().replace(/\\/g, '/');
    normalizedPath = normalizedPath.replace(/^\.\//, '').replace(/^\/+/, '');
    if (normalizedPath === '' || normalizedPath === '.' || normalizedPath === '*') {
      normalizedPath = '**';
    }
    if (normalizedPath.endsWith('/')) {
      normalizedPath = normalizedPath.slice(0, -1);
    }
    if (normalizedPath) {
      seen.add(normalizedPath);
    }
  }
  return [...seen];
}

async function hasGitLfs(repoDir: string): Promise<boolean> {
  try {
    await simpleGit(repoDir).raw(['lfs', 'version']);
    return true;
  } catch {
    return false;
  }
}

async function findLfsPointers(repoDir: string, includePaths: string[]): Promise<LfsPointerInfo[]> {
  const normalizedRepo = normalize(resolve(repoDir));
  const files = await collectCandidateFiles(normalizedRepo, includePaths);
  const pointers = await Promise.all(
    files.map(async (filePath) => {
      const pointer = await readLfsPointerInfo(filePath);
      if (!pointer) {
        return null;
      }
      const relativePath = toRepoRelativePath(normalizedRepo, filePath);
      if (!relativePath) {
        return null;
      }
      return {
        path: relativePath,
        absolutePath: filePath,
        ...pointer,
      };
    })
  );

  return pointers.filter((pointer): pointer is LfsPointerInfo => pointer !== null);
}

async function collectCandidateFiles(repoDir: string, includePaths: string[]): Promise<string[]> {
  const files = new Set<string>();
  for (const includePath of includePaths) {
    const target = includePathToTarget(repoDir, includePath);
    if (!target || !isPathInside(repoDir, target)) {
      continue;
    }
    await collectFiles(target, files);
  }
  return [...files];
}

function includePathToTarget(repoDir: string, includePath: string): string | null {
  if (includePath === '**') {
    return repoDir;
  }
  if (includePath.endsWith('/**')) {
    return join(repoDir, includePath.slice(0, -3));
  }
  return join(repoDir, includePath);
}

async function collectFiles(target: string, files: Set<string>): Promise<void> {
  let info;
  try {
    info = await stat(target);
  } catch {
    return;
  }

  if (info.isFile()) {
    files.add(target);
    return;
  }
  if (!info.isDirectory()) {
    return;
  }

  const entries = await readdir(target, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        return;
      }
      const child = join(target, entry.name);
      if (entry.isDirectory()) {
        await collectFiles(child, files);
      } else if (entry.isFile()) {
        files.add(child);
      }
    })
  );
}

async function readLfsPointerInfo(filePath: string): Promise<{ oid: string; size: number } | null> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(filePath, 'r');
    const buffer = Buffer.alloc(POINTER_READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, POINTER_READ_BYTES, 0);
    return parseLfsPointerText(buffer.subarray(0, bytesRead).toString('utf8'));
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function toRepoRelativePath(repoDir: string, filePath: string): string | null {
  if (!isPathInside(repoDir, filePath)) {
    return null;
  }
  const rel = normalize(resolve(filePath)).slice(repoDir.length + 1);
  return rel.split(sep).join('/');
}

function isPathInside(basePath: string, targetPath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(targetPath));
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(normalizedBase + sep);
}
