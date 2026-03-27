<!-- claude-setup remove {{DATE}} -->

Remove from setup: "{{USER_INPUT}}"

## Current setup — read everything before touching any file

{{#if HAS_CLAUDE_MD}}
### CLAUDE.md
{{CLAUDE_MD_CONTENT}}
{{/if}}

{{#if HAS_MCP_JSON}}
### .mcp.json
{{MCP_JSON_CONTENT}}
{{/if}}

{{#if HAS_SETTINGS}}
### settings.json
{{SETTINGS_CONTENT}}
{{/if}}

Skills: {{SKILLS_LIST}} | Commands: {{COMMANDS_LIST}} | Workflows: {{WORKFLOWS_LIST}}

## IMPORTANT: Scan the filesystem directly — do NOT rely on manifest history

The manifest is a historical record, not a reliable source of what exists now.
Claude Code can create, modify, or delete files outside the CLI at any time.

Before removing anything, scan these locations directly:
- Skills   : `.claude/skills/*/SKILL.md`, `.claude/skills/*.md`, `.claude/skills/**/*.md`
- Commands : `.claude/commands/*.md` (exclude stack-*.md)
- MCP      : read `.mcp.json` directly
- Hooks    : read `.claude/settings.json` → look inside the `"hooks"` key
- CLAUDE.md: read the file directly
- Plugins  : check `/plugin` installed list

## What to remove for each type

### MCP servers
- Remove the server entry from `.mcp.json` → `mcpServers.<name>`
- Remove corresponding env vars from `.env.example` (if no other server uses them)
- Remove references in CLAUDE.md

### Hooks
- Remove from `.claude/settings.json` → `hooks.<EventName>` entries
- Hooks use this structure: `{ "hooks": { "PostToolUse": [{ "matcher": "...", "hooks": [...] }] } }`
- Remove the entire matcher entry if removing all hooks for that matcher

### Skills
- Delete the skill directory using the appropriate shell command:
  - macOS/Linux: run `rm -rf .claude/skills/<name>/`
  - Windows: run `rmdir /s /q ".claude\skills\<name>"`
- Verify deletion succeeded: confirm `.claude/skills/<name>/` no longer exists on disk
- Remove the skill reference from CLAUDE.md
- Remove from SKILLS_LIST in CLAUDE.md if referenced there

### Plugins
- Suggest: `/plugin uninstall <name>@<marketplace>`
- Print the exact uninstall command for the user

### Commands
- Delete the command file: `.claude/commands/<name>.md`

Before deleting, list every reference found and confirm scope:
```
Planning to remove:
  [path/entry] — [what it is]

Dangling references that will break:
  [path] — still references [thing being removed]
```

## Rules
- Find everything related to the removal request across ALL files — scan the filesystem, not just the data shown above.
- Remove surgically — section by section, key by key.
- Never delete an entire file unless it contains ONLY the thing being removed.
- Never remove content unrelated to the request.
- After every edit, the file MUST remain valid (JSON stays valid JSON, etc.)
- If not found anywhere: say so and stop.
- Check for dangling references: if removing an MCP server, check if any hook or skill references its env vars.

## Output — one line per file
Removed: ✅ [path] — [what was removed]
Not found: ⏭ [path] — not referenced
Dangling: ⚠️ [path] — still references [removed thing]
Suggested: 📦 To uninstall plugin: /plugin uninstall [name]@[marketplace]
