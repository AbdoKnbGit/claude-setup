# claude-setup

Setup layer for Claude Code. Reads your project, writes command files, Claude Code does the rest.

## Install

```bash
npx claude-setup init
```

## Commands

| Command | What it does |
|---------|-------------|
| `npx claude-setup init` | Full project setup — new or existing |
| `npx claude-setup add` | Add a multi-file capability |
| `npx claude-setup sync` | Update setup after project changes |
| `npx claude-setup status` | Show current setup |
| `npx claude-setup doctor` | Validate environment |
| `npx claude-setup remove` | Remove a capability cleanly |

## How it works

1. **CLI collects** — reads project files (configs, source samples) with strict cost controls
2. **CLI writes command files** — assembles markdown instructions into `.claude/commands/`
3. **Claude Code executes** — you run `/stack-init` (or `/stack-sync`, etc.) in Claude Code

The CLI has zero intelligence. All reasoning is delegated to Claude Code via the command files.

## Three project states

- **Empty project** — Claude Code asks 3 discovery questions, then sets up a tailored environment
- **In development** — reads existing files, writes setup that references actual code patterns
- **Production** — same as development; merge rules protect existing Claude config (append only, never rewrite)

## What it creates

- `CLAUDE.md` — project-specific context for Claude Code
- `.mcp.json` — MCP server connections (only if evidenced by project files)
- `.claude/settings.json` — hooks (only if warranted)
- `.claude/skills/` — reusable patterns (only if recurring)
- `.claude/commands/` — project-specific slash commands
- `.github/workflows/` — CI workflows (only if `.github/` exists)


