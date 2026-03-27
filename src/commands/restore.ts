import { readTimeline, restoreSnapshot, updateRestoredNode, SnapshotTimeline } from "../snapshot.js"
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
  const restoredTo = (timeline as SnapshotTimeline & { restoredTo?: string }).restoredTo
  for (let i = 0; i < timeline.nodes.length; i++) {
    const node = timeline.nodes[i]
    const date = new Date(node.timestamp).toLocaleString()
    const isLatest = i === timeline.nodes.length - 1
    const isRestored = restoredTo === node.id && !isLatest
    const current = isLatest ? ` ${c.green("← current")}` : isRestored ? ` ${c.cyan("← restored here")}` : ""
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

  const result = restoreSnapshot(cwd, input, timeline)
  updateRestoredNode(cwd, input)

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

  if (result.stale.length) {
    section("Files not in this snapshot (may be stale)")
    console.log(`  ${c.dim("These files exist now but were not part of the restored snapshot:")}`)
    for (const f of result.stale) {
      console.log(`  ${c.yellow("⚠️")}  ${f}`)
    }
    console.log(`  ${c.dim("To fully reset, delete these manually or run sync to update the snapshot.")}`)
  }

  if (result.restored.length === 0 && result.stale.length === 0) {
    console.log(`\n${c.yellow("⚠️")}  This snapshot captured 0 files — the project was empty at that point.`)
    console.log(`   Files added since this snapshot have been left in place.`)
  } else {
    console.log(`\n${c.green("✅")} Restored ${result.restored.length} file(s) to snapshot ${c.cyan(node.id)}.`)
  }

  // Re-read and display updated timeline showing the restored position
  const updatedTimeline = readTimeline(cwd)
  console.log("")
  section("Updated timeline")
  console.log("")
  for (let i = 0; i < updatedTimeline.nodes.length; i++) {
    const n = updatedTimeline.nodes[i]
    const date = new Date(n.timestamp).toLocaleString()
    const isRestored = updatedTimeline.restoredTo === n.id
    const marker = isRestored ? ` ${c.cyan("← restored here")}` : ""
    const connector = i < updatedTimeline.nodes.length - 1 ? "──→" : "   "
    const inputStr = n.input ? ` "${n.input}"` : ""
    console.log(`  ${c.cyan(n.id)}  ${n.command}${inputStr}  ${c.dim(date)}  ${n.summary}${marker}`)
    if (i < updatedTimeline.nodes.length - 1) console.log(`  ${c.dim(connector)}`)
  }

  console.log(`\nTimeline position updated → snapshot ${c.cyan(node.id)}`)
  console.log(`Run ${c.cyan("npx claude-setup sync")} to capture the current state as a new node.\n`)
}
