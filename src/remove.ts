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
  sanitizeName,
} from './installer.ts';

export interface RemoveOptions {
  global?: boolean;
  agent?: string[];
  yes?: boolean;
  all?: boolean;
  resourceType?: ResourceType;
}

async function removeRuleCommand(ruleNames: string[], options: RemoveOptions): Promise<void> {
  const isGlobal = options.global ?? false;
  const cwd = process.cwd();
  const spinner = p.spinner();
  const supportedAgents = getAgentsSupportingResource('rule');
  const validAgents = Object.keys(agents);

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

  if (options.agent && options.agent.length > 0) {
    const invalidAgents = options.agent.filter((agent) => !validAgents.includes(agent));
    if (invalidAgents.length > 0) {
      p.log.error(`Invalid agents: ${invalidAgents.join(', ')}`);
      p.log.info(`Valid agents: ${validAgents.join(', ')}`);
      process.exit(1);
    }

    const unsupportedAgents = options.agent.filter(
      (agent) => !agents[agent as AgentType].resources.rule
    );
    if (unsupportedAgents.length > 0) {
      p.log.error(`Unsupported agents for rule removal: ${unsupportedAgents.join(', ')}`);
      p.log.info(`Supported agents: ${supportedAgents.join(', ')}`);
      process.exit(1);
    }
  }

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

  let successCount = 0;
  for (const ruleName of selectedRules) {
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

    successCount++;
  }

  spinner.stop('Removal process complete');
  p.log.success(pc.green(`Successfully removed ${successCount} rule(s)`));
  console.log();
  p.outro(pc.green('Done!'));
}

export async function removeCommand(skillNames: string[], options: RemoveOptions) {
  const resourceType = options.resourceType ?? 'skill';
  if (resourceType === 'rule') {
    await removeRuleCommand(skillNames, options);
    return;
  }

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

  // Validate agent options BEFORE prompting for skill selection
  if (options.agent && options.agent.length > 0) {
    const validAgents = Object.keys(agents);
    const invalidAgents = options.agent.filter((a) => !validAgents.includes(a));

    if (invalidAgents.length > 0) {
      p.log.error(`Invalid agents: ${invalidAgents.join(', ')}`);
      p.log.info(`Valid agents: ${validAgents.join(', ')}`);
      process.exit(1);
    }
  }

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
    // When removing, we should target all known agents to ensure
    // ghost symlinks are cleaned up, even if the agent is not detected.
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

  const results: {
    skill: string;
    success: boolean;
    source?: string;
    sourceType?: string;
    error?: string;
  }[] = [];

  for (const skillName of selectedSkills) {
    try {
      const canonicalPath = getCanonicalPath(skillName, { global: isGlobal, cwd });

      for (const agentKey of targetAgents) {
        const agent = agents[agentKey];
        const skillPath = getInstallPath(skillName, agentKey, { global: isGlobal, cwd });

        // Determine potential paths to cleanup. For universal agents, getInstallPath
        // now returns the canonical path, so we also need to check their 'native'
        // directory to clean up any legacy symlinks.
        const pathsToCleanup = new Set([skillPath]);
        const sanitizedName = sanitizeName(skillName);
        if (isGlobal && agent.globalSkillsDir) {
          pathsToCleanup.add(join(agent.globalSkillsDir, sanitizedName));
        } else {
          pathsToCleanup.add(join(cwd, agent.skillsDir, sanitizedName));
        }

        for (const pathToCleanup of pathsToCleanup) {
          // Skip if this is the canonical path - we'll handle that after checking all agents
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

      // Only remove the canonical path if no other installed agents are using it.
      // This prevents breaking other agents when uninstalling from a specific agent (#287).
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
      }

      results.push({
        skill: skillName,
        success: true,
        source: effectiveSource,
        sourceType: effectiveSourceType,
      });
    } catch (err) {
      results.push({
        skill: skillName,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  spinner.stop('Removal process complete');

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  // Track removal (grouped by source)
  if (successful.length > 0) {
    const bySource = new Map<string, { skills: string[]; sourceType?: string }>();

    for (const r of successful) {
      const source = r.source || 'local';
      const existing = bySource.get(source) || { skills: [] };
      existing.skills.push(r.skill);
      existing.sourceType = r.sourceType;
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

  if (successful.length > 0) {
    p.log.success(pc.green(`Successfully removed ${successful.length} skill(s)`));
  }

  if (failed.length > 0) {
    p.log.error(pc.red(`Failed to remove ${failed.length} skill(s)`));
    for (const r of failed) {
      p.log.message(`  ${pc.red('✗')} ${r.skill}: ${r.error}`);
    }
  }

  console.log();
  p.outro(pc.green('Done!'));
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
    } else if (arg === '--rule') {
      options.resourceType = 'rule';
    } else if (arg === '-s' || arg === '--skill') {
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
