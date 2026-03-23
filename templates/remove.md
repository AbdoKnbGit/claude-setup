<!-- claude-setup remove {{DATE}} -->

Remove from setup: "{{USER_INPUT}}"

## Current setup

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

## Rules
- Remove only related content. Never delete entire files.
- Files must remain valid after edit (JSON stays valid, etc.)
- If not found: say so and stop.

## Output — one line per file
Removed: ✅ [path] — [what removed]
Not found: ⏭ [path] — not referenced
