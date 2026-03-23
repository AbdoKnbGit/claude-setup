<!-- claude-setup add {{DATE}} -->

Add to Claude Code setup: "{{USER_INPUT}}"

## Project context
{{PROJECT_CONTEXT}}

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

Skills: {{SKILLS_LIST}} | Commands: {{COMMANDS_LIST}}

## Rules
- Read current content before writing. Merge/append only.
- If request mentions something not in project files: ask first.

## Output — one line per file
Updated: ✅ [path] — [what and why]
Skipped: ⏭ [path] — [why]
