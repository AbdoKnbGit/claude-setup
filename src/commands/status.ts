import { readFileSync, existsSync } from "fs"
import { basename, join } from "path"
import { readManifest } from "../manifest.js"
import { readState } from "../state.js"
import { detectOS } from "../os.js"
import { readTimeline } from "../snapshot.js"
import { computeCumulativeStats, formatCost } from "../tokens.js"
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
  // BUG 2 FIX: Use directory name or package manifest name, not language
  const projectName = getProjectName()
  const language = inferLanguage(state)
  console.log(`Project  : ${projectName}`)
  console.log(`Language : ${language}`)
  console.log(`OS       : ${os}`)
  console.log(`Version  : claude-setup v${version}`)

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
    const hookCount = countHooks(settings)
    statusLine("✅", "settings.json", `${hookCount} hook(s)`)
  } else {
    statusLine("❌", "settings.json", "missing")
  }

  // Lists
  console.log(`  Skills    : ${state.skills.length ? state.skills.map(s => s.split("/").at(-2) ?? s).join(", ") : "none"}`)
  console.log(`  Commands  : ${state.commands.length ? state.commands.map(s => s.split("/").pop()?.replace(".md", "") ?? s).join(", ") : "none"}`)
  console.log(`  Workflows : ${state.workflows.length ? state.workflows.map(s => s.split("/").pop() ?? s).join(", ") : "none"}`)

  // --- Feature A/B: Snapshot timeline ---
  const cwd = process.cwd()
  const timeline = readTimeline(cwd)
  if (timeline.nodes.length > 0) {
    section("Snapshot timeline")
    const displayNodes = timeline.nodes.slice(-8) // Show last 8
    if (timeline.nodes.length > 8) {
      console.log(`  ${c.dim(`... +${timeline.nodes.length - 8} older snapshots`)}`)
    }
    for (let i = 0; i < displayNodes.length; i++) {
      const node = displayNodes[i]
      const date = new Date(node.timestamp).toLocaleDateString()
      const time = new Date(node.timestamp).toLocaleTimeString()
      const isLatest = i === displayNodes.length - 1
      const marker = isLatest ? ` ${c.green("← current")}` : ""
      const inputStr = node.input ? ` "${node.input}"` : ""
      console.log(
        `  ${c.cyan(node.id)}  ${node.command}${inputStr}  ${c.dim(`${date} ${time}`)}  ${node.summary}${marker}`
      )
    }
    console.log(`\n  ${c.dim("Use")} ${c.cyan("npx claude-setup restore")} ${c.dim("to jump to any snapshot")}`)
    console.log(`  ${c.dim("Use")} ${c.cyan("npx claude-setup compare")} ${c.dim("to diff two snapshots")}`)
  }

  // --- Feature I: Token usage stats ---
  const runsWithTokens = manifest.runs.filter(r => r.estimatedTokens !== undefined)
  if (runsWithTokens.length > 0) {
    section("Token usage")
    const stats = computeCumulativeStats(manifest.runs)

    console.log(`  Total tokens : ~${stats.totalTokens.toLocaleString()} across ${stats.runCount} run(s)`)
    console.log(`  Total cost   : ${formatCost(stats.totalCost)}`)

    // Average by command type
    const avgEntries = Object.entries(stats.avgByCommand)
    if (avgEntries.length > 0) {
      console.log(`  Avg by type  :`)
      for (const [cmd, avg] of avgEntries) {
        console.log(`    ${cmd}: ~${avg.toLocaleString()} tokens/run`)
      }
    }

    // Cost trend (last 3 vs previous 3)
    if (runsWithTokens.length >= 6) {
      const recent3 = runsWithTokens.slice(-3)
      const prev3 = runsWithTokens.slice(-6, -3)
      const recentAvg = recent3.reduce((s, r) => s + (r.estimatedTokens ?? 0), 0) / 3
      const prevAvg = prev3.reduce((s, r) => s + (r.estimatedTokens ?? 0), 0) / 3
      const change = ((recentAvg - prevAvg) / prevAvg) * 100
      if (Math.abs(change) > 10) {
        const trend = change > 0 ? c.yellow(`↑ +${change.toFixed(0)}%`) : c.green(`↓ ${change.toFixed(0)}%`)
        console.log(`  Trend        : ${trend} (recent vs previous)`)
      } else {
        console.log(`  Trend        : ${c.green("→ stable")}`)
      }
    }
  }

  // --- Run history ---
  section("Run history (last 5)")
  for (const r of manifest.runs.slice(-5)) {
    const inputStr = r.input ? ` — "${r.input}"` : ""
    const tokenStr = r.estimatedTokens ? ` (${r.estimatedTokens.toLocaleString()} tokens)` : ""
    console.log(`  ${c.dim(r.at)}  ${r.command}${inputStr}${tokenStr}`)
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

/**
 * BUG 3 FIX: Count hooks across all event types, handling both formats:
 * - Correct format: { "hooks": { "PostToolUse": [{ "matcher": "...", "hooks": [{ "type": "command", "command": "..." }] }] } }
 * - Legacy/flat format: { "PostToolUse": [{ "command": "...", "args": [...] }] }
 */
function countHooks(settings: Record<string, unknown> | null): number {
  if (!settings) return 0
  let count = 0

  const HOOK_EVENTS = [
    "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop", "SessionStart",
    "Notification", "SubagentStart", "SubagentStop", "UserPromptSubmit",
    "PermissionRequest", "ConfigChange", "InstructionsLoaded", "TaskCompleted",
    "TeammateIdle", "StopFailure", "SessionEnd",
    "PreCompact", "PostCompact", "WorktreeCreate", "WorktreeRemove",
    "Elicitation", "ElicitationResult",
  ]

  // Check inside "hooks" key first (correct Claude Code format)
  const hooksObj = settings["hooks"] as Record<string, unknown> | undefined
  if (hooksObj && typeof hooksObj === "object") {
    for (const event of HOOK_EVENTS) {
      const eventHooks = hooksObj[event]
      if (Array.isArray(eventHooks)) {
        for (const entry of eventHooks) {
          if (typeof entry === "object" && entry !== null) {
            const e = entry as Record<string, unknown>
            if (Array.isArray(e.hooks)) {
              count += e.hooks.length
            } else {
              count++
            }
          }
        }
      }
    }
    return count
  }

  // Fallback: check top-level keys (legacy flat format)
  for (const event of HOOK_EVENTS) {
    const hooks = settings[event]
    if (Array.isArray(hooks)) {
      for (const entry of hooks) {
        if (typeof entry === "object" && entry !== null) {
          const e = entry as Record<string, unknown>
          if (Array.isArray(e.hooks)) {
            count += e.hooks.length
          } else {
            count++
          }
        }
      }
    }
  }
  return count
}

/** BUG 2 FIX: Get project name from package manifest or directory name */
function getProjectName(): string {
  const cwd = process.cwd()

  // Try package.json name
  try {
    const pkgPath = join(cwd, "package.json")
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
      if (pkg.name) return pkg.name
    }
  } catch { /* skip */ }

  // Try pom.xml artifactId
  try {
    const pomPath = join(cwd, "pom.xml")
    if (existsSync(pomPath)) {
      const pom = readFileSync(pomPath, "utf8")
      const match = pom.match(/<artifactId>([^<]+)<\/artifactId>/)
      if (match) return match[1]
    }
  } catch { /* skip */ }

  // Try Cargo.toml name
  try {
    const cargoPath = join(cwd, "Cargo.toml")
    if (existsSync(cargoPath)) {
      const cargo = readFileSync(cargoPath, "utf8")
      const match = cargo.match(/^name\s*=\s*"([^"]+)"/m)
      if (match) return match[1]
    }
  } catch { /* skip */ }

  // Try pyproject.toml name
  try {
    const pyPath = join(cwd, "pyproject.toml")
    if (existsSync(pyPath)) {
      const py = readFileSync(pyPath, "utf8")
      const match = py.match(/^name\s*=\s*"([^"]+)"/m)
      if (match) return match[1]
    }
  } catch { /* skip */ }

  // Fallback: directory name
  return basename(cwd)
}

/** Detect language/runtime as a separate field */
function inferLanguage(state: ReturnType<typeof readState> extends Promise<infer T> ? T : never): string {
  const cwd = process.cwd()

  if (existsSync(join(cwd, "package.json"))) return "Node.js / TypeScript"
  if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "requirements.txt"))) return "Python"
  if (existsSync(join(cwd, "go.mod"))) return "Go"
  if (existsSync(join(cwd, "Cargo.toml"))) return "Rust"
  if (existsSync(join(cwd, "pom.xml")) || existsSync(join(cwd, "build.gradle"))) return "Java"
  if (existsSync(join(cwd, "Gemfile"))) return "Ruby"
  if (existsSync(join(cwd, "composer.json"))) return "PHP"

  if (state.claudeMd.content) {
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
