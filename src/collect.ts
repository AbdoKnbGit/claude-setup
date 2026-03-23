import { readFileSync, existsSync, statSync } from "fs"
import { glob } from "glob"
import { join, relative, extname, basename, dirname } from "path"

export interface CollectedFiles {
  configs: Record<string, string>
  source: Array<{ path: string; content: string }>
  skipped: Array<{ path: string; reason: string }>
}

// Universal blocklist — always exclude these patterns
const BLOCKED_DIRS = new Set([
  "node_modules", "vendor", ".venv", "venv", "env", "__pypackages__",
  "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", "__pycache__",
  "target", ".git", ".cache", "coverage", ".nyc_output", ".pytest_cache",
  ".tox", "htmlcov", ".ruff_cache", "logs",
])

const BLOCKED_EXTENSIONS = new Set([
  ".lock", ".pyc", ".pyo", ".class", ".o", ".a", ".so", ".dylib", ".dll",
  ".exe", ".wasm", ".min.js", ".min.css", ".bundle.js", ".chunk.js", ".map",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp4", ".mp3", ".wav", ".ogg", ".webm", ".pdf",
  ".zip", ".tar", ".gz", ".bz2", ".rar", ".7z", ".dmg", ".pkg", ".deb", ".rpm",
  ".sqlite3", ".sqlite", ".db", ".csv", ".parquet", ".arrow",
  ".pkl", ".pickle", ".npy", ".npz",
  ".log", ".swp", ".swo",
])

const BLOCKED_FILES = new Set([
  "go.sum", "poetry.lock", "Pipfile.lock", "composer.lock",
  ".DS_Store", "Thumbs.db",
])

// Config files to read at root (or one level deep)
const CONFIG_FILES: Array<{ pattern: string; truncate?: (c: string) => string }> = [
  { pattern: "package.json" },
  { pattern: "package-lock.json", truncate: truncatePackageLock },
  { pattern: "pyproject.toml" },
  { pattern: "setup.py", truncate: (c) => firstLines(c, 60) },
  { pattern: "requirements.txt" },
  { pattern: "Pipfile" },
  { pattern: "go.mod" },
  { pattern: "Cargo.toml" },
  { pattern: "pom.xml", truncate: (c) => firstLines(c, 80) },
  { pattern: "build.gradle", truncate: (c) => firstLines(c, 80) },
  { pattern: "build.gradle.kts", truncate: (c) => firstLines(c, 80) },
  { pattern: "composer.json" },
  { pattern: "Gemfile" },
  { pattern: "turbo.json" },
  { pattern: "nx.json" },
  { pattern: "pnpm-workspace.yaml" },
  { pattern: "lerna.json" },
  { pattern: ".env.example" },
  { pattern: ".env.sample" },
  { pattern: ".env.template" },
  { pattern: "docker-compose.yml", truncate: (c) => c.length > 8000 ? firstLines(c, 100) + "\n[... truncated]" : c },
  { pattern: "docker-compose.yaml", truncate: (c) => c.length > 8000 ? firstLines(c, 100) + "\n[... truncated]" : c },
  { pattern: "Dockerfile", truncate: (c) => firstLines(c, 50) },
]

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".scala",
  ".rb", ".php", ".cs", ".swift", ".c", ".cpp", ".h",
  ".vue", ".svelte", ".astro",
])

const ENTRY_BASENAMES = new Set([
  "index", "main", "app", "server", "cmd", "cli", "mod", "run",
])

const ENTRY_DIRS = [".", "src", "app", "cmd", "bin"]

const PRIMARY_SOURCE_DIRS = [
  "src", "app", "lib", "core", "pkg", "internal", "api", "cmd",
]

const MAX_SOURCE_FILES = 10
const MAX_FILE_BYTES = 80_000

export async function collectProjectFiles(cwd: string = process.cwd()): Promise<CollectedFiles> {
  const configs: Record<string, string> = {}
  const source: CollectedFiles["source"] = []
  const skipped: CollectedFiles["skipped"] = []

  // Collect config files
  for (const cfg of CONFIG_FILES) {
    const filePath = join(cwd, cfg.pattern)
    if (existsSync(filePath)) {
      try {
        let content = readFileSync(filePath, "utf8")
        if (cfg.truncate) content = cfg.truncate(content)
        configs[cfg.pattern] = content
      } catch {
        skipped.push({ path: cfg.pattern, reason: "could not read" })
      }
    }
  }

  // Check for .env (note existence but never read)
  if (existsSync(join(cwd, ".env")) && !configs[".env"]) {
    configs[".env"] = "[.env exists — not read for security]"
  }

  // Root-level *.config.{js,ts,mjs} files
  for (const ext of ["js", "ts", "mjs"]) {
    try {
      const matches = await glob(`*.config.${ext}`, { cwd, nodir: true })
      for (const m of matches) {
        const filePath = join(cwd, m)
        try {
          const content = readFileSync(filePath, "utf8")
          configs[m] = firstLines(content, 100)
        } catch {
          skipped.push({ path: m, reason: "could not read" })
        }
      }
    } catch { /* glob error — skip */ }
  }

  // Root-level *.csproj files
  try {
    const csprojMatches = await glob("*.csproj", { cwd, nodir: true })
    for (const m of csprojMatches) {
      try {
        configs[m] = readFileSync(join(cwd, m), "utf8")
      } catch {
        skipped.push({ path: m, reason: "could not read" })
      }
    }
  } catch { /* skip */ }

  // Collect source files — max 10, cost-aware
  const allSourceFiles = await findSourceFiles(cwd)

  // Step 1: entry points
  const entries: string[] = []
  for (const dir of ENTRY_DIRS) {
    for (const file of allSourceFiles) {
      const base = basename(file, extname(file))
      const fileDir = dirname(file)
      if (ENTRY_BASENAMES.has(base) && (fileDir === dir || fileDir === ".")) {
        if (!entries.includes(file)) entries.push(file)
        if (entries.length >= 3) break
      }
    }
    if (entries.length >= 3) break
  }

  // Step 2: breadth sample from primary source directory
  let primaryDir = ""
  let maxCount = 0
  for (const dir of PRIMARY_SOURCE_DIRS) {
    const count = allSourceFiles.filter(f => f.startsWith(dir + "/")).length
    if (count > maxCount) {
      maxCount = count
      primaryDir = dir
    }
  }

  const breadthFiles: string[] = []
  if (primaryDir) {
    const dirFiles = allSourceFiles
      .filter(f => f.startsWith(primaryDir + "/"))
      .filter(f => !entries.includes(f))

    // Sort smallest first — highest signal-to-size ratio
    const withSize = dirFiles.map(f => {
      try {
        return { path: f, size: statSync(join(cwd, f)).size }
      } catch {
        return { path: f, size: Infinity }
      }
    }).sort((a, b) => a.size - b.size)

    for (const { path: p } of withSize) {
      if (breadthFiles.length >= 5) break
      breadthFiles.push(p)
    }
  }

  // Step 3: fill remaining from other top-level dirs
  const selected = [...entries, ...breadthFiles]
  const remaining = allSourceFiles.filter(f => !selected.includes(f))
  for (const f of remaining) {
    if (selected.length >= MAX_SOURCE_FILES) break
    selected.push(f)
  }

  // Step 4: read and truncate
  for (const filePath of selected) {
    const fullPath = join(cwd, filePath)
    try {
      const stat = statSync(fullPath)
      if (stat.size > MAX_FILE_BYTES) {
        skipped.push({ path: filePath, reason: `too large (${(stat.size / 1024).toFixed(0)}KB)` })
        continue
      }
      const raw = readFileSync(fullPath, "utf8")
      source.push({ path: filePath, content: truncateSource(raw, filePath) })
    } catch {
      skipped.push({ path: filePath, reason: "could not read" })
    }
  }

  return { configs, source, skipped }
}

async function findSourceFiles(cwd: string): Promise<string[]> {
  try {
    const files = await glob("**/*", {
      cwd,
      nodir: true,
      ignore: [...BLOCKED_DIRS].map(d => `${d}/**`),
      maxDepth: 5,
    })
    return files
      .filter(f => {
        const ext = extname(f)
        const base = basename(f)
        if (BLOCKED_FILES.has(base)) return false
        if (BLOCKED_EXTENSIONS.has(ext)) return false
        if (SOURCE_EXTENSIONS.has(ext)) return true
        return false
      })
      .map(f => f.replace(/\\/g, "/"))
  } catch {
    return []
  }
}

function truncateSource(content: string, path: string): string {
  const lines = content.split("\n")
  const total = lines.length

  if (total <= 150) return content
  if (total <= 400) {
    return lines.slice(0, 100).join("\n") + `\n[... ${total - 100} more lines truncated]`
  }
  return lines.slice(0, 60).join("\n") + `\n[... truncated — ${total} lines total]`
}

function firstLines(content: string, n: number): string {
  const lines = content.split("\n")
  if (lines.length <= n) return content
  return lines.slice(0, n).join("\n") + `\n[... ${lines.length - n} more lines]`
}

function truncatePackageLock(content: string): string {
  try {
    const pkg = JSON.parse(content)
    return JSON.stringify({
      name: pkg.name,
      version: pkg.version,
      lockfileVersion: pkg.lockfileVersion,
    }, null, 2)
  } catch {
    return "[package-lock.json: could not parse]"
  }
}

export function isEmptyProject(collected: CollectedFiles): boolean {
  const hasSource = collected.source.length > 0

  const hasOnlyBarePackageJson =
    Object.keys(collected.configs).length === 1 &&
    "package.json" in collected.configs &&
    isBarePkgJson(collected.configs["package.json"])

  const hasAnyConfig = Object.keys(collected.configs).length > 0

  return !hasSource && (!hasAnyConfig || hasOnlyBarePackageJson)
}

function isBarePkgJson(content: string): boolean {
  try {
    const pkg = JSON.parse(content)
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
    return Object.keys(deps).length === 0
  } catch {
    return false
  }
}
