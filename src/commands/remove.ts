import { writeFileSync, mkdirSync, existsSync } from "fs"
import { createInterface } from "readline"
import { collectProjectFiles } from "../collect.js"
import { readState } from "../state.js"
import { updateManifest } from "../manifest.js"
import { buildRemoveCommand } from "../builder.js"
import { estimateTokens, estimateCost, formatCost } from "../tokens.js"
import { c, section } from "../output.js"

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

async function promptFreeText(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question + " ", (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export async function runRemove(): Promise<void> {
  const userInput = await promptFreeText(
    "What do you want to remove from your Claude Code setup?"
  )

  if (!userInput) {
    console.log("No input provided.")
    return
  }

  const state = await readState()
  const collected = await collectProjectFiles(process.cwd(), "configOnly")
  const content = buildRemoveCommand(userInput, state)

  // Token tracking
  const tokens = estimateTokens(content)
  const cost = estimateCost(tokens)

  ensureDir(".claude/commands")
  writeFileSync(".claude/commands/stack-remove.md", content, "utf8")
  await updateManifest("remove", collected, {
    input: userInput,
    estimatedTokens: tokens,
    estimatedCost: cost,
  })

  console.log(`\n${c.green("✅")} Ready. Open Claude Code and run:\n   ${c.cyan("/stack-remove")}`)

  section("Token cost")
  console.log(`  ~${tokens.toLocaleString()} input tokens (${c.dim(`${formatCost(cost)}`)})`)
  console.log("")
}
