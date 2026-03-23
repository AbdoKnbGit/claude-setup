<!-- claude-setup {{VERSION}} {{DATE}} -->

Set up this project for Claude Code. Reason from what you see. Don't ask questions.

## Project

{{PROJECT_CONTEXT}}

{{#if HAS_SOURCE}}
## Source samples

{{SOURCE_CONTEXT}}
{{/if}}

## Existing setup — READ BEFORE WRITING

{{#if HAS_CLAUDE_MD}}
### CLAUDE.md (exists — append only)
{{CLAUDE_MD_CONTENT}}
{{else}}
CLAUDE.md: does not exist (create it)
{{/if}}

{{#if HAS_MCP_JSON}}
### .mcp.json (exists — merge only)
{{MCP_JSON_CONTENT}}
{{else}}
.mcp.json: create only if services evidenced above
{{/if}}

{{#if HAS_SETTINGS}}
### settings.json (exists — merge only)
{{SETTINGS_CONTENT}}
{{else}}
settings.json: create only if hooks warranted
{{/if}}

Skills: {{SKILLS_LIST}} | Commands: {{COMMANDS_LIST}} | Workflows: {{WORKFLOWS_LIST}} | .github: {{HAS_GITHUB_DIR}}

## Rules
1. Read existing content above before writing. Never write blind.
2. Append/merge only. Never rewrite or remove.
3. Every line must trace to something in the project. No generic boilerplate.
4. MCP/skills/hooks cost tokens every session. Only add if clearly earned.

## Output — one line per file, nothing else
Created: ✅ [path] — [why]
Updated: ✅ [path] — [what added]
Skipped: ⏭ [path] — [why not needed]
