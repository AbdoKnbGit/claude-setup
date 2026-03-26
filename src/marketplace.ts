/**
 * Marketplace intelligence — provides catalog info and decision logic
 * for the add command to suggest plugins, skills, and MCP servers.
 *
 * Zero API calls at import time. Catalog is fetched only when needed.
 */

export const MARKETPLACE_REPO = "jeremylongshore/claude-code-plugins-plus-skills"

export const MARKETPLACE_CATALOG_URL =
  `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/.claude-plugin/marketplace.extended.json`

/** The 20 skill categories in the marketplace */
export const SKILL_CATEGORIES = [
  "01-code-quality", "02-testing", "03-security",
  "04-devops", "05-api-development", "06-database",
  "07-frontend", "08-backend", "09-mobile",
  "10-data-science", "11-documentation", "12-project-management",
  "13-communication", "14-research", "15-content-creation",
  "16-business", "17-finance", "18-visual-content",
  "19-legal", "20-productivity",
] as const

/** SaaS packs available in the marketplace */
export const SAAS_PACKS = [
  "Supabase", "Vercel", "OpenRouter", "GitHub", "Azure", "MongoDB",
  "Playwright", "Tavily", "Stripe", "Slack", "Linear", "Notion",
] as const

/** Keyword-to-category mapping for classifying user requests */
export const KEYWORD_CATEGORY_MAP: Record<string, string> = {
  // Code quality
  "lint": "01-code-quality", "format": "01-code-quality", "prettier": "01-code-quality",
  "eslint": "01-code-quality", "code quality": "01-code-quality", "style": "01-code-quality",

  // Testing
  "test": "02-testing", "jest": "02-testing", "vitest": "02-testing",
  "playwright": "02-testing", "cypress": "02-testing", "e2e": "02-testing",
  "unit test": "02-testing", "integration test": "02-testing",

  // Security
  "security": "03-security", "auth": "03-security", "authentication": "03-security",
  "oauth": "03-security", "jwt": "03-security", "encryption": "03-security",

  // DevOps
  "devops": "04-devops", "ci": "04-devops", "cd": "04-devops",
  "docker": "04-devops", "kubernetes": "04-devops", "k8s": "04-devops",
  "deploy": "04-devops", "infrastructure": "04-devops", "terraform": "04-devops",

  // API
  "api": "05-api-development", "rest": "05-api-development", "graphql": "05-api-development",
  "swagger": "05-api-development", "openapi": "05-api-development",

  // Database
  "database": "06-database", "sql": "06-database", "postgres": "06-database",
  "mysql": "06-database", "mongodb": "06-database", "redis": "06-database",
  "prisma": "06-database", "orm": "06-database", "migration": "06-database",

  // Frontend
  "frontend": "07-frontend", "react": "07-frontend", "vue": "07-frontend",
  "svelte": "07-frontend", "angular": "07-frontend", "css": "07-frontend",
  "tailwind": "07-frontend", "ui": "07-frontend", "component": "07-frontend",

  // Backend
  "backend": "08-backend", "express": "08-backend", "fastapi": "08-backend",
  "django": "08-backend", "spring": "08-backend", "nest": "08-backend",

  // Mobile
  "mobile": "09-mobile", "react native": "09-mobile", "flutter": "09-mobile",
  "ios": "09-mobile", "android": "09-mobile", "swift": "09-mobile",

  // Data science
  "data": "10-data-science", "ml": "10-data-science", "machine learning": "10-data-science",
  "pandas": "10-data-science", "numpy": "10-data-science", "jupyter": "10-data-science",

  // Documentation
  "docs": "11-documentation", "documentation": "11-documentation",
  "readme": "11-documentation", "jsdoc": "11-documentation",

  // Project management
  "project management": "12-project-management", "agile": "12-project-management",
  "sprint": "12-project-management", "kanban": "12-project-management",
}

/** Classify a user request into marketplace categories */
export function classifyRequest(input: string): { categories: string[]; saasMatches: string[] } {
  const lower = input.toLowerCase()
  const categories = new Set<string>()
  const saasMatches: string[] = []

  // Check keyword matches
  for (const [keyword, category] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (lower.includes(keyword)) {
      categories.add(category)
    }
  }

  // Check SaaS pack matches
  for (const saas of SAAS_PACKS) {
    if (lower.includes(saas.toLowerCase())) {
      saasMatches.push(saas)
    }
  }

  return { categories: [...categories], saasMatches }
}

/** Generate marketplace search instructions for the add template */
export function buildMarketplaceInstructions(input: string): string {
  const { categories, saasMatches } = classifyRequest(input)

  const lines: string[] = []
  lines.push(`## Marketplace intelligence`)
  lines.push(``)
  lines.push(`A plugin marketplace is available with 340+ plugins and 1,367+ agent skills.`)
  lines.push(``)

  if (categories.length > 0 || saasMatches.length > 0) {
    lines.push(`### Matched categories for "${input}":`)
    for (const cat of categories) {
      lines.push(`- ${cat}`)
    }
    for (const saas of saasMatches) {
      lines.push(`- SaaS pack: ${saas} (~30 skills)`)
    }
    lines.push(``)
  }

  lines.push(`### How to search and install`)
  lines.push(``)
  lines.push(`**Step 1 — Add the marketplace** (if not already added):`)
  lines.push("```")
  lines.push(`/plugin marketplace add ${MARKETPLACE_REPO}`)
  lines.push("```")
  lines.push(``)
  lines.push(`**Step 2 — Search for matching plugins:**`)
  lines.push("```")
  lines.push(`# Fetch the catalog:`)
  lines.push(`curl -s ${MARKETPLACE_CATALOG_URL} | jq '[.[] | select(.category | test("${categories[0] ?? ""}"; "i"))]'`)
  lines.push("```")
  lines.push(``)
  lines.push(`**Step 3 — Install matching plugins:**`)
  lines.push("```")
  lines.push(`/plugin install <name>@claude-code-plugins-plus`)
  lines.push("```")
  lines.push(``)
  lines.push(`### Before suggesting any plugin, validate:`)
  lines.push(`- \`mcp_required\` field — if true, flag the MCP dependency`)
  lines.push(`- \`free\` field — if false, flag that it needs a paid API`)
  lines.push(`- Never suggest a plugin without checking the catalog first`)
  lines.push(`- Never hardcode a plugin name from memory — validate against the fetched catalog`)
  lines.push(``)
  lines.push(`### Suggestion format:`)
  lines.push("```")
  lines.push(`📦 Suggested from [claude-code-plugins-plus-skills]`)
  lines.push(``)
  lines.push(`  [plugin/skill name]`)
  lines.push(`  Category  : [category]`)
  lines.push(`  What it does: [one sentence from catalog description]`)
  lines.push(`  Requires  : [nothing / MCP: name / Paid API: service name]`)
  lines.push(``)
  lines.push(`  Install:`)
  lines.push(`    /plugin marketplace add ${MARKETPLACE_REPO}`)
  lines.push(`    /plugin install [name]@claude-code-plugins-plus`)
  lines.push("```")
  lines.push(``)

  // Official Anthropic marketplace plugins (always available)
  lines.push(`### Official Anthropic plugins (always available, no marketplace add needed):`)
  lines.push(`These are installed via \`/plugin install <name>@claude-plugins-official\`:`)
  lines.push(`- **github** — GitHub integration (PRs, issues, repos)`)
  lines.push(`- **gitlab** — GitLab integration`)
  lines.push(`- **slack** — Slack messaging`)
  lines.push(`- **linear** — Linear project management`)
  lines.push(`- **notion** — Notion workspace`)
  lines.push(`- **sentry** — Error monitoring`)
  lines.push(`- **figma** — Design files`)
  lines.push(`- **vercel** — Deployment`)
  lines.push(`- **firebase** — Firebase services`)
  lines.push(`- **supabase** — Supabase backend`)
  lines.push(`- **atlassian** — Jira/Confluence`)
  lines.push(`- **asana** — Project management`)
  lines.push(``)

  return lines.join("\n")
}
