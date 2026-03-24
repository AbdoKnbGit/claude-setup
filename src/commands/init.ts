import { writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import { collectProjectFiles, isEmptyProject } from "../collect.js"
import { readState } from "../state.js"
import { updateManifest } from "../manifest.js"
import {
  buildEmptyProjectCommand,
  buildAtomicSteps,
  buildOrchestratorCommand,
} from "../builder.js"
import { c } from "../output.js"
import { ensureConfig } from "../config.js"

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export async function runInit(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false

  // Auto-generate .claude-setup.json if it doesn't exist
  // Developer can edit it anytime to tune token budgets, truncation rules, etc.
  const configCreated = ensureConfig()
  if (configCreated) {
    console.log(`${c.dim("Created .claude-setup.json — edit to tune token budgets and truncation rules")}`)
  }

  const state = await readState()
  const collected = await collectProjectFiles(process.cwd(), "deep")

  if (isEmptyProject(collected)) {
    const content = buildEmptyProjectCommand()

    if (dryRun) {
      console.log(c.bold("[DRY RUN] Would write:\n"))
      console.log(`  .claude/commands/stack-init.md (${content.length} chars, ~${Math.ceil(content.length / 4)} tokens)`)
      console.log(`\n${c.dim("--- preview ---")}`)
      console.log(content.slice(0, 500))
      if (content.length > 500) console.log(c.dim(`\n... +${content.length - 500} chars`))
      return
    }

    ensureDir(".claude/commands")
    writeFileSync(".claude/commands/stack-init.md", content, "utf8")
    await updateManifest("init", collected)

    console.log(`
${c.green("✅")} New project detected.

Open Claude Code and run:
   ${c.cyan("/stack-init")}

Claude Code will ask 3 questions, then set up your environment.
    `)
    return
  }

  // Standard init — atomic steps + orchestrator
  const steps = buildAtomicSteps(collected, state)
  const orchestrator = buildOrchestratorCommand(steps)

  if (dryRun) {
    console.log(c.bold("[DRY RUN] Would write:\n"))
    for (const step of steps) {
      const tokens = Math.ceil(step.content.length / 4)
      console.log(`  .claude/commands/${step.filename} (${step.content.length} chars, ~${tokens} tokens)`)
    }
    console.log(`  .claude/commands/stack-init.md (orchestrator)`)
    const totalTokens = steps.reduce((sum, s) => sum + Math.ceil(s.content.length / 4), 0)
    console.log(`\n${c.dim(`Total: ~${totalTokens} tokens across ${steps.length} files`)}`)
    return
  }

  ensureDir(".claude/commands")
  for (const step of steps) {
    writeFileSync(join(".claude/commands", step.filename), step.content, "utf8")
  }
  writeFileSync(".claude/commands/stack-init.md", orchestrator, "utf8")
  await updateManifest("init", collected)

  console.log(`
${c.green("✅")} Ready. Open Claude Code and run:
   ${c.cyan("/stack-init")}

Runs ${steps.length - 1} atomic steps. If one fails, re-run only that step.
  `)
}
