# Changelog

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
