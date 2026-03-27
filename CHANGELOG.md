# Changelog

## v1.1.5 — Token accuracy: subagents, OS-universal paths (2026-03-27)

### Bug Fixes

**Subagent token usage was not counted.**
Agent tool calls (subagents) run in separate API sessions. Their JSONL files are stored in `<session-id>/subagents/*.jsonl`, not in the main session file. The token reader was only scanning the main file and missing all subagent usage. This could silently undercount costs by a large margin depending on how many Agent calls a session used. Both the JSONL reader and the Stop hook script now include subagent files.

**Project path matching failed on all operating systems.**
The JSONL reader was trying to decode Claude Code's encoded directory names back to paths (e.g. `C--Users-ok-Desktop-myapp` → path). This decoding is lossy: folder names with hyphens (like `Claude-code-documentation`) were decoded as extra path segments, so the directory was never found. The fix encodes the CWD using Claude Code's exact scheme and matches by direct comparison, case-insensitive.

**Synthetic model entries appeared in per-model breakdown.**
Claude Code writes `<synthetic>` entries to JSONL with all-zero token counts. These were being passed through the parser and shown in the per-model display as a zero-cost row. They are now filtered out before aggregation.

**Stop hook did not cover all Claude data directories.**
Data directory detection only checked `~/.config/claude` and `~/.claude`. Added `~/Library/Application Support/claude` (macOS), `%APPDATA%/claude` (Windows), and `CLAUDE_CONFIG_DIR` env var override to cover every platform default.

---

## v1.1.4 — Snapshots, Templates, Token Tracking, Doctor Auto-Fix (2026-03-26)

Six new features that make claude-setup a complete project management layer.

### New Commands

**`restore` — Time-travel to any snapshot.**
Every `init` and `sync` creates a snapshot node on a timeline. Each node stores the actual content of changed files. Run `npx claude-setup restore` to pick any snapshot and restore files to that state. Other snapshots are preserved — jump forward or back freely, like git checkout without losing branches.

**`compare` — Diff any two snapshots.**
Run `npx claude-setup compare` to see exactly what changed between two points in time. Shows files added, removed, and modified with line counts. Useful for finding where a bug was introduced.

**`export` — Save your setup as a reusable template.**
Run `npx claude-setup export` to capture your CLAUDE.md, MCP servers, hooks, skills, and commands into a portable `.claude-template.json` file. Share it with teammates or reuse across projects.

### New Flags

**`init --template <path|url>` — Apply a template to a new project.**
Import a saved template instead of scanning from scratch. Merge logic: existing content is kept, new content is added. MCP commands are auto-adapted between Windows and macOS/Linux. Skills and commands with duplicate names are skipped.

**`doctor --fix` — Auto-fix issues.**
Removes accidental model overrides from settings.json, converts MCP commands to the correct OS format, adds missing `-y` flags to npx calls, and re-snapshots files modified outside the CLI.

**`doctor --test-hooks` — Run every hook in a sandbox.**
Spawns each hook command once, checks if the tool exists on the system, validates exit code and stderr, measures execution time, detects timeouts (10s), and validates matcher regex patterns. Reports pass/fail per hook.

**`sync --budget <tokens>` — Override token budget for a single run.**
Temporarily change the sync token budget without editing `.claude-setup.json`.

### Token Cost Tracking

Every command now shows estimated token usage and cost across Opus, Sonnet, and Haiku pricing. Token counts and costs are stored in the manifest per run. Status shows cumulative totals, per-command averages, and cost trends. Optimization hints suggest ways to reduce usage.

### Status Dashboard

Status now shows a snapshot timeline (last 8 nodes with restore/compare hints), token usage stats (total, averages, trends), and per-run token counts in the run history.

---

## v1.1.3 — Bug Patch + Smarter Detection (2026-03-24)

This release fixes 6 bugs that caused silent failures and adds intelligence rules so the tool actually thinks before skipping features.

### Bug Fixes

**Doctor and status were checking hook names that don't exist.**
The tool was looking for `PreCompact`, `PostCompact`, `Notification`, and `SubagentStop` — none of these are real Claude Code hook events. Now it only recognizes the valid five: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SessionStart`. Doctor also flags any invalid hook names it finds in your settings.json.

**MCP package names were being made up.**
Previous versions could generate packages like `@anthropic-ai/playwright-mcp` which don't exist on npm. Now there's a verified package list baked in, and the tool refuses to guess. If a service isn't on the list, it tells you instead of writing a broken config. Also, `npx` calls now always include `-y` so installs don't hang waiting for confirmation.

**Connection strings were being hardcoded in .mcp.json args.**
Things like `postgresql://localhost:5432/mydb` were ending up directly in the args array. Now the tool enforces `env` + `${VARNAME}` syntax for all credentials and connection strings. Doctor flags any hardcoded connection strings it finds as critical.

**Sync couldn't see when Claude Code edited files directly.**
If Claude Code modified `.mcp.json`, `settings.json`, or `CLAUDE.md` during a session, sync would report "no changes" because it only checked project source files. Now sync hashes these managed files and compares against the last snapshot. Out-of-band edits get flagged with a clear warning.

**Skills were invisible after being added.**
Status showed "Skills: none" even when skills existed on disk. The tool was only checking one directory pattern (`.claude/skills/*/SKILL.md`). Now it scans all three patterns — structured, flat, and nested — and deduplicates the results.

**Remove couldn't find things it didn't create.**
The remove command was reading from the manifest (a historical log) instead of scanning the filesystem. Since Claude Code can create files outside the CLI, the manifest is never the full picture. Now the remove template instructs a full filesystem scan before deleting anything.

**The tool was silently overriding your model selection.**
Writing `"model"` into settings.json forces that model on every session, taking away your ability to pick one in the UI. The tool no longer writes this key, and doctor warns you if it finds one already there.

### Smarter Detection

**Commands step actually looks at your project now.**
Instead of skipping with a lazy "no recurring workflows found," the commands step now scans your Makefile, package.json scripts, docker-compose.yml, Dockerfile, README, and shell scripts for multi-step patterns. It detects things like docker clean-rebuild sequences, migrate+seed+start chains, and lint+format+typecheck gates, then suggests specific commands for each.

**Missing .github/ is no longer a dead end.**
When `.github/` doesn't exist, the tool now scans for CI/CD evidence (test directories, Dockerfiles, build scripts, deploy references) and suggests setting up pipelines if it finds anything. It asks before creating anything.

**Environment setup gaps get called out.**
The tool now detects missing `.env` files when `.env.example` exists, docker-compose service dependencies, database migration directories, and postinstall hooks — then suggests setup commands like `/init`, `/setup-env`, `/db:migrate` based on what it actually finds in your project.

**Channel servers (Telegram, Discord) get proper handling.**
Channels are special MCP servers that push events into your session. They need extra setup that `.mcp.json` alone can't provide — specific launch flags, Bun runtime, claude.ai login. Doctor now detects channel-type servers and reminds you about the `--channels` flag requirement.
