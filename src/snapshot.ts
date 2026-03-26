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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join, dirname } from "path"
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
}

export interface SnapshotTimeline {
  nodes: SnapshotNode[]
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
  }

  timeline.nodes.push(node)
  writeTimeline(cwd, timeline)
  writeNodeData(cwd, nodeId, data)

  return node
}

/**
 * Restore files from a snapshot node.
 * Writes stored file contents back to disk.
 * Does NOT delete other nodes — all nodes are preserved (like git).
 */
export function restoreSnapshot(
  cwd: string,
  nodeId: string
): { restored: string[]; failed: string[] } {
  const data = readNodeData(cwd, nodeId)
  if (!data) return { restored: [], failed: [nodeId] }

  const restored: string[] = []
  const failed: string[] = []

  for (const [filePath, content] of Object.entries(data.files)) {
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

  return { restored, failed }
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

/**
 * Collect current file contents for snapshot.
 * Reads tracked files + CLI-managed files from disk.
 */
export function collectFilesForSnapshot(
  cwd: string,
  trackedPaths: string[]
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = []
  const seen = new Set<string>()

  for (const filePath of trackedPaths) {
    if (filePath === "__digest__" || filePath === ".env") continue
    if (seen.has(filePath)) continue
    const fullPath = join(cwd, filePath)
    if (!existsSync(fullPath)) continue
    try {
      files.push({ path: filePath, content: readFileSync(fullPath, "utf8") })
      seen.add(filePath)
    } catch { /* skip unreadable */ }
  }

  // Also capture CLI-managed files if not already included
  const managed = ["CLAUDE.md", ".mcp.json", ".claude/settings.json"]
  for (const m of managed) {
    if (seen.has(m)) continue
    const fullPath = join(cwd, m)
    if (!existsSync(fullPath)) continue
    try {
      files.push({ path: m, content: readFileSync(fullPath, "utf8") })
      seen.add(m)
    } catch { /* skip */ }
  }

  return files
}
