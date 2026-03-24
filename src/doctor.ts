import { existsSync, readFileSync } from "fs"
import { execSync } from "child_process"
import { join } from "path"
import { readManifest } from "./manifest.js"
import { readState } from "./state.js"
import { detectOS, VERIFIED_MCP_PACKAGES } from "./os.js"
import { c, statusLine, section } from "./output.js"

function tryExec(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
  } catch {
    return null
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

function safeJsonParse(content: string): Record<string, unknown> | null {
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return null
  }
}

interface DoctorCounts {
  critical: number
  warnings: number
  healthy: number
}

export async function runDoctor(verbose = false): Promise<void> {
  const os = detectOS()
  const manifest = await readManifest()
  const state = await readState()
  const counts: DoctorCounts = { critical: 0, warnings: 0, healthy: 0 }

  console.log(`${c.bold("claude-setup doctor")} — ${new Date().toISOString().split("T")[0]} | OS: ${os}\n`)

  // --- Check 1: Claude Code version ---
  section("Environment")
  const cv = tryExec("claude --version")
  if (cv) {
    statusLine("✅", "Claude Code", cv.trim())
    counts.healthy++
  } else {
    statusLine("🔴", "Claude Code", c.red("not found in PATH"))
    counts.critical++
  }

  // --- Check 2: Manifest integrity ---
  const lastRun = manifest?.runs.at(-1)
  if (manifest) {
    const staleCheck = lastRun ? checkStaleness(lastRun.at) : null
    const detail = lastRun
      ? `last: ${lastRun.command} at ${lastRun.at}${staleCheck ? ` ${staleCheck}` : ""}`
      : "empty runs array"
    statusLine("✅", "Manifest", detail)
    counts.healthy++
  } else {
    statusLine("⚠️ ", "Manifest", c.yellow("not found — run: npx claude-setup init"))
    counts.warnings++
  }

  // --- Check 2b: Out-of-band edit detection ---
  if (lastRun) {
    const { createHash } = await import("crypto")
    const oobFiles: Array<{ label: string; path: string; snapshotKey: string }> = [
      { label: "CLAUDE.md", path: join(process.cwd(), "CLAUDE.md"), snapshotKey: "CLAUDE.md" },
      { label: ".mcp.json", path: join(process.cwd(), ".mcp.json"), snapshotKey: ".mcp.json" },
      { label: "settings.json", path: join(process.cwd(), ".claude", "settings.json"), snapshotKey: ".claude/settings.json" },
    ]
    for (const mf of oobFiles) {
      if (!existsSync(mf.path)) continue
      const content = readFileSync(mf.path, "utf8")
      const currentHash = createHash("sha256").update(content).digest("hex")
      const snapshotHash = lastRun.snapshot[mf.snapshotKey]
      if (snapshotHash && currentHash !== snapshotHash) {
        statusLine("⚠️ ", mf.label, c.yellow("modified outside the CLI since last run — run sync to re-snapshot"))
        counts.warnings++
      }
    }
  }

  // --- Check 3: OS/MCP format mismatch ---
  if (state.mcpJson.content) {
    section("MCP servers")
    const mcp = safeJsonParse(state.mcpJson.content)
    if (mcp && typeof mcp.mcpServers === "object" && mcp.mcpServers !== null) {
      const servers = mcp.mcpServers as Record<string, Record<string, unknown>>
      for (const [name, config] of Object.entries(servers)) {
        const cmd = config.command as string | undefined
        if (!cmd) {
          statusLine("⚠️ ", name, c.yellow("no command field"))
          counts.warnings++
          continue
        }

        if (os === "Windows" && cmd === "npx") {
          statusLine("🔴", name, c.red(`BROKEN: Windows can't execute npx directly — use cmd /c npx`))
          counts.critical++
        } else if (os !== "Windows" && cmd === "cmd") {
          statusLine("⚠️ ", name, c.yellow(`UNNECESSARY: cmd wrapper not needed on ${os}`))
          counts.warnings++
        } else {
          statusLine("✅", name, `valid, OS-format correct (${cmd})`)
          counts.healthy++
        }

        // Check for missing -y flag in npx args
        const args = config.args as string[] | undefined
        if (args) {
          const npxIndex = args.indexOf("npx")
          if (npxIndex >= 0 && args[npxIndex + 1] !== "-y") {
            statusLine("⚠️ ", name, c.yellow(`npx without -y flag — installs may hang`))
            counts.warnings++
          }

          // Check for hardcoded connection strings in args
          for (const arg of args) {
            if (/^(postgresql|postgres|mysql|mongodb|redis|amqp):\/\//.test(arg)) {
              statusLine("🔴", name, c.red(`HARDCODED connection string in args — move to env: { "DATABASE_URL": "\${DATABASE_URL}" }`))
              counts.critical++
              break
            }
          }
        }
      }
      // Check for channel-type servers
      const channelNames = ["telegram", "discord", "fakechat"]
      for (const [name] of Object.entries(servers)) {
        if (channelNames.includes(name.toLowerCase())) {
          statusLine("⚠️ ", `${name} (CHANNEL)`, c.yellow(
            `channel server detected — .mcp.json alone does not activate delivery. ` +
            `Launch with: claude --channels plugin:${name.toLowerCase()}@claude-plugins-official`
          ))
          counts.warnings++
        }
      }
    } else if (mcp) {
      // Check for flat structure (some .mcp.json files use flat keys)
      if (verbose) statusLine("⚠️ ", ".mcp.json", "no mcpServers key found")
    }
  } else if (verbose) {
    section("MCP servers")
    statusLine("⏭ ", ".mcp.json", "does not exist")
  }

  // --- Check 4: Hook quoting bugs ---
  if (state.settings.content) {
    section("Hooks")
    const settings = safeJsonParse(state.settings.content)
    if (settings) {
      const hookCategories = [
        "PreToolUse", "PostToolUse", "PostToolUseFailure",
        "Stop", "SessionStart"
      ]
      // Bug 6: Check for model override
      if (settings["model"]) {
        statusLine("⚠️ ", "MODEL OVERRIDE", c.yellow(`"model": "${settings["model"]}" in settings.json forces this model on every session. Remove it if not intentional.`))
        counts.warnings++
      }

      // Check for invalid hook event names
      const validHookNames = new Set(hookCategories)
      for (const key of Object.keys(settings)) {
        if (key === "permissions" || key === "model" || key === "env" || key === "allowedTools") continue
        if (Array.isArray(settings[key]) && !validHookNames.has(key)) {
          statusLine("🔴", `"${key}"`, c.red(`INVALID hook event name. Valid names: ${hookCategories.join(", ")}`))
          counts.critical++
        }
      }

      let foundHooks = false
      for (const category of hookCategories) {
        const hooks = settings[category]
        if (!hooks || !Array.isArray(hooks)) continue

        for (const hook of hooks) {
          if (typeof hook !== "object" || !hook) continue
          const h = hook as Record<string, unknown>
          const hookCmd = h.command as string | undefined
          const args = h.args as string[] | undefined

          if (!hookCmd || !args) continue
          foundHooks = true

          // Check for bash -c quoting bugs
          if (hookCmd === "bash" && args[0] === "-c" && args[1]) {
            const shellStr = args[1] as string
            const quotingIssue = checkBashQuoting(shellStr)
            if (quotingIssue) {
              statusLine("🔴", `${category} hook`, c.red(`quoting bug: ${quotingIssue}`))
              counts.critical++
            } else {
              statusLine("✅", `${category} hook`, "quoting clean")
              counts.healthy++
            }
          } else {
            statusLine("✅", `${category} hook`, "valid")
            counts.healthy++
          }
        }
      }
      if (!foundHooks && verbose) {
        statusLine("⏭ ", "Hooks", "none configured")
      }
    }
  } else if (verbose) {
    section("Hooks")
    statusLine("⏭ ", "settings.json", "does not exist")
  }

  // --- Check 5: Env var coverage ---
  if (state.mcpJson.content) {
    const refs = [...state.mcpJson.content.matchAll(/\$\{?([A-Z_][A-Z0-9_]+)\}?/g)]
      .map(m => m[1])
    const unique = [...new Set(refs)]
    if (unique.length) {
      const template = readIfExists(".env.example") ?? readIfExists(".env.sample") ?? readIfExists(".env.template") ?? ""
      section("Env vars")
      for (const v of unique) {
        if (template.includes(v)) {
          statusLine("✅", `\${${v}}`, "found in env template")
          counts.healthy++
        } else {
          statusLine("⚠️ ", `\${${v}}`, c.yellow("used in .mcp.json but missing from .env.example"))
          counts.warnings++
        }
      }
    }
  }

  // --- Check 6: Workflow secret coverage ---
  if (state.workflows.length) {
    const secrets = new Set<string>()
    for (const wf of state.workflows) {
      const content = readIfExists(wf) ?? ""
      for (const m of content.matchAll(/\$\{\{\s*secrets\.([A-Z_][A-Z0-9_]*)\s*\}\}/g)) {
        secrets.add(m[1])
      }
    }
    if (secrets.size) {
      section("Workflow secrets")
      const readme = readIfExists("README.md") ?? ""
      const envTemplate = readIfExists(".env.example") ?? readIfExists(".env.sample") ?? ""
      for (const s of secrets) {
        if (readme.includes(s) || envTemplate.includes(s)) {
          statusLine("✅", s, "documented")
          counts.healthy++
        } else {
          statusLine("⚠️ ", s, c.yellow("needs GitHub Settings → Secrets"))
          counts.warnings++
        }
      }
    }
  }

  // --- Check 7: Stale skill paths ---
  if (state.skills.length) {
    section("Skills")
    for (const skillPath of state.skills) {
      const content = readIfExists(skillPath)
      if (!content) {
        statusLine("⚠️ ", skillPath, c.yellow("skill file not readable"))
        counts.warnings++
        continue
      }

      // Extract file/dir references from skill content
      const pathRefs = extractPathReferences(content)
      const staleRefs = pathRefs.filter(ref => !existsSync(ref) && !existsSync(join(process.cwd(), ref)))
      if (staleRefs.length) {
        statusLine("⚠️ ", skillPath, c.yellow(`stale paths: ${staleRefs.join(", ")}`))
        counts.warnings++
      } else {
        statusLine("✅", skillPath, "valid")
        counts.healthy++
      }
    }
  } else if (verbose) {
    section("Skills")
    statusLine("⏭ ", "Skills", "none installed")
  }

  // --- Check 8: Files from last run still on disk ---
  // Filter __digest__ — it's a virtual key, not a real file
  if (lastRun?.filesRead.length && verbose) {
    section("Files from last run")
    const realFiles = lastRun.filesRead.filter(f => f !== "__digest__" && f !== ".env")
    for (const f of realFiles.slice(0, 8)) {
      if (existsSync(f)) {
        statusLine("✅", f, "")
        counts.healthy++
      } else {
        statusLine("⚠️ ", f, c.yellow("not found on disk"))
        counts.warnings++
      }
    }
    if (realFiles.length > 8) {
      console.log(c.dim(`  ... +${realFiles.length - 8} more`))
    }
  }

  // --- Summary ---
  console.log("")
  section("Summary")
  if (counts.critical > 0) console.log(`  🔴 ${c.red(`${counts.critical} critical`)} (will break Claude Code)`)
  if (counts.warnings > 0) console.log(`  ⚠️  ${c.yellow(`${counts.warnings} warning(s)`)} (degraded behavior)`)
  console.log(`  ✅ ${c.green(`${counts.healthy} healthy`)}`)

  if (counts.critical > 0) {
    console.log(`\n${c.red("Fix critical issues first.")} Run ${c.cyan("npx claude-setup sync")} after fixing.`)
  } else {
    console.log(`\n${c.green("✅ Done.")}`)
  }
}

// --- Helpers ---

function checkStaleness(lastRunDate: string): string | null {
  try {
    const last = new Date(lastRunDate).getTime()
    const now = Date.now()
    const daysSince = Math.floor((now - last) / (1000 * 60 * 60 * 24))
    if (daysSince > 7) return c.yellow(`(${daysSince} days ago — may be stale)`)
  } catch { /* invalid date */ }
  return null
}

function checkBashQuoting(shellStr: string): string | null {
  // Check for unescaped double quotes inside the command string
  // The -c "..." outer string must never contain a bare " character
  let inSingleQuote = false
  let prevChar = ""
  for (let i = 0; i < shellStr.length; i++) {
    const ch = shellStr[i]
    if (ch === "'" && prevChar !== "\\") {
      inSingleQuote = !inSingleQuote
    }
    // Unescaped double quote inside single-quoted context is a problem
    // when the outer wrapper is double quotes
    if (ch === '"' && !inSingleQuote && prevChar !== "\\") {
      // Check for patterns like ["'] which mix quote types
      if (i > 0 && shellStr[i - 1] === "[") {
        return `mixed quotes in character class at position ${i}: ...${shellStr.slice(Math.max(0, i - 10), i + 10)}...`
      }
    }
    prevChar = ch
  }

  // Check for unmatched brackets in grep patterns
  const bracketCount = (shellStr.match(/\[/g) || []).length
  const closeBracketCount = (shellStr.match(/\]/g) || []).length
  if (bracketCount !== closeBracketCount) {
    return "unmatched brackets in pattern"
  }

  return null
}

function extractPathReferences(skillContent: string): string[] {
  const paths: string[] = []
  // Match file/directory references in skill content
  // Look for patterns like src/, lib/, *.ts references
  const pathPatterns = skillContent.matchAll(/(?:^|\s)((?:src|lib|app|cmd|bin|pkg|internal|api|core|test|tests|spec)\/[\w/.\\-]*)/gm)
  for (const m of pathPatterns) {
    paths.push(m[1].trim())
  }
  return paths
}
