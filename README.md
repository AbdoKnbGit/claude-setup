# claude-setup

Setup layer for Claude Code. Reads your project, writes command files, Claude Code does the rest.

**The CLI has zero intelligence.** All reasoning is delegated to Claude Code via the command files.

## Install

```bash
npx claude-setup init
```

Then open Claude Code and run `/stack-init`.

## Commands

| Command | What it does |
|---------|-------------|
| `init` | Full project setup — detects empty projects, generates atomic setup steps |
| `add` | Add capabilities — MCP servers, skills, hooks, plugins in one go |
| `sync` | Update setup after project changes — diff-based, not full re-scan |
| `status` | Dashboard — project info, setup files, snapshots, token usage |
| `doctor` | Validate everything — OS format, hooks, env vars, stale skills |
| `remove` | Remove capabilities cleanly with dangling reference detection |
| `restore` | Jump to any snapshot — restore files to a previous state |
| `compare` | Diff two snapshots — find exactly where something changed |
| `export` | Save your setup as a reusable template |

### Flags

```bash
npx claude-setup init --dry-run            # Preview without writing
npx claude-setup init --template my.json   # Apply a saved template
npx claude-setup sync --dry-run            # Show changes without writing
npx claude-setup sync --budget 3000        # Override token budget
npx claude-setup doctor --verbose          # Include passing checks
npx claude-setup doctor --fix              # Auto-fix issues
npx claude-setup doctor --test-hooks       # Run every hook in sandbox
```

## How it works

1. **CLI collects** — reads project files with strict token cost controls
2. **CLI writes** — generates markdown instructions into `.claude/commands/`
3. **Claude Code executes** — you run `/stack-init`, `/stack-sync`, etc.

## What it creates

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-specific context for Claude Code |
| `.mcp.json` | MCP server connections (only if evidenced by project files) |
| `.claude/settings.json` | Hooks in correct Claude Code format |
| `.claude/skills/` | Reusable patterns with frontmatter |
| `.claude/commands/` | Project-specific slash commands |
| `.github/workflows/` | CI workflows (only with confirmation) |

## Snapshots

Every `init` and `sync` creates a snapshot node — a checkpoint on a timeline. Snapshots store the content of changed files only.

```
init ──→ sync#1 ──→ sync#2 ──→ sync#3 (current)
              │                    │
              │                    └─ bug introduced here
              └─ jump back here
```

- `npx claude-setup restore` — pick any snapshot and restore files to that state
- `npx claude-setup compare` — diff any two snapshots to find what changed
- Jumping does **not** delete other snapshots — all are preserved

## Templates

Save your setup and reuse it across projects.

```bash
# Export current setup
npx claude-setup export
# → creates my-template.claude-template.json

# Apply to a new project
npx claude-setup init --template my-template.claude-template.json

# Apply from a URL
npx claude-setup init --template https://example.com/template.json
```

Templates capture CLAUDE.md, MCP servers, hooks, skills, and commands. On import:
- Existing content is kept, new content is merged
- MCP commands are auto-adapted for the target OS
- Skills and commands with the same name are skipped

## Token Cost Tracking

Every command shows estimated token usage and cost across all Claude models.

```
Token cost
  ~2,450 input tokens (Opus $0.0368 | Sonnet $0.0074 | Haiku $0.0006)
```

Status shows cumulative stats, per-command averages, and cost trends. Use `--budget` on sync to override the token limit for a single run.

## Doctor

Validates your entire setup and reports issues by severity.

```bash
npx claude-setup doctor           # Check everything
npx claude-setup doctor --fix     # Auto-fix what's possible
npx claude-setup doctor --test-hooks  # Run each hook, report pass/fail
```

What `--fix` can repair:
- Remove accidental model overrides from settings.json
- Convert MCP commands to the correct OS format
- Add missing `-y` flags to npx calls
- Re-snapshot files modified outside the CLI

What `--test-hooks` checks per hook:
- Command exists on the system
- Command executes without error
- Exit code and stderr
- Execution time and timeout detection
- Matcher regex validity

## Marketplace

The `add` command integrates with [claude-code-plugins-plus-skills](https://github.com/jeremylongshore/claude-code-plugins-plus-skills) — 340+ plugins and 1,367+ skills across 20 categories.

```bash
npx claude-setup add
# → "Stripe and frontend skills"
# → generates stack-add.md with marketplace search + install instructions
```

## Configuration

Auto-generated on first run. Edit `.claude-setup.json` to customize:

```json
{
  "maxSourceFiles": 15,
  "maxDepth": 6,
  "maxFileSizeKB": 80,
  "tokenBudget": {
    "init": 12000,
    "sync": 6000,
    "add": 3000,
    "remove": 2000
  },
  "digestMode": true,
  "extraBlockedDirs": [],
  "sourceDirs": []
}
```

## License

MIT
