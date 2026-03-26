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

---

{{MARKETPLACE_INSTRUCTIONS}}

---

## What you must actually do

Parse the user's request and take ALL applicable actions:

### 1. MCP servers
If the request mentions an external service (database, API, browser, etc.):
- Check the verified MCP package list below
- If found: add to `.mcp.json` with OS-correct format (detected: {{DETECTED_OS}})
- Use `${VARNAME}` syntax for all credentials — NEVER hardcode
- Document new env vars in `.env.example`

Verified MCP packages — ONLY use these for MCP servers:
```
playwright   → @playwright/mcp@latest
postgres     → @modelcontextprotocol/server-postgres
filesystem   → @modelcontextprotocol/server-filesystem
memory       → @modelcontextprotocol/server-memory
github       → @modelcontextprotocol/server-github
brave        → @modelcontextprotocol/server-brave-search
puppeteer    → @modelcontextprotocol/server-puppeteer
slack        → @modelcontextprotocol/server-slack
sqlite       → @modelcontextprotocol/server-sqlite
stripe       → @stripe/mcp@latest
redis        → @modelcontextprotocol/server-redis
mysql        → @benborla29/mcp-server-mysql
mongodb      → mcp-mongo-server
```

{{#if HAS_MCP_JSON}}
MCP format — merge into existing .mcp.json:
{{else}}
MCP format — create new .mcp.json:
{{/if}}
{{#if IS_WINDOWS}}
```json
{
  "mcpServers": {
    "server-name": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "<package>"],
      "env": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```
{{else}}
```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "<package>"],
      "env": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```
{{/if}}

### 2. Skills
If the request mentions skills or capabilities:
- Create `.claude/skills/<name>/SKILL.md` with proper frontmatter
- Use `description:` so Claude knows when to load the skill
- Search the marketplace for matching pre-built skills (see above)

Skill format:
```yaml
---
name: skill-name
description: What this skill does
---

Instructions...
```

### 3. Hooks
If the request implies automated actions (formatting, building, notifications):
- Add to `.claude/settings.json` using the CORRECT hooks format
- Verify the tool exists before adding a hook for it

Correct hooks format:
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

### 4. Plugins
If the request matches a marketplace category or SaaS platform:
- Suggest the relevant plugin with install commands
- Show the user exactly how to install it

### 5. CLAUDE.md
Document any new capabilities, services, or patterns added.

## Rules
- Read current content above before writing. Merge/append only.
- If request mentions something not evidenced in project files: ask first.
- OS detected: {{DETECTED_OS}}. Use correct command format for MCP/hooks.
- All env var refs use `${VARNAME}` syntax. Document new vars in .env.example.
- **NEVER write a "model" key into settings.json**
- Produce valid JSON only.

## Output — one line per file
Updated: ✅ [path] — [what and why]
Created: ✅ [path] — [what and why]
Skipped: ⏭ [path] — [why not needed for this request]
Suggested: 📦 [plugin name] — install with: /plugin install [name]@[marketplace]
