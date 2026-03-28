<!-- claude-setup sync {{DATE}} | last: {{LAST_RUN_DATE}} -->

> **Step 1 — always do this first:** Run `npx claude-setup sync` to refresh this file with the latest diff.
> - If it outputs "No changes since…" → respond "Stack already in sync." and STOP.
> - Otherwise → re-read `.claude/commands/stack-sync.md` (Step 2), then process the diff below (Step 3).

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

For EACH changed file: does this change have any implication for the Claude Code setup?

Reason about the signal:
- New dependency → new MCP server needed? New hook justified?
- New docker-compose service → new MCP entry? Env vars changed?
- Source file added/removed → CLAUDE.md paths stale? Skill still applies?
- Config deleted → remove its MCP/hook reference if it was the only evidence?

Update ONLY what the change demands.
Do NOT update things that did not change.
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
