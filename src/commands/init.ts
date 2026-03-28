import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { collectProjectFiles, isEmptyProject } from "../collect.js"
import { readState } from "../state.js"
import { updateManifest } from "../manifest.js"
import {
  buildEmptyProjectCommand,
  buildAtomicSteps,
  buildOrchestratorCommand,
  buildBootstrapSync,
} from "../builder.js"
import { createSnapshot, collectFilesForSnapshot } from "../snapshot.js"
import { estimateTokens, estimateCost, formatCost, getTokenHookScript, formatRealCostSummary } from "../tokens.js"
import { c, section } from "../output.js"
import { ensureConfig } from "../config.js"
import { applyTemplate } from "./export.js"

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

export async function runInit(opts: { dryRun?: boolean; template?: string } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false

  // Feature H: --template flag — apply a template instead of scanning
  if (opts.template) {
    console.log(`Applying template: ${c.cyan(opts.template)}\n`)
    await applyTemplate(opts.template)
    return
  }

  // Auto-generate .claude-setup.json if it doesn't exist
  const configCreated = ensureConfig()
  if (configCreated) {
    console.log(`${c.dim("Created .claude-setup.json — edit to tune token budgets and truncation rules")}`)
  }

  const state = await readState()
  const collected = await collectProjectFiles(process.cwd(), "deep")

  if (isEmptyProject(collected)) {
    const content = buildEmptyProjectCommand()

    // Token tracking
    const tokens = estimateTokens(content)
    const cost = estimateCost(tokens)

    if (dryRun) {
      console.log(c.bold("[DRY RUN] Would write:\n"))
      console.log(`  .claude/commands/stack-init.md (${content.length} chars, ~${tokens.toLocaleString()} tokens)`)
      console.log(`\n${c.dim("--- preview ---")}`)
      console.log(content.slice(0, 500))
      if (content.length > 500) console.log(c.dim(`\n... +${content.length - 500} chars`))

      section("Token cost estimate")
      console.log(`  ~${tokens.toLocaleString()} input tokens (${formatCost(cost)})`)
      return
    }

    ensureDir(".claude/commands")
    writeFileSync(".claude/commands/stack-init.md", content, "utf8")
    writeFileSync(".claude/commands/stack-sync.md", buildBootstrapSync(), "utf8")
    await updateManifest("init", collected, { estimatedTokens: tokens, estimatedCost: cost })
    installTokenHook()

    // Create initial snapshot — collectFilesForSnapshot scans all .claude/ automatically
    const cwd = process.cwd()
    const snapshotFiles = collectFilesForSnapshot(cwd, Object.keys(collected.configs))
    createSnapshot(cwd, "init", snapshotFiles, { summary: "initial setup (empty project)" })

    console.log(`
${c.green("✅")} New project detected.

Open Claude Code and run:
   ${c.cyan("/stack-init")}

Claude Code will ask 3 questions, then set up your environment.
    `)

    section("Token cost")
    const realSummary1 = formatRealCostSummary(cwd)
    if (realSummary1) {
      console.log(realSummary1)
    } else {
      console.log(`  ~${tokens.toLocaleString()} input tokens (${c.dim(`${formatCost(cost)}`)})`)
      console.log(`  ${c.dim("Estimates only — real costs tracked after first Claude Code session")}`)
    }
    console.log("")
    return
  }

  // Standard init — atomic steps + orchestrator
  const steps = buildAtomicSteps(collected, state)
  const orchestrator = buildOrchestratorCommand(steps)

  // Token tracking — sum all steps
  const totalContent = steps.map(s => s.content).join("\n") + "\n" + orchestrator
  const tokens = estimateTokens(totalContent)
  const cost = estimateCost(tokens)

  if (dryRun) {
    console.log(c.bold("[DRY RUN] Would write:\n"))
    for (const step of steps) {
      const stepTokens = estimateTokens(step.content)
      console.log(`  .claude/commands/${step.filename} (${step.content.length} chars, ~${stepTokens.toLocaleString()} tokens)`)
    }
    console.log(`  .claude/commands/stack-init.md (orchestrator)`)
    console.log(`\n${c.dim(`Total: ~${tokens.toLocaleString()} tokens across ${steps.length} files`)}`)

    section("Token cost estimate")
    console.log(`  ~${tokens.toLocaleString()} input tokens (${formatCost(cost)})`)
    return
  }

  ensureDir(".claude/commands")
  for (const step of steps) {
    writeFileSync(join(".claude/commands", step.filename), step.content, "utf8")
  }
  writeFileSync(".claude/commands/stack-init.md", orchestrator, "utf8")
  writeFileSync(".claude/commands/stack-sync.md", buildBootstrapSync(), "utf8")
  await updateManifest("init", collected, { estimatedTokens: tokens, estimatedCost: cost })
  installTokenHook()

  // Create initial snapshot — collectFilesForSnapshot scans all .claude/ automatically
  const cwd = process.cwd()
  const snapshotFiles = collectFilesForSnapshot(cwd, Object.keys(collected.configs))
  createSnapshot(cwd, "init", snapshotFiles, {
    summary: `${steps.length - 1} atomic steps generated`,
  })

  console.log(`
${c.green("✅")} Ready. Open Claude Code and run:
   ${c.cyan("/stack-init")}

Runs ${steps.length - 1} atomic steps. If one fails, re-run only that step.
  `)

  section("Token cost")
  const realSummary2 = formatRealCostSummary(cwd)
  if (realSummary2) {
    console.log(realSummary2)
  } else {
    console.log(`  ~${tokens.toLocaleString()} input tokens (${c.dim(`${formatCost(cost)}`)})`)
    console.log(`  ${c.dim("Estimates only — real costs tracked after first Claude Code session")}`)
  }
  console.log("")
}
