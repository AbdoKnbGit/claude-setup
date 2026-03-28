import { execSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

export type DetectedOS = "Windows" | "macOS" | "Linux" | "WSL"

/**
 * Detect OS once per session. Order:
 * 1. COMSPEC set → Windows
 * 2. OS === "Windows_NT" → Windows
 * 3. process.platform === "win32" → Windows
 * 4. /proc/version contains "microsoft" or "WSL" → WSL
 * 5. WSL_DISTRO_NAME env var set → WSL
 * 6. uname() === "Darwin" → macOS
 * 7. default → Linux
 */
export function detectOS(): DetectedOS {
  if (process.env.COMSPEC) return "Windows"
  if (process.env.OS === "Windows_NT") return "Windows"
  if (process.platform === "win32") return "Windows"

  // WSL detection — runs as Linux but under Windows kernel
  if (process.env.WSL_DISTRO_NAME) return "WSL"
  try {
    const procVersion = readFileSync("/proc/version", "utf8").toLowerCase()
    if (procVersion.includes("microsoft") || procVersion.includes("wsl")) return "WSL"
  } catch { /* not WSL or /proc not available */ }

  try {
    const uname = execSync("uname", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
    if (uname === "Darwin") return "macOS"
  } catch { /* not unix — unlikely to reach here */ }

  return "Linux"
}

/** Returns true if the OS uses Unix-style shell commands (bash, npx direct) */
export function isUnixLike(os: DetectedOS): boolean {
  return os === "Linux" || os === "macOS" || os === "WSL"
}

/**
 * Verified MCP package names — ONLY use these.
 * If a service is not in this map, do not guess a package name.
 */
export const VERIFIED_MCP_PACKAGES: Record<string, string> = {
  playwright:  "@playwright/mcp@latest",
  postgres:    "@modelcontextprotocol/server-postgres",
  filesystem:  "@modelcontextprotocol/server-filesystem",
  memory:      "@modelcontextprotocol/server-memory",
  github:      "@modelcontextprotocol/server-github",
  brave:       "@modelcontextprotocol/server-brave-search",
  puppeteer:   "@modelcontextprotocol/server-puppeteer",
  slack:       "@modelcontextprotocol/server-slack",
  sqlite:      "@modelcontextprotocol/server-sqlite",
  stripe:      "@stripe/mcp@latest",
  redis:       "@modelcontextprotocol/server-redis",
  mysql:       "@benborla29/mcp-server-mysql",
  mongodb:     "mcp-mongo-server",
}

/** Default connection strings for local services — used when env vars are not set */
export const DEFAULT_SERVICE_CONNECTIONS: Record<string, { envVar: string; defaultUrl: string; testCmd: Record<DetectedOS, string> }> = {
  postgres: {
    envVar: "DATABASE_URL",
    defaultUrl: "postgresql://localhost:5432/postgres",
    testCmd: {
      Windows: "where psql 2>nul || where pg_isready 2>nul",
      macOS: "command -v psql || command -v pg_isready",
      Linux: "command -v psql || command -v pg_isready",
      WSL: "command -v psql || command -v pg_isready || /mnt/c/Program\\ Files/PostgreSQL/*/bin/psql.exe --version 2>/dev/null",
    },
  },
  mysql: {
    envVar: "MYSQL_URL",
    defaultUrl: "mysql://root@localhost:3306",
    testCmd: {
      Windows: "where mysql 2>nul",
      macOS: "command -v mysql || brew list mysql 2>/dev/null",
      Linux: "command -v mysql",
      WSL: "command -v mysql || /mnt/c/Program\\ Files/MySQL/*/bin/mysql.exe --version 2>/dev/null",
    },
  },
  mongodb: {
    envVar: "MONGODB_URI",
    defaultUrl: "mongodb://localhost:27017",
    testCmd: {
      Windows: "where mongosh 2>nul || where mongo 2>nul",
      macOS: "command -v mongosh || command -v mongo || brew list mongodb-community 2>/dev/null",
      Linux: "command -v mongosh || command -v mongo",
      WSL: "command -v mongosh || command -v mongo || mongosh.exe --version 2>/dev/null",
    },
  },
  redis: {
    envVar: "REDIS_URL",
    defaultUrl: "redis://localhost:6379",
    testCmd: {
      Windows: "where redis-cli 2>nul",
      macOS: "command -v redis-cli || brew list redis 2>/dev/null",
      Linux: "command -v redis-cli",
      WSL: "command -v redis-cli || redis-cli.exe --version 2>/dev/null",
    },
  },
}

/** MCP command format per OS — always includes -y to prevent npx install hangs */
export function mcpCommandFormat(os: DetectedOS, pkg: string): { command: string; args: string[] } {
  if (os === "Windows") {
    return { command: "cmd", args: ["/c", "npx", "-y", pkg] }
  }
  // macOS, Linux, and WSL all use npx directly
  return { command: "npx", args: ["-y", pkg] }
}

/** Hook shell format per OS */
export function hookShellFormat(os: DetectedOS, cmd: string): { command: string; args: string[] } {
  if (os === "Windows") {
    return { command: "cmd", args: ["/c", cmd] }
  }
  // macOS, Linux, and WSL all use bash
  return { command: "bash", args: ["-c", cmd] }
}

/**
 * Detect which services are available on the local machine.
 * Returns a map of service name → detected info.
 */
export function detectLocalServices(os: DetectedOS): Record<string, { found: boolean; defaultUrl: string; envVar: string }> {
  const results: Record<string, { found: boolean; defaultUrl: string; envVar: string }> = {}

  for (const [service, config] of Object.entries(DEFAULT_SERVICE_CONNECTIONS)) {
    let found = false
    try {
      const cmd = config.testCmd[os]
      execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000 })
      found = true
    } catch { /* not installed */ }

    results[service] = {
      found,
      defaultUrl: config.defaultUrl,
      envVar: config.envVar,
    }
  }

  return results
}

/**
 * Scan project files for service evidence and return auto-discovery instructions.
 * Reads docker-compose, .env.example, package.json to find which services are used.
 */
export function discoverProjectServices(cwd: string): string[] {
  const discovered: string[] = []
  const os = detectOS()

  // Check docker-compose.yml for service definitions
  for (const dcFile of ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
    const dcPath = join(cwd, dcFile)
    if (existsSync(dcPath)) {
      try {
        const content = readFileSync(dcPath, "utf8")
        if (/postgres|pg_/i.test(content)) discovered.push("postgres")
        if (/mysql|mariadb/i.test(content)) discovered.push("mysql")
        if (/mongo/i.test(content)) discovered.push("mongodb")
        if (/redis/i.test(content)) discovered.push("redis")
      } catch { /* skip */ }
    }
  }

  // Check .env.example or .env.sample for service-related vars
  for (const envFile of [".env.example", ".env.sample", ".env.template"]) {
    const envPath = join(cwd, envFile)
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, "utf8")
        if (/DATABASE_URL|POSTGRES|PG_/i.test(content) && !discovered.includes("postgres")) discovered.push("postgres")
        if (/MYSQL/i.test(content) && !discovered.includes("mysql")) discovered.push("mysql")
        if (/MONGO/i.test(content) && !discovered.includes("mongodb")) discovered.push("mongodb")
        if (/REDIS/i.test(content) && !discovered.includes("redis")) discovered.push("redis")
      } catch { /* skip */ }
    }
  }

  // Check package.json for database dependencies
  const pkgPath = join(cwd, "package.json")
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (allDeps.pg || allDeps.prisma || allDeps["@prisma/client"] || allDeps.knex) {
        if (!discovered.includes("postgres")) discovered.push("postgres")
      }
      if (allDeps.mysql2 || allDeps.mysql) {
        if (!discovered.includes("mysql")) discovered.push("mysql")
      }
      if (allDeps.mongoose || allDeps.mongodb) {
        if (!discovered.includes("mongodb")) discovered.push("mongodb")
      }
      if (allDeps.redis || allDeps.ioredis) {
        if (!discovered.includes("redis")) discovered.push("redis")
      }
    } catch { /* skip */ }
  }

  // Check requirements.txt / pyproject.toml for Python projects
  for (const pyFile of ["requirements.txt", "pyproject.toml"]) {
    const pyPath = join(cwd, pyFile)
    if (existsSync(pyPath)) {
      try {
        const content = readFileSync(pyPath, "utf8")
        if (/psycopg|asyncpg|sqlalchemy/i.test(content) && !discovered.includes("postgres")) discovered.push("postgres")
        if (/pymysql|mysqlclient/i.test(content) && !discovered.includes("mysql")) discovered.push("mysql")
        if (/pymongo|motor/i.test(content) && !discovered.includes("mongodb")) discovered.push("mongodb")
        if (/redis/i.test(content) && !discovered.includes("redis")) discovered.push("redis")
      } catch { /* skip */ }
    }
  }

  return [...new Set(discovered)]
}

/**
 * Build auto-discovery MCP configuration instructions for the detected OS.
 * Returns markdown text to embed in templates.
 */
export function buildServiceDiscoveryInstructions(cwd: string): string {
  const os = detectOS()
  const projectServices = discoverProjectServices(cwd)
  const localServices = detectLocalServices(os)
  const lines: string[] = []

  if (projectServices.length === 0) return ""

  lines.push(`### Auto-discovered services`)
  lines.push(`The following services were detected in your project files:\n`)

  for (const service of projectServices) {
    const local = localServices[service]
    const pkg = VERIFIED_MCP_PACKAGES[service]
    if (!pkg || !local) continue

    const status = local.found ? "installed locally" : "not found locally"
    const statusIcon = local.found ? "✅" : "⚠️"

    lines.push(`**${service}** — ${statusIcon} ${status}`)
    if (local.found) {
      lines.push(`- Default connection: \`${local.defaultUrl}\``)
      lines.push(`- Env var: \`${local.envVar}\``)
      lines.push(`- If \`${local.envVar}\` is not set in the environment, use the default: \`${local.defaultUrl}\``)
    } else {
      lines.push(`- Env var: \`${local.envVar}\` — must be set before starting Claude Code`)
      lines.push(`- Use \`\${${local.envVar}}\` in .mcp.json env block`)
    }
    lines.push(``)
  }

  lines.push(`### MCP auto-configuration strategy`)
  lines.push(``)
  lines.push(`For each service above, configure .mcp.json as follows:`)
  lines.push(`1. **Check if the env var is already set** in the user's environment`)
  lines.push(`2. **If set** → use \`\${VARNAME}\` syntax in the env block`)
  lines.push(`3. **If not set but service is installed locally** → use the default connection URL directly in the env block AND document the var in .env.example`)
  lines.push(`4. **If not set and not installed** → use \`\${VARNAME}\` syntax and flag: "⚠️ Set ${"{VARNAME}"} before starting Claude Code"`)
  lines.push(``)

  // OS-specific MCP format reminder
  if (os === "Windows") {
    lines.push(`### OS format (Windows detected)`)
    lines.push(`\`\`\`json`)
    lines.push(`{ "command": "cmd", "args": ["/c", "npx", "-y", "<package>"], "env": { ... } }`)
    lines.push(`\`\`\``)
  } else if (os === "WSL") {
    lines.push(`### OS format (WSL detected — uses Linux-style commands)`)
    lines.push(`\`\`\`json`)
    lines.push(`{ "command": "npx", "args": ["-y", "<package>"], "env": { ... } }`)
    lines.push(`\`\`\``)
    lines.push(`Note: WSL can also access Windows-side services on localhost. If a service runs on the Windows host, it is reachable at \`localhost\` from WSL.`)
  } else {
    lines.push(`### OS format (${os} detected)`)
    lines.push(`\`\`\`json`)
    lines.push(`{ "command": "npx", "args": ["-y", "<package>"], "env": { ... } }`)
    lines.push(`\`\`\``)
  }
  lines.push(``)

  return lines.join("\n")
}
