<!-- claude-setup add {{DATE}} -->

Add to Claude Code setup: "{{USER_INPUT}}"

## Project context
{{PROJECT_CONTEXT}}

## Current setup — read before writing anything

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
- Read current content above before writing. Merge/append only.
- If request mentions something not evidenced in project files: ask first.
- OS detected: {{DETECTED_OS}}. Use correct command format for MCP/hooks:
  - Windows: `{ "command": "cmd", "args": ["/c", "npx", "<pkg>"] }`
  - macOS/Linux: `{ "command": "npx", "args": ["<pkg>"] }`
- All env var refs use `${VARNAME}` syntax. Document new vars in .env.example.

## Output — one line per file
Updated: ✅ [path] — [what and why]
Skipped: ⏭ [path] — [why not needed for this request]
