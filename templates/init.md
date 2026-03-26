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
- Windows: `{ "command": "cmd", "args": ["/c", "npx", "-y", "<package>"] }`
- macOS/Linux: `{ "command": "npx", "args": ["-y", "<package>"] }`
{{else}}
.mcp.json → does not exist (create if you find evidence of external services in deps, docker-compose, or env vars)
{{/if}}

{{#if HAS_SETTINGS}}
### .claude/settings.json — EXISTS — merge only, never remove existing hooks
{{SETTINGS_CONTENT}}
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
Create if you found evidence of external services in: dependencies, docker-compose services,
env vars (DATABASE_URL, REDIS_URL, STRIPE_KEY, etc.), or import statements (pg, mysql2, mongoose, redis, stripe).
If it exists: add to it. Never remove existing entries. Produce valid JSON.
Use OS-correct command format (see above). Always include `-y` in npx args.
All credentials use `${VARNAME}` syntax — NEVER hardcode connection strings.

### .claude/settings.json — CORRECT HOOKS FORMAT
Only if hooks genuinely earn their cost for this specific project.
Every hook adds overhead on every Claude Code action.

**Use this exact format:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "<shell command here>"
          }
        ]
      }
    ]
  }
}
```

**Before adding a build hook**, verify the tool is installed:
- Wrap with existence check: `command -v mvn && mvn compile -q`
- If not installed: skip the hook and warn the user
- NEVER add a hook for a tool that doesn't exist

**NEVER write a `"model"` key** — it overrides the user's model selection.

If it exists: add to it. Never remove existing hooks.
Use OS-correct shell format.

### .claude/skills/
Create skills for patterns that recur across this codebase and benefit from automatic loading.
Each skill must be a directory with SKILL.md:
```
.claude/skills/<name>/SKILL.md
```
With frontmatter:
```yaml
---
name: skill-name
description: When to use this skill
---
Instructions...
```

### .claude/commands/
Create project-specific commands for multi-step workflows developers repeat.
Based on what you find in scripts, Makefile, README, docker-compose.

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
