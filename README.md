# claude-setup

One command to set up Claude Code for any project. It reads your code, configures everything, and gives you slash commands that work inside Claude Code.

## Quick start

```bash
npx claude-setup
```

Pick `1` (init), then open Claude Code and run `/stack-init`. That's it.

After init, these slash commands are available inside Claude Code:

| Slash command | What it does |
|--------------|-------------|
| `/stack-init` | Set up the project (CLAUDE.md, MCP servers, hooks, skills) |
| `/stack-sync` | Detect all file changes and update the setup |
| `/stack-add` | Add a capability (searches 400+ marketplace plugins first) |
| `/stack-remove` | Remove a capability cleanly |
| `/stack-status` | Show project state, snapshots, token usage |
| `/stack-doctor` | Validate environment, offer auto-fix |
| `/stack-restore` | Time-travel to any snapshot |

No extra terminal commands needed after init.

## What it does

You have a project. You want Claude Code to understand it — know the stack, connect to your database, run the right hooks, have useful skills.

`claude-setup` reads your project files, figures out what's there, and generates the right config:

- **CLAUDE.md** — project context (stack, structure, commands, conventions)
- **.mcp.json** — MCP server connections (only if your project actually uses them)
- **settings.json** — hooks in the correct format
- **skills/** — reusable patterns for your workflow
- **commands/** — project-specific slash commands

It doesn't guess. Every line it writes comes from evidence in your project files.

## Snapshots

Every init and sync saves a full snapshot of your project — like a git commit for your setup.

```
init ──→ sync#1 ──→ sync#2 ──→ sync#3 (you are here)
              │
              └── jump back here anytime
```

- **Restore**: `npx claude-setup restore` — interactive arrow-key navigation, pick any snapshot
- **Compare**: `npx claude-setup compare` — diff two snapshots to find what changed
- Snapshots are never deleted — you can always go back or forward

## Sync = checkpoint

Sync captures **every file** in your project (respects `.gitignore`). When you add new routes, services, configs — sync catches all of it and updates your setup.

```bash
npx claude-setup sync
```

Or just run `/stack-sync` inside Claude Code.

## Marketplace

The `add` command searches 400+ community plugins and 13 official Anthropic plugins before creating anything custom.

```bash
npx claude-setup add "Stripe and testing"
```

Or run `/stack-add` inside Claude Code — it asks what you want, searches the marketplace, and installs.

## All commands

You can also run any command directly:

```bash
npx claude-setup init                        # Full project setup
npx claude-setup add "postgres MCP server"   # Add a capability
npx claude-setup sync                        # Checkpoint + update setup
npx claude-setup status                      # Dashboard
npx claude-setup doctor                      # Validate everything
npx claude-setup doctor --fix                # Auto-fix issues
npx claude-setup restore                     # Time-travel to a snapshot
npx claude-setup compare                     # Diff two snapshots
npx claude-setup remove "redis"              # Remove a capability
npx claude-setup export                      # Save setup as reusable template
npx claude-setup init --template file.json   # Apply a saved template
```

## Configuration

Auto-generated on first run. Edit `.claude-setup.json` if needed:

```json
{
  "maxSourceFiles": 15,
  "maxDepth": 6,
  "tokenBudget": { "init": 12000, "sync": 6000, "add": 3000 },
  "digestMode": true
}
```

## License

MIT
