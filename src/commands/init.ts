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

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export async function runInit(): Promise<void> {
  const state = await readState()
  const collected = await collectProjectFiles(process.cwd(), "deep")

  ensureDir(".claude/commands")

  if (isEmptyProject(collected)) {
    const content = buildEmptyProjectCommand()
    writeFileSync(".claude/commands/stack-init.md", content, "utf8")
    await updateManifest("init", collected)
    console.log(`
✅ New project detected.

Open Claude Code and run:
   /stack-init

Claude Code will ask 3 questions, then set up your environment.
    `)
    return
  }

  // Standard init — 6 atomic steps + orchestrator
  const steps = buildAtomicSteps(collected, state)
  for (const step of steps) {
    writeFileSync(join(".claude/commands", step.filename), step.content, "utf8")
  }
  writeFileSync(".claude/commands/stack-init.md", buildOrchestratorCommand(steps), "utf8")
  await updateManifest("init", collected)

  console.log(`
✅ Ready. Open Claude Code and run:
   /stack-init

Runs 6 atomic steps. If one fails, re-run only that step.
  `)
}
