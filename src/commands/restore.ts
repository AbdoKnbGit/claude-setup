import { readTimeline, restoreSnapshot } from "../snapshot.js"
import { c, section } from "../output.js"
import { createInterface } from "readline"

async function promptFreeText(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question + " ", (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export async function runRestore(): Promise<void> {
  const cwd = process.cwd()
  const timeline = readTimeline(cwd)

  if (!timeline.nodes.length) {
    console.log(`${c.yellow("⚠️")} No snapshots found. Run ${c.cyan("npx claude-setup sync")} to create one.`)
    return
  }

  // Display timeline
  section("Snapshot timeline")
  console.log("")
  for (let i = 0; i < timeline.nodes.length; i++) {
    const node = timeline.nodes[i]
    const date = new Date(node.timestamp).toLocaleString()
    const current = i === timeline.nodes.length - 1 ? ` ${c.green("← current")}` : ""
    const connector = i < timeline.nodes.length - 1 ? "──→" : "   "
    const inputStr = node.input ? ` "${node.input}"` : ""
    console.log(`  ${c.cyan(node.id)}  ${node.command}${inputStr}  ${c.dim(date)}  ${node.summary}${current}`)
    if (i < timeline.nodes.length - 1) console.log(`  ${c.dim(connector)}`)
  }
  console.log("")

  const input = await promptFreeText("Enter snapshot ID to restore (or 'cancel'):")
  if (!input || input === "cancel") {
    console.log("Cancelled.")
    return
  }

  const node = timeline.nodes.find(n => n.id === input)
  if (!node) {
    console.log(`${c.red("🔴")} Snapshot "${input}" not found.`)
    return
  }

  console.log(`\nRestoring to snapshot ${c.cyan(node.id)} (${new Date(node.timestamp).toLocaleString()})...`)
  console.log(`${c.dim("Other snapshots are preserved — you can jump forward or back at any time.")}\n`)

  const result = restoreSnapshot(cwd, input)

  if (result.restored.length) {
    section("Restored files")
    for (const f of result.restored) {
      console.log(`  ${c.green("✅")} ${f}`)
    }
  }
  if (result.failed.length) {
    section("Failed to restore")
    for (const f of result.failed) {
      console.log(`  ${c.red("🔴")} ${f}`)
    }
  }

  console.log(`\n${c.green("✅")} Restored ${result.restored.length} file(s) to snapshot ${c.cyan(node.id)}.`)
  console.log(`Run ${c.cyan("npx claude-setup sync")} to capture the current state as a new node.`)
}
