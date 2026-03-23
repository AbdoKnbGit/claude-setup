import { readManifest } from "../manifest.js"
import { readState } from "../state.js"

export async function runStatus(): Promise<void> {
  const manifest = await readManifest()
  const state = await readState()

  if (!manifest) {
    console.log("No setup found.\n  Run: npx claude-stack init")
    return
  }

  const last = manifest.runs.at(-1)!
  console.log(`Last: ${last.command} at ${last.at} (v${last.claudeStackVersion})\n`)
  console.log(`CLAUDE.md             ${state.claudeMd.exists ? "✅" : "❌ missing"}`)
  console.log(`.mcp.json             ${state.mcpJson.exists ? "✅" : "❌ missing"}`)
  console.log(`settings.json         ${state.settings.exists ? "✅" : "❌ missing"}`)
  console.log(`Skills                ${state.skills.length || "none"}`)
  console.log(`Workflows             ${state.workflows.length || "none"}`)
  console.log(`\nHistory (last 5):`)
  for (const r of manifest.runs.slice(-5)) {
    console.log(`  ${r.at}  ${r.command}${r.input ? ` — "${r.input}"` : ""}`)
  }
  console.log("\n  npx claude-stack sync    — update after changes")
  console.log("  npx claude-stack doctor  — validate environment")
}
