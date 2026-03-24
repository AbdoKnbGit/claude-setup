import { writeFileSync, mkdirSync, existsSync } from "fs"
import { createInterface } from "readline"
import { collectProjectFiles } from "../collect.js"
import { readState } from "../state.js"
import { updateManifest } from "../manifest.js"
import { buildAddCommand } from "../builder.js"
import { c } from "../output.js"

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

// Conservative — only redirect when unambiguously single-file
// False negatives (multi-step for single-file request) are fine
// False positives (redirecting a genuinely multi-file request) are bad
function isSingleFileOperation(input: string): boolean {
  return (
    /to \.mcp\.json\s*$/i.test(input) ||
    /to settings\.json\s*$/i.test(input) ||
    /to claude\.md\s*$/i.test(input)
  )
}

export async function runAdd(): Promise<void> {
  const userInput = await promptFreeText(
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
  // add only needs config files — source files are irrelevant and waste tokens
  const collected = await collectProjectFiles(process.cwd(), "configOnly")
  const content = buildAddCommand(userInput, collected, state)

  ensureDir(".claude/commands")
  writeFileSync(".claude/commands/stack-add.md", content, "utf8")
  await updateManifest("add", collected, { input: userInput })

  console.log(`\n${c.green("✅")} Ready. Open Claude Code and run:\n   ${c.cyan("/stack-add")}\n`)
}
