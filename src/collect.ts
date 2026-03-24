import { readFileSync, existsSync, statSync, readdirSync } from "fs"
import { glob } from "glob"
import { join, extname, basename, dirname } from "path"
import { loadConfig, applyTruncation, SetupConfig } from "./config.js"

// --- Public interface ---

export interface CollectedFiles {
  configs: Record<string, string>
  source: Array<{ path: string; content: string }>
  skipped: Array<{ path: string; reason: string }>
}

export interface ProjectDigest {
  configFilesFound: string[]   // which config files exist — Claude Code infers the stack
  deps: string[]               // raw dependency names — no interpretation
  scripts: string[]            // available scripts/commands
  tree: string                 // compact directory tree
  envVars: string[]            // env var names from .env.example
  configs: Record<string, string>  // full content only for files that truly need it
}

export type CollectMode = "deep" | "normal" | "configOnly"

// --- Blocklists ---

const BLOCKED_DIRS = new Set([
  "node_modules", "vendor", ".venv", "venv", "env", "__pypackages__",
  "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", "__pycache__",
  "target", ".git", ".cache", "coverage", ".nyc_output", ".pytest_cache",
  ".tox", "htmlcov", ".ruff_cache", "logs", ".egg-info",
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

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".scala",
  ".rb", ".php", ".cs", ".swift", ".c", ".cpp", ".h",
  ".vue", ".svelte", ".astro",
])

const ENTRY_BASENAMES = new Set(["index", "main", "app", "server", "cmd", "cli", "mod", "run"])
const ENTRY_DIRS = [".", "src", "app", "cmd", "bin"]
const PRIMARY_SOURCE_DIRS = ["src", "app", "lib", "core", "pkg", "internal", "api", "cmd"]

// Config files the CLI knows how to find — but NOT what they mean
const KNOWN_CONFIG_FILES = [
  "package.json", "package-lock.json", "pyproject.toml", "setup.py",
  "requirements.txt", "Pipfile",
  "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts",
  "composer.json", "Gemfile", "turbo.json", "nx.json", "pnpm-workspace.yaml",
  "lerna.json", ".env.example", ".env.sample", ".env.template",
  "docker-compose.yml", "docker-compose.yaml", "Dockerfile",
  "tsconfig.json", "Makefile",
]


// --- Main collection function ---

export async function collectProjectFiles(
  cwd: string = process.cwd(),
  mode: CollectMode = "normal"
): Promise<CollectedFiles> {
  const config = loadConfig(cwd)
  const allBlocked = new Set([...BLOCKED_DIRS, ...config.extraBlockedDirs])

  const configs: Record<string, string> = {}
  const source: CollectedFiles["source"] = []
  const skipped: CollectedFiles["skipped"] = []

  if (config.digestMode) {
    const digest = await buildProjectDigest(cwd, config, allBlocked)
    configs["__digest__"] = formatDigest(digest)
    for (const [k, v] of Object.entries(digest.configs)) {
      configs[k] = v
    }
  } else {
    await collectRawConfigs(cwd, configs, skipped)
  }

  if (existsSync(join(cwd, ".env")) && !configs[".env"]) {
    configs[".env"] = "[.env exists — not read for security]"
  }

  if (mode === "configOnly") return { configs, source, skipped }

  // Source sampling
  const maxFiles = mode === "deep" ? config.maxSourceFiles : Math.min(config.maxSourceFiles, 10)
  const allSourceFiles = await findSourceFiles(cwd, config.maxDepth, allBlocked)

  const entries = selectEntryPoints(allSourceFiles, 3)
  const breadthSample = selectBreadthSample(cwd, allSourceFiles, entries, maxFiles - entries.length, config.sourceDirs)
  const selected = [...entries, ...breadthSample]

  for (const filePath of selected) {
    const fullPath = join(cwd, filePath)
    try {
      const stat = statSync(fullPath)
      if (stat.size > config.maxFileSizeKB * 1024) {
        skipped.push({ path: filePath, reason: `${(stat.size / 1024).toFixed(0)}KB` })
        continue
      }
      const raw = readFileSync(fullPath, "utf8")

      if (config.digestMode) {
        const isEntry = entries.includes(filePath)
        source.push({
          path: filePath,
          content: isEntry ? compactContent(raw) : extractSignatures(raw),
        })
      } else {
        source.push({ path: filePath, content: truncateSource(raw) })
      }
    } catch {
      skipped.push({ path: filePath, reason: "could not read" })
    }
  }

  return { configs, source, skipped }
}

// --- Digest builder ---
// ZERO domain knowledge. Extracts raw data only. Claude Code interprets.

async function buildProjectDigest(
  cwd: string,
  config: SetupConfig,
  blockedDirs: Set<string>
): Promise<ProjectDigest> {
  const digest: ProjectDigest = {
    configFilesFound: [],
    deps: [],
    scripts: [],
    tree: "",
    envVars: [],
    configs: {},
  }

  // Which config files exist? Just the names — Claude Code infers the stack.
  for (const name of KNOWN_CONFIG_FILES) {
    if (existsSync(join(cwd, name))) {
      digest.configFilesFound.push(name)
    }
  }

  // Also check for *.config.{js,ts,mjs} and *.csproj
  try {
    for (const ext of ["js", "ts", "mjs"]) {
      const matches = await glob(`*.config.${ext}`, { cwd, nodir: true })
      digest.configFilesFound.push(...matches)
    }
    const csprojMatches = await glob("*.csproj", { cwd, nodir: true })
    digest.configFilesFound.push(...csprojMatches)
  } catch { /* skip */ }

  // Extract dep names from whatever package manifest exists
  // No interpretation — just the names as strings
  digest.deps = extractDeps(cwd, digest.configFilesFound)
  digest.scripts = extractScripts(cwd, digest.configFilesFound)

  // Env var names from .env.example / .env.sample / .env.template
  for (const envFile of [".env.example", ".env.sample", ".env.template"]) {
    const envPath = join(cwd, envFile)
    if (existsSync(envPath)) {
      const lines = readFileSync(envPath, "utf8").split("\n")
      for (const line of lines) {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=/)
        if (match) digest.envVars.push(match[1])
      }
      break
    }
  }

  // Directory tree
  digest.tree = buildTree(cwd, blockedDirs, 3)

  // Full content only for infra files that are usually small and high-signal
  for (const dcFile of ["docker-compose.yml", "docker-compose.yaml"]) {
    const dcPath = join(cwd, dcFile)
    if (existsSync(dcPath)) {
      const content = readFileSync(dcPath, "utf8")
      if (content.length < 2000) {
        digest.configs[dcFile] = content
      } else {
        // Just service block headers — no interpretation of what they are
        const services = [...content.matchAll(/^\s{2}(\w[\w-]*):\s*$/gm)].map(m => m[1])
        digest.configs[dcFile] = `services: ${services.join(", ")}\n[${content.split("\n").length} lines total]`
      }
    }
  }

  const dockerfilePath = join(cwd, "Dockerfile")
  if (existsSync(dockerfilePath)) {
    const lines = readFileSync(dockerfilePath, "utf8").split("\n")
    const fromLines = lines.filter(l => /^FROM\s/i.test(l.trim()))
    if (fromLines.length) digest.configs["Dockerfile"] = fromLines.join("\n")
  }

  // Small monorepo configs — full content
  for (const f of ["turbo.json", "nx.json", "pnpm-workspace.yaml", "lerna.json"]) {
    const p = join(cwd, f)
    if (existsSync(p)) {
      const content = readFileSync(p, "utf8")
      if (content.length < 500) digest.configs[f] = content
    }
  }

  digest.deps = [...new Set(digest.deps)].filter(Boolean)
  return digest
}

// --- Raw data extractors — no domain knowledge ---

/** Extract dependency names from any package manifest. Just names, no meaning. */
function extractDeps(cwd: string, configFiles: string[]): string[] {
  const deps: string[] = []

  // package.json — extract keys from dependencies/devDependencies
  if (configFiles.includes("package.json")) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"))
      deps.push(...Object.keys(pkg.dependencies ?? {}))
      deps.push(...Object.keys(pkg.devDependencies ?? {}))
    } catch { /* skip */ }
  }

  // requirements.txt — each non-comment line is a dep
  if (configFiles.includes("requirements.txt")) {
    try {
      const lines = readFileSync(join(cwd, "requirements.txt"), "utf8").split("\n")
      for (const l of lines) {
        const dep = l.trim().split(/[>=<!\[;\s]/)[0].trim()
        if (dep && !dep.startsWith("#") && !dep.startsWith("-")) deps.push(dep)
      }
    } catch { /* skip */ }
  }

  // pyproject.toml — extract from dependencies sections
  if (configFiles.includes("pyproject.toml")) {
    try {
      const content = readFileSync(join(cwd, "pyproject.toml"), "utf8")
      deps.push(...extractTomlDeps(content))
    } catch { /* skip */ }
  }

  // go.mod — require block
  if (configFiles.includes("go.mod")) {
    try {
      const content = readFileSync(join(cwd, "go.mod"), "utf8")
      const requires = content.match(/require\s*\(([\s\S]*?)\)/)?.[1] ?? ""
      for (const line of requires.split("\n")) {
        const dep = line.trim().split(/\s/)[0]
        if (dep) deps.push(dep)
      }
    } catch { /* skip */ }
  }

  // Cargo.toml — [dependencies] section
  if (configFiles.includes("Cargo.toml")) {
    try {
      const content = readFileSync(join(cwd, "Cargo.toml"), "utf8")
      const depsSection = content.match(/\[dependencies\]([\s\S]*?)(\[|$)/)?.[1] ?? ""
      for (const line of depsSection.split("\n")) {
        const dep = line.split("=")[0].trim()
        if (dep && !dep.startsWith("#")) deps.push(dep)
      }
    } catch { /* skip */ }
  }

  // Gemfile — gem lines
  if (configFiles.includes("Gemfile")) {
    try {
      const lines = readFileSync(join(cwd, "Gemfile"), "utf8").split("\n")
      for (const l of lines) {
        const match = l.match(/^\s*gem\s+['"]([^'"]+)/)
        if (match) deps.push(match[1])
      }
    } catch { /* skip */ }
  }

  // composer.json
  if (configFiles.includes("composer.json")) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, "composer.json"), "utf8"))
      deps.push(...Object.keys(pkg.require ?? {}))
      deps.push(...Object.keys(pkg["require-dev"] ?? {}))
    } catch { /* skip */ }
  }

  return deps
}

/** Extract script/task names */
function extractScripts(cwd: string, configFiles: string[]): string[] {
  const scripts: string[] = []

  if (configFiles.includes("package.json")) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"))
      scripts.push(...Object.keys(pkg.scripts ?? {}))
    } catch { /* skip */ }
  }

  if (configFiles.includes("Makefile")) {
    try {
      const content = readFileSync(join(cwd, "Makefile"), "utf8")
      for (const m of content.matchAll(/^([a-zA-Z_][\w-]*):/gm)) {
        scripts.push(m[1])
      }
    } catch { /* skip */ }
  }

  return scripts
}

function extractTomlDeps(content: string): string[] {
  const deps: string[] = []
  const sections = content.match(/\[(?:project\.dependencies|tool\.poetry\.dependencies)\]([\s\S]*?)(?:\[|$)/g) ?? []
  for (const section of sections) {
    for (const line of section.split("\n")) {
      const match = line.match(/^(\w[\w-]*)/)
      if (match && !line.startsWith("[")) deps.push(match[1])
    }
  }
  const listMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/g)
  for (const block of listMatch ?? []) {
    for (const m of block.matchAll(/"([^">=<\[]+)/g)) {
      deps.push(m[1].trim())
    }
  }
  return deps
}

// --- Digest formatter ---

function formatDigest(d: ProjectDigest): string {
  const lines: string[] = []

  if (d.configFilesFound.length) lines.push(`Config files: ${d.configFilesFound.join(", ")}`)
  if (d.deps.length) lines.push(`Deps: ${d.deps.join(", ")}`)
  if (d.scripts.length) lines.push(`Scripts: ${d.scripts.join(", ")}`)
  if (d.envVars.length) lines.push(`Env vars: ${d.envVars.join(", ")}`)

  if (d.tree) {
    lines.push("")
    lines.push("Structure:")
    lines.push(d.tree)
  }

  return lines.join("\n")
}

// --- Directory tree ---

function buildTree(cwd: string, blocked: Set<string>, maxDepth: number, prefix = "", depth = 0): string {
  if (depth > maxDepth) return ""
  const lines: string[] = []

  try {
    const entries = readdirSync(cwd, { withFileTypes: true })
      .filter(e => !blocked.has(e.name) && !e.name.startsWith("."))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

    const dirs = entries.filter(e => e.isDirectory())
    const files = entries.filter(e => e.isFile() && SOURCE_EXTENSIONS.has(extname(e.name)))

    for (const dir of dirs) {
      const subPath = join(cwd, dir.name)
      const fileCount = countSourceFiles(subPath, blocked)
      if (fileCount === 0) continue
      lines.push(`${prefix}${dir.name}/ (${fileCount} files)`)
      const subtree = buildTree(subPath, blocked, maxDepth, prefix + "  ", depth + 1)
      if (subtree) lines.push(subtree)
    }

    if (depth === 0 && files.length > 0) {
      for (const f of files.slice(0, 5)) {
        lines.push(`${prefix}${f.name}`)
      }
      if (files.length > 5) lines.push(`${prefix}... +${files.length - 5} more`)
    }
  } catch { /* skip */ }

  return lines.join("\n")
}

function countSourceFiles(dir: string, blocked: Set<string>): number {
  let count = 0
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (blocked.has(e.name) || e.name.startsWith(".")) continue
      if (e.isFile() && SOURCE_EXTENSIONS.has(extname(e.name))) count++
      else if (e.isDirectory()) count += countSourceFiles(join(dir, e.name), blocked)
    }
  } catch { /* skip */ }
  return count
}

// --- Source file processing ---

function extractSignatures(content: string): string {
  const lines = content.split("\n")
  const sigs: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")) continue

    // Imports
    if (/^import\s/.test(trimmed) || /^from\s/.test(trimmed) || /^require\(/.test(trimmed) ||
        /^const\s+\w+\s*=\s*require/.test(trimmed) || /^use\s/.test(trimmed)) {
      sigs.push(trimmed)
      continue
    }

    // Exports
    if (/^export\s/.test(trimmed) || /^module\.exports/.test(trimmed)) {
      sigs.push(trimmed.length > 120 ? trimmed.slice(0, 120) + "..." : trimmed)
      continue
    }

    // Declarations
    if (/^(export\s+)?(async\s+)?function\s/.test(trimmed) ||
        /^(export\s+)?(abstract\s+)?class\s/.test(trimmed) ||
        /^(export\s+)?interface\s/.test(trimmed) ||
        /^(export\s+)?type\s/.test(trimmed) ||
        /^(export\s+)?enum\s/.test(trimmed) ||
        /^def\s/.test(trimmed) || /^class\s/.test(trimmed) ||
        /^func\s/.test(trimmed) || /^fn\s/.test(trimmed) ||
        /^pub\s/.test(trimmed) ||
        /^(public|private|protected)\s/.test(trimmed)) {
      sigs.push(trimmed.length > 120 ? trimmed.slice(0, 120) + "..." : trimmed)
    }

    if (trimmed.startsWith("@") && !trimmed.startsWith("@import")) {
      sigs.push(trimmed)
    }
  }

  if (sigs.length === 0) return `[${lines.length} lines, no extractable signatures]`
  return sigs.join("\n")
}

function compactContent(content: string): string {
  const lines = content.split("\n")
  const kept: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith("//") && !trimmed.startsWith("///")) continue
    if (trimmed === "*" || trimmed === "/**" || trimmed === "*/") continue
    if (trimmed.startsWith("* ") && !trimmed.startsWith("* @")) continue
    if (trimmed.startsWith("#") && !trimmed.startsWith("#!") && !trimmed.startsWith("#include")) continue
    kept.push(line)
  }

  if (kept.length > 80) {
    return kept.slice(0, 60).join("\n") + `\n[... ${kept.length - 60} more lines]`
  }
  return kept.join("\n")
}

function truncateSource(content: string): string {
  const lines = content.split("\n")
  if (lines.length <= 100) return content
  if (lines.length <= 300) {
    return lines.slice(0, 80).join("\n") + `\n[... ${lines.length - 80} more lines]`
  }
  return lines.slice(0, 50).join("\n") + `\n[... truncated — ${lines.length} lines total]`
}

// --- Legacy raw config collection ---

async function collectRawConfigs(
  cwd: string,
  configs: Record<string, string>,
  skipped: CollectedFiles["skipped"]
): Promise<void> {
  const config = loadConfig(cwd)

  for (const name of KNOWN_CONFIG_FILES) {
    const p = join(cwd, name)
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, "utf8")
        // Dynamic truncation — driven by config, not hardcoded
        configs[name] = applyTruncation(name, raw, config)
      } catch {
        skipped.push({ path: name, reason: "could not read" })
      }
    }
  }

  // Scan for *.config.{js,ts,mjs} at root level — truncation from config
  try {
    for (const ext of ["js", "ts", "mjs"]) {
      const matches = await glob(`*.config.${ext}`, { cwd, nodir: true })
      for (const match of matches) {
        if (configs[match]) continue
        const p = join(cwd, match)
        try {
          const content = readFileSync(p, "utf8")
          configs[match] = applyTruncation(match, content, config)
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }

  // Scan for *.csproj at root level
  try {
    const csprojFiles = await glob("*.csproj", { cwd, nodir: true })
    for (const match of csprojFiles) {
      if (configs[match]) continue
      const p = join(cwd, match)
      try {
        const content = readFileSync(p, "utf8")
        configs[match] = applyTruncation(match, content, config)
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}

// --- Source file discovery ---

async function findSourceFiles(cwd: string, maxDepth: number, blocked: Set<string>): Promise<string[]> {
  try {
    const files = await glob("**/*", {
      cwd, nodir: true,
      ignore: [...blocked].map(d => `${d}/**`),
      maxDepth,
    })
    return files
      .filter(f => {
        if (BLOCKED_FILES.has(basename(f))) return false
        if (BLOCKED_EXTENSIONS.has(extname(f))) return false
        return SOURCE_EXTENSIONS.has(extname(f))
      })
      .map(f => f.replace(/\\/g, "/"))
  } catch { return [] }
}

function selectEntryPoints(files: string[], max: number): string[] {
  const entries: string[] = []
  for (const dir of ENTRY_DIRS) {
    for (const file of files) {
      if (entries.length >= max) return entries
      const base = basename(file, extname(file))
      const fileDir = dirname(file)
      if (ENTRY_BASENAMES.has(base) && (fileDir === dir || fileDir === ".")) {
        if (!entries.includes(file)) entries.push(file)
      }
    }
  }
  return entries
}

function selectBreadthSample(
  cwd: string, files: string[], exclude: string[], max: number, forceDirs: string[]
): string[] {
  const selected: string[] = []
  const dirsToSample = forceDirs.length > 0 ? forceDirs : PRIMARY_SOURCE_DIRS

  for (const dir of dirsToSample) {
    const dirFiles = files
      .filter(f => f.startsWith(dir + "/"))
      .filter(f => !exclude.includes(f) && !selected.includes(f))

    const sorted = dirFiles.sort((a, b) => {
      try { return statSync(join(cwd, a)).size - statSync(join(cwd, b)).size }
      catch { return 0 }
    })

    for (const f of sorted) {
      if (selected.length >= max) return selected
      selected.push(f)
    }
  }

  for (const f of files) {
    if (selected.length >= max) break
    if (!exclude.includes(f) && !selected.includes(f)) selected.push(f)
  }

  return selected
}

// --- Empty project detection ---

export function isEmptyProject(collected: CollectedFiles): boolean {
  const hasSource = collected.source.length > 0

  const digestContent = collected.configs["__digest__"] ?? ""
  const hasDeps = digestContent.includes("Deps:")

  const rawConfigs = Object.keys(collected.configs).filter(k => k !== "__digest__" && k !== ".env")
  const hasAnyConfig = rawConfigs.length > 0 || hasDeps

  // A bare package.json has no deps
  const hasOnlyBarePackageJson = !hasDeps && digestContent.includes("package.json") &&
    !digestContent.includes(",") // only one config file

  return !hasSource && (!hasAnyConfig || hasOnlyBarePackageJson)
}
