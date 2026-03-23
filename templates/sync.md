<!-- claude-setup sync {{DATE}} | last: {{LAST_RUN_DATE}} -->

Project changed since last setup. Update only what the changes demand.

## Changes
### Added
{{ADDED_FILES}}
### Modified
{{MODIFIED_FILES}}
### Deleted
{{DELETED_FILES}}

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
- Surgical edits only. Don't rewrite files. Don't update unchanged things.
- If unsure about a change's implication: flag it, don't guess.

## Output — one line per file
Updated: ✅ [path] — triggered by: [which change and why]
Skipped: ⏭ [path] — [why no implication]
Flagged: ⚠️ [needs developer decision]
