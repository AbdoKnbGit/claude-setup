<!-- claude-setup {{VERSION}} {{DATE}} -->

Set up this project for Claude Code. Reason from what you see. Don't ask questions.

## Project

{{PROJECT_CONTEXT}}

{{#if HAS_SOURCE}}
## Source samples

{{SOURCE_CONTEXT}}
{{/if}}

{{#if HAS_SKIPPED}}
## Files skipped (too large or filtered)

{{SKIPPED_LIST}}
{{/if}}

## Existing setup — READ EVERY LINE BEFORE TOUCHING ANYTHING

{{#if HAS_CLAUDE_MD}}
### CLAUDE.md — EXISTS — append only, never rewrite, never remove
{{CLAUDE_MD_CONTENT}}
{{else}}
CLAUDE.md → does not exist (create it)
{{/if}}

{{#if HAS_MCP_JSON}}
### .mcp.json — EXISTS — merge only, never remove existing entries
{{MCP_JSON_CONTENT}}

OS detected: {{DETECTED_OS}}. Use correct MCP command format:
- Windows: `{ "command": "cmd", "args": ["/c", "npx", "<package>"] }`
- macOS/Linux: `{ "command": "npx", "args": ["<package>"] }`
{{else}}
.mcp.json → does not exist (create only if you find evidence of external services)
{{/if}}

{{#if HAS_SETTINGS}}
### .claude/settings.json — EXISTS — merge only, never remove existing hooks
{{SETTINGS_CONTENT}}

Hook shell format for {{DETECTED_OS}}:
- Windows: `{ "command": "cmd", "args": ["/c", "<command>"] }`
- macOS/Linux: `{ "command": "bash", "args": ["-c", "<command>"] }`
- Bash quoting rule: never use bare `"` inside `-c "..."` — use `\x22` instead
{{else}}
settings.json → does not exist (create only if hooks are warranted)
{{/if}}

Skills installed:    {{SKILLS_LIST}}
Commands installed:  {{COMMANDS_LIST}}
Workflows installed: {{WORKFLOWS_LIST}}
.github/ exists:     {{HAS_GITHUB_DIR}}

---

## Your job

Read the files above. Figure out the project from what you see — language, runtime,
dependencies, structure, conventions. Do not assume anything not visible in the files.

Then write the Claude Code setup for THIS specific project.

### CLAUDE.md
Always write or update. Make it specific: reference actual file paths, actual patterns,
actual conventions from the code. Generic advice belongs in docs, not here.
If it exists: read it above first. Add only what is genuinely missing. Never remove.

### .mcp.json
Only if you found evidence of external services in the config files, dependencies,
or environment template. No evidence = no server.
If it exists: add to it. Never remove existing entries. Produce valid JSON.
Use OS-correct command format (see above).

### .claude/settings.json
Only if hooks genuinely earn their cost for this specific project.
Every hook adds overhead on every Claude Code action.
If it exists: add to it. Never remove existing hooks.
Use OS-correct shell format (see above).

### .claude/skills/
Only for patterns that recur across this codebase and benefit from automatic loading.
Use `applies-when` frontmatter so skills load only when relevant.
If a similar skill already exists: extend it.

### .github/workflows/
Only if .github/ exists ({{HAS_GITHUB_DIR}}).
Only workflows warranted by what you found.
If workflows already exist: do not touch them.

---

## Absolute rules

1. You have the full content of every existing Claude config file above.
   Read it before writing. Never write blind.
2. Append and merge only. Never rewrite a file in full. Never remove existing content.
3. Write only what is evidenced by the project files. No evidence = skip it.
4. Every line in CLAUDE.md must reference something you actually saw.
   No generic boilerplate. No advice identical for every project.
5. MCP servers, skills, and hooks add cost on every Claude Code session.
   Only add them if they clearly earn their keep for THIS project.

---

## Output format — one line per file, nothing else

Created: ✅ [path] — [one clause: what you saw that justified it]
Updated: ✅ [path] — [one clause: what was added]
Skipped: ⏭ [path] — [one clause: why not needed]
