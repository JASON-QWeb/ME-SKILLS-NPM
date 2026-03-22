# SkillsHub

跨编码代理安装和管理 agent skills 与 rules 的 CLI 工具。

<!-- agent-list:start -->
支持 **OpenCode**, **Claude Code**, **Codex**, **Cursor** 以及 [其他 39 个代理](#支持的代理)。
<!-- agent-list:end -->

[English](README.md)

## 安装

```bash
npx skillsandruless add owner/repo
```

## 命令

```bash
# 添加技能
npx skillsandruless add owner/repo

# 添加规则
npx skillsandruless add owner/repo --rule

# 列出已安装的技能 / 规则
npx skillsandruless list
npx skillsandruless list --rule

# 搜索技能
npx skillsandruless find [keyword]

# 移除
npx skillsandruless remove skill-name
npx skillsandruless remove --rule rule-name

# 检查更新
npx skillsandruless check

# 更新全部
npx skillsandruless update

# 创建新技能模板
npx skillsandruless init [name]
```

## 常用选项

| 选项 | 描述 |
| --- | --- |
| `-g, --global` | 全局安装/移除，而非项目级别 |
| `-a, --agent <name>` | 指定目标代理（如 `claude-code`, `cursor`） |
| `-s, --skill <name>` | 按名称选择特定技能 |
| `--rule` | 操作规则而非技能 |
| `-y, --yes` | 跳过确认提示 |
| `--all` | 针对所有技能/代理 |

## 示例

```bash
# 从仓库安装指定技能
npx skillsandruless add owner/repo --skill frontend-design --skill web-design

# 全局安装到指定代理
npx skillsandruless add owner/repo -g -a claude-code

# 非交互模式（CI 友好）
npx skillsandruless add owner/repo --skill my-skill -a claude-code -y

# 移除所有技能
npx skillsandruless remove --all
```

## 来源格式

```bash
npx skillsandruless add owner/repo                           # GitHub 简写
npx skillsandruless add https://github.com/owner/repo        # 完整 URL
npx skillsandruless add https://gitlab.com/org/repo          # GitLab
npx skillsandruless add ./local-path                          # 本地目录
```

## 什么是 Agent Skills？

Agent Skills 是可复用的指令集（`SKILL.md` 文件），用于扩展编码代理的能力。Rules 是为代理提供指导规则的单个 Markdown 文件。

在 **[skills.sh](https://skills.sh)** 发现更多技能。

## 支持的代理

<details>
<summary>点击展开完整代理列表</summary>

<!-- supported-agents:start -->
| 代理 | `--agent` | 项目路径 | 全局路径 |
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

## 更多

- [发布指南](publish-to-npm.zh-CN.md)
- [Agent Skills 规范](https://agentskills.io)
- [技能目录](https://skills.sh)

## 许可证

MIT
