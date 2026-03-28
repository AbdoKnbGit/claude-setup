import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { glob } from "glob"
import { collectProjectFiles, CollectedFiles } from "../collect.js"
import { readState } from "../state.js"
import { readManifest, sha256, updateManifest } from "../manifest.js"
import { buildSyncCommand, FileDiff } from "../builder.js"
import { createSnapshot, collectFilesForSnapshot } from "../snapshot.js"
import { estimateTokens, estimateCost, formatCost, formatTokenReport, buildTokenEstimate, generateHints, getTokenHookScript, formatRealCostSummary } from "../tokens.js"
import { loadConfig } from "../config.js"
import { c, section } from "../output.js"

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function installTokenHook(cwd: string = process.cwd()): void {
  // Write the hook script
  const hooksDir = join(cwd, ".claude", "hooks")
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true })
  writeFileSync(join(hooksDir, "track-tokens.cjs"), getTokenHookScript(), "utf8")

  // Merge Stop hook into settings.json
  const settingsPath = join(cwd, ".claude", "settings.json")
  let settings: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, "utf8") ?? "{}") } catch {}
  }

  const hookEntry = {
    hooks: [{ type: "command", command: "node \".claude/hooks/track-tokens.cjs\"" }]
  }

  // Merge into settings.hooks.Stop
  if (!settings.hooks) settings.hooks = {}
  const hooks = settings.hooks as Record<string, unknown[]>
  if (!Array.isArray(hooks.Stop)) hooks.Stop = []

  // Only add if not already present
  const alreadyPresent = (hooks.Stop as Array<Record<string, unknown>>).some(e =>
    Array.isArray(e.hooks) && (e.hooks as Array<Record<string, unknown>>).some(
      (h: Record<string, unknown>) => typeof h.command === "string" && h.command.includes("track-tokens")
    )
  )
  if (!alreadyPresent) {
    hooks.Stop.push(hookEntry)
    if (!existsSync(join(cwd, ".claude"))) mkdirSync(join(cwd, ".claude"), { recursive: true })
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8")
  }
}

function truncate(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  return content.slice(0, maxChars) + "\n[... truncated for sync diff]"
}

function computeDiff(snapshot: Record<string, string>, collected: CollectedFiles, cwd: string): FileDiff {
  const current: Record<string, string> = {
    ...collected.configs,
    ...Object.fromEntries(collected.source.map(f => [f.path, f.content])),
  }

  const added: FileDiff["added"] = []
  const changed: FileDiff["changed"] = []
  const deleted: string[] = []

  for (const [path, content] of Object.entries(current)) {
    // Skip virtual keys — they're not real files
    if (path === "__digest__") continue

    const hash = sha256(content)
    if (!snapshot[path]) {
      added.push({ path, content: truncate(content, 2000) })
    } else if (snapshot[path] !== hash) {
      changed.push({ path, current: truncate(content, 2000) })
    }
  }

  // BUG 1 FIX: Verify file existence on disk before reporting deletions.
  // Files may appear "deleted" because they weren't in the current collection set
  // (different collect mode, or CLI-managed files like CLAUDE.md/settings.json).
  // If the file still exists on disk, it was "modified outside the CLI", not deleted.
  for (const path of Object.keys(snapshot)) {
    // Skip virtual keys
    if (path === "__digest__") continue
    if (!current[path]) {
      // Check if file actually exists on disk
      const fullPath = join(cwd, path)
      if (existsSync(fullPath)) {
        // File exists but wasn't in our collection — it was modified outside CLI
        // Read it and check if its hash changed
        try {
          const diskContent = readFileSync(fullPath, "utf8")
          const diskHash = sha256(diskContent)
          if (snapshot[path] !== diskHash) {
            changed.push({ path, current: truncate(diskContent, 2000) })
          }
          // If hash matches, file is unchanged — don't report anything
        } catch {
          // Can't read — treat as changed
          changed.push({ path, current: "[file exists but could not be read]" })
        }
      } else {
        // File genuinely does not exist on disk — truly deleted
        deleted.push(path)
      }
    }
  }

  return { added, changed, deleted }
}

async function collectClaudeInternalFiles(cwd: string): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = []
  try {
    const skillFiles = await glob(".claude/skills/**/*.md", { cwd, posix: true })
    const allCmds = await glob(".claude/commands/*.md", { cwd, posix: true })
    const commandFiles = allCmds.filter(f => !f.split("/").pop()!.startsWith("stack-"))
    for (const f of [...skillFiles, ...commandFiles]) {
      try {
        const content = readFileSync(join(cwd, f), "utf8")
        files.push({ path: f, content })
      } catch { /* skip unreadable */ }
    }
  } catch { /* skip */ }
  return files
}

export async function runSync(opts: { dryRun?: boolean; budget?: number } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false
  const manifest = await readManifest()

  if (!manifest?.runs.length) {
    console.log(`No previous run found. Start with: ${c.cyan("npx claude-setup init")}`)
    return
  }

  const lastRun = manifest.runs.at(-1)!
  const cwd = process.cwd()
  const config = loadConfig(cwd)

  // Apply --budget override if provided
  if (opts.budget) {
    config.tokenBudget.sync = opts.budget
  }

  // --- Out-of-band edit detection ---
  const managedFiles: Array<{ label: string; path: string; snapshotKey: string }> = [
    { label: "CLAUDE.md", path: join(cwd, "CLAUDE.md"), snapshotKey: "CLAUDE.md" },
    { label: ".mcp.json", path: join(cwd, ".mcp.json"), snapshotKey: ".mcp.json" },
    { label: "settings.json", path: join(cwd, ".claude", "settings.json"), snapshotKey: ".claude/settings.json" },
  ]

  let oobDetected = false
  for (const mf of managedFiles) {
    if (!existsSync(mf.path)) continue
    const currentContent = readFileSync(mf.path, "utf8")
    const currentHash = sha256(currentContent)
    const snapshotHash = lastRun.snapshot[mf.snapshotKey]

    if (snapshotHash && currentHash !== snapshotHash) {
      if (!oobDetected) {
        oobDetected = true
        console.log("")
      }
      console.log(`${c.yellow("⚠️")}  OUT-OF-BAND EDIT — ${mf.label} was modified outside the CLI`)
      console.log(`    Re-snapshotting. Run ${c.cyan("npx claude-setup doctor")} to validate the new state.`)
    }
  }
  if (oobDetected) console.log("")

  const collected = await collectProjectFiles(cwd, "normal")
  const diff = computeDiff(lastRun.snapshot, collected, cwd)

  // Bug 3 fix: Also detect changes inside .claude/ (skills, commands)
  const claudeInternalFiles = await collectClaudeInternalFiles(cwd)
  for (const f of claudeInternalFiles) {
    const hash = sha256(f.content)
    if (!lastRun.snapshot[f.path]) {
      diff.added.push({ path: f.path, content: truncate(f.content, 2000) })
    } else if (lastRun.snapshot[f.path] !== hash) {
      diff.changed.push({ path: f.path, current: truncate(f.content, 2000) })
    }
  }
  // Also detect deleted .claude/ files (were in snapshot but no longer exist)
  for (const path of Object.keys(lastRun.snapshot)) {
    if ((path.startsWith(".claude/skills/") || (path.startsWith(".claude/commands/") && !path.split("/").pop()!.startsWith("stack-"))) && !path.includes("__digest__")) {
      const alreadyInDiff = diff.added.some(f => f.path === path) ||
        diff.changed.some(f => f.path === path) ||
        diff.deleted.includes(path)
      if (!alreadyInDiff && !claudeInternalFiles.some(f => f.path === path)) {
        if (!existsSync(join(cwd, path))) {
          diff.deleted.push(path)
        }
      }
    }
  }

  const hasChanges = diff.added.length > 0 || diff.changed.length > 0 || diff.deleted.length > 0 || oobDetected

  if (!hasChanges) {
    console.log(`${c.green("✅")} No changes since ${c.dim(lastRun.at)}. Setup is current.`)
    // Still regenerate the command file so /stack-sync self-refresh always gets an up-to-date "no changes" state
  }

  const state = await readState()
  const content = buildSyncCommand(diff, collected, state)

  // Token tracking
  const tokens = estimateTokens(content)
  const cost = estimateCost(tokens)

  if (dryRun) {
    console.log(c.bold("[DRY RUN] Changes detected:\n"))
    if (diff.added.length) {
      console.log(c.green(`  +${diff.added.length} added`))
      for (const f of diff.added) console.log(`    ${f.path}`)
    }
    if (diff.changed.length) {
      console.log(c.yellow(`  ~${diff.changed.length} modified`))
      for (const f of diff.changed) console.log(`    ${f.path}`)
    }
    if (diff.deleted.length) {
      console.log(c.red(`  -${diff.deleted.length} deleted`))
      for (const f of diff.deleted) console.log(`    ${f}`)
    }
    console.log(`\n  Would write: .claude/commands/stack-sync.md (~${tokens.toLocaleString()} tokens)`)

    // Token cost display
    section("Token cost estimate")
    const estimate = buildTokenEstimate([{ label: "sync command", content }])
    console.log(formatTokenReport(estimate))
    return
  }

  // Add .claude/ internal files to snapshot
  for (const f of claudeInternalFiles) {
    collected.configs[f.path] = f.content
  }

  ensureDir(".claude/commands")
  writeFileSync(".claude/commands/stack-sync.md", content, "utf8")
  await updateManifest("sync", collected, { estimatedTokens: tokens, estimatedCost: cost })
  installTokenHook()

  // Create snapshot node — collectFilesForSnapshot scans all .claude/ automatically
  const allPaths = [
    ...Object.keys(collected.configs),
    ...collected.source.map(s => s.path),
  ]
  const snapshotFiles = collectFilesForSnapshot(cwd, allPaths)
  createSnapshot(cwd, "sync", snapshotFiles, {
    summary: `+${diff.added.length} added, ~${diff.changed.length} modified, -${diff.deleted.length} deleted`,
  })

  if (hasChanges) {
    console.log(`
Changes since ${c.dim(lastRun.at)}:
  ${c.green(`+${diff.added.length}`)} added  ${c.yellow(`~${diff.changed.length}`)} modified  ${c.red(`-${diff.deleted.length}`)} deleted

${c.green("✅")} Run ${c.cyan("/stack-sync")} in Claude Code to apply.
    `)
  }

  if (hasChanges) {
    // Token cost display
    section("Token cost")
    const realSummary = formatRealCostSummary(cwd)
    if (realSummary) {
      console.log(realSummary)
    } else {
      console.log(`  ~${tokens.toLocaleString()} input tokens (${c.dim(`${formatCost(cost)}`)})`)
      console.log(`  ${c.dim("Estimates only — real costs tracked after first Claude Code session")}`)
    }

    // Optimization hints
    const runs = manifest.runs.map(r => ({ command: r.command, estimatedTokens: r.estimatedTokens }))
    const hints = generateHints(runs, tokens, config.tokenBudget.sync)
    if (hints.length) {
      section("Optimization hints")
      for (const hint of hints) {
        console.log(`  ${c.yellow("💡")} ${hint}`)
      }
    }

    console.log("")
  }
}
