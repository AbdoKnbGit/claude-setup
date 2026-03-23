import { writeFileSync, mkdirSync, existsSync } from "fs"
import { collectProjectFiles, CollectedFiles } from "../collect.js"
import { readState } from "../state.js"
import { readManifest, sha256, updateManifest } from "../manifest.js"
import { buildSyncCommand, FileDiff } from "../builder.js"

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function truncate(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  return content.slice(0, maxChars) + "\n[... truncated for sync diff]"
}

function computeDiff(snapshot: Record<string, string>, collected: CollectedFiles): FileDiff {
  const current: Record<string, string> = {
    ...collected.configs,
    ...Object.fromEntries(collected.source.map(f => [f.path, f.content])),
  }

  const added: FileDiff["added"] = []
  const changed: FileDiff["changed"] = []
  const deleted: string[] = []

  for (const [path, content] of Object.entries(current)) {
    const hash = sha256(content)
    if (!snapshot[path]) {
      added.push({ path, content: truncate(content, 2000) })
    } else if (snapshot[path] !== hash) {
      changed.push({ path, current: truncate(content, 2000) })
    }
  }

  for (const path of Object.keys(snapshot)) {
    if (!current[path]) deleted.push(path)
  }

  return { added, changed, deleted }
}

export async function runSync(): Promise<void> {
  const manifest = await readManifest()

  if (!manifest?.runs.length) {
    console.log("No previous run found. Start with: npx claude-setup init")
    return
  }

  const lastRun = manifest.runs.at(-1)!
  const collected = await collectProjectFiles(process.cwd(), "normal")
  const diff = computeDiff(lastRun.snapshot, collected)

  if (!diff.added.length && !diff.changed.length && !diff.deleted.length) {
    console.log(`✅ No changes since ${lastRun.at}. Setup is current.`)
    return
  }

  const state = await readState()
  const content = buildSyncCommand(diff, collected, state)

  ensureDir(".claude/commands")
  writeFileSync(".claude/commands/stack-sync.md", content, "utf8")
  await updateManifest("sync", collected)

  console.log(`
Changes since ${lastRun.at}:
  +${diff.added.length} added  ~${diff.changed.length} modified  -${diff.deleted.length} deleted

✅ Ready. Open Claude Code and run:
   /stack-sync
  `)
}
