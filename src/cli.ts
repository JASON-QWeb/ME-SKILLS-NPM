#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { basename, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runAdd, parseAddOptions, initTelemetry } from './add.ts';
import { runFind } from './find.ts';
import { runInstallFromLock } from './install.ts';
import { runList } from './list.ts';
import { removeCommand, parseRemoveOptions } from './remove.ts';
import { runSync, parseSyncOptions } from './sync.ts';
import { track } from './telemetry.ts';
import { parseSource, getOwnerRepo } from './source-parser.ts';
import {
  fetchSkillFolderHash,
  fetchRuleFileHash,
  getGitHubToken,
  parseLockResourceKey,
  readSkillLock as readGlobalSkillLock,
  type SkillLockEntry as GlobalSkillLockEntry,
} from './skill-lock.ts';
import { readLocalLock, type LocalSkillLockEntry } from './local-lock.ts';
import type { ResourceType } from './types.ts';

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
    `  ${DIM}$${RESET} ${TEXT}npx skillsandruless remove${RESET}               ${DIM}Remove installed skills${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}npx skillsandruless list${RESET}                 ${DIM}List installed skills${RESET}`
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
  remove [skills]      Remove installed skills
  list, ls             List installed skills
  find [query]         Search for skills interactively

${BOLD}Updates:${RESET}
  check                Check for available skill updates
  update               Update all skills to latest versions

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
  --rule                 Operate on rule resources
  -y, --yes              Skip confirmation prompts
  --all                  Shorthand for --skill '*' --agent '*' -y
  
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
  ${DIM}$${RESET} skillsandruless remove                        ${DIM}# interactive remove${RESET}
  ${DIM}$${RESET} skillsandruless remove web-design             ${DIM}# remove by name${RESET}
  ${DIM}$${RESET} skillsandruless rm --global frontend-design
  ${DIM}$${RESET} skillsandruless list                          ${DIM}# list project skills${RESET}
  ${DIM}$${RESET} skillsandruless ls -g                         ${DIM}# list global skills${RESET}
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
${BOLD}Usage:${RESET} skillsandruless remove [skills...] [options]

${BOLD}Description:${RESET}
  Remove installed skills from agents. If no skill names are provided,
  an interactive selection menu will be shown.

${BOLD}Arguments:${RESET}
  skills            Optional skill names to remove (space-separated)

${BOLD}Options:${RESET}
  -g, --global       Remove from global scope (~/) instead of project scope
  -a, --agent        Remove from specific agents (use '*' for all agents)
  -s, --skill        Specify skills to remove (use '*' for all skills)
  --rule             Remove rule resources instead of skills
  -y, --yes          Skip confirmation prompts
  --all              Shorthand for --skill '*' --agent '*' -y

${BOLD}Examples:${RESET}
  ${DIM}$${RESET} skillsandruless remove                           ${DIM}# interactive selection${RESET}
  ${DIM}$${RESET} skillsandruless remove my-skill                   ${DIM}# remove specific skill${RESET}
  ${DIM}$${RESET} skillsandruless remove skill1 skill2 -y           ${DIM}# remove multiple skills${RESET}
  ${DIM}$${RESET} skillsandruless remove --global my-skill          ${DIM}# remove from global scope${RESET}
  ${DIM}$${RESET} skillsandruless rm --agent claude-code my-skill   ${DIM}# remove from specific agent${RESET}
  ${DIM}$${RESET} skillsandruless remove --all                      ${DIM}# remove all skills${RESET}
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

/**
 * Determine why a skill cannot be checked for updates automatically.
 */
function getSkipReason(entry: GlobalSkillLockEntry | LocalSkillLockEntry): string {
  const resourceType = entry.resourceType ?? 'skill';
  if (entry.sourceType === 'local') {
    return 'Local path';
  }
  if (entry.sourceType === 'git') {
    return 'Git URL (hash tracking not supported)';
  }
  if (!getEntryRemoteHash(entry as GlobalSkillLockEntry | LocalSkillLockEntry)) {
    return 'No version hash available';
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

function getEntrySourceRef(entry: GlobalSkillLockEntry | LocalSkillLockEntry): string {
  return entry.sourceRef || '';
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
  cwd: string = process.cwd()
): Promise<TrackedUpdateEntry[]> {
  const [globalLock, localLock] = await Promise.all([readGlobalSkillLock(), readLocalLock(cwd)]);

  const globalEntries = Object.entries(globalLock.skills).map(([key, entry]) => ({
    name: parseLockResourceKey(key, entry.resourceType).name,
    scope: 'global' as const,
    entry,
  }));
  const localEntries = Object.entries(localLock.skills).map(([key, entry]) => ({
    name: parseLockResourceKey(key, entry.resourceType).name,
    scope: 'project' as const,
    entry,
  }));

  return [...globalEntries, ...localEntries];
}

export function buildUpdateInstallInvocation(update: TrackedUpdateEntry): {
  sourceUrl: string;
  args: string[];
} {
  const entry = update.entry;
  const ref = getEntrySourceRef(entry) || 'main';
  const resourcePath = getEntryResourcePath(entry);
  const resourceType = getEntryResourceType(entry);

  const parsedSource = parseSource(entry.sourceUrl || entry.source);
  let sourceUrl = stripGitSuffix(parsedSource.url);
  if (entry.sourceType === 'github') {
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

async function runCheck(args: string[] = []): Promise<void> {
  console.log(`${TEXT}Checking for tracked resource updates...${RESET}`);
  console.log();

  const trackedEntries = await collectTrackedUpdateEntries(process.cwd());

  if (trackedEntries.length === 0) {
    console.log(`${DIM}No tracked resources in lock files.${RESET}`);
    console.log(
      `${DIM}Install resources with${RESET} ${TEXT}npx skillsandruless add <package>${RESET}`
    );
    return;
  }

  // Get GitHub token from user's environment for higher rate limits
  const token = getGitHubToken();

  const skipped: SkippedSkill[] = [];

  const updates: Array<{ name: string; source: string; scope: string }> = [];
  const errors: Array<{ name: string; source: string; error: string }> = [];

  for (const tracked of trackedEntries) {
    const { name, entry } = tracked;
    const resourcePath = getEntryResourcePath(entry);
    const remoteHash = getEntryRemoteHash(entry);
    const resourceType = getEntryResourceType(entry);
    const ownerRepo = getOwnerRepo(parseSource(entry.sourceUrl || entry.source)) || entry.source;

    if (entry.sourceType !== 'github' || !remoteHash || !resourcePath) {
      skipped.push({
        name,
        reason: getSkipReason(entry),
        sourceUrl: buildUpdateInstallInvocation(tracked).sourceUrl,
        command: `npx skillsandruless ${buildUpdateInstallInvocation(tracked).args.join(' ')}`,
      });
      continue;
    }

    try {
      const latestHash =
        resourceType === 'rule'
          ? await fetchRuleFileHash(ownerRepo, resourcePath, token, getEntrySourceRef(entry))
          : await fetchSkillFolderHash(ownerRepo, resourcePath, token, getEntrySourceRef(entry));

      if (!latestHash) {
        errors.push({ name, source: ownerRepo, error: 'Could not fetch from GitHub' });
        continue;
      }

      if (latestHash !== remoteHash) {
        updates.push({ name, source: ownerRepo, scope: tracked.scope });
      }
    } catch (err) {
      errors.push({
        name,
        source: ownerRepo,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  console.log();

  if (updates.length === 0) {
    console.log(`${TEXT}✓ All tracked resources are up to date${RESET}`);
  } else {
    console.log(`${TEXT}${updates.length} update(s) available:${RESET}`);
    console.log();
    for (const update of updates) {
      console.log(`  ${TEXT}↑${RESET} ${update.name}`);
      console.log(`    ${DIM}source: ${update.source}${RESET}`);
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

async function runUpdate(): Promise<void> {
  console.log(`${TEXT}Checking for tracked resource updates...${RESET}`);
  console.log();

  const trackedEntries = await collectTrackedUpdateEntries(process.cwd());

  if (trackedEntries.length === 0) {
    console.log(`${DIM}No tracked resources in lock files.${RESET}`);
    console.log(
      `${DIM}Install resources with${RESET} ${TEXT}npx skillsandruless add <package>${RESET}`
    );
    return;
  }

  // Get GitHub token from user's environment for higher rate limits
  const token = getGitHubToken();

  const updates: Array<TrackedUpdateEntry> = [];
  const skipped: SkippedSkill[] = [];

  for (const tracked of trackedEntries) {
    const { name, entry } = tracked;
    const resourcePath = getEntryResourcePath(entry);
    const remoteHash = getEntryRemoteHash(entry);
    const resourceType = getEntryResourceType(entry);
    const ownerRepo = getOwnerRepo(parseSource(entry.sourceUrl || entry.source)) || entry.source;

    if (entry.sourceType !== 'github' || !remoteHash || !resourcePath) {
      skipped.push({
        name,
        reason: getSkipReason(entry),
        sourceUrl: buildUpdateInstallInvocation(tracked).sourceUrl,
        command: `npx skillsandruless ${buildUpdateInstallInvocation(tracked).args.join(' ')}`,
      });
      continue;
    }

    try {
      const latestHash =
        resourceType === 'rule'
          ? await fetchRuleFileHash(ownerRepo, resourcePath, token, getEntrySourceRef(entry))
          : await fetchSkillFolderHash(ownerRepo, resourcePath, token, getEntrySourceRef(entry));

      if (latestHash && latestHash !== remoteHash) {
        updates.push(tracked);
      }
    } catch {
      // Skip resources that fail to check
    }
  }

  const checkedCount = trackedEntries.length - skipped.length;

  if (checkedCount === 0) {
    console.log(`${DIM}No tracked resources to check.${RESET}`);
    printSkippedSkills(skipped);
    return;
  }

  if (updates.length === 0) {
    console.log(`${TEXT}✓ All tracked resources are up to date${RESET}`);
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
      runCheck(restArgs);
      break;
    case 'update':
    case 'upgrade':
      runUpdate();
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
