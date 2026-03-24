# claude-setup

Setup layer for Claude Code. Reads your project, writes command files, Claude Code does the rest.

**The CLI has zero intelligence.** All reasoning is delegated to Claude Code via the command files. The CLI reads files. Claude Code decides.

## Install & Quick Start

```bash
npx claude-setup init
```

Then open Claude Code and run `/stack-init`.

## Commands

| Command | What it does |
|---------|-------------|
| `npx claude-setup init` | Full project setup — new or existing. Detects empty projects automatically. |
| `npx claude-setup add` | Add a multi-file capability (MCP + hooks + skills together) |
| `npx claude-setup sync` | Update setup after project changes (uses diff, not full re-scan) |
| `npx claude-setup status` | Show current setup state — OS, servers, hooks, staleness |
| `npx claude-setup doctor` | Validate environment — OS/MCP format, hook quoting, env vars, stale skills |
| `npx claude-setup remove` | Remove a capability cleanly with dangling reference detection |

### Flags

```bash
npx claude-setup init --dry-run    # Preview without writing
npx claude-setup sync --dry-run    # Show changes without writing
npx claude-setup doctor --verbose  # Include passing checks in output
```

## How it works

1. **CLI collects** — reads project files (configs, source samples) with strict token cost controls
2. **CLI writes command files** — assembles markdown instructions into `.claude/commands/`
3. **Claude Code executes** — you run `/stack-init` (or `/stack-sync`, etc.) in Claude Code

## Three project states

- **Empty project** — Claude Code asks 3 discovery questions, then sets up a tailored environment
- **In development** — reads existing files, writes setup that references actual code patterns
- **Production** — same as development; merge rules protect existing Claude config (append only, never rewrite)

## What it creates

- `CLAUDE.md` — project-specific context for Claude Code
- `.mcp.json` — MCP server connections (only if evidenced by project files, OS-correct format)
- `.claude/settings.json` — hooks (only if warranted, OS-correct shell format)
- `.claude/skills/` — reusable patterns (only if recurring, with `applies-when` frontmatter)
- `.claude/commands/` — project-specific slash commands
- `.github/workflows/` — CI workflows (only if `.github/` exists)

## Token cost controls

Every byte injected into command files costs tokens. The CLI enforces:

| Control | Default |
|---------|---------|
| Init token budget | 12,000 |
| Sync token budget | 6,000 |
| Add token budget | 3,000 |
| Remove token budget | 2,000 |
| Max source files sampled | 15 |
| Max file size | 80KB |
| Max depth | 6 levels |

### File-specific truncation

| File | Strategy |
|------|----------|
| `package-lock.json` | Extract `{ name, version, lockfileVersion }` only |
| `Dockerfile` | First 50 lines |
| `docker-compose.yml` | First 100 lines if > 8KB |
| `pom.xml`, `build.gradle*` | First 80 lines |
| `setup.py` | First 60 lines |
| `*.config.{js,ts,mjs}` | First 100 lines |

## Configuration

Create `.claude-setup.json` in your project root to customize:

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
  "extraBlockedDirs": ["my-custom-dir"],
  "sourceDirs": ["src", "lib"]
}
```

## Digest mode

When `digestMode` is enabled (default), the CLI extracts compact signal instead of dumping raw file content:

- **Config files found** — just names, not content
- **Dependencies** — extracted from any package manifest
- **Scripts** — available commands/tasks
- **Env vars** — names from `.env.example`
- **Directory tree** — compact structure (3 levels deep)
- **Source signatures** — imports, exports, declarations (not full content)

## OS detection

The CLI detects your OS and ensures command files tell Claude Code to use the correct format:

- **Windows**: `{ "command": "cmd", "args": ["/c", "npx", "<package>"] }`
- **macOS/Linux**: `{ "command": "npx", "args": ["<package>"] }`

`doctor` checks for mismatches and reports them as critical issues.
