import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { createHash } from "crypto"
import { CollectedFiles } from "./collect.js"

export interface ManifestRun {
  command: string
  at: string
  claudeStackVersion: string
  input?: string
  filesRead: string[]
  snapshot: Record<string, string>
}

export interface Manifest {
  version: string
  created: string
  runs: ManifestRun[]
}

const MANIFEST_FILENAME = ".claude/claude-stack.json"

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

export async function readManifest(cwd: string = process.cwd()): Promise<Manifest | null> {
  const filePath = join(cwd, MANIFEST_FILENAME)
  if (!existsSync(filePath)) return null

  try {
    const raw = readFileSync(filePath, "utf8")
    return JSON.parse(raw) as Manifest
  } catch {
    // Corrupted — back it up and start fresh
    const backupPath = filePath + ".bak"
    try {
      renameSync(filePath, backupPath)
      console.warn(`⚠️  Manifest was corrupted. Backed up to ${backupPath}`)
    } catch {
      console.warn(`⚠️  Manifest was corrupted and could not be backed up.`)
    }
    return null
  }
}

export async function updateManifest(
  command: string,
  collected: CollectedFiles,
  opts: { input?: string; cwd?: string } = {}
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const filePath = join(cwd, MANIFEST_FILENAME)

  // Read version from package.json
  let version = "0.0.0"
  try {
    const pkgPath = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..", "package.json")
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
      version = pkg.version ?? "0.0.0"
    }
  } catch { /* use default */ }

  // Build snapshot — hash of every file we read
  const snapshot: Record<string, string> = {}
  for (const [path, content] of Object.entries(collected.configs)) {
    snapshot[path] = sha256(content)
  }
  for (const { path, content } of collected.source) {
    snapshot[path] = sha256(content)
  }

  const filesRead = [
    ...Object.keys(collected.configs),
    ...collected.source.map(s => s.path),
  ]

  const run: ManifestRun = {
    command,
    at: new Date().toISOString(),
    claudeStackVersion: version,
    ...(opts.input ? { input: opts.input } : {}),
    filesRead,
    snapshot,
  }

  let manifest: Manifest
  const existing = await readManifest(cwd)
  if (existing) {
    existing.runs.push(run)
    manifest = existing
  } else {
    manifest = {
      version: "1",
      created: new Date().toISOString(),
      runs: [run],
    }
  }

  try {
    const dir = dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, JSON.stringify(manifest, null, 2), "utf8")
  } catch (err) {
    console.warn(`⚠️  Could not write manifest to ${filePath}: ${err}`)
  }
}
