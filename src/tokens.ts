/**
 * Token cost tracking — visibility into what every command costs.
 *
 * Two data sources:
 *   1. Estimates: computed from content length (~4 chars/token)
 *   2. Real usage: parsed from Claude Code JSONL session transcripts
 *      stored at ~/.config/claude/projects/ and ~/.claude/projects/
 *
 * Pricing engine inspired by ccusage (github.com/syunmoca/ccusage):
 *   - Per-model pricing with tiered rates (200k token threshold)
 *   - Cache creation/read tokens tracked separately
 *   - Per-session, per-project, per-model breakdowns
 *
 * Current pricing (per million tokens):
 *   Opus 4.6:   $15 input / $75 output / $18.75 cache-write / $1.50 cache-read
 *   Sonnet 4.6: $3 input  / $15 output / $3.75 cache-write  / $0.30 cache-read
 *   Haiku 4.5:  $0.80 input / $4 output / $1.00 cache-write / $0.08 cache-read
 */

import { join } from "path"
import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { homedir } from "os"

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

// ── Pricing tables (per token, not per million) ──────────────────────

interface ModelPricing {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
  inputAbove200k?: number
  outputAbove200k?: number
  cacheWriteAbove200k?: number
  cacheReadAbove200k?: number
}

const TIERED_THRESHOLD = 200_000

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Opus 4.6
  "opus": {
    input: 15e-6, output: 75e-6, cacheWrite: 18.75e-6, cacheRead: 1.5e-6,
    inputAbove200k: 30e-6, outputAbove200k: 112.5e-6,
    cacheWriteAbove200k: 37.5e-6, cacheReadAbove200k: 3e-6,
  },
  // Sonnet 4.6
  "sonnet": {
    input: 3e-6, output: 15e-6, cacheWrite: 3.75e-6, cacheRead: 0.3e-6,
    inputAbove200k: 6e-6, outputAbove200k: 22.5e-6,
    cacheWriteAbove200k: 7.5e-6, cacheReadAbove200k: 0.6e-6,
  },
  // Haiku 4.5
  "haiku": {
    input: 0.8e-6, output: 4e-6, cacheWrite: 1e-6, cacheRead: 0.08e-6,
  },
}

/** Match a model name string to a pricing tier */
function matchModelPricing(modelName: string): ModelPricing {
  const m = modelName.toLowerCase()
  if (m.includes("opus")) return MODEL_PRICING["opus"]
  if (m.includes("haiku")) return MODEL_PRICING["haiku"]
  return MODEL_PRICING["sonnet"] // default
}

/** Calculate tiered cost (like ccusage's calculateTieredCost) */
function tieredCost(
  tokens: number,
  baseRate: number,
  aboveRate?: number,
  threshold = TIERED_THRESHOLD,
): number {
  if (tokens <= 0) return 0
  if (tokens > threshold && aboveRate !== undefined) {
    return Math.min(tokens, threshold) * baseRate + Math.max(0, tokens - threshold) * aboveRate
  }
  return tokens * baseRate
}

/** Calculate real cost for a set of token counts using a specific model */
export function calculateRealCost(
  inputTokens: number,
  outputTokens: number,
  cacheCreate: number,
  cacheRead: number,
  modelName: string,
): number {
  const p = matchModelPricing(modelName)
  return (
    tieredCost(inputTokens, p.input, p.inputAbove200k) +
    tieredCost(outputTokens, p.output, p.outputAbove200k) +
    tieredCost(cacheCreate, p.cacheWrite, p.cacheWriteAbove200k) +
    tieredCost(cacheRead, p.cacheRead, p.cacheReadAbove200k)
  )
}

// ── Legacy estimation (for command file size predictions) ────────────

// Pricing per million input tokens (for quick estimates)
const PRICING_PER_M_INPUT = {
  opus: 15.0,
  sonnet: 3.0,
  haiku: 0.80,
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

function fmtVal(v: number): string {
  if (v === 0) return "$0.000000"
  if (v < 0.000001) return `$${v.toFixed(8)}`
  if (v < 0.0001) return `$${v.toFixed(6)}`
  if (v < 0.01) return `$${v.toFixed(5)}`
  return `$${v.toFixed(4)}`
}

export function formatCost(cost: CostBreakdown): string {
  return `Opus ${fmtVal(cost.opus)} | Sonnet ${fmtVal(cost.sonnet)} | Haiku ${fmtVal(cost.haiku)}`
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

export interface RealTokenRecord {
  sessionId: string
  timestamp: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreate: number
  cacheRead: number
  cost: number
}

export function readRealTokenUsage(cwd: string): RealTokenRecord[] {
  const p = join(cwd, ".claude", "token-usage.json")
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, "utf8")) as RealTokenRecord[]
  } catch { return [] }
}

// ── ccusage-style JSONL reader ───────────────────────────────────────
// Reads Claude Code's session transcripts directly from data directories.
// Path structure: ~/.config/claude/projects/<project-name>/<session-id>.jsonl
// Each JSONL line contains: { timestamp, message: { model, usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens } }, costUSD? }

export interface ModelBreakdown {
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreateTokens: number
  cacheReadTokens: number
  cost: number
  totalTokens: number
}

export interface SessionSummary {
  sessionId: string
  project: string
  timestamp: string
  models: ModelBreakdown[]
  inputTokens: number
  outputTokens: number
  cacheCreateTokens: number
  cacheReadTokens: number
  totalTokens: number
  totalCost: number
}

export interface ProjectSummary {
  project: string
  sessions: number
  models: ModelBreakdown[]
  inputTokens: number
  outputTokens: number
  cacheCreateTokens: number
  cacheReadTokens: number
  totalTokens: number
  totalCost: number
}

/**
 * Find Claude data directories — works on every OS.
 * Checks (in order):
 *   1. CLAUDE_CONFIG_DIR env var (comma-separated, custom override)
 *   2. XDG_CONFIG_HOME/claude  (Linux/macOS new default)
 *   3. ~/.config/claude        (Linux/macOS fallback)
 *   4. ~/Library/Application Support/claude  (macOS alternate)
 *   5. %APPDATA%/claude        (Windows alternate)
 *   6. ~/.claude               (old default, all platforms)
 */
function getClaudeDataDirs(): string[] {
  const dirs: string[] = []
  const seen = new Set<string>()
  const home = homedir()

  function tryAdd(dir: string): void {
    const resolved = join(dir) // normalize
    if (seen.has(resolved)) return
    seen.add(resolved)
    if (existsSync(join(resolved, "projects"))) dirs.push(resolved)
  }

  // 1. Custom env var
  const envDirs = process.env.CLAUDE_CONFIG_DIR
  if (envDirs) {
    for (const d of envDirs.split(",").map(s => s.trim()).filter(Boolean)) {
      tryAdd(d)
    }
  }

  // 2. XDG config
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(home, ".config")
  tryAdd(join(xdgConfig, "claude"))

  // 3. macOS Application Support
  tryAdd(join(home, "Library", "Application Support", "claude"))

  // 4. Windows APPDATA
  if (process.env.APPDATA) tryAdd(join(process.env.APPDATA, "claude"))

  // 5. Old default
  tryAdd(join(home, ".claude"))

  return dirs
}

/** Parse a single JSONL line into usage data */
function parseJsonlLine(line: string): {
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreate: number
  cacheRead: number
  costUSD?: number
  timestamp?: string
  messageId?: string
  requestId?: string
} | null {
  try {
    const obj = JSON.parse(line)
    const msg = obj?.message
    if (!msg?.usage) return null
    const u = msg.usage
    // Skip synthetic/zero-usage entries (e.g. <synthetic> model with all-zero counts)
    if ((u.input_tokens ?? 0) === 0 && (u.output_tokens ?? 0) === 0 &&
        (u.cache_creation_input_tokens ?? 0) === 0 && (u.cache_read_input_tokens ?? 0) === 0) return null
    return {
      model: msg.model ?? "unknown",
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheCreate: u.cache_creation_input_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      costUSD: obj.costUSD,
      timestamp: obj.timestamp,
      messageId: msg.id,
      requestId: obj.requestId,
    }
  } catch { return null }
}

/** Extract a human-readable project name from a CWD path */
function extractProjectName(cwd: string): string {
  const parts = cwd.replace(/[\\/]/g, "/").split("/").filter(Boolean)
  return parts[parts.length - 1] ?? cwd
}

/** Aggregate entries by model (like ccusage's aggregateByModel) */
function aggregateByModel(
  entries: Array<{ model: string; inputTokens: number; outputTokens: number; cacheCreate: number; cacheRead: number; cost: number }>
): ModelBreakdown[] {
  const agg = new Map<string, { inputTokens: number; outputTokens: number; cacheCreateTokens: number; cacheReadTokens: number; cost: number }>()

  for (const e of entries) {
    const existing = agg.get(e.model) ?? { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0, cost: 0 }
    existing.inputTokens += e.inputTokens
    existing.outputTokens += e.outputTokens
    existing.cacheCreateTokens += e.cacheCreate
    existing.cacheReadTokens += e.cacheRead
    existing.cost += e.cost
    agg.set(e.model, existing)
  }

  return [...agg.entries()].map(([model, stats]) => ({
    model,
    ...stats,
    totalTokens: stats.inputTokens + stats.outputTokens + stats.cacheCreateTokens + stats.cacheReadTokens,
  }))
}

/**
 * Read all JSONL session files for a given project directory.
 * Scans Claude's data directories for matching project paths.
 * Returns per-session summaries with per-model breakdowns.
 */
export function readProjectSessions(projectCwd: string): SessionSummary[] {
  const claudeDirs = getClaudeDataDirs()
  if (claudeDirs.length === 0) return []

  const sessions: SessionSummary[] = []
  const seen = new Set<string>() // dedup by messageId:requestId

  for (const claudeDir of claudeDirs) {
    const projectsDir = join(claudeDir, "projects")
    if (!existsSync(projectsDir)) continue

    // Encode the CWD the way Claude Code does, then exact-match against project dirs.
    // This is the only reliable cross-platform approach — decoding is lossy when
    // folder names contain hyphens (e.g. "Claude-code-documentation").
    //   Windows: C:\Users\alice\Desktop\my-app  →  C--Users-alice-Desktop-my-app
    //   Unix:    /Users/alice/dev/my-app         →  -Users-alice-dev-my-app
    const encodedCwd = projectCwd
      .replace(/\\/g, "/")       // normalize backslashes to forward slashes
      .replace(/:\//g, "--")     // drive letter: C:/ → C--
      .replace(/\//g, "-")       // remaining slashes → dashes

    let targetDir: string | null = null
    try {
      for (const entry of readdirSync(projectsDir)) {
        // Case-insensitive compare handles Windows where CWDs may differ in case
        if (entry.toLowerCase() === encodedCwd.toLowerCase()) {
          targetDir = join(projectsDir, entry)
          break
        }
      }
    } catch { continue }

    if (!targetDir || !existsSync(targetDir)) continue

    // Read all .jsonl files in this project dir
    try {
      const files = readdirSync(targetDir).filter(f => f.endsWith(".jsonl"))
      for (const file of files) {
        const filePath = join(targetDir, file)
        const sessionId = file.replace(".jsonl", "")
        let content: string
        try { content = readFileSync(filePath, "utf8") } catch { continue }

        const entries: Array<{ model: string; inputTokens: number; outputTokens: number; cacheCreate: number; cacheRead: number; cost: number }> = []
        let latestTimestamp = ""

        // Helper to process lines from any JSONL source into entries
        const processLines = (text: string) => {
          for (const line of text.split("\n")) {
            if (!line.trim()) continue
            const parsed = parseJsonlLine(line)
            if (!parsed) continue

            // Dedup by messageId:requestId
            if (parsed.messageId && parsed.requestId) {
              const key = `${parsed.messageId}:${parsed.requestId}`
              if (seen.has(key)) continue
              seen.add(key)
            }

            const cost = parsed.costUSD ?? calculateRealCost(
              parsed.inputTokens, parsed.outputTokens, parsed.cacheCreate, parsed.cacheRead, parsed.model
            )

            entries.push({
              model: parsed.model,
              inputTokens: parsed.inputTokens,
              outputTokens: parsed.outputTokens,
              cacheCreate: parsed.cacheCreate,
              cacheRead: parsed.cacheRead,
              cost,
            })

            if (parsed.timestamp && parsed.timestamp > latestTimestamp) {
              latestTimestamp = parsed.timestamp
            }
          }
        }

        // Read main session JSONL
        processLines(content)

        // Also read subagent JSONL files (stored in <sessionId>/subagents/*.jsonl)
        // These track token usage from Agent tool calls (subagents use separate API sessions)
        const subagentDir = join(targetDir, sessionId, "subagents")
        if (existsSync(subagentDir)) {
          try {
            const subFiles = readdirSync(subagentDir).filter(f => f.endsWith(".jsonl"))
            for (const sf of subFiles) {
              try {
                const subContent = readFileSync(join(subagentDir, sf), "utf8")
                processLines(subContent)
              } catch { /* skip unreadable subagent file */ }
            }
          } catch { /* skip if subagents dir unreadable */ }
        }

        if (entries.length === 0) continue

        const models = aggregateByModel(entries)
        const totals = entries.reduce((acc, e) => ({
          inputTokens: acc.inputTokens + e.inputTokens,
          outputTokens: acc.outputTokens + e.outputTokens,
          cacheCreate: acc.cacheCreate + e.cacheCreate,
          cacheRead: acc.cacheRead + e.cacheRead,
          cost: acc.cost + e.cost,
        }), { inputTokens: 0, outputTokens: 0, cacheCreate: 0, cacheRead: 0, cost: 0 })

        sessions.push({
          sessionId,
          project: extractProjectName(projectCwd),
          timestamp: latestTimestamp,
          models,
          inputTokens: totals.inputTokens,
          outputTokens: totals.outputTokens,
          cacheCreateTokens: totals.cacheCreate,
          cacheReadTokens: totals.cacheRead,
          totalTokens: totals.inputTokens + totals.outputTokens + totals.cacheCreate + totals.cacheRead,
          totalCost: totals.cost,
        })
      }
    } catch { /* skip */ }
  }

  // Sort by timestamp descending
  sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return sessions
}

/**
 * Aggregate all sessions for a project into a single summary.
 */
export function getProjectUsageSummary(projectCwd: string): ProjectSummary | null {
  const sessions = readProjectSessions(projectCwd)
  if (sessions.length === 0) return null

  // Merge all model breakdowns across sessions
  const allEntries: Array<{ model: string; inputTokens: number; outputTokens: number; cacheCreate: number; cacheRead: number; cost: number }> = []
  for (const s of sessions) {
    for (const m of s.models) {
      allEntries.push({
        model: m.model,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheCreate: m.cacheCreateTokens,
        cacheRead: m.cacheReadTokens,
        cost: m.cost,
      })
    }
  }

  const models = aggregateByModel(allEntries)
  const totals = sessions.reduce((acc, s) => ({
    inputTokens: acc.inputTokens + s.inputTokens,
    outputTokens: acc.outputTokens + s.outputTokens,
    cacheCreate: acc.cacheCreate + s.cacheCreateTokens,
    cacheRead: acc.cacheRead + s.cacheReadTokens,
    cost: acc.cost + s.totalCost,
  }), { inputTokens: 0, outputTokens: 0, cacheCreate: 0, cacheRead: 0, cost: 0 })

  return {
    project: sessions[0].project,
    sessions: sessions.length,
    models,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    cacheCreateTokens: totals.cacheCreate,
    cacheReadTokens: totals.cacheRead,
    totalTokens: totals.inputTokens + totals.outputTokens + totals.cacheCreate + totals.cacheRead,
    totalCost: totals.cost,
  }
}

export function getTokenHookScript(): string {
  return `#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

// Tiered pricing: tokens above 200k threshold are charged at a higher rate
const THRESHOLD = 200000;
function tieredCost(tokens, baseRate, aboveRate) {
  if (tokens <= 0) return 0;
  if (tokens > THRESHOLD && aboveRate) {
    return Math.min(tokens, THRESHOLD) * baseRate + Math.max(0, tokens - THRESHOLD) * aboveRate;
  }
  return tokens * baseRate;
}

// Model pricing per token (ccusage-style, supports tiered pricing)
const PRICING = {
  opus:   { input: 15e-6, output: 75e-6, cacheWrite: 18.75e-6, cacheRead: 1.5e-6,
            inputAbove200k: 30e-6, outputAbove200k: 112.5e-6, cacheWriteAbove200k: 37.5e-6, cacheReadAbove200k: 3e-6 },
  sonnet: { input: 3e-6, output: 15e-6, cacheWrite: 3.75e-6, cacheRead: 0.3e-6,
            inputAbove200k: 6e-6, outputAbove200k: 22.5e-6, cacheWriteAbove200k: 7.5e-6, cacheReadAbove200k: 0.6e-6 },
  haiku:  { input: 0.8e-6, output: 4e-6, cacheWrite: 1e-6, cacheRead: 0.08e-6 },
};

function getPricing(modelName) {
  const m = modelName.toLowerCase();
  if (m.includes('opus')) return PRICING.opus;
  if (m.includes('haiku')) return PRICING.haiku;
  return PRICING.sonnet;
}

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input);
    const transcriptPath = event.transcript_path;
    const sessionId = event.session_id || 'unknown';

    if (!transcriptPath || !fs.existsSync(transcriptPath)) process.exit(0);

    // Per-model aggregation (like ccusage's aggregateByModel)
    const models = {};
    const seen = new Set();

    function processLines(text) {
      for (const line of text.split('\\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          const msg = obj.message;
          if (!msg || !msg.usage) continue;
          const u = msg.usage;
          // Skip zero-usage entries (e.g. <synthetic>)
          if (!u.input_tokens && !u.output_tokens && !u.cache_creation_input_tokens && !u.cache_read_input_tokens) continue;
          // Dedup by messageId:requestId
          const dedup = (msg.id || '') + ':' + (obj.requestId || '');
          if (dedup !== ':' && seen.has(dedup)) continue;
          if (dedup !== ':') seen.add(dedup);
          const model = msg.model || 'unknown';
          if (!models[model]) models[model] = { inputTokens: 0, outputTokens: 0, cacheCreate: 0, cacheRead: 0 };
          models[model].inputTokens  += u.input_tokens || 0;
          models[model].outputTokens += u.output_tokens || 0;
          models[model].cacheCreate  += u.cache_creation_input_tokens || 0;
          models[model].cacheRead    += u.cache_read_input_tokens || 0;
        } catch {}
      }
    }

    // Read main session transcript
    processLines(fs.readFileSync(transcriptPath, 'utf8'));

    // Also read subagent JSONL files — subagents use separate API sessions
    // stored at <transcriptPath without .jsonl>/subagents/*.jsonl
    const sessionDir = transcriptPath.replace(/\\.jsonl$/, '');
    const subagentDir = path.join(sessionDir, 'subagents');
    if (fs.existsSync(subagentDir)) {
      try {
        const subFiles = fs.readdirSync(subagentDir).filter(f => f.endsWith('.jsonl'));
        for (const sf of subFiles) {
          try { processLines(fs.readFileSync(path.join(subagentDir, sf), 'utf8')); } catch {}
        }
      } catch {}
    }

    // Calculate cost per model with tiered pricing
    let totalCost = 0;
    let totalInput = 0, totalOutput = 0, totalCacheCreate = 0, totalCacheRead = 0;
    const modelBreakdowns = [];
    let primaryModel = 'unknown';
    let maxTokens = 0;

    for (const [model, t] of Object.entries(models)) {
      const p = getPricing(model);
      const cost = tieredCost(t.inputTokens, p.input, p.inputAbove200k)
                 + tieredCost(t.outputTokens, p.output, p.outputAbove200k)
                 + tieredCost(t.cacheCreate, p.cacheWrite, p.cacheWriteAbove200k)
                 + tieredCost(t.cacheRead, p.cacheRead, p.cacheReadAbove200k);
      totalCost += cost;
      totalInput += t.inputTokens;
      totalOutput += t.outputTokens;
      totalCacheCreate += t.cacheCreate;
      totalCacheRead += t.cacheRead;
      const total = t.inputTokens + t.outputTokens + t.cacheCreate + t.cacheRead;
      if (total > maxTokens) { maxTokens = total; primaryModel = model; }
      modelBreakdowns.push({ model, ...t, cost, totalTokens: total });
    }

    const record = {
      sessionId,
      timestamp: new Date().toISOString(),
      model: primaryModel,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheCreate: totalCacheCreate,
      cacheRead: totalCacheRead,
      cost: totalCost,
      modelBreakdowns
    };

    const usageFile = path.join(process.cwd(), '.claude', 'token-usage.json');
    let records = [];
    try { records = JSON.parse(fs.readFileSync(usageFile, 'utf8')); } catch {}
    const idx = records.findIndex(r => r.sessionId === sessionId);
    if (idx >= 0) { records[idx] = record; } else { records.push(record); }
    if (records.length > 100) records = records.slice(-100);
    const dir = path.dirname(usageFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(usageFile, JSON.stringify(records, null, 2));
  } catch { process.exit(0); }
});
`
}

/**
 * Format a real-cost summary. Prefers JSONL transcript data (ccusage-style),
 * falls back to Stop hook data if no JSONL sessions found.
 * Returns null if no real data is available from either source.
 */
export function formatRealCostSummary(cwd: string): string | null {
  // Try JSONL transcripts first (most accurate — per-model, cache-aware)
  const projectSummary = getProjectUsageSummary(cwd)
  if (projectSummary && projectSummary.totalTokens > 0) {
    const lines: string[] = []
    lines.push(`  Real usage (${projectSummary.sessions} session${projectSummary.sessions > 1 ? "s" : ""}, from JSONL transcripts):`)
    lines.push(`    Total cost   : $${projectSummary.totalCost.toFixed(6)}`)
    lines.push(`    Input tokens : ${projectSummary.inputTokens.toLocaleString()}`)
    lines.push(`    Output tokens: ${projectSummary.outputTokens.toLocaleString()}`)
    if (projectSummary.cacheCreateTokens > 0 || projectSummary.cacheReadTokens > 0) {
      lines.push(`    Cache write  : ${projectSummary.cacheCreateTokens.toLocaleString()}`)
      lines.push(`    Cache read   : ${projectSummary.cacheReadTokens.toLocaleString()}`)
    }
    if (projectSummary.models.length > 0) {
      lines.push(`    Per model:`)
      for (const m of projectSummary.models.sort((a, b) => b.cost - a.cost)) {
        const shortName = m.model.replace(/^claude-/, "").replace(/-\d{8}$/, "")
        lines.push(`      ${shortName.padEnd(14)} ${m.totalTokens.toLocaleString().padStart(12)} tokens  $${m.cost.toFixed(6)}`)
      }
    }
    return lines.join("\n")
  }

  // Fallback: Stop hook data
  const records = readRealTokenUsage(cwd)
  if (records.length === 0) return null

  let totalCost = 0
  let totalInput = 0
  let totalOutput = 0
  let totalCacheCreate = 0
  let totalCacheRead = 0
  for (const r of records) {
    totalCost += r.cost
    totalInput += r.inputTokens
    totalOutput += r.outputTokens
    totalCacheCreate += r.cacheCreate
    totalCacheRead += r.cacheRead
  }

  const last = records[records.length - 1]
  const lastDate = new Date(last.timestamp).toLocaleString()
  const lines: string[] = []
  lines.push(`  Real usage (${records.length} session${records.length > 1 ? "s" : ""} tracked):`)
  lines.push(`    Total cost   : $${totalCost.toFixed(6)}`)
  lines.push(`    Input tokens : ${totalInput.toLocaleString()}`)
  lines.push(`    Output tokens: ${totalOutput.toLocaleString()}`)
  if (totalCacheCreate > 0 || totalCacheRead > 0) {
    lines.push(`    Cache write  : ${totalCacheCreate.toLocaleString()}`)
    lines.push(`    Cache read   : ${totalCacheRead.toLocaleString()}`)
  }
  lines.push(`    Last session : ${lastDate} (${last.model})`)
  return lines.join("\n")
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
