<!-- claude-setup add {{DATE}} -->

Add to Claude Code setup: "{{USER_INPUT}}"

**CRITICAL: Marketplace-first. Do NOT ask clarifying questions. Search and install automatically.**
**Execute every curl/install command yourself. The user expects zero-friction automation.**
**A fetch failure is NOT a stop — it is a routing signal to the next catalog.**

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

### 1. Agents (if request is about agents/orchestration/subagents)
If the marketplace pipeline installed an agent file to `.claude/agents/`:
- Verify the file has YAML frontmatter (name, description, tools, model) and a body
- Document it in CLAUDE.md under a **separate agents section** (not mixed with skills)
- Agent entry format in CLAUDE.md:
  ```
  ## Agents
  - **agent-name** — what it orchestrates, when to invoke it
  ```

Agent files live in `.claude/agents/<name>.md` — NOT in `.claude/skills/`.
Agents and skills are architecturally different and must never be mixed.

### 2. MCP servers
If the request mentions an external service (database, API, browser, etc.):
- Check the verified MCP package list below
- If found: add to `.mcp.json` with OS-correct format (detected: {{DETECTED_OS}})
- **Smart connection strings** — follow this order:
  1. Check if the env var is already set in the environment
  2. If not set, detect if the service is installed locally (run check command below)
  3. If local service found: use default localhost URL directly in env block
  4. If nothing found: use `${VARNAME}` syntax and flag the missing var
- Document new env vars in `.env.example`

**Service detection commands ({{DETECTED_OS}}):**
{{#if IS_WINDOWS}}
- PostgreSQL: `where psql 2>nul` → default: `postgresql://localhost:5432/postgres`
- MongoDB: `where mongosh 2>nul` → default: `mongodb://localhost:27017`
- Redis: `where redis-cli 2>nul` → default: `redis://localhost:6379`
- MySQL: `where mysql 2>nul` → default: `mysql://root@localhost:3306`
{{else}}
{{#if IS_MACOS}}
- PostgreSQL: `command -v psql || brew list postgresql 2>/dev/null` → default: `postgresql://localhost:5432/postgres`
- MongoDB: `command -v mongosh || brew list mongodb-community 2>/dev/null` → default: `mongodb://localhost:27017`
- Redis: `command -v redis-cli || brew list redis 2>/dev/null` → default: `redis://localhost:6379`
- MySQL: `command -v mysql || brew list mysql 2>/dev/null` → default: `mysql://root@localhost:3306`
{{else}}
- PostgreSQL: `command -v psql` → default: `postgresql://localhost:5432/postgres`
- MongoDB: `command -v mongosh` → default: `mongodb://localhost:27017`
- Redis: `command -v redis-cli` → default: `redis://localhost:6379`
- MySQL: `command -v mysql` → default: `mysql://root@localhost:3306`
{{/if}}
{{#if IS_WSL}}
Note: WSL can access Windows-host services on localhost. If the service runs on the Windows side, it is reachable at `localhost` from WSL.
{{/if}}
{{/if}}

Run the check command. If the service IS installed locally and the env var is NOT set, use the default URL directly. This avoids the "MCP server not showing" problem where `${VARNAME}` fails silently.

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

### 3. Skills
If the request mentions skills or capabilities (NOT agents):
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

### 4. Hooks
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

### 5. CLAUDE.md
Document any new capabilities, services, or patterns added.
- Skills go under `## Skills` section
- Agents go under `## Agents` section (separate — never mixed)
- MCP servers go under `## MCP Servers` section

## Rules
- Read current content above before writing. Merge/append only.
- If request mentions something not evidenced in project files: ask first.
- OS detected: {{DETECTED_OS}}. Use correct command format for MCP/hooks.
- All env var refs use `${VARNAME}` syntax. Document new vars in .env.example.
- **NEVER write a "model" key into settings.json**
- Produce valid JSON only.
- Agents install to `.claude/agents/` — Skills install to `.claude/skills/`
- Every installed file must contain real, functional content (Rule 7).
- A fetch failure is a routing signal, not a stop condition (Rule 6).

## Output — one line per file
Updated: ✅ [path] — [what and why]
Created: ✅ [path] — [what and why]
Skipped: ⏭ [path] — [why not needed for this request]
Suggested: 📦 [plugin name] — install with: /plugin install [name]@[marketplace]
