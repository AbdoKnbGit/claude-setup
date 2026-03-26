import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join, basename, dirname } from "path"
import { readState } from "../state.js"
import { detectOS } from "../os.js"
import { c, section } from "../output.js"
import { createInterface } from "readline"

export interface ConfigTemplate {
  name: string
  version: "1"
  exportedAt: string
  exportedFrom: string
  os: string
  claudeMd?: string
  mcpJson?: Record<string, unknown>
  settings?: Record<string, unknown>
  skills: Array<{ name: string; content: string }>
  commands: Array<{ name: string; content: string }>
}

async function promptFreeText(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question + " ", (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export async function runExport(): Promise<void> {
  const cwd = process.cwd()
  const state = await readState(cwd)
  const os = detectOS()

  const name = await promptFreeText("Template name:")
  if (!name) {
    console.log("No name provided.")
    return
  }

  const template: ConfigTemplate = {
    name,
    version: "1",
    exportedAt: new Date().toISOString(),
    exportedFrom: basename(cwd),
    os,
    skills: [],
    commands: [],
  }

  // Capture CLAUDE.md
  if (state.claudeMd.content) {
    template.claudeMd = state.claudeMd.content
  }

  // Capture .mcp.json (parsed as object for OS adaptation on import)
  if (state.mcpJson.content) {
    try {
      template.mcpJson = JSON.parse(state.mcpJson.content) as Record<string, unknown>
    } catch { /* skip invalid */ }
  }

  // Capture settings.json — never export model key
  if (state.settings.content) {
    try {
      const settings = JSON.parse(state.settings.content) as Record<string, unknown>
      delete settings["model"]
      template.settings = settings
    } catch { /* skip invalid */ }
  }

  // Capture skills
  for (const skillPath of state.skills) {
    const fullPath = join(cwd, skillPath)
    if (!existsSync(fullPath)) continue
    try {
      const content = readFileSync(fullPath, "utf8")
      const skillName = skillPath.split("/").at(-2) ?? skillPath.split("/").pop()?.replace(".md", "") ?? skillPath
      template.skills.push({ name: skillName, content })
    } catch { /* skip */ }
  }

  // Capture commands (excluding stack-* artifacts)
  for (const cmdPath of state.commands) {
    const fullPath = join(cwd, cmdPath)
    if (!existsSync(fullPath)) continue
    try {
      const content = readFileSync(fullPath, "utf8")
      const cmdName = cmdPath.split("/").pop()?.replace(".md", "") ?? cmdPath
      template.commands.push({ name: cmdName, content })
    } catch { /* skip */ }
  }

  const filename = `${name.replace(/[^a-zA-Z0-9_-]/g, "-")}.claude-template.json`
  writeFileSync(join(cwd, filename), JSON.stringify(template, null, 2), "utf8")

  const serverCount = template.mcpJson
    ? Object.keys((template.mcpJson as Record<string, Record<string, unknown>>).mcpServers ?? {}).length
    : 0

  console.log(`
${c.green("✅")} Template exported: ${c.cyan(filename)}

Contents:
  CLAUDE.md    : ${template.claudeMd ? "included" : "not found"}
  .mcp.json    : ${serverCount ? `${serverCount} server(s)` : "not found"}
  settings.json: ${template.settings ? "included" : "not found"}
  Skills       : ${template.skills.length}
  Commands     : ${template.commands.length}

Apply to another project:
  ${c.cyan(`npx claude-setup init --template ${filename}`)}
  `)
}

/**
 * Apply a template to the current project.
 * Merge logic: existing content kept, new content added.
 * OS adaptation: MCP commands auto-converted for target OS.
 */
export async function applyTemplate(templateSource: string): Promise<void> {
  const cwd = process.cwd()
  let templateContent: string

  // Resolve template source — local file or URL
  if (templateSource.startsWith("http://") || templateSource.startsWith("https://")) {
    try {
      const response = await fetch(templateSource)
      if (!response.ok) {
        console.log(`${c.red("🔴")} Failed to fetch template: HTTP ${response.status}`)
        return
      }
      templateContent = await response.text()
    } catch (err) {
      console.log(`${c.red("🔴")} Failed to fetch template: ${err}`)
      return
    }
  } else {
    // Try relative to cwd first, then absolute
    const resolved = existsSync(join(cwd, templateSource))
      ? join(cwd, templateSource)
      : existsSync(templateSource)
        ? templateSource
        : null
    if (!resolved) {
      console.log(`${c.red("🔴")} Template not found: ${templateSource}`)
      return
    }
    templateContent = readFileSync(resolved, "utf8")
  }

  let template: ConfigTemplate
  try {
    template = JSON.parse(templateContent) as ConfigTemplate
  } catch {
    console.log(`${c.red("🔴")} Invalid template JSON.`)
    return
  }

  const targetOS = detectOS()
  let applied = 0

  section(`Applying template: ${template.name}`)
  console.log(`  Source OS: ${template.os} → Target OS: ${targetOS}\n`)

  // 1. CLAUDE.md — append only, never remove existing lines
  if (template.claudeMd) {
    const claudeMdPath = join(cwd, "CLAUDE.md")
    if (existsSync(claudeMdPath)) {
      const existing = readFileSync(claudeMdPath, "utf8")
      const newLines = template.claudeMd
        .split("\n")
        .filter(l => l.trim() && !existing.includes(l.trim()))
      if (newLines.length) {
        writeFileSync(
          claudeMdPath,
          existing + "\n\n# From template: " + template.name + "\n" + newLines.join("\n") + "\n",
          "utf8"
        )
        console.log(`  ${c.green("✅")} CLAUDE.md — appended ${newLines.length} line(s)`)
        applied++
      } else {
        console.log(`  ${c.dim("⏭")} CLAUDE.md — all content already present`)
      }
    } else {
      writeFileSync(claudeMdPath, template.claudeMd, "utf8")
      console.log(`  ${c.green("✅")} CLAUDE.md — created`)
      applied++
    }
  }

  // 2. .mcp.json — merge servers, adapt OS format
  if (template.mcpJson) {
    const mcpPath = join(cwd, ".mcp.json")
    let existing: Record<string, unknown> = {}
    if (existsSync(mcpPath)) {
      try { existing = JSON.parse(readFileSync(mcpPath, "utf8")) } catch { /* start fresh */ }
    }

    const existingServers = (existing.mcpServers ?? {}) as Record<string, unknown>
    const templateServers = ((template.mcpJson).mcpServers ?? {}) as Record<string, Record<string, unknown>>

    let addedCount = 0
    for (const [name, config] of Object.entries(templateServers)) {
      if (existingServers[name]) {
        console.log(`  ${c.dim("⏭")} MCP server: ${name} — already exists`)
        continue
      }
      existingServers[name] = adaptMcpForOS(config, template.os, targetOS)
      console.log(`  ${c.green("✅")} MCP server: ${name} — added (OS-adapted)`)
      addedCount++
    }

    if (addedCount > 0) {
      existing.mcpServers = existingServers
      writeFileSync(mcpPath, JSON.stringify(existing, null, 2), "utf8")
      applied++
    }
  }

  // 3. settings.json — merge hooks, never write model key
  if (template.settings) {
    const settingsDir = join(cwd, ".claude")
    const settingsPath = join(settingsDir, "settings.json")
    if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true })

    let existing: Record<string, unknown> = {}
    if (existsSync(settingsPath)) {
      try { existing = JSON.parse(readFileSync(settingsPath, "utf8")) } catch { /* start fresh */ }
    }

    const templateHooks = (template.settings.hooks ?? {}) as Record<string, unknown[]>
    const existingHooks = (existing.hooks ?? {}) as Record<string, unknown[]>

    let addedHooks = 0
    for (const [event, hooks] of Object.entries(templateHooks)) {
      if (!existingHooks[event]) {
        existingHooks[event] = hooks
        addedHooks += Array.isArray(hooks) ? hooks.length : 0
        console.log(`  ${c.green("✅")} Hook: ${event} — added`)
      } else {
        console.log(`  ${c.dim("⏭")} Hook: ${event} — already exists`)
      }
    }

    if (addedHooks > 0) {
      existing.hooks = existingHooks
      delete existing["model"] // Never write model key
      writeFileSync(settingsPath, JSON.stringify(existing, null, 2), "utf8")
      applied++
    }
  }

  // 4. Skills — skip if same name exists
  for (const skill of template.skills) {
    const skillDir = join(cwd, ".claude", "skills", skill.name)
    const skillPath = join(skillDir, "SKILL.md")
    if (existsSync(skillPath)) {
      console.log(`  ${c.dim("⏭")} Skill: ${skill.name} — already exists`)
      continue
    }
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(skillPath, skill.content, "utf8")
    console.log(`  ${c.green("✅")} Skill: ${skill.name} — created`)
    applied++
  }

  // 5. Commands — skip if same name exists
  for (const cmd of template.commands) {
    const cmdDir = join(cwd, ".claude", "commands")
    const cmdPath = join(cmdDir, `${cmd.name}.md`)
    if (existsSync(cmdPath)) {
      console.log(`  ${c.dim("⏭")} Command: ${cmd.name} — already exists`)
      continue
    }
    if (!existsSync(cmdDir)) mkdirSync(cmdDir, { recursive: true })
    writeFileSync(cmdPath, cmd.content, "utf8")
    console.log(`  ${c.green("✅")} Command: ${cmd.name} — created`)
    applied++
  }

  console.log(`\n${c.green("✅")} Template "${template.name}" applied — ${applied} item(s) added.`)
}

/**
 * Adapt MCP server config for target OS.
 * Templates are stored with the source OS format.
 * On import, commands are auto-converted:
 *   Windows → macOS/Linux: cmd /c npx → npx
 *   macOS/Linux → Windows: npx → cmd /c npx
 * Path separators and env var syntax are also adapted.
 */
function adaptMcpForOS(
  config: Record<string, unknown>,
  sourceOS: string,
  targetOS: string
): Record<string, unknown> {
  if (sourceOS === targetOS) return config

  const result = { ...config }
  const cmd = config.command as string | undefined
  const args = [...(config.args as string[] ?? [])]

  if (!cmd) return result

  // Source is Windows → target is macOS/Linux
  if (sourceOS === "Windows" && targetOS !== "Windows") {
    if (cmd === "cmd" && args[0] === "/c") {
      result.command = args[1] // "npx", "bun", etc.
      result.args = args.slice(2)
    }
  }

  // Source is macOS/Linux → target is Windows
  if (sourceOS !== "Windows" && targetOS === "Windows") {
    if (cmd === "npx" || cmd === "bun" || cmd === "node") {
      result.command = "cmd"
      result.args = ["/c", cmd, ...args]
    }
  }

  return result
}
