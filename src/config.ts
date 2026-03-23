import { readFileSync, existsSync } from "fs"
import { join } from "path"

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
}

const CONFIG_FILENAME = ".claude-setup.json"

export function loadConfig(cwd: string = process.cwd()): SetupConfig {
  const configPath = join(cwd, CONFIG_FILENAME)
  if (!existsSync(configPath)) return { ...DEFAULTS }

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8"))
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
    }
  } catch {
    return { ...DEFAULTS }
  }
}
