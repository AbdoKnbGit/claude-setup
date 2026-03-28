<!-- claude-setup sync {{DATE}} | last: {{LAST_RUN_DATE}} -->

> **Step 1 — always do this first:** Run `npx claude-setup sync` to refresh this file with the latest diff.
> - If the output says **"No changes"** and shows "Setup is current" → respond "No changes detected since last sync. Everything is up to date." and STOP.
> - If the output shows **changes** (any "+N added", "~N modified", or "-N deleted" with N > 0) → continue to Step 2.
> **Step 2:** Re-read `.claude/commands/stack-sync.md` — it now contains the actual diff with line-level changes.
> **Step 3:** Process every change listed below. Update CLAUDE.md, .mcp.json, settings.json as needed.

**IMPORTANT:** Do NOT tell the user to "run /stack-sync" — you ARE running it right now. Process the diff below.

Project changed since last setup. Update ONLY what the changes demand.

## Changes since last setup

### Added files
{{ADDED_FILES}}

### Modified files
{{MODIFIED_FILES}}

### Deleted files
{{DELETED_FILES}}

## Current setup — read before touching

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

## Your job

For EACH changed file, update the Claude Code setup:

**Source files added/removed/modified — ALWAYS update CLAUDE.md:**
- New source directories or modules → add to key dirs section
- New routes, services, controllers → document the new endpoints/patterns
- New dependencies or frameworks → update runtime section
- Renamed or restructured files → update stale paths
- CLAUDE.md must reflect the CURRENT project structure, not just config files

**Config and infrastructure changes:**
- New dependency → new MCP server needed? New hook justified?
- New docker-compose service → new MCP entry? Env vars changed?
- Config deleted → remove its MCP/hook reference if it was the only evidence?

Do NOT rewrite files — surgical edits only.
If unsure about a change's implication: flag it, don't guess.

### Correct hooks format (if adding/modifying hooks)
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "<shell command>"
          }
        ]
      }
    ]
  }
}
```

## Output — one line per file, nothing else

Updated: ✅ [path] — triggered by: [which changed file and why]
Skipped: ⏭ [path] — [why this change has no setup implication]
Flagged: ⚠️ [something that needs the developer's decision]
