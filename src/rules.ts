import { readFile, readdir, stat } from 'fs/promises';
import { basename, join, normalize, resolve, sep } from 'path';
import type { Rule } from './types.ts';

function isRulePathSafe(basePath: string, rulePath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(rulePath));

  return normalizedTarget.startsWith(normalizedBase + sep) || normalizedTarget === normalizedBase;
}

function ruleDescriptionFromContent(content: string, fallback: string): string {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    return trimmed.replace(/^#+\s*/, '') || fallback;
  }
  return fallback;
}

export async function discoverRules(basePath: string, subpath?: string): Promise<Rule[]> {
  const searchPath = subpath ? join(basePath, subpath) : basePath;
  const rulesDir = join(searchPath, 'rules');

  if (!isRulePathSafe(searchPath, rulesDir)) {
    throw new Error(
      `Invalid rule directory: "${rulesDir}" resolves outside the source repository.`
    );
  }

  try {
    const rulesStat = await stat(rulesDir);
    if (!rulesStat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const entries = await readdir(rulesDir, { withFileTypes: true });
  const rules: Rule[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;

    const rulePath = join(rulesDir, entry.name);
    if (!isRulePathSafe(rulesDir, rulePath)) continue;

    const content = await readFile(rulePath, 'utf-8');
    const name = basename(entry.name, '.md');
    rules.push({
      name,
      description: ruleDescriptionFromContent(content, name),
      path: rulePath,
      content,
    });
  }

  rules.sort((a, b) => a.name.localeCompare(b.name));
  return rules;
}
