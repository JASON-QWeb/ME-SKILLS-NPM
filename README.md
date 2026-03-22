# SkillsHub

CLI for installing and managing agent skills and rules across coding agents.

<!-- agent-list:start -->
Supports **OpenCode**, **Claude Code**, **Codex**, **Cursor**, and [39 more](#available-agents).
<!-- agent-list:end -->

[中文文档](README.zh-CN.md)

## Install

```bash
npx skillsandruless add owner/repo
```

## Commands

```bash
# Add a skill
npx skillsandruless add owner/repo

# Add a rule
npx skillsandruless add owner/repo --rule

# List installed skills / rules
npx skillsandruless list
npx skillsandruless list --rule

# Search skills
npx skillsandruless find [keyword]

# Remove
npx skillsandruless remove skill-name
npx skillsandruless remove --rule rule-name

# Check for updates
npx skillsandruless check

# Update all
npx skillsandruless update

# Create a new skill template
npx skillsandruless init [name]
```

## Common Options

| Option | Description |
| --- | --- |
| `-g, --global` | Install/remove globally instead of project-level |
| `-a, --agent <name>` | Target specific agent (e.g. `claude-code`, `cursor`) |
| `-s, --skill <name>` | Select specific skill by name |
| `--rule` | Operate on rules instead of skills |
| `-y, --yes` | Skip confirmation prompts |
| `--all` | Target all skills/agents |

## Examples

```bash
# Install specific skills from a repo
npx skillsandruless add owner/repo --skill frontend-design --skill web-design

# Install to a specific agent globally
npx skillsandruless add owner/repo -g -a claude-code

# Non-interactive (CI-friendly)
npx skillsandruless add owner/repo --skill my-skill -a claude-code -y

# Remove all skills
npx skillsandruless remove --all
```

## Source Formats

```bash
npx skillsandruless add owner/repo                           # GitHub shorthand
npx skillsandruless add https://github.com/owner/repo        # Full URL
npx skillsandruless add https://gitlab.com/org/repo          # GitLab
npx skillsandruless add ./local-path                          # Local directory
```

## What are Agent Skills?

Agent skills are reusable instruction sets (`SKILL.md` files) that extend your coding agent's capabilities. Rules are single Markdown files that provide guidelines for agents.

Discover skills at **[skills.sh](https://skills.sh)**

## Available Agents

<details>
<summary>Click to expand full agent list</summary>

<!-- supported-agents:start -->
| Agent | `--agent` | Project Path | Global Path |
|-------|-----------|--------------|-------------|
| Amp, Kimi Code CLI, Replit, Universal | `amp`, `kimi-cli`, `replit`, `universal` | `.agents/skills/` | `~/.config/agents/skills/` |
| Antigravity | `antigravity` | `.agents/skills/` | `~/.gemini/antigravity/skills/` |
| Augment | `augment` | `.augment/skills/` | `~/.augment/skills/` |
| Claude Code | `claude-code` | `.claude/skills/` | `~/.claude/skills/` |
| OpenClaw | `openclaw` | `skills/` | `~/.openclaw/skills/` |
| Cline, Warp | `cline`, `warp` | `.agents/skills/` | `~/.agents/skills/` |
| CodeBuddy | `codebuddy` | `.codebuddy/skills/` | `~/.codebuddy/skills/` |
| Codex | `codex` | `.agents/skills/` | `~/.codex/skills/` |
| Command Code | `command-code` | `.commandcode/skills/` | `~/.commandcode/skills/` |
| Continue | `continue` | `.continue/skills/` | `~/.continue/skills/` |
| Cortex Code | `cortex` | `.cortex/skills/` | `~/.snowflake/cortex/skills/` |
| Crush | `crush` | `.crush/skills/` | `~/.config/crush/skills/` |
| Cursor | `cursor` | `.agents/skills/` | `~/.cursor/skills/` |
| Deep Agents | `deepagents` | `.agents/skills/` | `~/.deepagents/agent/skills/` |
| Droid | `droid` | `.factory/skills/` | `~/.factory/skills/` |
| Gemini CLI | `gemini-cli` | `.agents/skills/` | `~/.gemini/skills/` |
| GitHub Copilot | `github-copilot` | `.agents/skills/` | `~/.copilot/skills/` |
| Goose | `goose` | `.goose/skills/` | `~/.config/goose/skills/` |
| Junie | `junie` | `.junie/skills/` | `~/.junie/skills/` |
| iFlow CLI | `iflow-cli` | `.iflow/skills/` | `~/.iflow/skills/` |
| Kilo Code | `kilo` | `.kilocode/skills/` | `~/.kilocode/skills/` |
| Kiro CLI | `kiro-cli` | `.kiro/skills/` | `~/.kiro/skills/` |
| Kode | `kode` | `.kode/skills/` | `~/.kode/skills/` |
| MCPJam | `mcpjam` | `.mcpjam/skills/` | `~/.mcpjam/skills/` |
| Mistral Vibe | `mistral-vibe` | `.vibe/skills/` | `~/.vibe/skills/` |
| Mux | `mux` | `.mux/skills/` | `~/.mux/skills/` |
| OpenCode | `opencode` | `.agents/skills/` | `~/.config/opencode/skills/` |
| OpenHands | `openhands` | `.openhands/skills/` | `~/.openhands/skills/` |
| Pi | `pi` | `.pi/skills/` | `~/.pi/agent/skills/` |
| Qoder | `qoder` | `.qoder/skills/` | `~/.qoder/skills/` |
| Qwen Code | `qwen-code` | `.qwen/skills/` | `~/.qwen/skills/` |
| Roo Code | `roo` | `.roo/skills/` | `~/.roo/skills/` |
| Trae | `trae` | `.trae/skills/` | `~/.trae/skills/` |
| Trae CN | `trae-cn` | `.trae/skills/` | `~/.trae-cn/skills/` |
| Windsurf | `windsurf` | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| Zencoder | `zencoder` | `.zencoder/skills/` | `~/.zencoder/skills/` |
| Neovate | `neovate` | `.neovate/skills/` | `~/.neovate/skills/` |
| Pochi | `pochi` | `.pochi/skills/` | `~/.pochi/skills/` |
| AdaL | `adal` | `.adal/skills/` | `~/.adal/skills/` |
<!-- supported-agents:end -->

</details>

## More

- [Publishing Guide](publish-to-npm.md)
- [Agent Skills Specification](https://agentskills.io)
- [Skills Directory](https://skills.sh)

## License

MIT
