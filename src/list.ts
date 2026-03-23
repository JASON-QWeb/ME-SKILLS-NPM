import { homedir } from 'os';
import type { AgentType, ResourceType } from './types.ts';
import { agents } from './agents.ts';
import { listInstalledSkills, type InstalledSkill } from './installer.ts';
import { buildLockResourceKey, getAllLockedSkills } from './skill-lock.ts';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[38;5;102m';
const TEXT = '\x1b[38;5;145m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';

interface ListOptions {
  global?: boolean;
  agent?: string[];
  json?: boolean;
  resourceType?: ResourceType;
}

interface ListedResource extends InstalledSkill {
  resourceType: ResourceType;
}

/**
 * Shortens a path for display: replaces homedir with ~ and cwd with .
 */
function shortenPath(fullPath: string, cwd: string): string {
  const home = homedir();
  if (fullPath.startsWith(home)) {
    return fullPath.replace(home, '~');
  }
  if (fullPath.startsWith(cwd)) {
    return '.' + fullPath.slice(cwd.length);
  }
  return fullPath;
}

/**
 * Formats a list of items, truncating if too many
 */
function formatList(items: string[], maxShow: number = 5): string {
  if (items.length <= maxShow) {
    return items.join(', ');
  }
  const shown = items.slice(0, maxShow);
  const remaining = items.length - maxShow;
  return `${shown.join(', ')} +${remaining} more`;
}

export function parseListOptions(args: string[]): ListOptions {
  const options: ListOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-g' || arg === '--global') {
      options.global = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--rule' || arg === '--rules') {
      options.resourceType = 'rule';
    } else if (arg === '-s' || arg === '--skill' || arg === '--skills') {
      options.resourceType = 'skill';
    } else if (arg === '-a' || arg === '--agent') {
      options.agent = options.agent || [];
      // Collect all following arguments until next flag
      while (i + 1 < args.length && !args[i + 1]!.startsWith('-')) {
        options.agent.push(args[++i]!);
      }
    }
  }

  return options;
}

function getRequestedResourceTypes(options: ListOptions): ResourceType[] {
  return options.resourceType ? [options.resourceType] : ['skill', 'rule'];
}

export async function runList(args: string[]): Promise<void> {
  const options = parseListOptions(args);
  const resourceTypes = getRequestedResourceTypes(options);

  // Default to project only (local), use -g for global
  const scope = options.global === true ? true : false;

  // Validate agent filter if provided
  let agentFilter: AgentType[] | undefined;
  if (options.agent && options.agent.length > 0) {
    const validAgents = Object.keys(agents);
    const invalidAgents = options.agent.filter((a) => !validAgents.includes(a));

    if (invalidAgents.length > 0) {
      console.log(`${YELLOW}Invalid agents: ${invalidAgents.join(', ')}${RESET}`);
      console.log(`${DIM}Valid agents: ${validAgents.join(', ')}${RESET}`);
      process.exit(1);
    }

    agentFilter = options.agent as AgentType[];
  }

  const installedResources: ListedResource[] = (
    await Promise.all(
      resourceTypes.map(async (resourceType) =>
        (
          await listInstalledSkills({
            global: scope,
            agentFilter,
            resourceType,
          })
        ).map((resource) => ({ ...resource, resourceType }))
      )
    )
  ).flat();

  // JSON output mode: structured, no ANSI, untruncated agent lists
  if (options.json) {
    const jsonOutput = installedResources.map((resource) => ({
      name: resource.name,
      resourceType: resource.resourceType,
      path: resource.canonicalPath,
      scope: resource.scope,
      agents: resource.agents.map((a) => agents[a].displayName),
    }));
    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  // Fetch lock entries to get plugin grouping info
  const lockedSkills = await getAllLockedSkills();

  const cwd = process.cwd();
  const scopeLabel = scope ? 'Global' : 'Project';

  if (installedResources.length === 0) {
    if (options.json) {
      console.log('[]');
      return;
    }
    const resourceLabel = resourceTypes.length === 1 ? `${resourceTypes[0]}s` : 'skills or rules';
    console.log(`${DIM}No ${scopeLabel.toLowerCase()} ${resourceLabel} found.${RESET}`);
    if (scope) {
      console.log(`${DIM}Try listing project ${resourceLabel} without -g${RESET}`);
    } else {
      console.log(`${DIM}Try listing global ${resourceLabel} with -g${RESET}`);
    }
    return;
  }

  function printResource(resource: InstalledSkill, indent: boolean = false): void {
    const prefix = indent ? '  ' : '';
    const shortPath = shortenPath(resource.canonicalPath, cwd);
    const agentNames = resource.agents.map((a) => agents[a].displayName);
    const agentInfo =
      resource.agents.length > 0 ? formatList(agentNames) : `${YELLOW}not linked${RESET}`;
    console.log(`${prefix}${CYAN}${resource.name}${RESET} ${DIM}${shortPath}${RESET}`);
    console.log(`${prefix}  ${DIM}Agents:${RESET} ${agentInfo}`);
  }

  for (const resourceType of resourceTypes) {
    const resourcesForType = installedResources.filter(
      (resource) => resource.resourceType === resourceType
    );
    if (resourcesForType.length === 0) {
      continue;
    }

    console.log(`${BOLD}${scopeLabel} ${resourceType === 'skill' ? 'Skills' : 'Rules'}${RESET}`);
    console.log();

    const groupedResources: Record<string, InstalledSkill[]> = {};
    const ungroupedResources: InstalledSkill[] = [];

    for (const resource of resourcesForType) {
      const lockEntry = lockedSkills[buildLockResourceKey(resource.name, resourceType)];
      if (lockEntry?.pluginName) {
        const group = lockEntry.pluginName;
        if (!groupedResources[group]) {
          groupedResources[group] = [];
        }
        groupedResources[group].push(resource);
      } else {
        ungroupedResources.push(resource);
      }
    }

    const hasGroups = Object.keys(groupedResources).length > 0;

    if (hasGroups) {
      const sortedGroups = Object.keys(groupedResources).sort();
      for (const group of sortedGroups) {
        const title = group
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        console.log(`${BOLD}${title}${RESET}`);
        const groupedItems = groupedResources[group];
        if (groupedItems) {
          for (const resource of groupedItems) {
            printResource(resource, true);
          }
        }
        console.log();
      }

      if (ungroupedResources.length > 0) {
        console.log(`${BOLD}General${RESET}`);
        for (const resource of ungroupedResources) {
          printResource(resource, true);
        }
        console.log();
      }
    } else {
      for (const resource of resourcesForType) {
        printResource(resource);
      }
      console.log();
    }
  }
}
