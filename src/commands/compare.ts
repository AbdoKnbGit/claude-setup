import { readTimeline, compareSnapshots } from "../snapshot.js"
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

export async function runCompare(): Promise<void> {
  const cwd = process.cwd()
  const timeline = readTimeline(cwd)

  if (timeline.nodes.length < 2) {
    console.log(
      `${c.yellow("⚠️")} Need at least 2 snapshots to compare. ` +
      `Run ${c.cyan("npx claude-setup sync")} to create more.`
    )
    return
  }

  // Display available nodes
  section("Available snapshots")
  console.log("")
  for (let i = 0; i < timeline.nodes.length; i++) {
    const node = timeline.nodes[i]
    const date = new Date(node.timestamp).toLocaleString()
    const inputStr = node.input ? ` "${node.input}"` : ""
    console.log(`  ${c.cyan(node.id)}  ${node.command}${inputStr}  ${c.dim(date)}  ${node.summary}`)
  }
  console.log("")

  const idA = await promptFreeText("Enter first snapshot ID (older):")
  if (!idA) { console.log("No input provided."); return }

  const idB = await promptFreeText("Enter second snapshot ID (newer):")
  if (!idB) { console.log("No input provided."); return }

  const nodeA = timeline.nodes.find(n => n.id === idA)
  const nodeB = timeline.nodes.find(n => n.id === idB)

  if (!nodeA) { console.log(`${c.red("🔴")} Snapshot "${idA}" not found.`); return }
  if (!nodeB) { console.log(`${c.red("🔴")} Snapshot "${idB}" not found.`); return }

  console.log(`\nComparing ${c.cyan(idA)} → ${c.cyan(idB)}...\n`)

  const result = compareSnapshots(cwd, idA, idB)

  if (result.onlyInA.length) {
    section(`Only in ${idA} (removed after)`)
    for (const f of result.onlyInA) {
      console.log(`  ${c.red("-")} ${f}`)
    }
  }

  if (result.onlyInB.length) {
    section(`Only in ${idB} (added after)`)
    for (const f of result.onlyInB) {
      console.log(`  ${c.green("+")} ${f}`)
    }
  }

  if (result.changed.length) {
    section("Changed between snapshots")
    for (const f of result.changed) {
      console.log(`  ${c.yellow("~")} ${f.path} (${f.linesA} → ${f.linesB} lines)`)
    }
  }

  if (result.identical.length) {
    console.log(`\n  ${c.dim(`${result.identical.length} file(s) identical between snapshots`)}`)
  }

  const totalDiffs = result.onlyInA.length + result.onlyInB.length + result.changed.length
  if (totalDiffs === 0) {
    console.log(`\n${c.green("✅")} Snapshots are identical — no differences found.`)
  } else {
    console.log(`\n${c.bold(`${totalDiffs} difference(s)`)} between ${c.cyan(idA)} and ${c.cyan(idB)}.`)
    if (result.changed.length) {
      console.log(`${c.dim("Use")} ${c.cyan("npx claude-setup restore")} ${c.dim("to jump to either snapshot.")}`)
    }
  }
}
