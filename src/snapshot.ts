/**
 * Snapshot time-travel system — like git commits for your project setup.
 *
 * Each sync creates a NODE (checkpoint) on a timeline.
 * Nodes store actual content of changed files only — lightweight.
 * Users can jump to any node and restore files to that state.
 * Jumping does NOT delete other nodes — all are preserved.
 *
 * Storage: .claude/snapshots/
 *   timeline.json       — ordered list of all nodes
 *   {node-id}.json      — file contents for that node
 *
 * Zero API calls. All local filesystem operations.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from "fs"
import { join, dirname, extname } from "path"
import { createHash } from "crypto"

const SNAPSHOTS_DIR = ".claude/snapshots"
const TIMELINE_FILE = "timeline.json"

export interface SnapshotNode {
  id: string
  timestamp: string
  command: string
  input?: string
  changedFiles: string[]
  summary: string
  fullSnapshot?: boolean  // true = node stores complete project state (not just deltas)
}

export interface SnapshotTimeline {
  nodes: SnapshotNode[]
  restoredTo?: string
}

export interface SnapshotData {
  files: Record<string, string>
}

function snapshotsDir(cwd: string): string {
  return join(cwd, SNAPSHOTS_DIR)
}

function timelinePath(cwd: string): string {
  return join(snapshotsDir(cwd), TIMELINE_FILE)
}

function nodeDataPath(cwd: string, nodeId: string): string {
  return join(snapshotsDir(cwd), `${nodeId}.json`)
}

function generateNodeId(): string {
  const now = new Date()
  return now.toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .split(".")[0]
}

export function readTimeline(cwd: string = process.cwd()): SnapshotTimeline {
  const p = timelinePath(cwd)
  if (!existsSync(p)) return { nodes: [] }
  try {
    return JSON.parse(readFileSync(p, "utf8")) as SnapshotTimeline
  } catch {
    return { nodes: [] }
  }
}

function writeTimeline(cwd: string, timeline: SnapshotTimeline): void {
  const dir = snapshotsDir(cwd)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(timelinePath(cwd), JSON.stringify(timeline, null, 2), "utf8")
}

export function readNodeData(cwd: string, nodeId: string): SnapshotData | null {
  const p = nodeDataPath(cwd, nodeId)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8")) as SnapshotData
  } catch {
    return null
  }
}

function writeNodeData(cwd: string, nodeId: string, data: SnapshotData): void {
  const dir = snapshotsDir(cwd)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(nodeDataPath(cwd, nodeId), JSON.stringify(data, null, 2), "utf8")
}

/**
 * Create a snapshot node. Called during sync and init.
 * Stores actual content of changed files only — not full project copy.
 */
export function createSnapshot(
  cwd: string,
  command: string,
  changedFiles: Array<{ path: string; content: string }>,
  opts: { input?: string; summary?: string } = {}
): SnapshotNode {
  const timeline = readTimeline(cwd)
  const nodeId = generateNodeId()

  const data: SnapshotData = { files: {} }
  for (const f of changedFiles) {
    data.files[f.path] = f.content
  }

  const node: SnapshotNode = {
    id: nodeId,
    timestamp: new Date().toISOString(),
    command,
    ...(opts.input ? { input: opts.input } : {}),
    changedFiles: changedFiles.map(f => f.path),
    summary: opts.summary ?? `${changedFiles.length} file(s) captured`,
    fullSnapshot: true,
  }

  timeline.nodes.push(node)
  writeTimeline(cwd, timeline)
  writeNodeData(cwd, nodeId, data)

  return node
}

/**
 * Build the complete file state at a given node.
 *
 * Full snapshots (fullSnapshot: true) store the entire project state — used directly.
 * Legacy delta snapshots accumulate from node 0 to target (last-write-wins).
 *
 * Why the distinction matters: with delta snapshots, if a file was deleted between A→B,
 * it would wrongly appear in cumulative state at B (still present from A). Full snapshots
 * avoid this because the target node's data IS the complete truth at that point.
 */
export function buildCumulativeState(
  cwd: string,
  nodeId: string,
  timeline: SnapshotTimeline
): Record<string, string> | null {
  const targetIndex = timeline.nodes.findIndex(n => n.id === nodeId)
  if (targetIndex < 0) return null

  const targetNode = timeline.nodes[targetIndex]

  // Full snapshot: the node's own data is already the complete project state
  if (targetNode.fullSnapshot) {
    const data = readNodeData(cwd, nodeId)
    return data ? { ...data.files } : null
  }

  // Legacy delta snapshot: accumulate from beginning to target
  const cumulative: Record<string, string> = {}
  for (let i = 0; i <= targetIndex; i++) {
    const data = readNodeData(cwd, timeline.nodes[i].id)
    if (data) {
      for (const [filePath, content] of Object.entries(data.files)) {
        cumulative[filePath] = content
      }
    }
  }
  return cumulative
}

/**
 * Restore files from a snapshot node.
 * Accumulates all file states from node 0 through the target node,
 * then writes them to disk. This reconstructs the full project state
 * at that point in time, not just the delta.
 * Does NOT delete other nodes — all nodes are preserved (like git).
 */
export function restoreSnapshot(
  cwd: string,
  nodeId: string,
  timeline?: SnapshotTimeline
): { restored: string[]; failed: string[]; deleted: string[]; stale: string[] } {
  const tl = timeline ?? readTimeline(cwd)

  const cumulativeFiles = buildCumulativeState(cwd, nodeId, tl)
  if (!cumulativeFiles) return { restored: [], failed: [nodeId], deleted: [], stale: [] }

  // Step 1: Write all snapshot files to disk
  const restored: string[] = []
  const failed: string[] = []

  for (const [filePath, content] of Object.entries(cumulativeFiles)) {
    const fullPath = join(cwd, filePath)
    try {
      const dir = dirname(fullPath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(fullPath, content, "utf8")
      restored.push(filePath)
    } catch {
      failed.push(filePath)
    }
  }

  // Step 2: Scan the project NOW (using the just-restored .gitignore)
  // and delete any file that isn't part of the snapshot.
  // This makes restore a true time machine — the directory looks exactly
  // like it did at this snapshot.
  const rules = loadGitignoreRules(cwd) // uses restored .gitignore if it was snapshotted
  const currentFiles: Array<{ path: string; content: string }> = []
  scanProject(cwd, "", rules, currentFiles)

  const deleted: string[] = []
  const stale: string[] = []

  for (const f of currentFiles) {
    if (cumulativeFiles[f.path]) continue // in snapshot — already restored
    // Not in snapshot → delete
    try {
      unlinkSync(join(cwd, f.path))
      deleted.push(f.path)
    } catch {
      stale.push(f.path) // couldn't delete (permissions etc.)
    }
  }

  return { restored, failed, deleted, stale }
}

/**
 * Record the last restored node in the timeline (for display purposes).
 */
export function updateRestoredNode(cwd: string, nodeId: string): void {
  const timeline = readTimeline(cwd)
  timeline.restoredTo = nodeId
  writeTimeline(cwd, timeline)
}

/**
 * Compare two snapshot nodes. Returns files that differ between them.
 */
export function compareSnapshots(
  cwd: string,
  nodeIdA: string,
  nodeIdB: string
): {
  onlyInA: string[]
  onlyInB: string[]
  changed: Array<{ path: string; linesA: number; linesB: number }>
  identical: string[]
} {
  const dataA = readNodeData(cwd, nodeIdA)
  const dataB = readNodeData(cwd, nodeIdB)

  const filesA = dataA?.files ?? {}
  const filesB = dataB?.files ?? {}

  const allPaths = new Set([...Object.keys(filesA), ...Object.keys(filesB)])

  const onlyInA: string[] = []
  const onlyInB: string[] = []
  const changed: Array<{ path: string; linesA: number; linesB: number }> = []
  const identical: string[] = []

  for (const path of allPaths) {
    const inA = path in filesA
    const inB = path in filesB

    if (inA && !inB) {
      onlyInA.push(path)
    } else if (!inA && inB) {
      onlyInB.push(path)
    } else {
      const hashA = createHash("sha256").update(filesA[path]).digest("hex")
      const hashB = createHash("sha256").update(filesB[path]).digest("hex")
      if (hashA !== hashB) {
        changed.push({
          path,
          linesA: filesA[path].split("\n").length,
          linesB: filesB[path].split("\n").length,
        })
      } else {
        identical.push(path)
      }
    }
  }

  return { onlyInA, onlyInB, changed, identical }
}

// ── Full-project file scanner (git-like coverage) ──────────────────────

const MAX_FILE_BYTES = 1024 * 1024 // 1 MB per file

/** Directory names always excluded (regardless of location in tree) */
const EXCLUDE_DIRS = new Set([
  ".git", "node_modules",
  "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", ".remix",
  "__pycache__", "target", ".gradle", ".mvn", "vendor",
  "coverage", ".nyc_output", ".c8",
  ".cache", ".parcel-cache", ".turbo", ".vercel", ".netlify",
  "tmp", "temp", ".tmp",
])

/** Relative paths always excluded */
const EXCLUDE_REL = new Set([
  ".claude/snapshots",
  ".claude/token-usage.json",
  ".claude/claude-setup.json",
])

/** Filenames always excluded (sensitive or OS noise) */
const EXCLUDE_NAMES = new Set([
  ".env", ".DS_Store", "Thumbs.db", "desktop.ini",
])

/** Binary file extensions — skip */
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".ico", ".avif",
  ".pdf",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar", ".xz",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".wasm",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".mp3", ".mp4", ".wav", ".ogg", ".flac", ".avi", ".mov", ".mkv",
  ".class", ".jar", ".war",
  ".pyc", ".pyo", ".pyd",
  ".o", ".a", ".lib",
  ".db", ".sqlite", ".sqlite3",
])

interface GitignoreRule {
  negated: boolean
  dirOnly: boolean
  regex: RegExp
}

function parseGitignoreLine(line: string): GitignoreRule | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) return null
  let pattern = trimmed
  const negated = pattern.startsWith("!")
  if (negated) pattern = pattern.slice(1)
  const anchored = pattern.startsWith("/")
  if (anchored) pattern = pattern.slice(1)
  const dirOnly = pattern.endsWith("/")
  if (dirOnly) pattern = pattern.slice(0, -1)
  // Convert glob to regex
  let regexStr = ""
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") { regexStr += "(?:.+/)?"; i += 2 }
      else { regexStr += ".*"; i++ }
    } else if (ch === "*") { regexStr += "[^/]*"
    } else if (ch === "?") { regexStr += "[^/]"
    } else if (".+^${}()|[]\\".includes(ch)) { regexStr += "\\" + ch
    } else { regexStr += ch }
  }
  const full = (anchored || pattern.includes("/"))
    ? `^${regexStr}(?:/.*)?$`
    : `(?:^|/)${regexStr}(?:/.*)?$`
  try { return { negated, dirOnly, regex: new RegExp(full) } } catch { return null }
}

function loadGitignoreRules(cwd: string): GitignoreRule[] {
  try {
    return readFileSync(join(cwd, ".gitignore"), "utf8")
      .split("\n").map(parseGitignoreLine)
      .filter((r): r is GitignoreRule => r !== null)
  } catch { return [] }
}

function matchesAnyRule(relPath: string, isDir: boolean, rules: GitignoreRule[]): boolean {
  let excluded = false
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue
    if (rule.regex.test(relPath)) excluded = !rule.negated
  }
  return excluded
}

function tryReadText(absPath: string): string | null {
  try {
    const st = statSync(absPath)
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return null
    const content = readFileSync(absPath, "utf8")
    if (content.includes("\0")) return null // binary
    return content
  } catch { return null }
}

function scanProject(
  cwd: string,
  relBase: string,
  rules: GitignoreRule[],
  out: Array<{ path: string; content: string }>
): void {
  const abs = relBase ? join(cwd, relBase) : cwd
  try {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name
      const isDir = entry.isDirectory()
      // Hard excludes
      if (isDir && EXCLUDE_DIRS.has(entry.name)) continue
      if (EXCLUDE_REL.has(relPath) || relPath.startsWith(".claude/snapshots/")) continue
      if (!isDir && EXCLUDE_NAMES.has(entry.name)) continue
      if (!isDir && BINARY_EXT.has(extname(entry.name).toLowerCase())) continue
      // Gitignore
      if (matchesAnyRule(relPath, isDir, rules)) continue
      if (isDir) {
        scanProject(cwd, relPath, rules, out)
      } else {
        const content = tryReadText(join(cwd, relPath))
        if (content !== null) out.push({ path: relPath, content })
      }
    }
  } catch { /* skip unreadable */ }
}

/**
 * Collect ALL project files for snapshot — full git-like coverage.
 * Respects .gitignore + hard exclusions (node_modules, .git, binaries, .env).
 * The trackedPaths param is kept for API compat but ignored.
 */
export function collectFilesForSnapshot(
  cwd: string,
  _trackedPaths: string[]
): Array<{ path: string; content: string }> {
  const rules = loadGitignoreRules(cwd)
  const out: Array<{ path: string; content: string }> = []
  scanProject(cwd, "", rules, out)
  return out
}
