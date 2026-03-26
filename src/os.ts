import { execSync } from "child_process"

export type DetectedOS = "Windows" | "macOS" | "Linux"

/**
 * Detect OS once per session. Order per spec:
 * 1. COMSPEC set → Windows
 * 2. OS === "Windows_NT" → Windows
 * 3. process.platform === "win32" → Windows
 * 4. uname() === "Darwin" → macOS
 * 5. default → Linux
 */
export function detectOS(): DetectedOS {
  if (process.env.COMSPEC) return "Windows"
  if (process.env.OS === "Windows_NT") return "Windows"
  if (process.platform === "win32") return "Windows"

  try {
    const uname = execSync("uname", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
    if (uname === "Darwin") return "macOS"
  } catch { /* not unix — unlikely to reach here */ }

  return "Linux"
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

/** MCP command format per OS — always includes -y to prevent npx install hangs */
export function mcpCommandFormat(os: DetectedOS, pkg: string): { command: string; args: string[] } {
  if (os === "Windows") {
    return { command: "cmd", args: ["/c", "npx", "-y", pkg] }
  }
  return { command: "npx", args: ["-y", pkg] }
}

/** Hook shell format per OS */
export function hookShellFormat(os: DetectedOS, cmd: string): { command: string; args: string[] } {
  if (os === "Windows") {
    return { command: "cmd", args: ["/c", cmd] }
  }
  return { command: "bash", args: ["-c", cmd] }
}
