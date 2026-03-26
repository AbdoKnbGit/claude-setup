import { existsSync, readFileSync, writeFileSync } from "fs"
import { execSync, spawnSync } from "child_process"
import { join } from "path"
import { readManifest, sha256 } from "./manifest.js"
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
  fixed: number
}

export async function runDoctor(verbose = false, fix = false, testHooks = false): Promise<void> {
  const os = detectOS()
  const manifest = await readManifest()
  const state = await readState()
  const counts: DoctorCounts = { critical: 0, warnings: 0, healthy: 0, fixed: 0 }

  console.log(`${c.bold("claude-setup doctor")} — ${new Date().toISOString().split("T")[0]} | OS: ${os}`)
  if (fix) console.log(`${c.cyan("Auto-fix mode enabled")}`)
  if (testHooks) console.log(`${c.cyan("Hook testing enabled")}`)
  console.log("")

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
  // BUG 12 FIX: Distinguish expected modifications (from Claude Code sessions triggered
  // by /stack-init, /stack-add etc.) from truly unexpected external modifications.
  if (lastRun) {
    const lastCommand = lastRun.command
    const expectedModCommands = new Set(["init", "add", "sync"])
    const isExpectedMod = expectedModCommands.has(lastCommand)

    const oobFiles: Array<{ label: string; path: string; snapshotKey: string }> = [
      { label: "CLAUDE.md", path: join(process.cwd(), "CLAUDE.md"), snapshotKey: "CLAUDE.md" },
      { label: ".mcp.json", path: join(process.cwd(), ".mcp.json"), snapshotKey: ".mcp.json" },
      { label: "settings.json", path: join(process.cwd(), ".claude", "settings.json"), snapshotKey: ".claude/settings.json" },
    ]
    for (const mf of oobFiles) {
      if (!existsSync(mf.path)) continue
      const content = readFileSync(mf.path, "utf8")
      const currentHash = sha256(content)
      const snapshotHash = lastRun.snapshot[mf.snapshotKey]
      if (snapshotHash && currentHash !== snapshotHash) {
        if (isExpectedMod) {
          if (verbose) {
            statusLine("✅", mf.label, `modified after ${lastCommand} (expected — Claude Code session)`)
            counts.healthy++
          }
        } else {
          statusLine("⚠️ ", mf.label, c.yellow("modified outside the CLI since last run — run sync to re-snapshot"))
          counts.warnings++
          if (fix) {
            // Auto-fix: re-snapshot the file
            lastRun.snapshot[mf.snapshotKey] = currentHash
            statusLine("🔧", mf.label, c.green("re-snapshotted"))
            counts.fixed++
          }
        }
      }
    }

    // Write back updated manifest if fix modified snapshots
    if (fix && manifest) {
      const { writeFileSync: wfs } = await import("fs")
      const manifestPath = join(process.cwd(), ".claude/claude-setup.json")
      if (existsSync(manifestPath)) {
        wfs(manifestPath, JSON.stringify(manifest, null, 2), "utf8")
      }
    }
  }

  // --- Check 3: OS/MCP format mismatch ---
  if (state.mcpJson.content) {
    section("MCP servers")
    const mcp = safeJsonParse(state.mcpJson.content)
    if (mcp && typeof mcp.mcpServers === "object" && mcp.mcpServers !== null) {
      const servers = mcp.mcpServers as Record<string, Record<string, unknown>>
      let mcpModified = false

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
          if (fix) {
            // Auto-fix: convert to Windows format
            const args = config.args as string[] ?? []
            config.command = "cmd"
            config.args = ["/c", "npx", ...args]
            statusLine("🔧", name, c.green("fixed → cmd /c npx"))
            counts.fixed++
            mcpModified = true
          }
        } else if (os !== "Windows" && cmd === "cmd") {
          statusLine("⚠️ ", name, c.yellow(`UNNECESSARY: cmd wrapper not needed on ${os}`))
          counts.warnings++
          if (fix) {
            // Auto-fix: remove cmd wrapper
            const args = config.args as string[] ?? []
            if (args[0] === "/c") {
              config.command = args[1] ?? "npx"
              config.args = args.slice(2)
              statusLine("🔧", name, c.green(`fixed → ${config.command}`))
              counts.fixed++
              mcpModified = true
            }
          }
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
            if (fix) {
              args.splice(npxIndex + 1, 0, "-y")
              statusLine("🔧", name, c.green("added -y flag"))
              counts.fixed++
              mcpModified = true
            }
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

      // Write back fixed .mcp.json
      if (fix && mcpModified) {
        const mcpPath = join(process.cwd(), ".mcp.json")
        writeFileSync(mcpPath, JSON.stringify(mcp, null, 2), "utf8")
        statusLine("🔧", ".mcp.json", c.green("saved with fixes"))
      }
    } else if (mcp) {
      if (verbose) statusLine("⚠️ ", ".mcp.json", "no mcpServers key found")
    }
  } else if (verbose) {
    section("MCP servers")
    statusLine("⏭ ", ".mcp.json", "does not exist")
  }

  // --- Check 4: Hook format and quoting ---
  if (state.settings.content) {
    section("Hooks")
    const settings = safeJsonParse(state.settings.content)
    if (settings) {
      const ALL_HOOK_EVENTS = [
        "PreToolUse", "PostToolUse", "PostToolUseFailure",
        "Stop", "SessionStart", "Notification", "SubagentStart", "SubagentStop",
        "UserPromptSubmit", "PermissionRequest", "ConfigChange",
        "InstructionsLoaded", "TaskCompleted", "TeammateIdle",
        "StopFailure", "SessionEnd", "PreCompact", "PostCompact",
        "WorktreeCreate", "WorktreeRemove", "Elicitation", "ElicitationResult",
      ]
      const validHookNames = new Set(ALL_HOOK_EVENTS)
      const KNOWN_SETTINGS_KEYS = new Set([
        "permissions", "model", "env", "allowedTools", "hooks",
        "disableAllHooks", "statusLine", "outputStyle", "attribution",
        "includeCoAuthoredBy", "includeGitInstructions", "enableAllProjectMcpServers",
        "enabledMcpjsonServers", "disabledMcpjsonServers", "apiKeyHelper",
        "companyAnnouncements", "effortLevel", "language", "$schema",
      ])

      let settingsModified = false

      // BUG 13 FIX: Model override with auto-fix
      if (settings["model"]) {
        statusLine("⚠️ ", "MODEL OVERRIDE", c.yellow(
          `"model": "${settings["model"]}" forces this model on every session.\n` +
          `      Fix: remove the "model" key from .claude/settings.json, or use /model in Claude Code to switch per-session.`
        ))
        counts.warnings++
        if (fix) {
          delete settings["model"]
          statusLine("🔧", "MODEL OVERRIDE", c.green("removed — model selection is now per-session"))
          counts.fixed++
          settingsModified = true
        }
      }

      // Determine where hooks live — correct format uses "hooks" key
      const hooksObj = (settings["hooks"] as Record<string, unknown>) ?? null
      const hookSource = hooksObj ?? settings

      // Check for invalid hook event names (only in flat format)
      if (!hooksObj) {
        for (const key of Object.keys(settings)) {
          if (KNOWN_SETTINGS_KEYS.has(key)) continue
          if (Array.isArray(settings[key]) && !validHookNames.has(key)) {
            statusLine("🔴", `"${key}"`, c.red(
              `INVALID hook event name. Valid: ${ALL_HOOK_EVENTS.slice(0, 5).join(", ")}... ` +
              `See Claude Code hooks documentation.`
            ))
            counts.critical++
          }
        }
      }

      // Collect hooks for potential testing
      const hookCommands: Array<{ event: string; matcher: string; command: string }> = []
      let foundHooks = false

      for (const category of ALL_HOOK_EVENTS) {
        const entries = hookSource[category]
        if (!entries || !Array.isArray(entries)) continue

        for (const entry of entries) {
          if (typeof entry !== "object" || !entry) continue
          const e = entry as Record<string, unknown>

          if (Array.isArray(e.hooks)) {
            const matcher = (e.matcher as string) ?? ""

            // Validate matcher is valid regex
            if (matcher) {
              try {
                new RegExp(matcher)
              } catch {
                statusLine("🔴", `${category} matcher`, c.red(`invalid regex: "${matcher}"`))
                counts.critical++
              }
            }

            for (const hook of e.hooks) {
              if (typeof hook !== "object" || !hook) continue
              const h = hook as Record<string, unknown>
              foundHooks = true

              if (h.type === "command" && typeof h.command === "string") {
                const cmd = h.command as string
                const bashQuoting = checkBashQuoting(cmd)
                if (bashQuoting) {
                  statusLine("🔴", `${category} hook`, c.red(`quoting bug: ${bashQuoting}`))
                  counts.critical++
                } else {
                  statusLine("✅", `${category} hook`, `command: ${cmd.slice(0, 60)}${cmd.length > 60 ? "..." : ""}`)
                  counts.healthy++
                }
                hookCommands.push({ event: category, matcher, command: cmd })
              } else {
                statusLine("✅", `${category} hook`, `type: ${h.type ?? "unknown"}`)
                counts.healthy++
              }
            }
          } else {
            // Legacy flat format
            const hookCmd = e.command as string | undefined
            const args = e.args as string[] | undefined
            if (!hookCmd) continue
            foundHooks = true

            if (hookCmd === "bash" && args?.[0] === "-c" && args[1]) {
              const quotingIssue = checkBashQuoting(args[1] as string)
              if (quotingIssue) {
                statusLine("🔴", `${category} hook`, c.red(`quoting bug: ${quotingIssue}`))
                counts.critical++
              } else {
                statusLine("✅", `${category} hook`, "quoting clean")
                counts.healthy++
              }
              hookCommands.push({ event: category, matcher: "", command: args[1] })
            } else {
              statusLine("✅", `${category} hook`, "valid")
              counts.healthy++
              hookCommands.push({ event: category, matcher: "", command: `${hookCmd} ${(args ?? []).join(" ")}` })
            }
          }
        }
      }
      if (!foundHooks && verbose) {
        statusLine("⏭ ", "Hooks", "none configured")
      }

      // Write back fixed settings.json
      if (fix && settingsModified) {
        const settingsPath = join(process.cwd(), ".claude", "settings.json")
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8")
        statusLine("🔧", "settings.json", c.green("saved with fixes"))
      }

      // --- Feature G: Hook testing (--test-hooks) ---
      if (testHooks && hookCommands.length > 0) {
        section("Hook testing")
        console.log(`${c.dim("Running each hook once in sandbox mode...\n")}`)

        for (const hook of hookCommands) {
          const result = testSingleHook(hook.command, os)
          const label = `${hook.event}${hook.matcher ? `:${hook.matcher}` : ""}`

          if (result.status === "pass") {
            statusLine("✅", label, c.green(`PASS (${result.timeMs}ms) — ${hook.command.slice(0, 50)}`))
            counts.healthy++
          } else if (result.status === "not_found") {
            statusLine("🔴", label, c.red(
              `FAIL — command not found: ${result.tool}\n` +
              `      Install ${result.tool} or remove this hook.`
            ))
            counts.critical++
          } else if (result.status === "timeout") {
            statusLine("⚠️ ", label, c.yellow(
              `TIMEOUT (>${result.timeMs}ms) — hook may hang in real sessions\n` +
              `      Command: ${hook.command.slice(0, 50)}`
            ))
            counts.warnings++
          } else if (result.status === "error") {
            statusLine("⚠️ ", label, c.yellow(
              `FAIL (exit ${result.exitCode}, ${result.timeMs}ms)\n` +
              `      Command: ${hook.command.slice(0, 50)}\n` +
              `      ${result.stderr ? `stderr: ${result.stderr.slice(0, 100)}` : ""}`
            ))
            counts.warnings++
          } else if (result.status === "permission") {
            statusLine("🔴", label, c.red(
              `PERMISSION DENIED — ${hook.command.slice(0, 50)}\n` +
              `      Check file permissions or access rights.`
            ))
            counts.critical++
          }
        }
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
  if (counts.fixed > 0) console.log(`  🔧 ${c.cyan(`${counts.fixed} auto-fixed`)}`)

  if (counts.critical > 0 && !fix) {
    console.log(`\n${c.red("Fix critical issues first.")} Run ${c.cyan("npx claude-setup doctor --fix")} to auto-fix what's possible.`)
  } else if (counts.fixed > 0) {
    console.log(`\n${c.green("✅ Auto-fix applied.")} Run ${c.cyan("npx claude-setup sync")} to re-snapshot.`)
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
  let inSingleQuote = false
  let prevChar = ""
  for (let i = 0; i < shellStr.length; i++) {
    const ch = shellStr[i]
    if (ch === "'" && prevChar !== "\\") {
      inSingleQuote = !inSingleQuote
    }
    if (ch === '"' && !inSingleQuote && prevChar !== "\\") {
      if (i > 0 && shellStr[i - 1] === "[") {
        return `mixed quotes in character class at position ${i}: ...${shellStr.slice(Math.max(0, i - 10), i + 10)}...`
      }
    }
    prevChar = ch
  }

  const bracketCount = (shellStr.match(/\[/g) || []).length
  const closeBracketCount = (shellStr.match(/\]/g) || []).length
  if (bracketCount !== closeBracketCount) {
    return "unmatched brackets in pattern"
  }

  return null
}

function extractPathReferences(skillContent: string): string[] {
  const paths: string[] = []
  const pathPatterns = skillContent.matchAll(/(?:^|\s)((?:src|lib|app|cmd|bin|pkg|internal|api|core|test|tests|spec)\/[\w/.\\-]*)/gm)
  for (const m of pathPatterns) {
    paths.push(m[1].trim())
  }
  return paths
}

// --- Feature G: Hook testing ---

interface HookTestResult {
  status: "pass" | "error" | "not_found" | "timeout" | "permission"
  exitCode?: number
  stderr?: string
  timeMs: number
  tool?: string
}

/**
 * Test a single hook command by spawning it.
 * Checks: command existence, execution, exit code, stderr, timeout.
 */
function testSingleHook(command: string, os: string): HookTestResult {
  const TIMEOUT_MS = 10_000

  // Extract the base tool from the command
  const tool = extractToolName(command)

  // Step 1: Check if the tool exists on the system
  if (tool) {
    const whichCmd = os === "Windows" ? `where ${tool} 2>nul` : `which ${tool} 2>/dev/null`
    const found = tryExec(whichCmd)
    if (!found || !found.trim()) {
      return { status: "not_found", timeMs: 0, tool }
    }
  }

  // Step 2: Actually execute the hook command with a timeout
  const start = Date.now()
  try {
    let result
    if (os === "Windows") {
      result = spawnSync("cmd", ["/c", command], {
        timeout: TIMEOUT_MS,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
      })
    } else {
      result = spawnSync("bash", ["-c", command], {
        timeout: TIMEOUT_MS,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
      })
    }
    const timeMs = Date.now() - start

    if (result.error) {
      const err = result.error as NodeJS.ErrnoException
      if (err.code === "ETIMEDOUT") {
        return { status: "timeout", timeMs: TIMEOUT_MS }
      }
      if (err.code === "EACCES" || err.code === "EPERM") {
        return { status: "permission", timeMs }
      }
      return { status: "error", exitCode: -1, stderr: err.message, timeMs }
    }

    if (result.status === 0) {
      return { status: "pass", exitCode: 0, timeMs }
    }

    return {
      status: "error",
      exitCode: result.status ?? -1,
      stderr: result.stderr?.trim().slice(0, 200) ?? "",
      timeMs,
    }
  } catch (err) {
    const timeMs = Date.now() - start
    return { status: "error", exitCode: -1, stderr: String(err).slice(0, 200), timeMs }
  }
}

/**
 * Extract the base tool name from a shell command.
 * "command -v mvn && mvn compile -q" → "mvn"
 * "npm run build" → "npm"
 * "prettier --check ." → "prettier"
 */
function extractToolName(command: string): string | null {
  // Handle "command -v X && ..." or "which X && ..."
  const guardMatch = command.match(/(?:command -v|which|where)\s+(\S+)\s*&&\s*(.*)/)
  if (guardMatch) {
    return guardMatch[1]
  }

  // Handle simple commands
  const parts = command.trim().split(/\s+/)
  const first = parts[0]
  if (!first) return null

  // Skip shell builtins
  if (["cd", "echo", "test", "[", "if", "for", "while"].includes(first)) return null

  return first
}
