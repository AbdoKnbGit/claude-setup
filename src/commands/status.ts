import { readManifest } from "../manifest.js"
import { readState } from "../state.js"
import { detectOS } from "../os.js"
import { c, statusLine, section } from "../output.js"

function safeJsonParse(content: string): Record<string, unknown> | null {
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function runStatus(): Promise<void> {
  const manifest = await readManifest()
  const state = await readState()
  const os = detectOS()

  if (!manifest) {
    console.log(`${c.yellow("⚠️  No setup found.")}\n  Run: ${c.cyan("npx claude-setup init")}`)
    return
  }

  const last = manifest.runs.at(-1)!
  const version = last.claudeStackVersion ?? "unknown"

  // --- Header ---
  console.log(c.bold("status") + ` — ${new Date().toISOString().split("T")[0]}\n`)

  // --- Project info ---
  const projectType = inferProjectType(state)
  console.log(`Project : ${projectType}`)
  console.log(`OS      : ${os}`)
  console.log(`Version : claude-setup v${version}`)

  // --- Setup files ---
  section("Setup files")

  // CLAUDE.md
  if (state.claudeMd.exists) {
    statusLine("✅", "CLAUDE.md", "exists")
  } else {
    statusLine("❌", "CLAUDE.md", "missing")
  }

  // .mcp.json
  if (state.mcpJson.exists && state.mcpJson.content) {
    const mcp = safeJsonParse(state.mcpJson.content)
    const serverCount = mcp?.mcpServers
      ? Object.keys(mcp.mcpServers as object).length
      : 0
    statusLine("✅", ".mcp.json", `${serverCount} server(s)`)
  } else {
    statusLine("❌", ".mcp.json", "missing")
  }

  // settings.json
  if (state.settings.exists && state.settings.content) {
    const settings = safeJsonParse(state.settings.content)
    let hookCount = 0
    if (settings) {
      for (const key of ["PreToolUse", "PostToolUse", "PreCompact", "PostCompact", "Notification", "Stop", "SubagentStop"]) {
        const hooks = settings[key]
        if (Array.isArray(hooks)) hookCount += hooks.length
      }
    }
    statusLine("✅", "settings.json", `${hookCount} hook(s)`)
  } else {
    statusLine("❌", "settings.json", "missing")
  }

  // Lists
  console.log(`  Skills    : ${state.skills.length ? state.skills.map(s => s.split("/").at(-2) ?? s).join(", ") : "none"}`)
  console.log(`  Commands  : ${state.commands.length ? state.commands.map(s => s.split("/").pop()?.replace(".md", "") ?? s).join(", ") : "none"}`)
  console.log(`  Workflows : ${state.workflows.length ? state.workflows.map(s => s.split("/").pop() ?? s).join(", ") : "none"}`)

  // --- Run history ---
  section("Run history (last 5)")
  for (const r of manifest.runs.slice(-5)) {
    const inputStr = r.input ? ` — "${r.input}"` : ""
    console.log(`  ${c.dim(r.at)}  ${r.command}${inputStr}`)
  }

  // --- Health hint ---
  const hint = getHealthHint(manifest, state)
  if (hint) {
    section("Health hint")
    console.log(`  ${hint}`)
  }

  // --- Next action ---
  const next = getNextAction(manifest, state)
  if (next) {
    section("Next action")
    console.log(`  ${next}`)
  }

  console.log("")
}

function inferProjectType(state: ReturnType<typeof readState> extends Promise<infer T> ? T : never): string {
  if (state.claudeMd.content) {
    // Try to infer from CLAUDE.md content
    const content = state.claudeMd.content.toLowerCase()
    if (content.includes("typescript") || content.includes("node")) return "Node.js / TypeScript"
    if (content.includes("python")) return "Python"
    if (content.includes("go ") || content.includes("golang")) return "Go"
    if (content.includes("rust")) return "Rust"
    if (content.includes("ruby")) return "Ruby"
    if (content.includes("java") && !content.includes("javascript")) return "Java"
  }
  return c.dim("unknown — run init to detect")
}

function getHealthHint(manifest: NonNullable<Awaited<ReturnType<typeof readManifest>>>, _state: Awaited<ReturnType<typeof readState>>): string | null {
  const last = manifest.runs.at(-1)
  if (!last) return `${c.yellow("⚠️")}  No runs recorded. Run: ${c.cyan("npx claude-setup init")}`

  const daysSince = Math.floor((Date.now() - new Date(last.at).getTime()) / (1000 * 60 * 60 * 24))

  // Check for recent deletions
  if (last.command === "sync") {
    const snapshot = last.snapshot
    const deletionCount = Object.keys(snapshot).filter(k => k.startsWith("[deleted]")).length
    if (deletionCount > 0) {
      return `${c.red("🔴")}  Last sync detected ${deletionCount} deletion(s). Verify setup is still valid.`
    }
  }

  if (daysSince > 7) {
    return `${c.yellow("⚠️")}  ${daysSince} day(s) since last sync. Source files may have drifted.`
  }

  return `${c.green("✅")} Setup looks current.`
}

function getNextAction(manifest: NonNullable<Awaited<ReturnType<typeof readManifest>>>, _state: Awaited<ReturnType<typeof readState>>): string | null {
  const last = manifest.runs.at(-1)
  if (!last) return `Run ${c.cyan("npx claude-setup init")} to set up your project.`

  const daysSince = Math.floor((Date.now() - new Date(last.at).getTime()) / (1000 * 60 * 60 * 24))
  if (daysSince > 7) return `Run ${c.cyan("npx claude-setup sync")} to check for changes.`

  return null
}
