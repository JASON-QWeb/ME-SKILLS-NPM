import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readdir, rm, lstat } from 'fs/promises';
import { join } from 'path';
import { agents, detectInstalledAgents, getAgentsSupportingResource } from './agents.ts';
import { track } from './telemetry.ts';
import { removeSkillFromLock, getSkillFromLock } from './skill-lock.ts';
import { removeSkillFromLocalLock } from './local-lock.ts';
import type { AgentType, ResourceType } from './types.ts';
import {
  getInstallPath,
  getCanonicalPath,
  getCanonicalResourceDir,
  getCanonicalSkillsDir,
  listInstalledSkills,
  sanitizeName,
  type InstalledSkill,
} from './installer.ts';

export interface RemoveOptions {
  global?: boolean;
  agent?: string[];
  yes?: boolean;
  all?: boolean;
  resourceType?: ResourceType;
}

interface RemovableResource extends InstalledSkill {
  resourceType: ResourceType;
}

function validateAgentNames(agentNames?: string[]): void {
  if (!agentNames || agentNames.length === 0) {
    return;
  }

  const validAgents = Object.keys(agents);
  const invalidAgents = agentNames.filter((agent) => !validAgents.includes(agent));
  if (invalidAgents.length > 0) {
    p.log.error(`Invalid agents: ${invalidAgents.join(', ')}`);
    p.log.info(`Valid agents: ${validAgents.join(', ')}`);
    process.exit(1);
  }
}

function validateRuleAgents(agentNames?: string[]): void {
  validateAgentNames(agentNames);

  if (!agentNames || agentNames.length === 0) {
    return;
  }

  const supportedAgents = getAgentsSupportingResource('rule');
  const unsupportedAgents = agentNames.filter(
    (agent) => !agents[agent as AgentType].resources.rule
  );
  if (unsupportedAgents.length > 0) {
    p.log.error(`Unsupported agents for rule removal: ${unsupportedAgents.join(', ')}`);
    p.log.info(`Supported agents: ${supportedAgents.join(', ')}`);
    process.exit(1);
  }
}

async function removeSelectedRules(
  selectedRules: string[],
  options: RemoveOptions
): Promise<Array<{ name: string; success: boolean; error?: string }>> {
  const isGlobal = options.global ?? false;
  const cwd = process.cwd();
  const supportedAgents = getAgentsSupportingResource('rule');
  const targetAgents = options.agent
    ? (options.agent.filter((agent) => agents[agent as AgentType].resources.rule) as AgentType[])
    : supportedAgents;

  const results: Array<{ name: string; success: boolean; error?: string }> = [];

  for (const ruleName of selectedRules) {
    try {
      const canonicalPath = getCanonicalPath(ruleName, {
        global: isGlobal,
        cwd,
        resourceType: 'rule',
      });
      await rm(canonicalPath, { force: true });

      for (const agentKey of targetAgents) {
        const installPath = getInstallPath(ruleName, agentKey, {
          global: isGlobal,
          cwd,
          resourceType: 'rule',
        });
        await rm(installPath, { force: true });
      }

      if (isGlobal) {
        await removeSkillFromLock(ruleName, 'rule');
      } else {
        await removeSkillFromLocalLock(ruleName, cwd, 'rule');
      }

      results.push({ name: ruleName, success: true });
    } catch (error) {
      results.push({
        name: ruleName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

async function removeSelectedSkills(
  selectedSkills: string[],
  options: RemoveOptions
): Promise<
  Array<{ name: string; success: boolean; source?: string; sourceType?: string; error?: string }>
> {
  const isGlobal = options.global ?? false;
  const cwd = process.cwd();
  const targetAgents = options.agent
    ? (options.agent as AgentType[])
    : (Object.keys(agents) as AgentType[]);

  const results: Array<{
    name: string;
    success: boolean;
    source?: string;
    sourceType?: string;
    error?: string;
  }> = [];

  for (const skillName of selectedSkills) {
    try {
      const canonicalPath = getCanonicalPath(skillName, { global: isGlobal, cwd });

      for (const agentKey of targetAgents) {
        const agent = agents[agentKey];
        const skillPath = getInstallPath(skillName, agentKey, { global: isGlobal, cwd });

        const pathsToCleanup = new Set([skillPath]);
        const sanitizedName = sanitizeName(skillName);
        if (isGlobal && agent.globalSkillsDir) {
          pathsToCleanup.add(join(agent.globalSkillsDir, sanitizedName));
        } else {
          pathsToCleanup.add(join(cwd, agent.skillsDir, sanitizedName));
        }

        for (const pathToCleanup of pathsToCleanup) {
          if (pathToCleanup === canonicalPath) {
            continue;
          }

          try {
            const stats = await lstat(pathToCleanup).catch(() => null);
            if (stats) {
              await rm(pathToCleanup, { recursive: true, force: true });
            }
          } catch (err) {
            p.log.warn(
              `Could not remove skill from ${agent.displayName}: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }
      }

      const installedAgents = await detectInstalledAgents();
      const remainingAgents = installedAgents.filter((a) => !targetAgents.includes(a));

      let isStillUsed = false;
      for (const agentKey of remainingAgents) {
        const path = getInstallPath(skillName, agentKey, { global: isGlobal, cwd });
        const exists = await lstat(path).catch(() => null);
        if (exists) {
          isStillUsed = true;
          break;
        }
      }

      if (!isStillUsed) {
        await rm(canonicalPath, { recursive: true, force: true });
      }

      const lockEntry = isGlobal ? await getSkillFromLock(skillName) : null;
      const effectiveSource = lockEntry?.source || 'local';
      const effectiveSourceType = lockEntry?.sourceType || 'local';

      if (isGlobal) {
        await removeSkillFromLock(skillName);
      } else {
        await removeSkillFromLocalLock(skillName, cwd, 'skill');
      }

      results.push({
        name: skillName,
        success: true,
        source: effectiveSource,
        sourceType: effectiveSourceType,
      });
    } catch (error) {
      results.push({
        name: skillName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const successful = results.filter((result) => result.success);
  if (successful.length > 0) {
    const bySource = new Map<string, { skills: string[]; sourceType?: string }>();

    for (const result of successful) {
      const source = result.source || 'local';
      const existing = bySource.get(source) || { skills: [] };
      existing.skills.push(result.name);
      existing.sourceType = result.sourceType;
      bySource.set(source, existing);
    }

    for (const [source, data] of bySource) {
      track({
        event: 'remove',
        source,
        skills: data.skills.join(','),
        agents: targetAgents.join(','),
        ...(isGlobal && { global: '1' }),
        sourceType: data.sourceType,
      });
    }
  }

  return results;
}

async function removeMixedCommand(skillNames: string[], options: RemoveOptions): Promise<void> {
  validateAgentNames(options.agent);

  const isGlobal = options.global ?? false;
  const cwd = process.cwd();
  const agentFilter = options.agent as AgentType[] | undefined;

  const [skills, rules] = await Promise.all([
    listInstalledSkills({ global: isGlobal, cwd, agentFilter }),
    listInstalledSkills({ global: isGlobal, cwd, agentFilter, resourceType: 'rule' }),
  ]);

  const resources: RemovableResource[] = [
    ...skills.map((resource) => ({ ...resource, resourceType: 'skill' as const })),
    ...rules.map((resource) => ({ ...resource, resourceType: 'rule' as const })),
  ].sort((a, b) =>
    a.name === b.name ? a.resourceType.localeCompare(b.resourceType) : a.name.localeCompare(b.name)
  );

  if (resources.length === 0) {
    p.outro(pc.yellow('No skills or rules found to remove.'));
    return;
  }

  let selectedResources: RemovableResource[] = [];
  if (options.all) {
    selectedResources = resources;
  } else {
    if (skillNames.length > 0) {
      p.log.info(
        'Ignoring positional names without --skill or --rule; using interactive selection.'
      );
    }

    if (!process.stdin.isTTY) {
      p.log.error('Interactive mixed removal requires a TTY. Use --all, --skill, or --rule.');
      process.exit(1);
    }

    const selected = await p.multiselect({
      message: `Select skills and rules to remove ${pc.dim('(space to toggle)')}`,
      options: resources.map((resource) => ({
        value: `${resource.resourceType}:${resource.name}`,
        label: `${resource.resourceType}: ${resource.name}`,
      })),
      required: true,
    });

    if (p.isCancel(selected)) {
      p.cancel('Removal cancelled');
      process.exit(0);
    }

    const selectedKeys = new Set(selected as string[]);
    selectedResources = resources.filter((resource) =>
      selectedKeys.has(`${resource.resourceType}:${resource.name}`)
    );
  }

  if (!options.yes) {
    console.log();
    p.log.info('Resources to remove:');
    for (const resource of selectedResources) {
      p.log.message(`  ${pc.red('•')} ${resource.resourceType}: ${resource.name}`);
    }
    console.log();

    const confirmed = await p.confirm({
      message: `Are you sure you want to uninstall ${selectedResources.length} resource(s)?`,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Removal cancelled');
      process.exit(0);
    }
  }

  const selectedSkills = selectedResources
    .filter((resource) => resource.resourceType === 'skill')
    .map((resource) => resource.name);
  const selectedRules = selectedResources
    .filter((resource) => resource.resourceType === 'rule')
    .map((resource) => resource.name);

  const [skillResults, ruleResults] = await Promise.all([
    selectedSkills.length > 0 ? removeSelectedSkills(selectedSkills, options) : Promise.resolve([]),
    selectedRules.length > 0 ? removeSelectedRules(selectedRules, options) : Promise.resolve([]),
  ]);

  const failedSkills = skillResults.filter((result) => !result.success);
  const failedRules = ruleResults.filter((result) => !result.success);
  const successCount =
    skillResults.length - failedSkills.length + (ruleResults.length - failedRules.length);

  if (successCount > 0) {
    p.log.success(pc.green(`Successfully removed ${successCount} resource(s)`));
  }

  if (failedSkills.length + failedRules.length > 0) {
    p.log.error(pc.red(`Failed to remove ${failedSkills.length + failedRules.length} resource(s)`));
    for (const result of failedSkills) {
      p.log.message(`  ${pc.red('✗')} skill: ${result.name}: ${result.error}`);
    }
    for (const result of failedRules) {
      p.log.message(`  ${pc.red('✗')} rule: ${result.name}: ${result.error}`);
    }
  }

  console.log();
  p.outro(pc.green('Done!'));
}

async function removeRuleCommand(ruleNames: string[], options: RemoveOptions): Promise<void> {
  const isGlobal = options.global ?? false;
  const cwd = process.cwd();
  const spinner = p.spinner();
  const supportedAgents = getAgentsSupportingResource('rule');

  spinner.start('Scanning for installed rules...');
  const ruleNamesSet = new Set<string>();

  const scanDir = async (dir: string) => {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          ruleNamesSet.add(entry.name.replace(/\.md$/, ''));
        }
      }
    } catch (err) {
      if (err instanceof Error && (err as { code?: string }).code !== 'ENOENT') {
        p.log.warn(`Could not scan directory ${dir}: ${err.message}`);
      }
    }
  };

  if (isGlobal) {
    await scanDir(getCanonicalResourceDir(true, cwd, 'rule'));
    for (const agent of supportedAgents) {
      const globalDir = agents[agent].resources.rule?.globalDir;
      if (globalDir) {
        await scanDir(globalDir);
      }
    }
  } else {
    await scanDir(getCanonicalResourceDir(false, cwd, 'rule'));
    for (const agent of supportedAgents) {
      await scanDir(join(cwd, agents[agent].resources.rule!.projectDir));
    }
  }

  const installedRules = Array.from(ruleNamesSet).sort();
  spinner.stop(`Found ${installedRules.length} unique installed rule(s)`);

  if (installedRules.length === 0) {
    p.outro(pc.yellow('No rules found to remove.'));
    return;
  }

  validateRuleAgents(options.agent);

  let selectedRules: string[] = [];
  if (options.all) {
    selectedRules = installedRules;
  } else if (ruleNames.length > 0) {
    selectedRules = installedRules.filter((rule) =>
      ruleNames.some((name) => name.toLowerCase() === rule.toLowerCase())
    );

    if (selectedRules.length === 0) {
      p.log.error(`No matching rules found for: ${ruleNames.join(', ')}`);
      return;
    }
  } else {
    const choices = installedRules.map((rule) => ({ value: rule, label: rule }));
    const selected = await p.multiselect({
      message: `Select rules to remove ${pc.dim('(space to toggle)')}`,
      options: choices,
      required: true,
    });

    if (p.isCancel(selected)) {
      p.cancel('Removal cancelled');
      process.exit(0);
    }

    selectedRules = selected as string[];
  }

  let targetAgents: AgentType[];
  if (options.agent && options.agent.length > 0) {
    targetAgents = options.agent as AgentType[];
  } else {
    targetAgents = supportedAgents;
    spinner.stop(`Targeting ${targetAgents.length} potential agent(s)`);
  }

  if (!options.yes) {
    console.log();
    p.log.info('Rules to remove:');
    for (const rule of selectedRules) {
      p.log.message(`  ${pc.red('•')} ${rule}`);
    }
    console.log();

    const confirmed = await p.confirm({
      message: `Are you sure you want to uninstall ${selectedRules.length} rule(s)?`,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Removal cancelled');
      process.exit(0);
    }
  }

  spinner.start('Removing rules...');
  const results = await removeSelectedRules(selectedRules, options);
  const successCount = results.filter((result) => result.success).length;
  const failed = results.filter((result) => !result.success);

  spinner.stop('Removal process complete');
  p.log.success(pc.green(`Successfully removed ${successCount} rule(s)`));
  if (failed.length > 0) {
    p.log.error(pc.red(`Failed to remove ${failed.length} rule(s)`));
    for (const result of failed) {
      p.log.message(`  ${pc.red('✗')} ${result.name}: ${result.error}`);
    }
  }
  console.log();
  p.outro(pc.green('Done!'));
}

async function removeSkillCommand(skillNames: string[], options: RemoveOptions): Promise<void> {
  const isGlobal = options.global ?? false;
  const cwd = process.cwd();

  const spinner = p.spinner();

  spinner.start('Scanning for installed skills...');
  const skillNamesSet = new Set<string>();

  const scanDir = async (dir: string) => {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          skillNamesSet.add(entry.name);
        }
      }
    } catch (err) {
      if (err instanceof Error && (err as { code?: string }).code !== 'ENOENT') {
        p.log.warn(`Could not scan directory ${dir}: ${err.message}`);
      }
    }
  };

  if (isGlobal) {
    await scanDir(getCanonicalSkillsDir(true, cwd));
    for (const agent of Object.values(agents)) {
      if (agent.globalSkillsDir !== undefined) {
        await scanDir(agent.globalSkillsDir);
      }
    }
  } else {
    await scanDir(getCanonicalSkillsDir(false, cwd));
    for (const agent of Object.values(agents)) {
      await scanDir(join(cwd, agent.skillsDir));
    }
  }

  const installedSkills = Array.from(skillNamesSet).sort();
  spinner.stop(`Found ${installedSkills.length} unique installed skill(s)`);

  if (installedSkills.length === 0) {
    p.outro(pc.yellow('No skills found to remove.'));
    return;
  }

  validateAgentNames(options.agent);

  let selectedSkills: string[] = [];

  if (options.all) {
    selectedSkills = installedSkills;
  } else if (skillNames.length > 0) {
    if (skillNames.includes('*')) {
      selectedSkills = installedSkills;
    } else {
      selectedSkills = installedSkills.filter((s) =>
        skillNames.some((name) => name.toLowerCase() === s.toLowerCase())
      );

      if (selectedSkills.length === 0) {
        p.log.error(`No matching skills found for: ${skillNames.join(', ')}`);
        return;
      }
    }
  } else {
    const choices = installedSkills.map((s) => ({
      value: s,
      label: s,
    }));

    const selected = await p.multiselect({
      message: `Select skills to remove ${pc.dim('(space to toggle)')}`,
      options: choices,
      required: true,
    });

    if (p.isCancel(selected)) {
      p.cancel('Removal cancelled');
      process.exit(0);
    }

    selectedSkills = selected as string[];
  }

  let targetAgents: AgentType[];
  if (options.agent && options.agent.length > 0) {
    targetAgents = options.agent as AgentType[];
  } else {
    targetAgents = Object.keys(agents) as AgentType[];
    spinner.stop(`Targeting ${targetAgents.length} potential agent(s)`);
  }

  if (!options.yes) {
    console.log();
    p.log.info('Skills to remove:');
    for (const skill of selectedSkills) {
      p.log.message(`  ${pc.red('•')} ${skill}`);
    }
    console.log();

    const confirmed = await p.confirm({
      message: `Are you sure you want to uninstall ${selectedSkills.length} skill(s)?`,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Removal cancelled');
      process.exit(0);
    }
  }

  spinner.start('Removing skills...');
  const results = await removeSelectedSkills(selectedSkills, options);
  spinner.stop('Removal process complete');

  const successful = results.filter((result) => result.success);
  const failed = results.filter((result) => !result.success);

  if (successful.length > 0) {
    p.log.success(pc.green(`Successfully removed ${successful.length} skill(s)`));
  }

  if (failed.length > 0) {
    p.log.error(pc.red(`Failed to remove ${failed.length} skill(s)`));
    for (const result of failed) {
      p.log.message(`  ${pc.red('✗')} ${result.name}: ${result.error}`);
    }
  }

  console.log();
  p.outro(pc.green('Done!'));
}

export async function removeCommand(skillNames: string[], options: RemoveOptions) {
  if (!options.resourceType) {
    await removeMixedCommand(skillNames, options);
    return;
  }
  if (options.resourceType === 'rule') {
    await removeRuleCommand(skillNames, options);
    return;
  }
  await removeSkillCommand(skillNames, options);
}

/**
 * Parse command line options for the remove command.
 * Separates skill names from options flags.
 */
export function parseRemoveOptions(args: string[]): { skills: string[]; options: RemoveOptions } {
  const options: RemoveOptions = {};
  const skills: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-g' || arg === '--global') {
      options.global = true;
    } else if (arg === '-y' || arg === '--yes') {
      options.yes = true;
    } else if (arg === '--rules' || arg === '--rule') {
      options.resourceType = 'rule';
      i++;
      let nextArg = args[i];
      while (i < args.length && nextArg && !nextArg.startsWith('-')) {
        skills.push(nextArg);
        i++;
        nextArg = args[i];
      }
      i--;
    } else if (arg === '-s' || arg === '--skill' || arg === '--skills') {
      options.resourceType = 'skill';
      i++;
      let nextArg = args[i];
      while (i < args.length && nextArg && !nextArg.startsWith('-')) {
        skills.push(nextArg);
        i++;
        nextArg = args[i];
      }
      i--; // Back up one since the loop will increment
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '-a' || arg === '--agent') {
      options.agent = options.agent || [];
      i++;
      let nextArg = args[i];
      while (i < args.length && nextArg && !nextArg.startsWith('-')) {
        options.agent.push(nextArg);
        i++;
        nextArg = args[i];
      }
      i--; // Back up one since the loop will increment
    } else if (arg && !arg.startsWith('-')) {
      skills.push(arg);
    }
  }

  return { skills, options };
}
