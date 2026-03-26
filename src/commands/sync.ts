import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { collectProjectFiles, CollectedFiles } from "../collect.js"
import { readState } from "../state.js"
import { readManifest, sha256, updateManifest } from "../manifest.js"
import { buildSyncCommand, FileDiff } from "../builder.js"
import { createSnapshot, collectFilesForSnapshot } from "../snapshot.js"
import { estimateTokens, estimateCost, formatTokenReport, buildTokenEstimate, generateHints } from "../tokens.js"
import { loadConfig } from "../config.js"
import { c, section } from "../output.js"

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
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

  if (!diff.added.length && !diff.changed.length && !diff.deleted.length && !oobDetected) {
    console.log(`${c.green("✅")} No changes since ${c.dim(lastRun.at)}. Setup is current.`)
    return
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

  ensureDir(".claude/commands")
  writeFileSync(".claude/commands/stack-sync.md", content, "utf8")
  await updateManifest("sync", collected, { estimatedTokens: tokens, estimatedCost: cost })

  // Feature A: Create snapshot node
  const allPaths = [
    ...Object.keys(collected.configs),
    ...collected.source.map(s => s.path),
  ]
  const snapshotFiles = collectFilesForSnapshot(cwd, allPaths)
  const changeCount = diff.added.length + diff.changed.length + diff.deleted.length
  createSnapshot(cwd, "sync", snapshotFiles, {
    summary: `+${diff.added.length} added, ~${diff.changed.length} modified, -${diff.deleted.length} deleted`,
  })

  console.log(`
Changes since ${c.dim(lastRun.at)}:
  ${c.green(`+${diff.added.length}`)} added  ${c.yellow(`~${diff.changed.length}`)} modified  ${c.red(`-${diff.deleted.length}`)} deleted

${c.green("✅")} Ready. Open Claude Code and run:
   ${c.cyan("/stack-sync")}
  `)

  // Token cost display
  section("Token cost")
  console.log(`  ~${tokens.toLocaleString()} input tokens (${c.dim(`Opus $${cost.opus.toFixed(4)} | Sonnet $${cost.sonnet.toFixed(4)} | Haiku $${cost.haiku.toFixed(4)}`)})`)

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
