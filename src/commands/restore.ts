import { readTimeline, restoreSnapshot, updateRestoredNode } from "../snapshot.js"
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

async function promptSelectSnapshot(
  items: Array<{ id: string; label: string }>
): Promise<string | null> {
  const allItems = [
    ...items,
    { id: "__custom__", label: c.dim("Type snapshot ID manually…") },
    { id: "__cancel__", label: c.dim("Cancel") },
  ]

  // Non-TTY fallback: numbered list
  if (!process.stdin.isTTY) {
    for (let i = 0; i < allItems.length; i++) {
      console.log(`  [${i + 1}] ${allItems[i].label}`)
    }
    const raw = await promptFreeText("\nEnter number (or 'cancel'):")
    if (!raw || raw === "cancel") return null
    const num = parseInt(raw, 10)
    if (!isNaN(num) && num >= 1 && num <= allItems.length) {
      const val = allItems[num - 1].id
      if (val === "__cancel__") return null
      if (val === "__custom__") return (await promptFreeText("Enter snapshot ID:")) || null
      return val
    }
    return raw
  }

  return new Promise((resolve) => {
    let selectedIndex = 0
    let lineCount = 0

    const clearLines = () => {
      if (lineCount > 0) process.stdout.write(`\x1b[${lineCount}A\x1b[0J`)
    }

    const render = () => {
      clearLines()
      const lines: string[] = []
      for (let i = 0; i < allItems.length; i++) {
        const isSelected = i === selectedIndex
        const marker = isSelected ? c.cyan("❯") : " "
        const text = isSelected ? c.bold(allItems[i].label) : allItems[i].label
        lines.push(`  ${marker} ${text}`)
      }
      lines.push(``)
      lines.push(`  ${c.dim("↑/↓ navigate · Enter select · Ctrl+C cancel")}`)
      process.stdout.write(lines.join("\n") + "\n")
      lineCount = lines.length
    }

    let onKey: (key: string) => void

    const cleanup = () => {
      process.stdin.removeListener("data", onKey)
      try { process.stdin.setRawMode(false) } catch {}
      process.stdin.pause()
    }

    onKey = (key: string) => {
      if (key === "\u0003") {
        cleanup()
        process.stdout.write("\n")
        process.exit(0)
      } else if (key === "\u001b[A" || key === "\u001bOA") {
        selectedIndex = Math.max(0, selectedIndex - 1)
        render()
      } else if (key === "\u001b[B" || key === "\u001bOB") {
        selectedIndex = Math.min(allItems.length - 1, selectedIndex + 1)
        render()
      } else if (key === "\r" || key === "\n") {
        const chosen = allItems[selectedIndex]
        cleanup()
        process.stdout.write("\n")
        if (chosen.id === "__cancel__") {
          resolve(null)
        } else if (chosen.id === "__custom__") {
          promptFreeText("Enter snapshot ID:").then(id => resolve(id || null))
        } else {
          resolve(chosen.id)
        }
      }
    }

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", onKey)
    render()
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
  console.log(`  ${c.dim("All snapshots are always preserved — you can go back or forward freely.")}\n`)

  const restoredIdx = timeline.restoredTo
    ? timeline.nodes.findIndex(n => n.id === timeline.restoredTo)
    : timeline.nodes.length - 1
  const latestIdx = timeline.nodes.length - 1

  for (let i = 0; i < timeline.nodes.length; i++) {
    const node = timeline.nodes[i]
    const date = new Date(node.timestamp).toLocaleString()
    const isLatest = i === latestIdx
    const isHere = i === restoredIdx && timeline.restoredTo

    let marker = ""
    let prefix = "  "
    if (isHere && !isLatest) {
      marker = `  ${c.cyan("◀ you are here")}`
      prefix = c.cyan("▶ ")
    } else if (isLatest && !timeline.restoredTo) {
      marker = `  ${c.green("◀ you are here")}`
      prefix = c.green("▶ ")
    } else if (i > restoredIdx) {
      marker = `  ${c.dim("(future — reachable)")}`
      prefix = c.dim("  ")
    }

    const inputStr = node.input ? ` "${node.input}"` : ""
    console.log(`  ${prefix}${c.cyan(node.id)}  ${node.command}${inputStr}  ${c.dim(date)}  ${node.summary}${marker}`)
    if (i < timeline.nodes.length - 1) console.log(`  ${c.dim("  ──→")}`)
  }
  console.log("")

  const items = timeline.nodes.map((node, i) => {
    const date = new Date(node.timestamp).toLocaleString()
    const isLatest = i === latestIdx
    const isHere = i === restoredIdx && timeline.restoredTo
    const tag = isHere && !isLatest ? ` ${c.cyan("← you are here")}`
      : isLatest && !timeline.restoredTo ? ` ${c.green("← you are here")}`
      : i > restoredIdx ? ` ${c.dim("(future)")}`
      : ""
    return { id: node.id, label: `${node.id}  ${node.command}  ${c.dim(date)}  ${node.summary}${tag}` }
  })

  console.log("Select a snapshot to restore to:\n")
  const input = await promptSelectSnapshot(items)

  if (!input) {
    console.log("Cancelled.")
    return
  }

  const node = timeline.nodes.find(n => n.id === input)
  if (!node) {
    console.log(`${c.red("🔴")} Snapshot "${input}" not found.`)
    return
  }

  console.log(`\nRestoring to snapshot ${c.cyan(node.id)} (${new Date(node.timestamp).toLocaleString()})...`)
  console.log(`${c.dim("Config files will be rewritten to their state at this snapshot. Other files are untouched.")}\n`)

  const result = restoreSnapshot(cwd, input, timeline)
  updateRestoredNode(cwd, input)

  if (result.restored.length) {
    section("Restored files")
    for (const f of result.restored) {
      console.log(`  ${c.green("✅")} ${f}`)
    }
  }
  if (result.deleted.length) {
    section(`Removed (added after this snapshot — ${result.deleted.length} files)`)
    for (const f of result.deleted) {
      console.log(`  ${c.red("🗑")}  ${f}`)
    }
  }
  if (result.failed.length) {
    section("Failed to restore")
    for (const f of result.failed) {
      console.log(`  ${c.red("🔴")} ${f}`)
    }
  }
  if (result.stale.length) {
    section("Could not delete (permission error)")
    console.log(`  ${c.dim("These files exist but couldn't be removed — delete manually:")}`)
    for (const f of result.stale) {
      console.log(`  ${c.yellow("⚠️")}  ${f}`)
    }
  }

  if (result.restored.length === 0 && result.deleted.length === 0) {
    console.log(`\n${c.yellow("⚠️")}  This snapshot captured 0 files — nothing to restore.`)
  } else {
    const parts: string[] = []
    if (result.restored.length) parts.push(`${result.restored.length} restored`)
    if (result.deleted.length) parts.push(`${result.deleted.length} removed`)
    console.log(`\n${c.green("✅")} ${parts.join(", ")} → project is now at snapshot ${c.cyan(node.id)}.`)
  }

  // Re-read and display updated timeline
  const updatedTimeline = readTimeline(cwd)
  const updatedRestoredIdx = updatedTimeline.restoredTo
    ? updatedTimeline.nodes.findIndex(n => n.id === updatedTimeline.restoredTo)
    : updatedTimeline.nodes.length - 1
  console.log("")
  section("Timeline — you can restore to any node at any time")
  console.log("")
  for (let i = 0; i < updatedTimeline.nodes.length; i++) {
    const n = updatedTimeline.nodes[i]
    const date = new Date(n.timestamp).toLocaleString()
    const isHere = i === updatedRestoredIdx
    const isFuture = i > updatedRestoredIdx
    const marker = isHere ? `  ${c.cyan("◀ you are here")}` : isFuture ? `  ${c.dim("(future — reachable)")}` : ""
    const prefix = isHere ? c.cyan("▶ ") : isFuture ? c.dim("  ") : "  "
    const inputStr = n.input ? ` "${n.input}"` : ""
    console.log(`  ${prefix}${c.cyan(n.id)}  ${n.command}${inputStr}  ${c.dim(date)}  ${n.summary}${marker}`)
    if (i < updatedTimeline.nodes.length - 1) console.log(`  ${c.dim("  ──→")}`)
  }

  console.log(``)
  console.log(`  ${c.green("▶")} Run ${c.cyan("claude")} in this directory to start working from this point.`)
  console.log(`  ${c.dim("Run npx claude-setup sync to save the current state as a new snapshot.")}`)
  console.log(``)
}
