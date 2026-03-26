/**
 * Token cost tracking — visibility into what every command costs.
 *
 * Zero extra API calls. Token count is computed from content length.
 * Estimates are based on ~4 chars per token approximation.
 *
 * Supports all pricing models:
 *   - Opus:   $15/M input
 *   - Sonnet: $3/M input
 *   - Haiku:  $0.25/M input
 */

export interface CostBreakdown {
  opus: number
  sonnet: number
  haiku: number
}

export interface TokenEstimate {
  inputTokens: number
  cost: CostBreakdown
  breakdown: Array<{ label: string; tokens: number }>
}

// Pricing per million input tokens (current as of 2025)
const PRICING_PER_M_INPUT = {
  opus: 15.0,
  sonnet: 3.0,
  haiku: 0.25,
}

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4)
}

export function estimateCost(tokens: number): CostBreakdown {
  return {
    opus: (tokens / 1_000_000) * PRICING_PER_M_INPUT.opus,
    sonnet: (tokens / 1_000_000) * PRICING_PER_M_INPUT.sonnet,
    haiku: (tokens / 1_000_000) * PRICING_PER_M_INPUT.haiku,
  }
}

export function formatCost(cost: CostBreakdown): string {
  return `Opus $${cost.opus.toFixed(4)} | Sonnet $${cost.sonnet.toFixed(4)} | Haiku $${cost.haiku.toFixed(4)}`
}

/**
 * Build a detailed token estimate with per-section breakdown.
 */
export function buildTokenEstimate(
  sections: Array<{ label: string; content: string }>
): TokenEstimate {
  const breakdown: Array<{ label: string; tokens: number }> = []
  let total = 0

  for (const s of sections) {
    const tokens = estimateTokens(s.content)
    breakdown.push({ label: s.label, tokens })
    total += tokens
  }

  return {
    inputTokens: total,
    cost: estimateCost(total),
    breakdown,
  }
}

/**
 * Format token estimate for display after a command.
 */
export function formatTokenReport(estimate: TokenEstimate): string {
  const lines: string[] = []
  lines.push(`  Estimated: ~${estimate.inputTokens.toLocaleString()} input tokens`)
  lines.push(`  Cost:      ${formatCost(estimate.cost)}`)

  if (estimate.breakdown.length > 1) {
    lines.push(`  Breakdown:`)
    // Sort by token count descending
    const sorted = [...estimate.breakdown].sort((a, b) => b.tokens - a.tokens)
    for (const item of sorted.slice(0, 5)) {
      const pct = ((item.tokens / estimate.inputTokens) * 100).toFixed(0)
      lines.push(`    ${item.label}: ~${item.tokens.toLocaleString()} (${pct}%)`)
    }
    if (sorted.length > 5) {
      lines.push(`    ... +${sorted.length - 5} more sections`)
    }
  }

  return lines.join("\n")
}

/**
 * Generate optimization hints based on token usage patterns.
 */
export function generateHints(
  runs: Array<{ command: string; estimatedTokens?: number }>,
  currentTokens: number,
  budget: number
): string[] {
  const hints: string[] = []

  // Budget usage warning
  const usage = (currentTokens / budget) * 100
  if (usage > 80) {
    hints.push(
      `This command used ${usage.toFixed(0)}% of its ${budget.toLocaleString()} token budget — ` +
      `consider increasing tokenBudget in .claude-setup.json or enabling digestMode`
    )
  }

  // Check for repeated zero-change syncs
  const recentSyncs = runs.filter(r => r.command === "sync").slice(-3)
  if (recentSyncs.length >= 3) {
    const lowTokenSyncs = recentSyncs.filter(r => (r.estimatedTokens ?? 0) < 500)
    if (lowTokenSyncs.length >= 3) {
      hints.push("Last 3 syncs had minimal changes — consider syncing less frequently")
    }
  }

  // Identify high-token commands
  const avgByCommand: Record<string, { total: number; count: number }> = {}
  for (const r of runs) {
    if (!r.estimatedTokens) continue
    if (!avgByCommand[r.command]) avgByCommand[r.command] = { total: 0, count: 0 }
    avgByCommand[r.command].total += r.estimatedTokens
    avgByCommand[r.command].count++
  }

  for (const [cmd, stats] of Object.entries(avgByCommand)) {
    const avg = stats.total / stats.count
    if (avg > 10000 && cmd === "init") {
      hints.push(
        `Average init uses ~${Math.round(avg).toLocaleString()} tokens — ` +
        `digestMode and truncation rules in .claude-setup.json can reduce this`
      )
    }
  }

  return hints
}

/**
 * Compute cumulative stats for status dashboard.
 */
export function computeCumulativeStats(
  runs: Array<{ command: string; estimatedTokens?: number; estimatedCost?: CostBreakdown }>
): {
  totalTokens: number
  totalCost: CostBreakdown
  avgByCommand: Record<string, number>
  runCount: number
} {
  let totalTokens = 0
  const totalCost: CostBreakdown = { opus: 0, sonnet: 0, haiku: 0 }
  const commandTotals: Record<string, { tokens: number; count: number }> = {}

  for (const r of runs) {
    const tokens = r.estimatedTokens ?? 0
    totalTokens += tokens
    if (r.estimatedCost) {
      totalCost.opus += r.estimatedCost.opus
      totalCost.sonnet += r.estimatedCost.sonnet
      totalCost.haiku += r.estimatedCost.haiku
    }
    if (!commandTotals[r.command]) commandTotals[r.command] = { tokens: 0, count: 0 }
    commandTotals[r.command].tokens += tokens
    commandTotals[r.command].count++
  }

  const avgByCommand: Record<string, number> = {}
  for (const [cmd, stats] of Object.entries(commandTotals)) {
    avgByCommand[cmd] = Math.round(stats.tokens / stats.count)
  }

  return { totalTokens, totalCost, avgByCommand, runCount: runs.length }
}
