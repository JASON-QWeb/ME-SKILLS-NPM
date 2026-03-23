#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { basename, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as p from '@clack/prompts';
import { runAdd, parseAddOptions, initTelemetry } from './add.ts';
import { runFind } from './find.ts';
import { runInstallFromLock } from './install.ts';
import { getCanonicalPath, getInstallPath } from './installer.ts';
import { runList } from './list.ts';
import { removeCommand, parseRemoveOptions } from './remove.ts';
import { runSync, parseSyncOptions } from './sync.ts';
import { track } from './telemetry.ts';
import { parseSource, getOwnerRepo } from './source-parser.ts';
import {
  computeContentHash,
  fetchSkillFolderHash,
  fetchRuleFileHash,
  getGitHubToken,
  parseLockResourceKey,
  readSkillLock as readGlobalSkillLock,
  type SkillLockEntry as GlobalSkillLockEntry,
} from './skill-lock.ts';
import { computeSkillFolderHash, readLocalLock, type LocalSkillLockEntry } from './local-lock.ts';
import { cleanupTempDir, cloneRepo } from './git.ts';
import type { AgentType, ResourceType } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

const VERSION = getVersion();
initTelemetry(VERSION);

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
// 256-color grays - visible on both light and dark backgrounds
const DIM = '\x1b[38;5;102m'; // darker gray for secondary text
const TEXT = '\x1b[38;5;145m'; // lighter gray for primary text

const LOGO_LINES = [
  '███████╗██╗  ██╗██╗██╗     ██╗        ██╗   ██████╗ ██╗   ██╗██╗     ███████╗',
  '██╔════╝██║ ██╔╝██║██║     ██║        ██║   ██╔══██╗██║   ██║██║     ██╔════╝',
  '███████╗█████╔╝ ██║██║     ██║     ████████╗██████╔╝██║   ██║██║     █████╗  ',
  '╚════██║██╔═██╗ ██║██║     ██║     ██╔═██╔═╝██╔══██╗██║   ██║██║     ██╔══╝  ',
  '███████║██║  ██╗██║███████╗███████╗██████║  ██║  ██║╚██████╔╝███████╗███████╗',
  '╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═════╝  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚══════╝',
];

// Blue-gray metallic gradient - visible on both light and dark backgrounds
const LOGO_COLORS = [
  '\x1b[38;5;75m', // bright steel blue
  '\x1b[38;5;110m', // steel blue
  '\x1b[38;5;146m', // blue-gray
  '\x1b[38;5;145m', // warm silver
  '\x1b[38;5;103m', // dark steel
  '\x1b[38;5;60m', // deep blue-gray
];

function showLogo(): void {
  console.log();
  LOGO_LINES.forEach((line, i) => {
    console.log(`${LOGO_COLORS[i]}${line}${RESET}`);
  });
}

function showBanner(): void {
  showLogo();
  console.log();
  console.log(`${TEXT}SkillAndRule${RESET}`);
  console.log(`${DIM}The open agent skills & rules ecosystem${RESET}`);
  console.log();
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillsandruless add ${DIM}<package>${RESET}        ${DIM}Add a new skill${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillsandruless add https://github.com/org/repo --rule${RESET} ${DIM}Add a rule${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillsandruless remove${RESET}               ${DIM}Remove installed skills or rules${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillsandruless list${RESET}                 ${DIM}List installed skills or rules${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillsandruless find ${DIM}[query]${RESET}         ${DIM}Search for skills${RESET}`
  );
  console.log();
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillsandruless check${RESET}                ${DIM}Check for updates${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillsandruless update${RESET}               ${DIM}Update all skills${RESET}`
  );
  console.log();
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillsandruless experimental_install${RESET} ${DIM}Restore from skillshub-lock.json${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillsandruless init ${DIM}[name]${RESET}          ${DIM}Create a new skill${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillsandruless experimental_sync${RESET}    ${DIM}Sync skills from node_modules${RESET}`
  );
  console.log();
  console.log(`${DIM}try:${RESET} npx skillsandruless add vercel-labs/agent-skills`);
  console.log();
  console.log(`Discover more skills at ${TEXT}https://skills.sh/${RESET}`);
  console.log();
}

function showHelp(): void {
  console.log(`
${BOLD}SkillAndRule${RESET}

${BOLD}Usage:${RESET} skillsandruless <command> [options]

${BOLD}Manage Skills:${RESET}
  add <package>        Add a skill package (alias: a)
                       e.g. vercel-labs/agent-skills
                            https://github.com/vercel-labs/agent-skills
  remove [options]     Remove installed skills or rules
  list, ls             List installed skills or rules
  find [query]         Search for skills interactively

${BOLD}Updates:${RESET}
  check                Check for available skill updates
  update               Update all skills to latest versions
  --scope <scope>      Scope for check/update: project, global, or all

${BOLD}Project:${RESET}
  experimental_install Restore skills from skillshub-lock.json
  init [name]          Initialize a skill (creates <name>/SKILL.md or ./SKILL.md)
  experimental_sync    Sync skills from node_modules into agent directories

${BOLD}Add Options:${RESET}
  -g, --global           Install skill globally (user-level) instead of project-level
  -a, --agent <agents>   Specify agents to install to (use '*' for all agents)
  -s, --skill <skills>   Specify skill names to install (use '*' for all skills)
  --rule                 Install or operate on rule resources
  -l, --list             List available skills in the repository without installing
  -y, --yes              Skip confirmation prompts
  --copy                 Copy files instead of symlinking to agent directories
  --all                  Shorthand for --skill '*' --agent '*' -y
  --full-depth           Search all subdirectories even when a root SKILL.md exists

${BOLD}Remove Options:${RESET}
  -g, --global           Remove from global scope
  -a, --agent <agents>   Remove from specific agents (use '*' for all agents)
  -s, --skill <skills>   Specify skills to remove (use '*' for all skills)
  --rule                 Operate on rule resources (names may follow this flag)
  -y, --yes              Skip confirmation prompts
  --all                  Remove all discovered resources in the selected scope
  
${BOLD}Experimental Sync Options:${RESET}
  -a, --agent <agents>   Specify agents to install to (use '*' for all agents)
  -y, --yes              Skip confirmation prompts

${BOLD}List Options:${RESET}
  -g, --global           List global skills (default: project)
  -a, --agent <agents>   Filter by specific agents
  -s, --skill            List skill resources
  --rule                 List rule resources
  --json                 Output as JSON (machine-readable, no ANSI codes)

${BOLD}Options:${RESET}
  --help, -h        Show this help message
  --version, -v     Show version number

${BOLD}Examples:${RESET}
  ${DIM}$${RESET} skillsandruless add vercel-labs/agent-skills
  ${DIM}$${RESET} skillsandruless add vercel-labs/agent-skills -g
  ${DIM}$${RESET} skillsandruless add vercel-labs/agent-skills --agent claude-code cursor
  ${DIM}$${RESET} skillsandruless add vercel-labs/agent-skills --skill pr-review commit
  ${DIM}$${RESET} skillsandruless remove                        ${DIM}# interactive remove for skills + rules${RESET}
  ${DIM}$${RESET} skillsandruless remove --skill web-design     ${DIM}# remove a skill by name${RESET}
  ${DIM}$${RESET} skillsandruless rm --global --skill frontend-design
  ${DIM}$${RESET} skillsandruless list                          ${DIM}# list project skills + rules${RESET}
  ${DIM}$${RESET} skillsandruless ls -g                         ${DIM}# list global skills + rules${RESET}
  ${DIM}$${RESET} skillsandruless ls -a claude-code             ${DIM}# filter by agent${RESET}
  ${DIM}$${RESET} skillsandruless ls --json                      ${DIM}# JSON output${RESET}
  ${DIM}$${RESET} skillsandruless find                          ${DIM}# interactive search${RESET}
  ${DIM}$${RESET} skillsandruless find typescript               ${DIM}# search by keyword${RESET}
  ${DIM}$${RESET} skillsandruless check
  ${DIM}$${RESET} skillsandruless update
  ${DIM}$${RESET} skillsandruless experimental_install            ${DIM}# restore from skillshub-lock.json${RESET}
  ${DIM}$${RESET} skillsandruless init my-skill
  ${DIM}$${RESET} skillsandruless experimental_sync              ${DIM}# sync from node_modules${RESET}
  ${DIM}$${RESET} skillsandruless experimental_sync -y           ${DIM}# sync without prompts${RESET}

Discover more skills at ${TEXT}https://skills.sh/${RESET}
`);
}

function showRemoveHelp(): void {
  console.log(`
${BOLD}Usage:${RESET} skillsandruless remove [options]

${BOLD}Description:${RESET}
  Remove installed skills or rules from agents. By default, the command
  shows an interactive mixed selection menu for both resource types.
  To remove by name non-interactively, use --skill or --rule explicitly.

${BOLD}Arguments:${RESET}
  names             Optional only when used with --skill or --rule

${BOLD}Options:${RESET}
  -g, --global       Remove from global scope (~/) instead of project scope
  -a, --agent        Remove from specific agents (use '*' for all agents)
  -s, --skill        Specify skills to remove (use '*' for all skills)
  --rule             Remove rule resources instead of skills (names may follow)
  -y, --yes          Skip confirmation prompts
  --all              Remove all discovered skills and rules in the selected scope

${BOLD}Examples:${RESET}
  ${DIM}$${RESET} skillsandruless remove                            ${DIM}# interactive mixed selection${RESET}
  ${DIM}$${RESET} skillsandruless remove --skill my-skill           ${DIM}# remove a specific skill${RESET}
  ${DIM}$${RESET} skillsandruless remove --skill skill1 skill2 -y   ${DIM}# remove multiple skills${RESET}
  ${DIM}$${RESET} skillsandruless remove --global --skill my-skill  ${DIM}# remove from global scope${RESET}
  ${DIM}$${RESET} skillsandruless rm --agent claude-code --skill my-skill ${DIM}# remove from specific agent${RESET}
  ${DIM}$${RESET} skillsandruless remove --all                      ${DIM}# remove all skills and rules${RESET}
  ${DIM}$${RESET} skillsandruless remove --skill '*' -a cursor      ${DIM}# remove all skills from cursor${RESET}
  ${DIM}$${RESET} skillsandruless remove --rule react -y             ${DIM}# remove a rule${RESET}

Discover more skills at ${TEXT}https://skills.sh/${RESET}
`);
}

function runInit(args: string[]): void {
  const cwd = process.cwd();
  const skillName = args[0] || basename(cwd);
  const hasName = args[0] !== undefined;

  const skillDir = hasName ? join(cwd, skillName) : cwd;
  const skillFile = join(skillDir, 'SKILL.md');
  const displayPath = hasName ? `${skillName}/SKILL.md` : 'SKILL.md';

  if (existsSync(skillFile)) {
    console.log(`${TEXT}Skill already exists at ${DIM}${displayPath}${RESET}`);
    return;
  }

  if (hasName) {
    mkdirSync(skillDir, { recursive: true });
  }

  const skillContent = `---
name: ${skillName}
description: A brief description of what this skill does
---

# ${skillName}

Instructions for the agent to follow when this skill is activated.

## When to use

Describe when this skill should be used.

## Instructions

1. First step
2. Second step
3. Additional steps as needed
`;

  writeFileSync(skillFile, skillContent);

  console.log(`${TEXT}Initialized skill: ${DIM}${skillName}${RESET}`);
  console.log();
  console.log(`${DIM}Created:${RESET}`);
  console.log(`  ${displayPath}`);
  console.log();
  console.log(`${DIM}Next steps:${RESET}`);
  console.log(`  1. Edit ${TEXT}${displayPath}${RESET} to define your skill instructions`);
  console.log(
    `  2. Update the ${TEXT}name${RESET} and ${TEXT}description${RESET} in the frontmatter`
  );
  console.log();
  console.log(`${DIM}Publishing:${RESET}`);
  console.log(
    `  ${DIM}GitHub:${RESET}  Push to a repo, then ${TEXT}npx skillsandruless add <owner>/<repo>${RESET}`
  );
  console.log(
    `  ${DIM}URL:${RESET}     Host the file, then ${TEXT}npx skillsandruless add https://example.com/${displayPath}${RESET}`
  );
  console.log();
  console.log(`Browse existing skills for inspiration at ${TEXT}https://skills.sh/${RESET}`);
  console.log();
}

// ============================================
// Check and Update Commands
// ============================================

interface SkippedSkill {
  name: string;
  reason: string;
  sourceUrl: string;
  command: string;
}

type UpdateScope = 'project' | 'global' | 'all';

const SHA1_HEX_RE = /^[a-f0-9]{40}$/i;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

/**
 * Determine why a skill cannot be checked for updates automatically.
 */
function getSkipReason(entry: GlobalSkillLockEntry | LocalSkillLockEntry): string {
  const resourceType = entry.resourceType ?? 'skill';
  if (entry.sourceType === 'local') {
    return 'Local path';
  }
  if (entry.sourceType === 'well-known') {
    return 'Well-known URL';
  }
  if (entry.sourceType === 'node_modules') {
    return 'node_modules sync';
  }
  if (isPinnedRef(getEntrySourceRef(entry))) {
    return 'Pinned commit reference';
  }
  if (!isGitBackedSourceType(entry.sourceType)) {
    return 'Unsupported source type';
  }
  if (!getEntryStoredHash(entry as GlobalSkillLockEntry | LocalSkillLockEntry)) {
    return 'No tracked resource hash';
  }
  if (!getEntryResourcePath(entry as GlobalSkillLockEntry | LocalSkillLockEntry)) {
    return resourceType === 'rule' ? 'No rule path recorded' : 'No skill path recorded';
  }
  return 'No version tracking';
}

/**
 * Print a list of skills that cannot be checked automatically,
 * with the reason and a manual update command for each.
 */
function printSkippedSkills(skipped: SkippedSkill[]): void {
  if (skipped.length === 0) return;
  console.log();
  console.log(`${DIM}${skipped.length} resource(s) cannot be checked automatically:${RESET}`);
  for (const skill of skipped) {
    console.log(`  ${TEXT}•${RESET} ${skill.name} ${DIM}(${skill.reason})${RESET}`);
    console.log(`    ${DIM}To update: ${TEXT}${skill.command}${RESET}`);
  }
}

export interface TrackedUpdateEntry {
  name: string;
  scope: 'global' | 'project';
  entry: GlobalSkillLockEntry | LocalSkillLockEntry;
}

function getEntryResourceType(entry: GlobalSkillLockEntry | LocalSkillLockEntry): ResourceType {
  return entry.resourceType ?? 'skill';
}

function getEntryResourcePath(entry: GlobalSkillLockEntry | LocalSkillLockEntry): string {
  return (entry.resourcePath || entry.skillPath || '').replace(/\\/g, '/');
}

function getEntryRemoteHash(entry: GlobalSkillLockEntry | LocalSkillLockEntry): string {
  return (
    entry.remoteHash || entry.skillFolderHash || (entry as LocalSkillLockEntry).computedHash || ''
  );
}

function getEntryStoredHash(entry: GlobalSkillLockEntry | LocalSkillLockEntry): string {
  return (
    (entry as LocalSkillLockEntry).computedHash || entry.remoteHash || entry.skillFolderHash || ''
  );
}

function getEntrySourceRef(entry: GlobalSkillLockEntry | LocalSkillLockEntry): string {
  return entry.sourceRef || '';
}

function isPinnedRef(ref: string): boolean {
  return SHA1_HEX_RE.test(ref.trim());
}

function isGitBackedSourceType(sourceType: string): boolean {
  return sourceType === 'github' || sourceType === 'gitlab' || sourceType === 'git';
}

function isSha256Hash(value: string): boolean {
  return SHA256_HEX_RE.test(value.trim());
}

function getDisplaySource(entry: GlobalSkillLockEntry | LocalSkillLockEntry): string {
  const sourceUrl = entry.sourceUrl || entry.source;
  if (entry.sourceType === 'github') {
    return getOwnerRepo(parseSource(sourceUrl)) || sourceUrl;
  }
  return sourceUrl;
}

function stripGitSuffix(sourceUrl: string): string {
  return sourceUrl.replace(/\.git$/, '').replace(/\/$/, '');
}

function getSkillBasePath(resourcePath: string): string {
  const normalized = resourcePath.replace(/\\/g, '/');
  if (normalized.endsWith('/SKILL.md')) {
    return normalized.slice(0, -9);
  }
  if (normalized.endsWith('SKILL.md')) {
    return normalized.slice(0, -8);
  }
  return normalized.replace(/\/$/, '');
}

function getRuleBasePath(resourcePath: string): string {
  const normalized = resourcePath.replace(/\\/g, '/');
  const ruleIndex = normalized.lastIndexOf('/rules/');
  if (ruleIndex >= 0) {
    return normalized.slice(0, ruleIndex);
  }
  if (normalized.startsWith('rules/')) {
    return '';
  }
  return normalized.replace(/\/[^/]+\.md$/, '');
}

function getRuleName(resourcePath: string): string {
  const normalized = resourcePath.replace(/\\/g, '/');
  const filename = normalized.split('/').pop() || '';
  return filename.replace(/\.md$/, '');
}

function buildGithubTreeUrl(sourceUrl: string, ref: string, resourcePath: string): string {
  const base = stripGitSuffix(sourceUrl);
  const path = resourcePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return path ? `${base}/tree/${ref}/${path}` : `${base}/tree/${ref}`;
}

function getEntryTargetTypes(entry: GlobalSkillLockEntry | LocalSkillLockEntry): string[] {
  if (Array.isArray(entry.targetTypes) && entry.targetTypes.length > 0) {
    return [...new Set(entry.targetTypes.filter((value): value is string => Boolean(value)))];
  }
  return entry.targetType ? [entry.targetType] : [];
}

export async function collectTrackedUpdateEntries(
  cwd: string = process.cwd(),
  scope: UpdateScope = 'all'
): Promise<TrackedUpdateEntry[]> {
  const tracked: TrackedUpdateEntry[] = [];

  if (scope === 'all' || scope === 'global') {
    const globalLock = await readGlobalSkillLock();
    tracked.push(
      ...Object.entries(globalLock.skills).map(([key, entry]) => ({
        name: parseLockResourceKey(key, entry.resourceType).name,
        scope: 'global' as const,
        entry,
      }))
    );
  }

  if (scope === 'all' || scope === 'project') {
    const localLock = await readLocalLock(cwd);
    tracked.push(
      ...Object.entries(localLock.skills).map(([key, entry]) => ({
        name: parseLockResourceKey(key, entry.resourceType).name,
        scope: 'project' as const,
        entry,
      }))
    );
  }

  return tracked;
}

export function buildUpdateInstallInvocation(update: TrackedUpdateEntry): {
  sourceUrl: string;
  args: string[];
} {
  const entry = update.entry;
  const ref = getEntrySourceRef(entry);
  const resourcePath = getEntryResourcePath(entry);
  const resourceType = getEntryResourceType(entry);
  const originalSource = entry.sourceUrl || entry.source;
  let sourceUrl = originalSource;
  if (entry.sourceType === 'github' && ref) {
    const parsedSource = parseSource(originalSource);
    sourceUrl = stripGitSuffix(parsedSource.url);
    if (resourceType === 'rule') {
      const basePath = getRuleBasePath(resourcePath);
      sourceUrl = buildGithubTreeUrl(sourceUrl, ref, basePath);
    } else {
      const basePath = getSkillBasePath(resourcePath);
      sourceUrl = buildGithubTreeUrl(sourceUrl, ref, basePath);
    }
  }

  const args = ['add', sourceUrl];
  if (resourceType === 'rule') {
    args.push('--rule', '--skill', getRuleName(resourcePath) || update.name);
  }
  const targetTypes = getEntryTargetTypes(entry);
  if (targetTypes.length > 0) {
    args.push('--agent', ...targetTypes);
  }
  if (update.scope === 'global') {
    args.push('-g');
  }
  args.push('-y');

  return { sourceUrl, args };
}

function parseUpdateScopeArg(args: string[]): UpdateScope | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--scope') {
      const value = args[i + 1];
      if (value === 'project' || value === 'global' || value === 'all') {
        return value;
      }
      console.error(`Invalid value for --scope: ${value ?? '(missing)'}`);
      console.error('Expected one of: project, global, all');
      process.exit(1);
    }
  }

  return null;
}

async function promptForUpdateScope(): Promise<UpdateScope> {
  const scope = await p.select({
    message: 'Update scope',
    options: [
      { value: 'all', label: 'All', hint: 'project + global' },
      { value: 'project', label: 'Project', hint: 'current directory only' },
      { value: 'global', label: 'Global', hint: 'globally installed only' },
    ],
  });

  if (p.isCancel(scope)) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  return scope as UpdateScope;
}

async function resolveUpdateScope(args: string[]): Promise<UpdateScope> {
  const explicitScope = parseUpdateScopeArg(args);
  if (explicitScope) {
    return explicitScope;
  }
  if (!process.stdin.isTTY) {
    return 'all';
  }
  return promptForUpdateScope();
}

async function computeTrackedResourceHashFromClone(
  repoDir: string,
  entry: GlobalSkillLockEntry | LocalSkillLockEntry
): Promise<string | null> {
  const resourcePath = getEntryResourcePath(entry).replace(/^\/+/, '');
  if (!resourcePath) {
    return null;
  }

  try {
    if (getEntryResourceType(entry) === 'rule') {
      const content = await readFile(join(repoDir, resourcePath), 'utf-8');
      return computeContentHash(content);
    }

    const skillBasePath = getSkillBasePath(resourcePath);
    const skillDir = skillBasePath ? join(repoDir, skillBasePath) : repoDir;
    return await computeSkillFolderHash(skillDir);
  } catch {
    return null;
  }
}

async function computeInstalledResourceHash(update: TrackedUpdateEntry): Promise<string | null> {
  const resourceType = getEntryResourceType(update.entry);
  const isGlobal = update.scope === 'global';
  const candidatePaths: string[] = [];

  try {
    candidatePaths.push(getCanonicalPath(update.name, { global: isGlobal, resourceType }));
  } catch {
    // Ignore invalid path construction and try agent-specific locations instead.
  }

  for (const targetType of getEntryTargetTypes(update.entry)) {
    try {
      const installPath = getInstallPath(update.name, targetType as AgentType, {
        global: isGlobal,
        resourceType,
      });
      if (!candidatePaths.includes(installPath)) {
        candidatePaths.push(installPath);
      }
    } catch {
      // Ignore unsupported agent/resource combinations.
    }
  }

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) {
      continue;
    }

    try {
      if (resourceType === 'rule') {
        const content = await readFile(candidatePath, 'utf-8');
        return computeContentHash(content);
      }
      return await computeSkillFolderHash(candidatePath);
    } catch {
      // Try the next candidate path.
    }
  }

  return null;
}

function shouldUseLegacyGithubHash(update: TrackedUpdateEntry): boolean {
  const storedHash = getEntryStoredHash(update.entry);
  return (
    update.scope === 'global' &&
    update.entry.sourceType === 'github' &&
    getEntryResourceType(update.entry) === 'skill' &&
    SHA1_HEX_RE.test(storedHash) &&
    !isSha256Hash(storedHash)
  );
}

export async function detectTrackedUpdates(trackedEntries: TrackedUpdateEntry[]): Promise<{
  updates: TrackedUpdateEntry[];
  skipped: SkippedSkill[];
  errors: Array<{ name: string; source: string; error: string }>;
}> {
  const token = getGitHubToken();
  const updates: TrackedUpdateEntry[] = [];
  const skipped: SkippedSkill[] = [];
  const errors: Array<{ name: string; source: string; error: string }> = [];

  const cloneCache = new Map<string, Promise<string>>();
  const tempDirs = new Set<string>();

  const getCachedCloneDir = (sourceUrl: string, ref: string): Promise<string> => {
    const key = `${sourceUrl}#${ref || 'HEAD'}`;
    if (!cloneCache.has(key)) {
      cloneCache.set(
        key,
        cloneRepo(sourceUrl, ref || undefined).then((dir) => {
          tempDirs.add(dir);
          return dir;
        })
      );
    }
    return cloneCache.get(key)!;
  };

  try {
    for (const tracked of trackedEntries) {
      const { name, entry } = tracked;
      const resourcePath = getEntryResourcePath(entry);
      const sourceUrl = entry.sourceUrl || entry.source;
      const source = getDisplaySource(entry);
      let storedHash = getEntryStoredHash(entry);

      if (!storedHash) {
        storedHash = await computeInstalledResourceHash(tracked);
      }

      if (!isGitBackedSourceType(entry.sourceType) || !storedHash || !resourcePath) {
        skipped.push({
          name,
          reason: getSkipReason(entry),
          sourceUrl: buildUpdateInstallInvocation(tracked).sourceUrl,
          command: `npx skillsandruless ${buildUpdateInstallInvocation(tracked).args.join(' ')}`,
        });
        continue;
      }

      if (isPinnedRef(getEntrySourceRef(entry))) {
        skipped.push({
          name,
          reason: getSkipReason(entry),
          sourceUrl: buildUpdateInstallInvocation(tracked).sourceUrl,
          command: `npx skillsandruless ${buildUpdateInstallInvocation(tracked).args.join(' ')}`,
        });
        continue;
      }

      try {
        let latestHash: string | null = null;

        if (shouldUseLegacyGithubHash(tracked)) {
          const ownerRepo =
            getOwnerRepo(parseSource(sourceUrl || entry.source)) || entry.source || sourceUrl;
          latestHash =
            getEntryResourceType(entry) === 'rule'
              ? await fetchRuleFileHash(ownerRepo, resourcePath, token, getEntrySourceRef(entry))
              : await fetchSkillFolderHash(
                  ownerRepo,
                  resourcePath,
                  token,
                  getEntrySourceRef(entry)
                );
        } else {
          const repoDir = await getCachedCloneDir(sourceUrl, getEntrySourceRef(entry));
          latestHash = await computeTrackedResourceHashFromClone(repoDir, entry);
        }

        if (!latestHash) {
          errors.push({ name, source, error: 'Could not inspect tracked resource' });
          continue;
        }

        if (latestHash !== storedHash) {
          updates.push(tracked);
        }
      } catch (err) {
        errors.push({
          name,
          source,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  } finally {
    await Promise.all(
      [...tempDirs].map(async (dir) => {
        try {
          await cleanupTempDir(dir);
        } catch {
          // Ignore cleanup failures after inspection
        }
      })
    );
  }

  return { updates, skipped, errors };
}

async function runCheck(args: string[] = []): Promise<void> {
  console.log(`${TEXT}Checking for tracked resource updates...${RESET}`);
  console.log();

  const scope = await resolveUpdateScope(args);
  const trackedEntries = await collectTrackedUpdateEntries(process.cwd(), scope);

  if (trackedEntries.length === 0) {
    console.log(`${DIM}No tracked resources in lock files.${RESET}`);
    console.log(
      `${DIM}Install resources with${RESET} ${TEXT}npx skillsandruless add <package>${RESET}`
    );
    return;
  }

  const { updates, skipped, errors } = await detectTrackedUpdates(trackedEntries);

  console.log();

  if (updates.length === 0) {
    console.log(`${TEXT}✓ All tracked resources are up to date${RESET}`);
  } else {
    console.log(`${TEXT}${updates.length} update(s) available:${RESET}`);
    console.log();
    for (const update of updates) {
      console.log(`  ${TEXT}↑${RESET} ${update.name}`);
      console.log(`    ${DIM}source: ${getDisplaySource(update.entry)}${RESET}`);
    }
    console.log();
    console.log(
      `${DIM}Run${RESET} ${TEXT}npx skillsandruless update${RESET} ${DIM}to update all tracked resources${RESET}`
    );
  }

  if (errors.length > 0) {
    console.log();
    console.log(`${DIM}Could not check ${errors.length} resource(s) (may need reinstall)${RESET}`);
    console.log();
    for (const error of errors) {
      console.log(`  ${DIM}✗${RESET} ${error.name}`);
      console.log(`    ${DIM}source: ${error.source}${RESET}`);
    }
  }

  printSkippedSkills(skipped);

  // Track telemetry
  track({
    event: 'check',
    skillCount: String(trackedEntries.length - skipped.length),
    updatesAvailable: String(updates.length),
  });

  console.log();
}

async function runUpdate(args: string[] = []): Promise<void> {
  console.log(`${TEXT}Checking for tracked resource updates...${RESET}`);
  console.log();

  const scope = await resolveUpdateScope(args);
  const trackedEntries = await collectTrackedUpdateEntries(process.cwd(), scope);

  if (trackedEntries.length === 0) {
    console.log(`${DIM}No tracked resources in lock files.${RESET}`);
    console.log(
      `${DIM}Install resources with${RESET} ${TEXT}npx skillsandruless add <package>${RESET}`
    );
    return;
  }

  const { updates, skipped, errors } = await detectTrackedUpdates(trackedEntries);

  const checkedCount = trackedEntries.length - skipped.length;

  if (checkedCount === 0) {
    console.log(`${DIM}No tracked resources to check.${RESET}`);
    printSkippedSkills(skipped);
    return;
  }

  if (updates.length === 0) {
    console.log(`${TEXT}✓ All tracked resources are up to date${RESET}`);
    if (errors.length > 0) {
      console.log();
      console.log(`${DIM}Could not check ${errors.length} resource(s)${RESET}`);
    }
    console.log();
    return;
  }

  console.log(`${TEXT}Found ${updates.length} update(s)${RESET}`);
  console.log();

  // Reinstall each skill that has an update
  let successCount = 0;
  let failCount = 0;

  for (const update of updates) {
    console.log(`${TEXT}Updating ${update.name}...${RESET}`);
    const { args: installArgs } = buildUpdateInstallInvocation(update);

    // Reinstall using the current CLI entrypoint directly (avoid nested npm exec/npx)
    const cliEntry = join(__dirname, '..', 'bin', 'cli.js');
    if (!existsSync(cliEntry)) {
      failCount++;
      console.log(
        `  ${DIM}✗ Failed to update ${update.name}: CLI entrypoint not found at ${cliEntry}${RESET}`
      );
      continue;
    }
    const result = spawnSync(process.execPath, [cliEntry, ...installArgs], {
      stdio: ['inherit', 'pipe', 'pipe'],
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    });

    if (result.status === 0) {
      successCount++;
      console.log(`  ${TEXT}✓${RESET} Updated ${update.name}`);
    } else {
      failCount++;
      console.log(`  ${DIM}✗ Failed to update ${update.name}${RESET}`);
    }
  }

  console.log();
  if (successCount > 0) {
    console.log(`${TEXT}✓ Updated ${successCount} skill(s)${RESET}`);
  }
  if (failCount > 0) {
    console.log(`${DIM}Failed to update ${failCount} skill(s)${RESET}`);
  }

  // Track telemetry
  track({
    event: 'update',
    skillCount: String(updates.length),
    successCount: String(successCount),
    failCount: String(failCount),
  });

  console.log();
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showBanner();
    return;
  }

  const command = args[0];
  const restArgs = args.slice(1);

  switch (command) {
    case 'find':
    case 'search':
    case 'f':
    case 's':
      showLogo();
      console.log();
      await runFind(restArgs);
      break;
    case 'init':
      showLogo();
      console.log();
      runInit(restArgs);
      break;
    case 'experimental_install': {
      showLogo();
      await runInstallFromLock(restArgs);
      break;
    }
    case 'i':
    case 'install':
    case 'a':
    case 'add': {
      showLogo();
      const { source: addSource, options: addOpts } = parseAddOptions(restArgs);
      await runAdd(addSource, addOpts);
      break;
    }
    case 'remove':
    case 'rm':
    case 'r':
      // Check for --help or -h flag
      if (restArgs.includes('--help') || restArgs.includes('-h')) {
        showRemoveHelp();
        break;
      }
      const { skills, options: removeOptions } = parseRemoveOptions(restArgs);
      await removeCommand(skills, removeOptions);
      break;
    case 'experimental_sync': {
      showLogo();
      const { options: syncOptions } = parseSyncOptions(restArgs);
      await runSync(restArgs, syncOptions);
      break;
    }
    case 'list':
    case 'ls':
      await runList(restArgs);
      break;
    case 'check':
      await runCheck(restArgs);
      break;
    case 'update':
    case 'upgrade':
      await runUpdate(restArgs);
      break;
    case '--help':
    case '-h':
      showHelp();
      break;
    case '--version':
    case '-v':
      console.log(VERSION);
      break;

    default:
      console.log(`Unknown command: ${command}`);
      console.log(`Run ${BOLD}skillsandruless --help${RESET} for usage.`);
  }
}

export { main };

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
