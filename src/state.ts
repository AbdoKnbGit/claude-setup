import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { glob } from "glob"
import { readManifest, Manifest } from "./manifest.js"

export interface ExistingState {
  claudeMd: { exists: boolean; content?: string }
  mcpJson: { exists: boolean; content?: string }
  settings: { exists: boolean; content?: string }

  skills: string[]
  commands: string[]
  workflows: string[]

  hasGithubDir: boolean
  hasDotClaude: boolean

  manifest: Manifest | null
}

export async function readState(cwd: string = process.cwd()): Promise<ExistingState> {
  const claudeMdPath = join(cwd, "CLAUDE.md")
  const mcpJsonPath = join(cwd, ".mcp.json")
  const settingsPath = join(cwd, ".claude", "settings.json")

  const claudeMd = readIfExists(claudeMdPath)
  const mcpJson = readIfExists(mcpJsonPath)
  const settings = readIfExists(settingsPath)

  // Scan all three skill patterns and deduplicate (Bug 4 fix)
  let skills: string[] = []
  try {
    const structured = await glob(".claude/skills/*/SKILL.md", { cwd, posix: true })
    const flat = await glob(".claude/skills/*.md", { cwd, posix: true })
    const nested = await glob(".claude/skills/**/*.md", { cwd, posix: true })
    skills = [...new Set([...structured, ...flat, ...nested])]
  } catch { /* no skills */ }

  let commands: string[] = []
  try {
    const allCmds = await glob(".claude/commands/*.md", { cwd, posix: true })
    commands = allCmds.filter(c => !c.includes("stack-"))
  } catch { /* no commands */ }

  let workflows: string[] = []
  try {
    workflows = await glob(".github/workflows/*.yml", { cwd, posix: true })
    const yamlWorkflows = await glob(".github/workflows/*.yaml", { cwd, posix: true })
    workflows = [...workflows, ...yamlWorkflows]
  } catch { /* no workflows */ }

  const hasGithubDir = existsSync(join(cwd, ".github"))
  const hasDotClaude = existsSync(join(cwd, ".claude"))
  const manifest = await readManifest(cwd)

  return {
    claudeMd: { exists: claudeMd !== null, content: claudeMd ?? undefined },
    mcpJson: { exists: mcpJson !== null, content: mcpJson ?? undefined },
    settings: { exists: settings !== null, content: settings ?? undefined },
    skills,
    commands,
    workflows,
    hasGithubDir,
    hasDotClaude,
    manifest,
  }
}

function readIfExists(filePath: string): string | null {
  if (!existsSync(filePath)) return null
  try {
    return readFileSync(filePath, "utf8")
  } catch {
    return null
  }
}

export { readIfExists }
