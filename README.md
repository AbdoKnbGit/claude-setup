# claude-setup

Your project already has the answers — `claude-setup` reads them and configures Claude Code so you don't have to.

One command. No manual config. Works on **Windows, macOS, Linux, and WSL**.

## Get started

```bash
npx claude-setup
```

Pick `1` (init). Then open Claude Code and run:

```
/stack-init
```

That's it. Claude Code now knows your stack, your services, your conventions.

## What happens during init

`claude-setup` scans your project files — `package.json`, `docker-compose.yml`, `.env.example`, source code — and generates everything Claude Code needs:

| Generated | What it does |
|-----------|-------------|
| **CLAUDE.md** | Project context — stack, structure, commands, conventions |
| **.mcp.json** | MCP server connections — auto-detected from your dependencies |
| **settings.json** | Hooks — auto-format, token tracking, build triggers |
| **skills/** | Reusable patterns for your workflow |
| **commands/** | Slash commands that work inside Claude Code |

Every line comes from evidence in your project files. No guessing.

### MCP servers are auto-configured

`claude-setup` detects your databases and services automatically:

- Finds PostgreSQL, MongoDB, Redis, MySQL from your deps, docker-compose, or env files
- Checks if the service is installed locally (`psql`, `mongosh`, `redis-cli`)
- Uses the right connection URL — no broken `${VARNAME}` that fails silently
- Formats commands for your OS (`cmd /c npx` on Windows, `npx` everywhere else)

## After init

These slash commands work inside Claude Code:

| Command | What it does |
|---------|-------------|
| `/stack-sync` | Detect file changes, update your setup |
| `/stack-add` | Add a capability — searches 400+ marketplace plugins first |
| `/stack-status` | Show project state, snapshots, token usage |
| `/stack-doctor` | Validate environment, auto-fix issues |
| `/stack-restore` | Time-travel to any snapshot |
| `/stack-remove` | Remove a capability cleanly |

### `/stack-add` searches the marketplace for you

Say what you want — it searches 400+ community plugins and 13 official Anthropic plugins, downloads and installs matching skills automatically. No manual steps.

```
/stack-add
> "E2E testing and Stripe integration"
```

### `/stack-sync` shows what changed

Every sync creates a snapshot and shows a color-coded diff:

```
Changes since 2026-03-28T14:32:01.904Z:
  +2 added  ~3 modified  -1 deleted

  Added files:
    + src/api/payments.ts (48 lines)
    + src/api/webhooks.ts (32 lines)

  Modified files:
    ~ package.json (+3 lines, -1 lines)
    ~ src/index.ts (+8 lines, -2 lines)
```

Claude Code sees the actual line-level changes and updates your setup surgically.

## Snapshots

Every init and sync saves a full snapshot. You can jump to any point in time:

```
/stack-restore
```

```
init ──> sync#1 ──> sync#2 ──> sync#3 (you are here)
              |
              └── jump back here anytime
```

Snapshots are never deleted. Go back, go forward, freely.

## All CLI commands

```bash
npx claude-setup                         # Interactive menu
npx claude-setup init                    # Full project setup
npx claude-setup sync                    # Checkpoint + update
npx claude-setup add "postgres and testing"  # Add capabilities
npx claude-setup status                  # Dashboard
npx claude-setup doctor                  # Validate everything
npx claude-setup doctor --fix            # Auto-fix issues
npx claude-setup restore                 # Time-travel
npx claude-setup compare                 # Diff two snapshots
npx claude-setup remove "redis"          # Remove cleanly
npx claude-setup export                  # Save as template
npx claude-setup init --template file    # Apply a template
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

## Supported platforms

| Platform | Status | MCP format |
|----------|--------|-----------|
| Windows | Full support | `cmd /c npx -y <pkg>` |
| macOS | Full support + Homebrew detection | `npx -y <pkg>` |
| Linux | Full support | `npx -y <pkg>` |
| WSL | Full support + Windows host access | `npx -y <pkg>` |

## License

MIT
