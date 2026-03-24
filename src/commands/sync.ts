import { writeFileSync, mkdirSync, existsSync } from "fs"
import { collectProjectFiles, CollectedFiles } from "../collect.js"
import { readState } from "../state.js"
import { readManifest, sha256, updateManifest } from "../manifest.js"
import { buildSyncCommand, FileDiff } from "../builder.js"
import { c } from "../output.js"

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
    // Skip virtual keys — they're not real files
    if (path === "__digest__") continue

    const hash = sha256(content)
    if (!snapshot[path]) {
      added.push({ path, content: truncate(content, 2000) })
    } else if (snapshot[path] !== hash) {
      changed.push({ path, current: truncate(content, 2000) })
    }
  }

  for (const path of Object.keys(snapshot)) {
    // Skip virtual keys
    if (path === "__digest__") continue
    if (!current[path]) deleted.push(path)
  }

  return { added, changed, deleted }
}

export async function runSync(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false
  const manifest = await readManifest()

  if (!manifest?.runs.length) {
    console.log(`No previous run found. Start with: ${c.cyan("npx claude-setup init")}`)
    return
  }

  const lastRun = manifest.runs.at(-1)!
  const collected = await collectProjectFiles(process.cwd(), "normal")
  const diff = computeDiff(lastRun.snapshot, collected)

  if (!diff.added.length && !diff.changed.length && !diff.deleted.length) {
    console.log(`${c.green("✅")} No changes since ${c.dim(lastRun.at)}. Setup is current.`)
    return
  }

  const state = await readState()
  const content = buildSyncCommand(diff, collected, state)

  if (dryRun) {
    console.log(c.bold("[DRY RUN] Changes detected:\n"))
    if (diff.added.length) {
      console.log(c.green(`  +${diff.added.length} added`))
      for (const f of diff.added) console.log(`    ${f.path}`)
    }
    if (diff.changed.length) {
      console.log(c.yellow(`  ~${diff.changed.length} modified`))
      for (const f of diff.changed) console.log(`    ${f.path}`)
    }
    if (diff.deleted.length) {
      console.log(c.red(`  -${diff.deleted.length} deleted`))
      for (const f of diff.deleted) console.log(`    ${f}`)
    }
    console.log(`\n  Would write: .claude/commands/stack-sync.md (~${Math.ceil(content.length / 4)} tokens)`)
    return
  }

  ensureDir(".claude/commands")
  writeFileSync(".claude/commands/stack-sync.md", content, "utf8")
  await updateManifest("sync", collected)

  console.log(`
Changes since ${c.dim(lastRun.at)}:
  ${c.green(`+${diff.added.length}`)} added  ${c.yellow(`~${diff.changed.length}`)} modified  ${c.red(`-${diff.deleted.length}`)} deleted

${c.green("✅")} Ready. Open Claude Code and run:
   ${c.cyan("/stack-sync")}
  `)
}
