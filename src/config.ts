import { readFileSync, writeFileSync, existsSync } from "fs"
import { join } from "path"

export interface TruncationRule {
  maxLines?: number
  metadataOnly?: boolean   // extract { name, version, lockfileVersion } from JSON
  maxBytes?: number        // cap at N bytes, truncate
}

export interface SetupConfig {
  // Source sampling
  maxSourceFiles: number
  maxDepth: number
  maxFileSizeKB: number

  // Token budgets per command
  tokenBudget: {
    init: number
    sync: number
    add: number
    remove: number
  }

  // Digest mode — extract signal instead of dumping raw content
  digestMode: boolean

  // Extra blocked directories (merged with built-in list)
  extraBlockedDirs: string[]

  // Only include these top-level dirs for source scanning (empty = auto-detect)
  sourceDirs: string[]

  // File-specific truncation — developer can override per file
  truncationRules: Record<string, TruncationRule>
}

// --- Defaults ---
// Sensible for projects up to ~200 source files.
// For bigger projects, the developer can increase budgets in .claude-setup.json.

const DEFAULT_TRUNCATION_RULES: Record<string, TruncationRule> = {
  "package-lock.json":  { metadataOnly: true },
  "Dockerfile":         { maxLines: 50 },
  "docker-compose.yml": { maxLines: 100, maxBytes: 8000 },
  "docker-compose.yaml":{ maxLines: 100, maxBytes: 8000 },
  "pom.xml":            { maxLines: 80 },
  "build.gradle":       { maxLines: 80 },
  "build.gradle.kts":   { maxLines: 80 },
  "setup.py":           { maxLines: 60 },
}

const DEFAULTS: SetupConfig = {
  maxSourceFiles: 15,
  maxDepth: 6,
  maxFileSizeKB: 80,
  tokenBudget: {
    init: 12_000,
    sync: 6_000,
    add: 3_000,
    remove: 2_000,
  },
  digestMode: true,
  extraBlockedDirs: [],
  sourceDirs: [],
  truncationRules: DEFAULT_TRUNCATION_RULES,
}

const CONFIG_FILENAME = ".claude-setup.json"

export function loadConfig(cwd: string = process.cwd()): SetupConfig {
  const configPath = join(cwd, CONFIG_FILENAME)
  if (!existsSync(configPath)) return { ...DEFAULTS, truncationRules: { ...DEFAULT_TRUNCATION_RULES } }

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8"))

    // Merge truncation rules: user overrides win, defaults fill gaps
    const userRules = raw.truncationRules ?? {}
    const mergedRules = { ...DEFAULT_TRUNCATION_RULES }
    for (const [file, rule] of Object.entries(userRules)) {
      mergedRules[file] = rule as TruncationRule
    }

    return {
      maxSourceFiles: raw.maxSourceFiles ?? DEFAULTS.maxSourceFiles,
      maxDepth: raw.maxDepth ?? DEFAULTS.maxDepth,
      maxFileSizeKB: raw.maxFileSizeKB ?? DEFAULTS.maxFileSizeKB,
      tokenBudget: {
        init: raw.tokenBudget?.init ?? DEFAULTS.tokenBudget.init,
        sync: raw.tokenBudget?.sync ?? DEFAULTS.tokenBudget.sync,
        add: raw.tokenBudget?.add ?? DEFAULTS.tokenBudget.add,
        remove: raw.tokenBudget?.remove ?? DEFAULTS.tokenBudget.remove,
      },
      digestMode: raw.digestMode ?? DEFAULTS.digestMode,
      extraBlockedDirs: raw.extraBlockedDirs ?? DEFAULTS.extraBlockedDirs,
      sourceDirs: raw.sourceDirs ?? DEFAULTS.sourceDirs,
      truncationRules: mergedRules,
    }
  } catch {
    return { ...DEFAULTS, truncationRules: { ...DEFAULT_TRUNCATION_RULES } }
  }
}

/**
 * Auto-generate .claude-setup.json with sensible defaults.
 * Only creates if it doesn't exist — never overwrites.
 * Returns true if created, false if already existed.
 */
export function ensureConfig(cwd: string = process.cwd()): boolean {
  const configPath = join(cwd, CONFIG_FILENAME)
  if (existsSync(configPath)) return false

  const config = {
    maxSourceFiles: DEFAULTS.maxSourceFiles,
    maxDepth: DEFAULTS.maxDepth,
    maxFileSizeKB: DEFAULTS.maxFileSizeKB,
    tokenBudget: DEFAULTS.tokenBudget,
    digestMode: DEFAULTS.digestMode,
    extraBlockedDirs: DEFAULTS.extraBlockedDirs,
    sourceDirs: DEFAULTS.sourceDirs,
    truncationRules: DEFAULT_TRUNCATION_RULES,
  }

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8")
    return true
  } catch {
    return false
  }
}

/** Apply truncation rule to file content */
export function applyTruncation(filename: string, content: string, config: SetupConfig): string {
  const rule = config.truncationRules[filename]
  if (!rule) {
    // No rule — use generic cap
    return content.length > 4000 ? content.slice(0, 4000) + "\n[... truncated]" : content
  }

  // Metadata-only extraction (e.g. package-lock.json)
  if (rule.metadataOnly) {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>
      return JSON.stringify({
        name: parsed.name,
        version: parsed.version,
        lockfileVersion: parsed.lockfileVersion,
      }, null, 2)
    } catch {
      return `[${filename}: could not parse]`
    }
  }

  // maxBytes check first: if file is small enough, content passes through before line truncation
  if (rule.maxBytes && content.length <= rule.maxBytes) {
    return content
  }

  // Line-based truncation
  if (rule.maxLines) {
    const lines = content.split("\n")
    if (lines.length <= rule.maxLines) return content
    return lines.slice(0, rule.maxLines).join("\n") + `\n[... ${lines.length - rule.maxLines} more lines truncated]`
  }

  // Byte cap
  if (rule.maxBytes && content.length > rule.maxBytes) {
    return content.slice(0, rule.maxBytes) + "\n[... truncated]"
  }

  return content
}
