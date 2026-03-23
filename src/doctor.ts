import { existsSync, readFileSync } from "fs"
import { execSync } from "child_process"
import { readManifest } from "./manifest.js"
import { readState } from "./state.js"

function tryExec(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
  } catch {
    return null
  }
}

function readIfExists(filePath: string): string | null {
  if (!existsSync(filePath)) return null
  try {
    return readFileSync(filePath, "utf8")
  } catch {
    return null
  }
}

function line(icon: string, label: string, detail: string): void {
  console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ""}`)
}

export async function runDoctor(): Promise<void> {
  const manifest = await readManifest()
  const state = await readState()

  console.log("claude-setup doctor\n")

  // Claude Code installed?
  const cv = tryExec("claude --version")
  line(cv ? "✅" : "❌", "Claude Code", cv?.trim() ?? "not found")

  // Manifest?
  const lastRun = manifest?.runs.at(-1)
  line(
    manifest ? "✅" : "⚠️ ",
    ".claude/claude-setup.json",
    manifest ? `last: ${lastRun?.command} at ${lastRun?.at}` : "not found — run: npx claude-setup init"
  )

  // Files from last run still on disk?
  if (lastRun?.filesRead.length) {
    console.log("\nFiles from last run (sample):")
    for (const f of lastRun.filesRead.slice(0, 8)) {
      line(existsSync(f) ? "✅" : "⚠️ ", f, existsSync(f) ? "" : "not found on disk")
    }
  }

  // Env vars in .mcp.json present in env template?
  if (state.mcpJson.content) {
    const refs = [...state.mcpJson.content.matchAll(/\$\{?([A-Z_][A-Z0-9_]+)\}?/g)]
      .map(m => m[1])
    const unique = [...new Set(refs)]
    if (unique.length) {
      const template = readIfExists(".env.example") ?? readIfExists(".env.sample") ?? ""
      console.log("\nMCP environment variables:")
      for (const v of unique) {
        line(
          template.includes(v) ? "✅" : "⚠️ ",
          v,
          template.includes(v) ? "found in env template" : "missing from .env.example"
        )
      }
    }
  }

  // Workflow secrets
  if (state.workflows.length) {
    const secrets = new Set<string>()
    for (const wf of state.workflows) {
      const content = readIfExists(wf) ?? ""
      for (const m of content.matchAll(/\$\{\{\s*secrets\.([A-Z_]+)\s*\}\}/g)) {
        secrets.add(m[1])
      }
    }
    if (secrets.size) {
      console.log("\nWorkflow secrets (add to GitHub Settings → Secrets):")
      for (const s of secrets) console.log(`  ⚠️  ${s}`)
    }
  }

  console.log("\n✅ Done.")
}
