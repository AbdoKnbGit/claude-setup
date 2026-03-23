import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { CollectedFiles } from "./collect.js"
import { ExistingState } from "./state.js"
import { loadConfig } from "./config.js"

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
  }
}

function buildFlags(_collected: CollectedFiles, state: ExistingState): Record<string, boolean> {
  return {
    HAS_SOURCE: _collected.source.length > 0,
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

  const header = `<!-- claude-setup ${version} ${date} -->\n`
  const check = `Check if target already has this content. If yes: print "SKIPPED" and stop. Write only what's missing.\n\n`

  // Shared context block — written once to a reference file, not duplicated
  const sharedContext = header +
    `## Project\n\n${vars.PROJECT_CONTEXT}\n\n` +
    `{{#if HAS_SOURCE}}## Source samples\n\n${vars.SOURCE_CONTEXT}\n{{/if}}`

  const sharedContextProcessed = processConditionals(sharedContext, buildFlags(collected, state))

  const steps: AtomicStep[] = [
    {
      filename: "stack-0-context.md",
      content: sharedContextProcessed,
    },
    {
      filename: "stack-1-claude-md.md",
      content: header + check +
        `Read /stack-0-context for project info.\n\n` +
        `## Target: CLAUDE.md\n` +
        (state.claudeMd.exists
          ? `Current content (append only, never rewrite):\n${vars.CLAUDE_MD_CONTENT}\n\n`
          : `Does not exist. Create it.\n\n`) +
        `Write CLAUDE.md specific to this project. Reference actual paths and patterns. No generic boilerplate.`,
    },
    {
      filename: "stack-2-mcp.md",
      content: header + check +
        `Read /stack-0-context for project info.\n\n` +
        `## Target: .mcp.json\n` +
        (state.mcpJson.exists
          ? `Current (merge only, never remove):\n${vars.MCP_JSON_CONTENT}\n\n`
          : `Does not exist. Create only if services are evidenced.\n\n`) +
        `No evidence = no server. Valid JSON only.`,
    },
    {
      filename: "stack-3-settings.md",
      content: header + check +
        `Read /stack-0-context for project info.\n\n` +
        `## Target: .claude/settings.json\n` +
        (state.settings.exists
          ? `Current (merge only, never remove hooks):\n${vars.SETTINGS_CONTENT}\n\n`
          : `Does not exist. Create only if hooks earn their cost.\n\n`) +
        `Every hook runs on every action. Only add if clearly justified.`,
    },
    {
      filename: "stack-4-skills.md",
      content: header + check +
        `Read /stack-0-context for project info.\n\n` +
        `## Target: .claude/skills/\nInstalled: ${vars.SKILLS_LIST}\n\n` +
        `Only for recurring patterns. Use applies-when frontmatter. Empty is fine.`,
    },
    {
      filename: "stack-5-commands.md",
      content: header + check +
        `Read /stack-0-context for project info.\n\n` +
        `## Target: .claude/commands/ (not stack-*.md)\nInstalled: ${vars.COMMANDS_LIST}\n\n` +
        `Only useful commands for this project type. No duplicates.`,
    },
    {
      filename: "stack-6-workflows.md",
      content: header + check +
        `## Target: .github/workflows/\n.github/ exists: ${vars.HAS_GITHUB_DIR}\nInstalled: ${vars.WORKFLOWS_LIST}\n\n` +
        (state.hasGithubDir
          ? `Only warranted workflows. Don't touch existing ones.`
          : `Only create if clearly warranted.`),
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
