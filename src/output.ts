/**
 * Terminal output helpers — no dependencies.
 * Raw ANSI codes. Falls back gracefully if NO_COLOR or piped.
 */

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR

const codes = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const

function wrap(code: string, text: string): string {
  if (!supportsColor) return text
  return `${code}${text}${codes.reset}`
}

export const c = {
  bold: (t: string) => wrap(codes.bold, t),
  dim: (t: string) => wrap(codes.dim, t),
  red: (t: string) => wrap(codes.red, t),
  green: (t: string) => wrap(codes.green, t),
  yellow: (t: string) => wrap(codes.yellow, t),
  blue: (t: string) => wrap(codes.blue, t),
  cyan: (t: string) => wrap(codes.cyan, t),
  gray: (t: string) => wrap(codes.gray, t),
}

/** Print a status line: icon + label + optional detail */
export function statusLine(icon: string, label: string, detail?: string): void {
  const detailStr = detail ? ` — ${detail}` : ""
  console.log(`  ${icon} ${label}${detailStr}`)
}

/** Print a section header */
export function section(title: string): void {
  console.log(`\n${c.bold(title)}`)
}
