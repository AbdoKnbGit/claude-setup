import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { CollectedFiles } from "./collect.js"
import { ExistingState } from "./state.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(__dirname, "..", "templates")

const TOKEN_SOFT_WARN = 8_000
const TOKEN_HARD_CAP = 20_000

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4)
}

function loadTemplate(name: string): string {
  return readFileSync(join(TEMPLATES_DIR, name), "utf8")
}

// Simple {{VARIABLE}} replacement
function replaceVars(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}

// Conditional blocks: {{#if VAR}}...{{else}}...{{/if}} and {{#if VAR}}...{{/if}}
function processConditionals(template: string, flags: Record<string, boolean>): string {
  // Handle {{#if VAR}}...{{else}}...{{/if}}
  let result = template
  const ifElseRegex = /\{\{#if\s+(\w+)\}\}\n?([\s\S]*?)\{\{else\}\}\n?([\s\S]*?)\{\{\/if\}\}/g
  result = result.replace(ifElseRegex, (_match, key, ifBlock, elseBlock) => {
    return flags[key] ? ifBlock : elseBlock
  })

  // Handle {{#if VAR}}...{{/if}} (no else)
  const ifRegex = /\{\{#if\s+(\w+)\}\}\n?([\s\S]*?)\{\{\/if\}\}/g
  result = result.replace(ifRegex, (_match, key, block) => {
    return flags[key] ? block : ""
  })

  return result
}

function formatConfigFiles(configs: Record<string, string>): string {
  if (Object.keys(configs).length === 0) return "(no config files found)"

  return Object.entries(configs)
    .map(([path, content]) => {
      return `#### ${path}\n\`\`\`\n${content}\n\`\`\``
    })
    .join("\n\n")
}

function formatSourceFiles(source: CollectedFiles["source"]): string {
  if (source.length === 0) return "(no source files sampled)"

  return source
    .map(({ path, content }) => {
      return `#### ${path}\n\`\`\`\n${content}\n\`\`\``
    })
    .join("\n\n")
}

function formatSkippedFiles(skipped: CollectedFiles["skipped"]): string {
  return skipped.map(({ path, reason }) => `- ${path} — ${reason}`).join("\n")
}

function formatList(items: string[]): string {
  if (items.length === 0) return "none"
  return items.join(", ")
}

function buildVars(collected: CollectedFiles, state: ExistingState): Record<string, string> {
  const version = getVersion()
  const date = new Date().toISOString().split("T")[0]

  return {
    VERSION: version,
    DATE: date,
    CONFIG_FILES: formatConfigFiles(collected.configs),
    SOURCE_FILES: formatSourceFiles(collected.source),
    SKIPPED_LIST: formatSkippedFiles(collected.skipped),
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

function buildFlags(collected: CollectedFiles, state: ExistingState): Record<string, boolean> {
  return {
    HAS_SKIPPED: collected.skipped.length > 0,
    HAS_CLAUDE_MD: state.claudeMd.exists,
    HAS_MCP_JSON: state.mcpJson.exists,
    HAS_SETTINGS: state.settings.exists,
    HAS_GITHUB_DIR: state.hasGithubDir,
  }
}

function getVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "package.json")
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
    return pkg.version ?? "0.0.0"
  } catch {
    return "0.0.0"
  }
}

function fitToTokenBudget(content: string, sources: CollectedFiles["source"]): string {
  if (estimateTokens(content) <= TOKEN_HARD_CAP) return content

  // Progressively remove source files, largest first
  const sorted = [...sources].sort((a, b) => b.content.length - a.content.length)
  for (const remove of sorted) {
    const sourceBlock = `#### ${remove.path}\n\`\`\`\n${remove.content}\n\`\`\``
    content = content.replace(sourceBlock, `[${remove.path} — removed to fit token budget]`)
    if (estimateTokens(content) <= TOKEN_HARD_CAP) break
  }

  return content
}

function applyTemplate(
  templateName: string,
  collected: CollectedFiles,
  state: ExistingState,
  extraVars: Record<string, string> = {}
): string {
  const template = loadTemplate(templateName)
  const vars = { ...buildVars(collected, state), ...extraVars }
  const flags = buildFlags(collected, state)

  let content = replaceVars(template, vars)
  content = processConditionals(content, flags)

  const tokens = estimateTokens(content)
  if (tokens > TOKEN_SOFT_WARN) {
    console.warn(`⚠️  Command file is ${tokens} tokens (soft limit: ${TOKEN_SOFT_WARN})`)
  }

  content = fitToTokenBudget(content, collected.source)
  return content
}

export function buildInitCommand(collected: CollectedFiles, state: ExistingState): string {
  return applyTemplate("init.md", collected, state)
}

export function buildEmptyProjectCommand(): string {
  const template = loadTemplate("init-empty.md")
  const version = getVersion()
  const date = new Date().toISOString().split("T")[0]
  return replaceVars(template, { VERSION: version, DATE: date })
}

export function buildAddCommand(input: string, collected: CollectedFiles, state: ExistingState): string {
  return applyTemplate("add.md", collected, state, { USER_INPUT: input })
}

export interface FileDiff {
  added: Array<{ path: string; content: string }>
  changed: Array<{ path: string; current: string }>
  deleted: string[]
}

export function buildSyncCommand(diff: FileDiff, collected: CollectedFiles, state: ExistingState): string {
  const lastRun = state.manifest?.runs.at(-1)
  const addedStr = diff.added.length > 0
    ? diff.added.map(f => `#### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n")
    : "(none)"
  const modifiedStr = diff.changed.length > 0
    ? diff.changed.map(f => `#### ${f.path}\n\`\`\`\n${f.current}\n\`\`\``).join("\n\n")
    : "(none)"
  const deletedStr = diff.deleted.length > 0
    ? diff.deleted.map(f => `- ${f}`).join("\n")
    : "(none)"

  return applyTemplate("sync.md", collected, state, {
    LAST_RUN_DATE: lastRun?.at ?? "unknown",
    ADDED_FILES: addedStr,
    MODIFIED_FILES: modifiedStr,
    DELETED_FILES: deletedStr,
  })
}

export function buildRemoveCommand(input: string, state: ExistingState): string {
  // Remove uses a minimal collected set — no project files needed
  const emptyCollected: CollectedFiles = { configs: {}, source: [], skipped: [] }
  return applyTemplate("remove.md", emptyCollected, state, { USER_INPUT: input })
}

// Atomic step builder for init
export interface AtomicStep {
  filename: string
  content: string
}

export function buildAtomicSteps(collected: CollectedFiles, state: ExistingState): AtomicStep[] {
  const fullContent = buildInitCommand(collected, state)
  const vars = buildVars(collected, state)
  const flags = buildFlags(collected, state)
  const version = getVersion()
  const date = new Date().toISOString().split("T")[0]

  const preamble = `<!-- Generated by claude-stack ${version} on ${date} — DO NOT hand-edit -->\n`
  const idempotentCheck = `\nBefore writing: check if what you are about to write already exists in the target file\n(current content provided below). If yes: print "SKIPPED — already up to date" and stop.\nWrite only what is genuinely missing.\n\n`

  // Each step gets project context + specific instructions for its target
  const steps: AtomicStep[] = [
    {
      filename: "stack-1-claude-md.md",
      content: preamble + idempotentCheck +
        `## Project context\n\n${vars.CONFIG_FILES}\n\n${vars.SOURCE_FILES}\n\n` +
        `## Target: CLAUDE.md\n\n` +
        (state.claudeMd.exists
          ? `### Current CLAUDE.md — EXISTS — append only, never rewrite, never remove\n${vars.CLAUDE_MD_CONTENT}\n\n`
          : `CLAUDE.md does not exist. Create it.\n\n`) +
        `Write or update CLAUDE.md for THIS specific project.\nMake it specific: reference actual file paths, actual patterns, actual conventions from the source above.\nNo generic boilerplate. Every line must trace back to something in the project files.\n` +
        (state.claudeMd.exists ? `\nAppend only — never rewrite or remove existing content.` : ""),
    },
    {
      filename: "stack-2-mcp.md",
      content: preamble + idempotentCheck +
        `## Project context\n\n${vars.CONFIG_FILES}\n\n` +
        `## Target: .mcp.json\n\n` +
        (state.mcpJson.exists
          ? `### Current .mcp.json — EXISTS — merge only, never remove existing entries\n${vars.MCP_JSON_CONTENT}\n\n`
          : `.mcp.json does not exist. Create only if you find evidence of external services in the config files above.\n\n`) +
        `Only add MCP servers for services evidenced in the project files. No evidence = no server.\n` +
        (state.mcpJson.exists ? `Merge only — never remove existing entries. Produce valid JSON.` : ""),
    },
    {
      filename: "stack-3-settings.md",
      content: preamble + idempotentCheck +
        `## Project context\n\n${vars.CONFIG_FILES}\n\n` +
        `## Target: .claude/settings.json\n\n` +
        (state.settings.exists
          ? `### Current settings.json — EXISTS — merge only, never remove existing hooks\n${vars.SETTINGS_CONTENT}\n\n`
          : `.claude/settings.json does not exist. Create only if hooks are genuinely warranted for this project.\n\n`) +
        `Every hook adds overhead on every Claude Code action. Only add if clearly earned for THIS project.\n` +
        (state.settings.exists ? `Merge only — never remove existing hooks. Never modify existing values.` : ""),
    },
    {
      filename: "stack-4-skills.md",
      content: preamble + idempotentCheck +
        `## Project context\n\n${vars.CONFIG_FILES}\n\n${vars.SOURCE_FILES}\n\n` +
        `## Target: .claude/skills/\n\n` +
        `Skills installed: ${vars.SKILLS_LIST}\n\n` +
        `Only create skills for patterns that recur across this codebase and benefit from automatic loading.\n` +
        `Use applies-when frontmatter so skills load only when relevant.\n` +
        `If a similar skill already exists: extend it. Do not create a parallel one.\n` +
        `Empty is fine — not every project needs skills.`,
    },
    {
      filename: "stack-5-commands.md",
      content: preamble + idempotentCheck +
        `## Project context\n\n${vars.CONFIG_FILES}\n\n` +
        `## Target: .claude/commands/ (not stack-*.md files)\n\n` +
        `Commands installed: ${vars.COMMANDS_LIST}\n\n` +
        `Only create commands that will actually be useful for this kind of project.\n` +
        `Do not duplicate existing commands. Do not create stack-*.md files.`,
    },
    {
      filename: "stack-6-workflows.md",
      content: preamble + idempotentCheck +
        `## Target: .github/workflows/\n\n` +
        `.github/ exists: ${vars.HAS_GITHUB_DIR}\n` +
        `Workflows installed: ${vars.WORKFLOWS_LIST}\n\n` +
        (state.hasGithubDir
          ? `Only create workflows warranted by the project. If workflows already exist: do not touch them.`
          : `.github/ does not exist. Only create workflows if the project clearly warrants them.`),
    },
  ]

  return steps
}

export function buildOrchestratorCommand(steps: AtomicStep[]): string {
  const version = getVersion()
  const date = new Date().toISOString().split("T")[0]

  const stepList = steps
    .map((s, i) => `${i + 1}. /${s.filename.replace(".md", "")}`)
    .join("\n")

  return `<!-- Generated by claude-stack ${version} on ${date} — DO NOT hand-edit -->
<!-- Run /stack-init in Claude Code -->

Run these in order. If one fails, fix it and continue from that step only.
Do not re-run steps that already completed.

${stepList}

After all steps complete: one-line summary of what was created.
`
}
