import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { CollectedFiles } from "./collect.js"
import { ExistingState } from "./state.js"
import { loadConfig } from "./config.js"
import { detectOS, isUnixLike, VERIFIED_MCP_PACKAGES, buildServiceDiscoveryInstructions } from "./os.js"
import { buildMarketplaceInstructions } from "./marketplace.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(__dirname, "..", "templates")

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4)
}

function loadTemplate(name: string): string {
  return readFileSync(join(TEMPLATES_DIR, name), "utf8")
}

function replaceVars(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}

function processConditionals(template: string, flags: Record<string, boolean>): string {
  let result = template
  // Process innermost conditionals first, repeat until stable.
  // This prevents outer {{#if}} from greedily matching inner {{else}}/{{/if}}.
  let prev = ""
  while (prev !== result) {
    prev = result
    // {{#if VAR}}...{{else}}...{{/if}} first (innermost — no nested {{#if}} in either branch)
    result = result.replace(
      /\{\{#if\s+(\w+)\}\}\n?((?:(?!\{\{#if\b)[\s\S])*?)\{\{else\}\}\n?((?:(?!\{\{#if\b)[\s\S])*?)\{\{\/if\}\}/g,
      (_m, key, ifBlock, elseBlock) => flags[key] ? ifBlock : elseBlock
    )
    // Simple {{#if VAR}}...{{/if}} (no else, no nested if inside)
    result = result.replace(
      /\{\{#if\s+(\w+)\}\}\n?((?:(?!\{\{#if\b|\{\{else\}\})[\s\S])*?)\{\{\/if\}\}/g,
      (_m, key, block) => flags[key] ? block : ""
    )
  }
  return result
}

function formatList(items: string[]): string {
  return items.length === 0 ? "none" : items.join(", ")
}

function getVersion(): string {
  try {
    return JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")).version ?? "0.0.0"
  } catch { return "0.0.0" }
}

// --- Project context formatter ---
// This is the key optimization: instead of dumping raw files, we format
// the digest compactly. Full file content only when truly needed.

function formatProjectContext(collected: CollectedFiles): string {
  const lines: string[] = []

  // Digest (compact signal extraction)
  const digest = collected.configs["__digest__"]
  if (digest) {
    lines.push(digest)
  }

  // Additional config files that kept full content (docker-compose, etc.)
  for (const [name, content] of Object.entries(collected.configs)) {
    if (name === "__digest__" || name === ".env") continue
    lines.push(`\n### ${name}\n\`\`\`\n${content}\n\`\`\``)
  }

  return lines.join("\n") || "(no config files found)"
}

function formatSourceContext(source: CollectedFiles["source"]): string {
  if (source.length === 0) return ""

  return source
    .map(({ path, content }) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join("\n\n")
}

// --- Template variable building ---

function buildVars(collected: CollectedFiles, state: ExistingState): Record<string, string> {
  const skippedList = collected.skipped.length > 0
    ? collected.skipped.map(s => `- ${s.path} — ${s.reason}`).join("\n")
    : ""

  return {
    VERSION: getVersion(),
    DATE: new Date().toISOString().split("T")[0],
    PROJECT_CONTEXT: formatProjectContext(collected),
    SOURCE_CONTEXT: formatSourceContext(collected.source),
    CLAUDE_MD_CONTENT: state.claudeMd.content
      ? `\`\`\`\n${state.claudeMd.content}\n\`\`\``
      : "",
    MCP_JSON_CONTENT: state.mcpJson.content
      ? `\`\`\`json\n${state.mcpJson.content}\n\`\`\``
      : "",
    SETTINGS_CONTENT: state.settings.content
      ? `\`\`\`json\n${state.settings.content}\n\`\`\``
      : "",
    SKILLS_LIST: formatList(state.skills),
    COMMANDS_LIST: formatList(state.commands),
    WORKFLOWS_LIST: formatList(state.workflows),
    HAS_GITHUB_DIR: state.hasGithubDir ? "yes" : "no",
    SKIPPED_LIST: skippedList,
    DETECTED_OS: detectOS(),
  }
}

function buildFlags(_collected: CollectedFiles, state: ExistingState): Record<string, boolean> {
  const os = detectOS()
  return {
    HAS_SOURCE: _collected.source.length > 0,
    HAS_SKIPPED: _collected.skipped.length > 0,
    HAS_CLAUDE_MD: state.claudeMd.exists,
    HAS_MCP_JSON: state.mcpJson.exists,
    HAS_SETTINGS: state.settings.exists,
    HAS_GITHUB_DIR: state.hasGithubDir,
    IS_WINDOWS: os === "Windows",  // WSL uses Unix-style commands, not cmd
    IS_WSL: os === "WSL",
    IS_MACOS: os === "macOS",
    IS_UNIX_LIKE: isUnixLike(os),
  }
}

// --- Token budget enforcement ---

function fitToTokenBudget(content: string, sources: CollectedFiles["source"], hardCap: number): string {
  if (estimateTokens(content) <= hardCap) return content

  // Remove source files largest-first until under budget
  const sorted = [...sources].sort((a, b) => b.content.length - a.content.length)
  for (const remove of sorted) {
    const block = `### ${remove.path}\n\`\`\`\n${remove.content}\n\`\`\``
    content = content.replace(block, `[${remove.path} — trimmed]`)
    if (estimateTokens(content) <= hardCap) break
  }
  return content
}

function applyTemplate(
  templateName: string,
  collected: CollectedFiles,
  state: ExistingState,
  extraVars: Record<string, string> = {},
  budgetKey: "init" | "sync" | "add" | "remove" = "init"
): string {
  const config = loadConfig()
  const budget = config.tokenBudget[budgetKey]

  const template = loadTemplate(templateName)
  const vars = { ...buildVars(collected, state), ...extraVars }
  const flags = buildFlags(collected, state)

  let content = replaceVars(template, vars)
  content = processConditionals(content, flags)

  const tokens = estimateTokens(content)
  if (tokens > budget) {
    content = fitToTokenBudget(content, collected.source, budget)
    const finalTokens = estimateTokens(content)
    if (finalTokens > budget) {
      console.warn(`⚠️  ${templateName}: ${finalTokens} tokens (budget: ${budget})`)
    }
  }

  return content
}

// --- Public API ---

export function buildInitCommand(collected: CollectedFiles, state: ExistingState): string {
  return applyTemplate("init.md", collected, state, {}, "init")
}

export function buildEmptyProjectCommand(): string {
  const template = loadTemplate("init-empty.md")
  const vars = { VERSION: getVersion(), DATE: new Date().toISOString().split("T")[0], DETECTED_OS: detectOS() }
  const flags = { IS_WINDOWS: detectOS() === "Windows" }
  let content = replaceVars(template, vars)
  content = processConditionals(content, flags)
  return content
}

export function buildAddCommand(input: string, collected: CollectedFiles, state: ExistingState): string {
  const marketplaceSection = buildMarketplaceInstructions(input)
  return applyTemplate("add.md", collected, state, {
    USER_INPUT: input,
    MARKETPLACE_INSTRUCTIONS: marketplaceSection,
  }, "add")
}

export interface FileDiff {
  added: Array<{ path: string; content: string }>
  changed: Array<{ path: string; current: string; previous?: string; lineDiff?: { added: string[]; removed: string[]; summary: string } }>
  deleted: string[]
}

export function buildSyncCommand(diff: FileDiff, collected: CollectedFiles, state: ExistingState): string {
  // Rich diff format — paths + line-level changes for modified files
  const addedStr = diff.added.length > 0
    ? diff.added.map(f => `- **${f.path}** (new) — ${f.content.split("\n").length} lines`).join("\n")
    : "(none)"

  // Modified files now include line-level diffs
  let modifiedStr: string
  if (diff.changed.length > 0) {
    const parts: string[] = []
    for (const f of diff.changed) {
      const lines: string[] = [`- **${f.path}** (modified)`]
      if (f.lineDiff) {
        lines[0] += ` — ${f.lineDiff.summary}`
        if (f.lineDiff.removed.length > 0 || f.lineDiff.added.length > 0) {
          lines.push("  ```diff")
          for (const l of f.lineDiff.removed.slice(0, 8)) {
            lines.push(`  - ${l.trimEnd().slice(0, 120)}`)
          }
          for (const l of f.lineDiff.added.slice(0, 8)) {
            lines.push(`  + ${l.trimEnd().slice(0, 120)}`)
          }
          const totalShown = Math.min(f.lineDiff.removed.length, 8) + Math.min(f.lineDiff.added.length, 8)
          const total = f.lineDiff.removed.length + f.lineDiff.added.length
          if (total > totalShown) {
            lines.push(`  # ... +${total - totalShown} more changes`)
          }
          lines.push("  ```")
        }
      }
      parts.push(lines.join("\n"))
    }
    modifiedStr = parts.join("\n")
  } else {
    modifiedStr = "(none)"
  }

  const deletedStr = diff.deleted.length > 0
    ? diff.deleted.map(f => `- ~~${f}~~ (deleted)`).join("\n")
    : "(none)"

  const lastRun = state.manifest?.runs.at(-1)
  return applyTemplate("sync.md", collected, state, {
    LAST_RUN_DATE: lastRun?.at ?? "unknown",
    ADDED_FILES: addedStr,
    MODIFIED_FILES: modifiedStr,
    DELETED_FILES: deletedStr,
  }, "sync")
}

/**
 * Bootstrap stack-sync.md — installed by init so /stack-sync works immediately.
 * When run, it tells Claude to invoke npx claude-setup sync first (which
 * regenerates this file with the real diff), then re-read and process it.
 */
export function buildBootstrapSync(): string {
  return `<!-- stack-sync: self-refreshing sync command. Last generated: ${new Date().toISOString().split("T")[0]} -->

> **Step 1 — always do this first:** Run \`npx claude-setup sync\` to refresh this file with the latest diff.
> - If the output says **"No changes"** and shows "Setup is current" → respond "No changes detected since last sync. Everything is up to date." and STOP.
> - If the output shows **changes** (any "+N added", "~N modified", or "-N deleted" with N > 0) → it means the file has been regenerated. Continue to Step 2.
> **Step 2:** Re-read \`.claude/commands/stack-sync.md\` — it now contains the actual diff with line-level changes.
> **Step 3:** Process every change listed. Update CLAUDE.md, .mcp.json, settings.json as needed. Surgical edits only.

**IMPORTANT:** The sync command creates a snapshot AND regenerates this file. The "Run /stack-sync" message in the output is for YOU — it means this file is now ready to be re-read. Do NOT tell the user to run /stack-sync again.

## Changes since last setup

### Added files
(none — run \`npx claude-setup sync\` to populate)

### Modified files
(none)

### Deleted files
(none)

## Your job

For EACH changed file, update the Claude Code setup. New source files (routes, services, etc.) MUST be reflected in CLAUDE.md. Config changes may require .mcp.json or settings.json updates. Surgical edits only.
`
}

export function buildRemoveCommand(input: string, state: ExistingState): string {
  const emptyCollected: CollectedFiles = { configs: {}, source: [], skipped: [] }
  return applyTemplate("remove.md", emptyCollected, state, { USER_INPUT: input }, "remove")
}

// --- Atomic steps for init ---
// Key optimization: project context is shared once, not duplicated per step.

export interface AtomicStep {
  filename: string
  content: string
}

export function buildAtomicSteps(collected: CollectedFiles, state: ExistingState): AtomicStep[] {
  const version = getVersion()
  const date = new Date().toISOString().split("T")[0]
  const vars = buildVars(collected, state)
  const os = detectOS()

  const header = `<!-- claude-setup ${version} ${date} -->\n`
  const preamble = `Before writing: check if what you are about to write already exists in the target file (current content provided below if it exists). If already up to date: print "SKIPPED — already up to date" and stop. Write only what is genuinely missing.\n\nRead /stack-0-context for full project info.\n\n`

  // Shared context block — written once, referenced by all steps
  const sharedContext = header +
    `## Project\n\n${vars.PROJECT_CONTEXT}\n\n` +
    `{{#if HAS_SOURCE}}## Source samples\n\n${vars.SOURCE_CONTEXT}\n{{/if}}`

  const sharedContextProcessed = processConditionals(sharedContext, buildFlags(collected, state))

  const steps: AtomicStep[] = [
    {
      filename: "stack-0-context.md",
      content: sharedContextProcessed,
    },

    // --- Step 1: CLAUDE.md ---
    {
      filename: "stack-1-claude-md.md",
      content: header + preamble +
        `## Target: CLAUDE.md\n\n` +
        (state.claudeMd.exists
          ? `### Current content — APPEND ONLY, never rewrite, never remove:\n${vars.CLAUDE_MD_CONTENT}\n\n`
          : `Does not exist — create it.\n\n`) +
        `### What to write\n` +
        `CLAUDE.md is the most valuable artifact. Make it specific to THIS project:\n` +
        `- **Purpose**: one sentence describing what this project does\n` +
        `- **Runtime**: language, framework, key dependencies from /stack-0-context\n` +
        `- **Key dirs**: reference actual directory paths from the project tree\n` +
        `- **Run/test/build commands**: extract from scripts in /stack-0-context\n` +
        `- **Non-obvious conventions**: patterns you see in the source samples\n\n` +
        `### Rules\n` +
        `- Every line must reference something you actually saw in /stack-0-context\n` +
        `- No generic boilerplate. Two different projects must produce two different CLAUDE.md files\n` +
        `- If it exists above: read it fully, add only what is genuinely missing\n\n` +
        `### Output\n` +
        `Created/Updated: ✅ CLAUDE.md — [one clause: what you wrote and why]\n` +
        `Skipped: ⏭ CLAUDE.md — [why not needed]\n`,
    },

    // --- Step 2: .mcp.json ---
    {
      filename: "stack-2-mcp.md",
      content: (() => {
        const serviceDiscovery = buildServiceDiscoveryInstructions(process.cwd())
        return header + preamble +
        `## Target: .mcp.json\n\n` +
        (state.mcpJson.exists
          ? `### Current content — MERGE ONLY, never remove existing entries:\n${vars.MCP_JSON_CONTENT}\n\n`
          : `Does not exist.\n\n`) +
        `### When to create/update\n` +
        `Add an MCP server if you find ANY of these signals in /stack-0-context:\n` +
        `- Import statement referencing an external service (e.g., pg, mysql2, mongoose, redis, stripe)\n` +
        `- docker-compose service (database, cache, queue, message broker)\n` +
        `- Env var name in .env.example matching a known service pattern (DATABASE_URL, REDIS_URL, STRIPE_KEY, etc.)\n` +
        `- Explicit dependency on an MCP-compatible package\n` +
        `- User mentioned external services during init questions\n\n` +
        `If ANY evidence is found, create .mcp.json with the corresponding servers.\n` +
        `No evidence = no server. Do not invent services.\n\n` +
        (serviceDiscovery ? serviceDiscovery + `\n` : ``) +
        `### Verified MCP package names — ONLY use these\n` +
        `\`\`\`\n` +
        Object.entries(VERIFIED_MCP_PACKAGES).map(([k, v]) => `${k.padEnd(12)} → ${v}`).join("\n") +
        `\n\`\`\`\n` +
        `If the service is not in this list, print:\n` +
        `\`⚠️ UNKNOWN PACKAGE — [service] MCP server not added: package name unverified. Find it at https://github.com/modelcontextprotocol/servers\`\n` +
        `Do not add a placeholder. Do not guess.\n\n` +
        `### OS-correct format (detected: ${os}${os === "WSL" ? " — uses Unix-style commands, services reachable on localhost" : ""})\n` +
        `**Preferred: use CLI to add (writes to .mcp.json automatically):**\n` +
        (os === "Windows"
          ? `\`\`\`\nclaude mcp add --scope project --transport stdio <name> -- cmd /c npx -y <package>\n\`\`\`\n`
          : `\`\`\`\nclaude mcp add --scope project --transport stdio <name> -- npx -y <package>\n\`\`\`\n`) +
        `**Or write .mcp.json directly:**\n` +
        (os === "Windows"
          ? `Use: \`{ "command": "cmd", "args": ["/c", "npx", "-y", "<package>"] }\`\n`
          : `Use: \`{ "command": "npx", "args": ["-y", "<package>"] }\`\n`) +
        `Always include \`-y\` in npx args to prevent install hangs.\n` +
        (os === "WSL" ? `Note: WSL uses Unix-style npx — do NOT use \`cmd /c\` wrapper.\n` : ``) +
        (os === "macOS" ? `Note: On macOS, Homebrew services run on localhost by default. Check with \`brew services list\`.\n` : ``) +
        `\n` +
        `### Connection strings — smart auto-configuration\n` +
        `For each MCP server that needs a connection string:\n` +
        `1. **Check environment first:** If \`\${VARNAME}\` is set in the user's environment, use \`"env": { "VAR": "\${VAR}" }\`\n` +
        `2. **Detect local service:** Run the OS-appropriate check command to see if the service is installed locally\n` +
        (os === "Windows"
          ? `   - PostgreSQL: \`where psql 2>nul\`\n   - MongoDB: \`where mongosh 2>nul\`\n   - Redis: \`where redis-cli 2>nul\`\n   - MySQL: \`where mysql 2>nul\`\n`
          : os === "macOS"
          ? `   - PostgreSQL: \`command -v psql || brew list postgresql 2>/dev/null\`\n   - MongoDB: \`command -v mongosh || brew list mongodb-community 2>/dev/null\`\n   - Redis: \`command -v redis-cli || brew list redis 2>/dev/null\`\n   - MySQL: \`command -v mysql || brew list mysql 2>/dev/null\`\n`
          : `   - PostgreSQL: \`command -v psql\`\n   - MongoDB: \`command -v mongosh\`\n   - Redis: \`command -v redis-cli\`\n   - MySQL: \`command -v mysql\`\n`) +
        `3. **If local service found and env var NOT set:** Use the well-known default URL directly in the env block:\n` +
        `   - PostgreSQL: \`postgresql://localhost:5432/postgres\`\n` +
        `   - MongoDB: \`mongodb://localhost:27017\`\n` +
        `   - Redis: \`redis://localhost:6379\`\n` +
        `   - MySQL: \`mysql://root@localhost:3306\`\n` +
        `   AND document the var in .env.example with the default value\n` +
        `4. **If neither env var nor local service found:** Use \`\${VARNAME}\` syntax and flag:\n` +
        `   \`⚠️ Set VARNAME in your environment or .env file before starting Claude Code\`\n\n` +
        `**NEVER hardcode credentials.** Default localhost URLs are acceptable for dev environments.\n` +
        `After adding any server with env vars, always document them in .env.example.\n\n` +
        `### Rules\n` +
        `- Produce valid JSON only\n` +
        `- If creating: document every new env var in .env.example\n` +
        `- OS format must match detected OS: ${os}\n\n` +
        `### Channels (Telegram, Discord) — special MCP servers\n` +
        `Channels are MCP servers that push events INTO a session. They require:\n` +
        `- Claude Code v2.1.80+\n` +
        `- claude.ai login (not API key / Console)\n` +
        `- Bun runtime installed\n` +
        `- \`--channels\` flag at EVERY session launch\n\n` +
        `Verified channel plugins:\n` +
        `\`\`\`\n` +
        `Telegram → plugin:telegram@claude-plugins-official\n` +
        `Discord  → plugin:discord@claude-plugins-official\n` +
        `\`\`\`\n\n` +
        `If adding a channel-type server, bot tokens must NEVER be hardcoded:\n` +
        (os === "Windows"
          ? `\`{ "command": "cmd", "args": ["/c", "bun", "run", "\${CLAUDE_PLUGIN_ROOT}/servers/telegram"], "env": { "TELEGRAM_BOT_TOKEN": "\${TELEGRAM_BOT_TOKEN}" } }\`\n`
          : `\`{ "command": "bun", "args": ["run", "\${CLAUDE_PLUGIN_ROOT}/servers/telegram"], "env": { "TELEGRAM_BOT_TOKEN": "\${TELEGRAM_BOT_TOKEN}" } }\`\n`) +
        (os === "WSL" ? `(WSL note: Bun must be installed inside WSL, not the Windows-side installation.)\n` : ``) +
        `After adding, flag: \`⚠️ CHANNEL ACTIVATION REQUIRED — launch with: claude --channels plugin:telegram@claude-plugins-official\`\n\n` +
        `### Self-correction fallback\n` +
        `If MCP configuration fails or produces warnings:\n` +
        `1. Read the official MCP documentation: https://modelcontextprotocol.io/introduction\n` +
        `2. Verify the package name against the MCP servers registry: https://github.com/modelcontextprotocol/servers\n` +
        `3. Check the server's README for required env vars and correct args format\n` +
        `4. Re-run \`npx claude-setup doctor\` to validate the fix\n` +
        `Do NOT leave broken MCP configuration in place — either fix it or remove the entry.\n\n` +
        `### Output\n` +
        `Created/Updated: ✅ .mcp.json — [what server and evidence source]\n` +
        `Skipped: ⏭ .mcp.json — checked [files], found [nothing], no action\n`
      })(),
    },

    // --- Step 3: .claude/settings.json ---
    {
      filename: "stack-3-settings.md",
      content: header + preamble +
        `## Target: .claude/settings.json\n\n` +
        (state.settings.exists
          ? `### Current content — MERGE ONLY, never remove existing hooks:\n${vars.SETTINGS_CONTENT}\n\n`
          : `Does not exist.\n\n`) +
        `### When to create/update\n` +
        `Add a hook ONLY if it runs on a pattern that repeats every session AND the cost is justified.\n` +
        `Every hook adds overhead on every Claude Code action. Only add if clearly earned.\n\n` +
        `### CORRECT Claude Code hooks format — USE THIS EXACTLY\n` +
        `The hooks object must be nested inside a top-level \`"hooks"\` key.\n` +
        `Each event contains an array of matcher objects, each with its own \`"hooks"\` array.\n\n` +
        `\`\`\`json\n` +
        `{\n` +
        `  "hooks": {\n` +
        `    "PostToolUse": [\n` +
        `      {\n` +
        `        "matcher": "Edit|Write",\n` +
        `        "hooks": [\n` +
        `          {\n` +
        `            "type": "command",\n` +
        `            "command": "<shell command here>"\n` +
        `          }\n` +
        `        ]\n` +
        `      }\n` +
        `    ]\n` +
        `  }\n` +
        `}\n` +
        `\`\`\`\n\n` +
        `**WRONG formats (do NOT use):**\n` +
        `- \`"hooks": { "post-edit": ["mvn compile"] }\` — INVALID event name and structure\n` +
        `- \`"PostToolUse": [{ "command": "bash", "args": [...] }]\` — missing top-level "hooks" key\n` +
        `- \`{ "command": "cmd", "args": ["/c", "..."] }\` — old format, must use "type": "command"\n\n` +
        `### Valid hook event names — use ONLY these\n` +
        `\`PreToolUse\`, \`PostToolUse\`, \`PostToolUseFailure\`, \`Stop\`, \`SessionStart\`,\n` +
        `\`Notification\`, \`UserPromptSubmit\`, \`PermissionRequest\`, \`ConfigChange\`,\n` +
        `\`SubagentStart\`, \`SubagentStop\`, \`SessionEnd\`\n\n` +
        `### Matcher patterns\n` +
        `- \`"Edit|Write"\` — fires only on file edits\n` +
        `- \`"Bash"\` — fires only on shell commands\n` +
        `- \`""\` (empty) — fires on all occurrences of the event\n\n` +
        `### BUG 8 FIX: Verify build tools exist BEFORE adding hooks\n` +
        `Before adding any hook that runs a build tool, verify it is installed:\n` +
        (os === "Windows"
          ? `\`\`\`\nwhere mvn 2>nul && mvn compile -q\nwhere gradle 2>nul && gradle build\nwhere npm 2>nul && npm run build\n\`\`\`\n`
          : `\`\`\`\ncommand -v mvn && mvn compile -q\ncommand -v gradle && gradle build\ncommand -v npm && npm run build\n\`\`\`\n`) +
        `If the tool is NOT installed:\n` +
        `- Wrap the command with an existence check: \`command -v mvn && mvn compile -q\`\n` +
        `- OR skip the hook and print: \`⚠️ SKIPPED mvn hook — Maven not found. Install Maven first.\`\n` +
        `- NEVER add a hook for a tool that doesn't exist on the system\n\n` +
        `### Rules\n` +
        `- **NEVER write a "model" key into settings.json** — it overrides the user's model selection silently\n` +
        `- If it exists above: audit quoting of existing hooks first, fix broken ones\n` +
        `- Only add hooks for patterns that genuinely recur for this project type\n` +
        `- Produce valid JSON only\n` +
        `- The \`"type"\` field in each hook must be one of: \`"command"\`, \`"prompt"\`, \`"agent"\`, \`"http"\`\n\n` +
        `### Output\n` +
        `Created/Updated: ✅ settings.json — [hook name and justification]\n` +
        `Skipped: ⏭ settings.json — [why no hooks warranted]\n`,
    },

    // --- Step 4: .claude/skills/ ---
    {
      filename: "stack-4-skills.md",
      content: header + preamble +
        `## Target: .claude/skills/\n` +
        `Installed: ${vars.SKILLS_LIST}\n\n` +
        `### When to create\n` +
        `Create a skill if:\n` +
        `- A recurring multi-step project-specific pattern exists in /stack-0-context\n` +
        `- The project type has standard workflows worth automating (build, deploy, test patterns)\n` +
        `- It will save time across multiple Claude Code sessions\n\n` +
        `### Correct skill file format\n` +
        `Skills must be created as \`.claude/skills/<skill-name>/SKILL.md\` with YAML frontmatter:\n\n` +
        `\`\`\`yaml\n` +
        `---\n` +
        `name: skill-name\n` +
        `description: What this skill does and when to use it\n` +
        `---\n\n` +
        `Skill instructions here...\n` +
        `\`\`\`\n\n` +
        `Optional frontmatter fields:\n` +
        `- \`disable-model-invocation: true\` — only user can invoke (for commands with side effects)\n` +
        `- \`allowed-tools: Read, Grep\` — restrict which tools the skill can use\n` +
        `- \`context: fork\` — run in isolated subagent\n` +
        `- \`agent: Explore\` — which agent type to use with context: fork\n\n` +
        `### Project-specific skills to consider\n` +
        `Based on what you see in /stack-0-context, consider creating skills for:\n` +
        `- Build/deploy workflows specific to this stack\n` +
        `- Code review patterns specific to this codebase\n` +
        `- Database migration patterns if migration files exist\n` +
        `- Testing patterns if test infrastructure exists\n\n` +
        `### Rules\n` +
        `- Use \`description:\` frontmatter so Claude knows when to load the skill\n` +
        `- If a similar skill already exists above: extend it, don't create a parallel one\n` +
        `- Empty is valid — no skills is better than useless skills\n` +
        `- Each skill directory MUST contain a SKILL.md file\n\n` +
        `### Output\n` +
        `Created: ✅ .claude/skills/[name]/SKILL.md — [what pattern it captures]\n` +
        `Skipped: ⏭ skills — checked [patterns], found [nothing project-specific]\n`,
    },

    // --- Step 5: .claude/commands/ ---
    {
      filename: "stack-5-commands.md",
      content: header + preamble +
        `## Target: .claude/commands/ (excluding stack-*.md — those are setup artifacts)\n` +
        `Installed: ${vars.COMMANDS_LIST}\n\n` +
        `### When to create\n` +
        `Create a command ONLY for project-specific multi-step workflows a developer repeats.\n` +
        `Do NOT create commands for things expressible as a single shell alias.\n\n` +
        `### Smart environment detection\n` +
        `Also scan for missing/incomplete environment setup:\n` +
        `- \`.env.example\` exists but \`.env\` missing → suggest \`/setup-env\`\n` +
        `- \`docker-compose.yml\` with \`depends_on\` → suggest \`/up\` with correct startup order\n` +
        `- Database migration files (\`migrations/\`, \`prisma/schema.prisma\`, \`alembic/\`) → suggest \`/db:migrate\`, \`/db:rollback\`\n` +
        `- \`package.json\` with \`"prepare"\` or \`"postinstall"\` hooks → suggest \`/install\`\n` +
        `- \`Makefile\` with \`install\`, \`deps\`, \`bootstrap\` → fold into \`/init\`\n` +
        `- README sections ("Environment Variables", "Database Setup") → each can become a command\n\n` +
        `All suggestions must be built from actual project files — never assume fixed commands.\n` +
        `Detect the real tooling (npm vs yarn vs pnpm, docker compose vs docker-compose) from project evidence.\n\n` +
        `### REQUIRED: Scan for multi-step patterns before deciding\n` +
        `You MUST actively scan these sources in /stack-0-context:\n` +
        `- **Makefile targets**: multiple chained commands under one target\n` +
        `- **package.json scripts**: chained commands with && or ;\n` +
        `- **docker-compose.yml**: service dependencies implying a boot order\n` +
        `- **Dockerfile**: multi-stage patterns implying a build sequence\n` +
        `- **README.md / docs**: sections like "Getting Started", "How to run"\n` +
        `- **Shell scripts** in /scripts or /bin\n` +
        `- **.env.example**: many vars suggest a setup sequence\n\n` +
        `### Pattern signatures to detect\n` +
        `| Pattern found | Suggested command |\n` +
        `|---------------|-------------------|\n` +
        `| docker-compose down + volume removal + build + up | /clean-rebuild |\n` +
        `| migrate + seed + start | /fresh-start |\n` +
        `| build + test + deploy | /release |\n` +
        `| lint + format + typecheck all separate | /check |\n` +
        `| setup + install + configure in README or scripts | /init |\n` +
        `| backup/restore scripts or pg_dump/mongodump | /db:backup, /db:restore |\n` +
        `| test + test:watch + test:coverage | /test |\n` +
        `| dev + start + debug in package.json | /dev |\n` +
        `| >2 manual steps in README "how to run" | candidate for /start |\n\n` +
        `For each pattern found, suggest to the user:\n` +
        `\`\`\`\n` +
        `## Suggested command: /[name]\n\n` +
        `I found a multi-step pattern in [source]:\n` +
        `  1. [step]\n` +
        `  2. [step]\n\n` +
        `Create .claude/commands/[name].md?\n` +
        `\`\`\`\n\n` +
        `### Rules\n` +
        `- If existing commands cover the same workflow: skip\n` +
        `- Commands should be specific to this project, not generic\n` +
        `- Adapt exact commands from actual project files — never hardcode\n` +
        `- Never skip with a blanket "no workflows found" without scanning all sources above\n\n` +
        `### Output\n` +
        `Created: ✅ .claude/commands/[name].md — [what workflow and why useful]\n` +
        `Skipped: ⏭ commands — scanned [list each source checked and result]. Nothing warranted.\n`,
    },

    // --- Step 6: .github/workflows/ ---
    {
      filename: "stack-6-workflows.md",
      content: header +
        `## Target: .github/workflows/\n` +
        `.github/ exists: ${vars.HAS_GITHUB_DIR}\n` +
        `Installed: ${vars.WORKFLOWS_LIST}\n\n` +
        (state.hasGithubDir
          ? (
            `### What to do\n` +
            `Check /stack-0-context for CI evidence: tests dir, Dockerfile, CI-related scripts.\n` +
            `If evidence found, print EXACTLY:\n\n` +
            `\`\`\`\n` +
            `⚙️  CI/CD GATE — action required\n\n` +
            `Evidence found:\n` +
            `  [list each piece of evidence]\n\n` +
            `Two questions before I proceed:\n` +
            `  1. Set up CI/CD? (yes / no / later)\n` +
            `  2. Connected to a remote GitHub repo? (yes / no)\n\n` +
            `I will not write .github/workflows/ until you answer.\n` +
            `\`\`\`\n\n` +
            `### Rules\n` +
            `- NEVER create or modify workflows without explicit developer confirmation\n` +
            `- If existing workflows exist: do not touch them\n` +
            `- Secrets must use \`\${{ secrets.VARNAME }}\` syntax only\n`
          )
          : (
            `### .github/ does not exist — scan for CI/CD evidence before skipping\n\n` +
            `The absence of .github/ is an opportunity to suggest, not a reason to stop.\n\n` +
            `Scan /stack-0-context for CI/CD evidence:\n` +
            `- \`tests/\` or \`__tests__/\` or \`spec/\` directory → test pipeline candidate\n` +
            `- \`Dockerfile\` or \`docker-compose.yml\` → build + deploy pipeline candidate\n` +
            `- \`package.json\` with build/test/lint scripts → Node CI candidate\n` +
            `- \`Makefile\` with test/build/deploy targets → generic CI candidate\n` +
            `- \`pyproject.toml\` with test config → Python CI candidate\n` +
            `- README references to "deploy", "release", "staging", "production"\n\n` +
            `If evidence found, print EXACTLY:\n` +
            `\`\`\`\n` +
            `⚙️  WORKFLOW SUGGESTION — .github/ does not exist\n\n` +
            `Evidence that CI/CD would be useful:\n` +
            `  [list each piece of evidence and its source]\n\n` +
            `I can set up:\n` +
            `  1. CI pipeline     — run tests + build on every push\n` +
            `  2. Deploy pipeline — build image + push to registry on merge to main\n` +
            `  3. Both\n\n` +
            `Two questions before I create anything:\n` +
            `  1. Which of the above? (1 / 2 / 3 / none)\n` +
            `  2. Is this connected to a remote GitHub repository? (yes / no)\n` +
            `\`\`\`\n\n` +
            `If user confirms: create .github/workflows/ with workflows based on actual project commands.\n` +
            `All secrets must use \`\${{ secrets.VARNAME }}\` syntax — never hardcoded.\n` +
            `After writing, flag every secret: \`⚠️ Add [VARNAME] to GitHub Settings → Secrets\`\n\n` +
            `If NO evidence found:\n` +
            `Skipped: ⏭ .github/workflows/ — scanned: no tests dir, no Dockerfile, no build/deploy scripts, no deployment references. Nothing to automate.\n`
          )),
    },
  ]

  return steps
}

export function buildOrchestratorCommand(steps: AtomicStep[]): string {
  const version = getVersion()
  const date = new Date().toISOString().split("T")[0]

  // Skip step 0 (context) in the run list — it's referenced by other steps
  const runSteps = steps.filter(s => s.filename !== "stack-0-context.md")
  const stepList = runSteps
    .map((s, i) => `${i + 1}. /${s.filename.replace(".md", "")}`)
    .join("\n")

  return `<!-- claude-setup ${version} ${date} -->

Run these in order. If one fails, fix and continue from that step.

${stepList}

After all complete: one-line summary of what was created.
`
}
