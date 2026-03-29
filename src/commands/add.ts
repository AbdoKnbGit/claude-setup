import { writeFileSync, mkdirSync, existsSync } from "fs"
import { createInterface } from "readline"
import { collectProjectFiles } from "../collect.js"
import { readState } from "../state.js"
import { updateManifest } from "../manifest.js"
import { buildAddCommand } from "../builder.js"
import { estimateTokens, estimateCost } from "../tokens.js"
import { c } from "../output.js"
import { installMarketplaceFetcher } from "./init.js"

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

function isSingleFileOperation(input: string): boolean {
  return (
    /to \.mcp\.json\s*$/i.test(input) ||
    /to settings\.json\s*$/i.test(input) ||
    /to claude\.md\s*$/i.test(input)
  )
}

export async function runAdd(opts: { input?: string } = {}): Promise<void> {
  const userInput = opts.input ?? await promptFreeText(
    "What do you want to add to your Claude Code setup?"
  )

  if (!userInput) {
    console.log("No input provided.")
    return
  }

  if (isSingleFileOperation(userInput)) {
    console.log(`
For single changes, Claude Code is faster:
  Just tell it: "${userInput}"

Use ${c.cyan("claude-setup add")} when the change spans multiple files —
capabilities that need documentation, MCP servers, skills, and hooks together.
    `)
    return
  }

  const state = await readState()
  const collected = await collectProjectFiles(process.cwd(), "configOnly")
  const content = buildAddCommand(userInput, collected, state)

  const tokens = estimateTokens(content)
  const cost = estimateCost(tokens)

  ensureDir(".claude/commands")
  installMarketplaceFetcher()
  writeFileSync(".claude/commands/stack-add.md", content, "utf8")
  await updateManifest("add", collected, {
    input: userInput,
    estimatedTokens: tokens,
    estimatedCost: cost,
  })

  console.log(`\n${c.green("✅")} Ready. Open Claude Code and run:\n   ${c.cyan("/stack-add")}\n`)
}
