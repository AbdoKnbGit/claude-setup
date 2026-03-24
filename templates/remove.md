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
- Hooks    : read `.claude/settings.json` directly
- CLAUDE.md: read the file directly

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
- Never delete an entire file. Remove only the relevant section.
- Never remove content unrelated to the request.
- After every edit, the file MUST remain valid (JSON stays valid JSON, etc.)
- If not found anywhere: say so and stop.
- Check for dangling references: if removing an MCP server, check if any hook or skill references its env vars.

## Output — one line per file
Removed: ✅ [path] — [what was removed]
Not found: ⏭ [path] — not referenced
Dangling: ⚠️ [path] — still references [removed thing]
