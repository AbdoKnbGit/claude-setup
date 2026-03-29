# Changelog

## v1.1.9 — 2026-03-29

### Fixed: marketplace was silently broken
- The template engine had a bug that swallowed the entire marketplace section on most runs — users got empty instructions with no search at all
- This was the root cause of "marketplace not searching" reports

### Smart fetch from 4 curated GitHub repos
- Every `/stack-add` now searches 4 hand-picked GitHub catalogs in order — VoltAgent, community plugins, ComposioHQ, and official Anthropic — and stops at the first quality match
- Agents and skills are treated differently: agent requests go to VoltAgent first (best agent quality), skill requests go to the community catalog first (widest coverage)
- When a catalog is a structured JSON file, it's filtered and matched. When it's a README linking to external repos, those links are followed automatically to the actual content
- Candidates are scored on relevance, focus, and uniqueness — the pipeline picks the best match, not the first one it finds
- Every downloaded file is verified: must have real instructions, not just an empty stub. Bad downloads are deleted and the pipeline moves on
- GitHub links found in any catalog are resolved dynamically — works for any repo, any author, any directory depth
- A failed fetch never stops the pipeline — it just moves to the next source. Only after all 4 are exhausted does it create a custom one from scratch

### Bulk-safe
- All GitHub API calls support authentication via GITHUB_TOKEN for heavy usage sessions
- The largest catalog (community, hundreds of plugins) doesn't use the API at all — fetched directly as a raw file
- Pipeline stops at first match, so most installs only touch one source

### Agents are first-class
- Agent requests route to VoltAgent's curated collection first — quality-security, infrastructure, data-ai, orchestration, and more
- Agents install to their own directory and are documented separately from skills — no more mixing them together

### Test suite
- Full test coverage across all 4 catalogs with live fetches — every name discovered at runtime, nothing hardcoded
- Tests are dev-only, never run during normal usage

---

## v1.1.8 — 2026-03-28

### Add: marketplace-first automation
- `/stack-add` now goes directly to marketplace search after user input — no more clarifying questions or manual steps
- Marketplace instructions are embedded in the bootstrap command so Claude executes curl/install commands automatically
- Zero-friction flow: user says what they want → marketplace is searched → skills are installed

### Sync: rich line-level diffs
- `npx claude-setup sync` now shows color-coded output: green `+` for added, yellow `~` for modified, red `-` for deleted
- Modified files display line-level diff summaries (`+22 lines, -5 lines`) with preview of actual changes
- Sync template now includes `diff` code blocks so Claude can inspect exactly what changed in each file
- Fixed the "Stack already in sync" contradiction — bootstrap command now clearly distinguishes between "no changes" and "changes applied, process them"

### MCP: smart auto-configuration
- New service auto-discovery: scans docker-compose, .env.example, package.json, requirements.txt, pyproject.toml to detect which services the project uses
- Detects locally installed services (PostgreSQL, MongoDB, Redis, MySQL) using OS-appropriate commands
- 4-tier connection strategy: (1) check env var, (2) detect local service, (3) use default localhost URL, (4) fall back to `${VARNAME}` + flag — eliminates the "MCP server not showing" problem
- macOS: Homebrew-aware detection (`brew list postgresql`, `brew services list`)

### OS: WSL and macOS support
- Added WSL (Windows Subsystem for Linux) as a distinct OS type — detected via `/proc/version` and `WSL_DISTRO_NAME`
- WSL uses Unix-style commands (npx direct, bash), not Windows cmd wrapper — doctor auto-fixes `cmd /c` to `npx` on WSL
- WSL can reach Windows-host services on localhost — documented in MCP instructions
- macOS: Homebrew-aware service detection commands in both init and add templates
- New `isUnixLike()` helper — returns true for Linux, macOS, and WSL
- All OS-specific conditionals updated: MCP format, hook commands, service detection, channel server setup

---

## v1.1.7 — 2026-03-28

### Sync: true checkpoint system
- Rewrote sync diff engine — single authoritative full-project scan replaces the old 3-layer overlap (computeDiff + claudeInternal + fullScan) that caused duplicate entries and missed files
- Sync now compares **every file on disk** against the last snapshot, not just a sampled subset — new routes, services, configs, everything gets caught
- After restore, sync correctly compares against the **restored-to snapshot**, not the latest node (was silently comparing against the wrong baseline)
- Eliminated double full-project scan — single scan reused for both diff and snapshot creation
- No longer creates empty snapshot nodes when nothing changed — timeline stays clean

### Snapshot: restoredTo auto-clear
- `createSnapshot` now clears the `restoredTo` marker automatically — after any new snapshot (init/sync), user is at latest, so next sync compares against the right baseline

### UX: one command for everything
- `npx claude-setup` (no subcommand) now shows an interactive numbered menu with all 9 commands — pick a number and go
- Init now installs **bootstrap slash commands** for all operations: `/stack-add`, `/stack-status`, `/stack-doctor`, `/stack-restore`, `/stack-remove` — all usable from within Claude Code without leaving the session
- `add` and `remove` accept CLI arguments: `npx claude-setup add "Stripe skills"` skips the interactive prompt (enables slash command automation)
- `restore` gained `--list` (print timeline) and `--id <id>` (direct restore) flags for non-interactive use

### Marketplace: curl fix
- Fixed `!q` in marketplace curl command — bash history expansion produced `\!q` → JavaScript SyntaxError. Changed to `q===""`
- Changed `readFileSync('/dev/stdin')` to `readFileSync(0)` for Windows compatibility
- Bumped marketplace results from 5 to 10
- Added "skip to next step if curl fails" fallback instruction

### Sync template: act on source changes
- Updated sync instructions so Claude Code updates CLAUDE.md when source files are added/modified, not just config files — no more "just source code, skipping"

### Token cost display
- Removed token cost section from init, add, sync, and remove output (kept in --dry-run only)

---

## v1.1.6 — 2026-03-28

### Restore: true time-machine
- Snapshots now capture **all project files** (git-like full coverage), not just `.claude/` config files
- Restore rewrites every file from the snapshot **and deletes** any file that didn't exist at that point — the project directory looks exactly like it did at that node
- Added `.gitignore` parsing so snapshot exclusions match what git ignores
- Hard-excluded from snapshots: `node_modules/`, `.git/`, build outputs (`dist/`, `build/`, `.next/`, `target/`, etc.), binary files, `.env`, `.claude/snapshots/` (the snapshot store itself)
- Full snapshots are self-contained — no delta accumulation on restore, so deleted files between snapshots don't "ghost" back
- Going back and forward in the timeline always works: snapshot data is stored in `.claude/snapshots/{node-id}.json` and is never touched by restore
- Timeline display now shows **◀ you are here**, past nodes, and **(future — reachable)** markers so it's clear you can always go forward again

### Sync: one-time install
- `npx claude-setup init` now installs a persistent `stack-sync.md` immediately — `/stack-sync` works from day one without any extra terminal commands
- `stack-sync.md` is self-refreshing: running `/stack-sync` inside Claude Code automatically runs `npx claude-setup sync` first (bash tool call), gets the fresh diff, then applies it
- `npx claude-setup sync` now always regenerates `stack-sync.md` even when there are no changes, so the self-refresh always produces an up-to-date state

### Token cost display
- Removed redundant `This command estimate` line from `init` and `sync` output when real session data is already shown

### Restore UX
- Replaced free-text snapshot ID prompt with interactive arrow-key list (↑/↓ navigate, Enter select)
- Added "Type snapshot ID manually…" option at the bottom of the list for edge cases
- Non-TTY fallback: numbered list for CI/pipe environments
- Improved stale-files messaging: clearly states which files were deleted vs could not be deleted

### Doctor improvements
- Hook test error now detects `Cannot find module` and shows actionable hint: `run npx claude-setup init to reinstall`
- Env var errors now explicitly say "MCP server will not appear in /mcp until this is resolved"
- Hook test stderr display increased from 100 to 200 chars

### Hardcoding
- Replaced machine-specific username in `tokens.ts` path example comment with generic `alice`

---

## v1.1.5 — 2026-03-27

- Fix subagent token counting, OS-universal path matching, synthetic model filter

## v1.1.4 — 2026-03-26

- Snapshots, templates, token tracking, doctor auto-fix, hook testing

## v1.1.3 — 2026-03-25

- Patch 6 silent-failure bugs, smarter project detection

## v1.1.2 — 2026-03-24

- Dynamic config, richer templates, OS awareness, improved doctor/status
