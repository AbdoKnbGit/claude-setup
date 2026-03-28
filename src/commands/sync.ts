import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { collectProjectFiles, CollectedFiles } from "../collect.js"
import { readState } from "../state.js"
import { readManifest, sha256, updateManifest } from "../manifest.js"
import { buildSyncCommand, FileDiff } from "../builder.js"
import { createSnapshot, collectFilesForSnapshot, readTimeline, readNodeData } from "../snapshot.js"
import { estimateTokens, estimateCost, formatTokenReport, buildTokenEstimate, getTokenHookScript } from "../tokens.js"
import { loadConfig } from "../config.js"
import { c, section } from "../output.js"

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function installTokenHook(cwd: string = process.cwd()): void {
  const hooksDir = join(cwd, ".claude", "hooks")
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true })
  writeFileSync(join(hooksDir, "track-tokens.cjs"), getTokenHookScript(), "utf8")

  const settingsPath = join(cwd, ".claude", "settings.json")
  let settings: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, "utf8") ?? "{}") } catch {}
  }

  const hookEntry = {
    hooks: [{ type: "command", command: "node \".claude/hooks/track-tokens.cjs\"" }]
  }

  if (!settings.hooks) settings.hooks = {}
  const hooks = settings.hooks as Record<string, unknown[]>
  if (!Array.isArray(hooks.Stop)) hooks.Stop = []

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

/**
 * Legacy diff — compares manifest hashes against collected files.
 * Only used when no snapshot data is available (e.g., old projects).
 */
function computeLegacyDiff(snapshot: Record<string, string>, collected: CollectedFiles, cwd: string): FileDiff {
  const current: Record<string, string> = {
    ...collected.configs,
    ...Object.fromEntries(collected.source.map(f => [f.path, f.content])),
  }

  const added: FileDiff["added"] = []
  const changed: FileDiff["changed"] = []
  const deleted: string[] = []

  for (const [path, content] of Object.entries(current)) {
    if (path === "__digest__") continue
    const hash = sha256(content)
    if (!snapshot[path]) {
      added.push({ path, content: truncate(content, 2000) })
    } else if (snapshot[path] !== hash) {
      changed.push({ path, current: truncate(content, 2000) })
    }
  }

  for (const path of Object.keys(snapshot)) {
    if (path === "__digest__") continue
    if (!current[path]) {
      const fullPath = join(cwd, path)
      if (existsSync(fullPath)) {
        try {
          const diskContent = readFileSync(fullPath, "utf8")
          const diskHash = sha256(diskContent)
          if (snapshot[path] !== diskHash) {
            changed.push({ path, current: truncate(diskContent, 2000) })
          }
        } catch {
          changed.push({ path, current: "[file exists but could not be read]" })
        }
      } else {
        deleted.push(path)
      }
    }
  }

  return { added, changed, deleted }
}

/**
 * Full-scan diff — compares every file on disk against a reference snapshot.
 * This is the authoritative diff: catches ALL file changes, no sampling.
 */
function computeFullDiff(
  currentFiles: Array<{ path: string; content: string }>,
  referenceFiles: Record<string, string>
): FileDiff {
  const added: FileDiff["added"] = []
  const changed: FileDiff["changed"] = []
  const deleted: string[] = []

  const currentPathSet = new Set<string>()

  for (const f of currentFiles) {
    currentPathSet.add(f.path)
    if (!referenceFiles[f.path]) {
      added.push({ path: f.path, content: truncate(f.content, 2000) })
    } else {
      const currentHash = sha256(f.content)
      const refHash = sha256(referenceFiles[f.path])
      if (currentHash !== refHash) {
        changed.push({ path: f.path, current: truncate(f.content, 2000) })
      }
    }
  }

  for (const path of Object.keys(referenceFiles)) {
    if (!currentPathSet.has(path)) {
      deleted.push(path)
    }
  }

  return { added, changed, deleted }
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

  if (opts.budget) {
    config.tokenBudget.sync = opts.budget
  }

  // --- Out-of-band edit detection (early warning) ---
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

  // --- Full project scan (single scan, used for both diff and snapshot) ---
  const currentFiles = collectFilesForSnapshot(cwd, [])

  // --- Determine reference snapshot ---
  // After restore: compare against the restored-to snapshot
  // Normal: compare against the latest snapshot
  const timeline = readTimeline(cwd)
  const referenceNodeId = timeline.restoredTo ?? timeline.nodes.at(-1)?.id
  let referenceFiles: Record<string, string> | null = null

  if (referenceNodeId) {
    const data = readNodeData(cwd, referenceNodeId)
    if (data) referenceFiles = data.files
  }

  // --- Compute diff ---
  let diff: FileDiff

  if (referenceFiles) {
    // Full-scan comparison (authoritative — catches ALL changes)
    diff = computeFullDiff(currentFiles, referenceFiles)
  } else {
    // Legacy fallback — no snapshot data available
    const collected = await collectProjectFiles(cwd, "normal")
    diff = computeLegacyDiff(lastRun.snapshot, collected, cwd)
  }

  const hasChanges = diff.added.length > 0 || diff.changed.length > 0 || diff.deleted.length > 0 || oobDetected

  if (!hasChanges) {
    console.log(`${c.green("✅")} No changes since ${c.dim(lastRun.at)}. Setup is current.`)
    return
  }

  // --- Build sync command (needs collected project context for template) ---
  const collected = await collectProjectFiles(cwd, "normal")
  const state = await readState()
  const content = buildSyncCommand(diff, collected, state)

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

    section("Token cost estimate")
    const estimate = buildTokenEstimate([{ label: "sync command", content }])
    console.log(formatTokenReport(estimate))
    return
  }

  ensureDir(".claude/commands")
  writeFileSync(".claude/commands/stack-sync.md", content, "utf8")
  await updateManifest("sync", collected, { estimatedTokens: tokens, estimatedCost: cost })
  installTokenHook()

  // Create snapshot — reuse the full scan data (no second scan needed)
  createSnapshot(cwd, "sync", currentFiles, {
    summary: `+${diff.added.length} added, ~${diff.changed.length} modified, -${diff.deleted.length} deleted`,
  })

  console.log(`
Changes since ${c.dim(lastRun.at)}:
  ${c.green(`+${diff.added.length}`)} added  ${c.yellow(`~${diff.changed.length}`)} modified  ${c.red(`-${diff.deleted.length}`)} deleted

${c.green("✅")} Run ${c.cyan("/stack-sync")} in Claude Code to apply.
  `)
}
