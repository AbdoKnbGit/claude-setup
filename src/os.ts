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

/** MCP command format per OS */
export function mcpCommandFormat(os: DetectedOS, pkg: string): { command: string; args: string[] } {
  if (os === "Windows") {
    return { command: "cmd", args: ["/c", "npx", pkg] }
  }
  return { command: "npx", args: [pkg] }
}

/** Hook shell format per OS */
export function hookShellFormat(os: DetectedOS, cmd: string): { command: string; args: string[] } {
  if (os === "Windows") {
    return { command: "cmd", args: ["/c", cmd] }
  }
  return { command: "bash", args: ["-c", cmd] }
}
