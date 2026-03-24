import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { CollectedFiles } from "./collect.js"
import { ExistingState } from "./state.js"
import { loadConfig } from "./config.js"
import { detectOS } from "./os.js"

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
  // {{#if VAR}}...{{else}}...{{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}\n?([\s\S]*?)\{\{else\}\}\n?([\s\S]*?)\{\{\/if\}\}/g,
    (_m, key, ifBlock, elseBlock) => flags[key] ? ifBlock : elseBlock
  )
  // {{#if VAR}}...{{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}\n?([\s\S]*?)\{\{\/if\}\}/g,
    (_m, key, block) => flags[key] ? block : ""
  )
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
  return {
    HAS_SOURCE: _collected.source.length > 0,
    HAS_SKIPPED: _collected.skipped.length > 0,
    HAS_CLAUDE_MD: state.claudeMd.exists,
    HAS_MCP_JSON: state.mcpJson.exists,
    HAS_SETTINGS: state.settings.exists,
    HAS_GITHUB_DIR: state.hasGithubDir,
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
  return replaceVars(template, { VERSION: getVersion(), DATE: new Date().toISOString().split("T")[0] })
}

export function buildAddCommand(input: string, collected: CollectedFiles, state: ExistingState): string {
  return applyTemplate("add.md", collected, state, { USER_INPUT: input }, "add")
}

export interface FileDiff {
  added: Array<{ path: string; content: string }>
  changed: Array<{ path: string; current: string }>
  deleted: string[]
}

export function buildSyncCommand(diff: FileDiff, collected: CollectedFiles, state: ExistingState): string {
  // Compact diff format — paths + one-line summary, not full content
  const addedStr = diff.added.length > 0
    ? diff.added.map(f => `- **${f.path}** (new) — ${f.content.split("\n").length} lines`).join("\n")
    : "(none)"
  const modifiedStr = diff.changed.length > 0
    ? diff.changed.map(f => `- **${f.path}** (modified)`).join("\n")
    : "(none)"
  const deletedStr = diff.deleted.length > 0
    ? diff.deleted.map(f => `- ${f}`).join("\n")
    : "(none)"

  const lastRun = state.manifest?.runs.at(-1)
  return applyTemplate("sync.md", collected, state, {
    LAST_RUN_DATE: lastRun?.at ?? "unknown",
    ADDED_FILES: addedStr,
    MODIFIED_FILES: modifiedStr,
    DELETED_FILES: deletedStr,
  }, "sync")
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
      content: header + preamble +
        `## Target: .mcp.json\n\n` +
        (state.mcpJson.exists
          ? `### Current content — MERGE ONLY, never remove existing entries:\n${vars.MCP_JSON_CONTENT}\n\n`
          : `Does not exist.\n\n`) +
        `### When to create/update\n` +
        `Add an MCP server ONLY if you find evidence in /stack-0-context:\n` +
        `- Import statement referencing an external service\n` +
        `- docker-compose service (database, cache, queue)\n` +
        `- Env var name in .env.example matching a known service pattern\n` +
        `- Explicit dependency on an MCP-compatible package\n\n` +
        `No evidence = no server. Do not invent services.\n\n` +
        `### OS-correct format (detected: ${os})\n` +
        (os === "Windows"
          ? `Use: \`{ "command": "cmd", "args": ["/c", "npx", "<package>"] }\`\n`
          : `Use: \`{ "command": "npx", "args": ["<package>"] }\`\n`) +
        `\n### Rules\n` +
        `- All env var refs use \`\${VARNAME}\` syntax\n` +
        `- Produce valid JSON only\n` +
        `- If creating: document every new env var in .env.example\n\n` +
        `### Output\n` +
        `Created/Updated: ✅ .mcp.json — [what server and evidence source]\n` +
        `Skipped: ⏭ .mcp.json — checked [files], found [nothing], no action\n`,
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
        `### OS-correct hook format (detected: ${os})\n` +
        (os === "Windows"
          ? `Use: \`{ "command": "cmd", "args": ["/c", "<command>"] }\`\n`
          : `Use: \`{ "command": "bash", "args": ["-c", "<command>"] }\`\n` +
            `**Bash quoting rule**: never use bare \`"\` inside \`-c "..."\` — use \`\\x22\` instead.\n` +
            `Replace \`'\` with \`\\x27\`, \`$\` in character classes with \`\\x24\`.\n`) +
        `\n### Rules\n` +
        `- If it exists above: audit quoting of existing hooks first, fix broken ones\n` +
        `- Only add hooks for patterns that genuinely recur for this project type\n` +
        `- Produce valid JSON only\n\n` +
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
        `Create a skill ONLY if:\n` +
        `- A recurring multi-step project-specific pattern exists in /stack-0-context\n` +
        `- It is NOT something Claude already knows (standard patterns don't need skills)\n` +
        `- It will save time across multiple Claude Code sessions\n\n` +
        `### Rules\n` +
        `- Use \`applies-when:\` frontmatter so skills load only when relevant, not every message\n` +
        `- If a similar skill already exists above: extend it, don't create a parallel one\n` +
        `- Empty is valid — no skills is better than useless skills\n\n` +
        `### Output\n` +
        `Created: ✅ .claude/skills/[name] — [what pattern it captures]\n` +
        `Skipped: ⏭ skills — checked [patterns], found [nothing project-specific]\n`,
    },

    // --- Step 5: .claude/commands/ ---
    {
      filename: "stack-5-commands.md",
      content: header + preamble +
        `## Target: .claude/commands/ (excluding stack-*.md — those are setup artifacts)\n` +
        `Installed: ${vars.COMMANDS_LIST}\n\n` +
        `### When to create\n` +
        `Create a command ONLY for project-specific multi-step workflows a developer repeats:\n` +
        `- Deploy sequences\n` +
        `- Database migration + seed\n` +
        `- Release workflows\n` +
        `- Environment setup for a new contributor\n\n` +
        `Do NOT create commands for things expressible as a single shell alias.\n` +
        `Look at the scripts in /stack-0-context for evidence of multi-step workflows.\n\n` +
        `### Rules\n` +
        `- If existing commands cover the same workflow: skip\n` +
        `- Commands should be specific to this project, not generic\n\n` +
        `### Output\n` +
        `Created: ✅ .claude/commands/[name].md — [what workflow and why useful]\n` +
        `Skipped: ⏭ commands — [why no project-specific workflows found]\n`,
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
            `### .github/ does not exist\n` +
            `Do not create workflows. Print:\n` +
            `Skipped: ⏭ .github/workflows/ — .github/ directory does not exist\n`
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
