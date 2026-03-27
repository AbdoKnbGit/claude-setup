/**
 * Marketplace intelligence — provides catalog info and decision logic
 * for the add command to suggest plugins, skills, and MCP servers.
 *
 * Zero API calls at import time. Catalog is fetched only when needed.
 */

export const MARKETPLACE_REPO = "jeremylongshore/claude-code-plugins-plus-skills"

export const MARKETPLACE_CATALOG_URL =
  `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/.claude-plugin/marketplace.extended.json`

/** Additional marketplace sources for broader coverage */
export const ADDITIONAL_MARKETPLACE_SOURCES = [
  {
    name: "claude-plugins-official",
    description: "Official Anthropic plugins (GitHub, Slack, Linear, Notion, etc.)",
    installPrefix: "claude-plugins-official",
    note: "No marketplace add needed — available by default"
  },
  {
    name: "awesome-claude-code",
    description: "Community collection of Claude Code skills and workflows",
    catalogUrl: "https://raw.githubusercontent.com/hesreallyhim/awesome-claude-code/main/catalog.json",
    installPrefix: null,
    note: "Browse and manually install skills"
  }
] as const

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

/** Generate fully-automated marketplace search and install instructions */
export function buildMarketplaceInstructions(input: string): string {
  const { categories, saasMatches } = classifyRequest(input)
  const categoryFilter = categories[0] ?? ""

  const lines: string[] = []
  lines.push(`## Marketplace — fully automated install`)
  lines.push(``)
  lines.push(`A plugin marketplace has 416 community skills + 13 official Anthropic plugins.`)
  lines.push(`Follow the steps below IN ORDER. Do not stop until a skill is installed.`)
  lines.push(``)

  if (categories.length > 0 || saasMatches.length > 0) {
    lines.push(`### Matched for "${input}":`)
    for (const cat of categories) lines.push(`- category: ${cat}`)
    for (const saas of saasMatches) lines.push(`- SaaS: ${saas}`)
    lines.push(``)
  }

  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 1 — Try official Anthropic plugins first (no schema errors, always works)`)
  lines.push(``)
  lines.push(`\`\`\``)
  lines.push(`/plugin marketplace add anthropics/claude-code`)
  lines.push(`\`\`\``)
  lines.push(`Then search installed plugins for a match. If found, install:`)
  lines.push(`\`\`\``)
  lines.push(`/plugin install <name>@claude-code-plugins`)
  lines.push(`\`\`\``)
  lines.push(`Official plugins: agent-sdk-dev, claude-opus-4-5-migration, code-review, commit-commands,`)
  lines.push(`explanatory-output-style, feature-dev, frontend-design, hookify, learning-output-style,`)
  lines.push(`plugin-dev, pr-review-toolkit, ralph-wiggum, security-guidance`)
  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 2 — Search community catalog (jeremylongshore — 416 plugins)`)
  lines.push(``)
  lines.push(`NOTE: /plugin marketplace add FAILS for this repo (one entry has broken schema).`)
  lines.push(`Use the DIRECT FETCH approach below instead — no marketplace add needed.`)
  lines.push(``)
  lines.push(`**2a. Fetch catalog and find matching plugin:**`)
  lines.push(`\`\`\`bash`)
  lines.push(`curl -s "${MARKETPLACE_CATALOG_URL}" \\`)
  lines.push(`  | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));const q='${categoryFilter}';const r=d.plugins.filter(p=>(!q||p.category.includes(q))&&p.name&&p.source).slice(0,5).map(p=>({name:p.name,source:p.source,desc:p.description}));console.log(JSON.stringify(r,null,2));"`)
  lines.push(`\`\`\``)
  lines.push(``)
  lines.push(`**2b. Pick the best match — get its source path (e.g. \`./plugins/productivity/my-skill\`)**`)
  lines.push(``)
  lines.push(`**2c. List the skills inside that plugin:**`)
  lines.push(`\`\`\`bash`)
  lines.push(`# Replace PLUGIN_SOURCE_PATH with value from step 2b (e.g. plugins/productivity/my-skill)`)
  lines.push(`PLUGIN_SOURCE_PATH="plugins/productivity/my-skill"`)
  lines.push(`curl -s "https://api.github.com/repos/${MARKETPLACE_REPO}/contents/\${PLUGIN_SOURCE_PATH}/skills" \\`)
  lines.push(`  | node -e "const a=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(a.map(x=>x.name).join('\\n'));"`)
  lines.push(`\`\`\``)
  lines.push(``)
  lines.push(`**2d. For each skill listed, download and install it:**`)
  lines.push(`\`\`\`bash`)
  lines.push(`# Replace PLUGIN_SOURCE_PATH and SKILL_NAME with actual values`)
  lines.push(`PLUGIN_SOURCE_PATH="plugins/productivity/my-skill"`)
  lines.push(`SKILL_NAME="skill-directory-name"`)
  lines.push(`mkdir -p ".claude/skills/\${SKILL_NAME}"`)
  lines.push(`curl -s "https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/\${PLUGIN_SOURCE_PATH}/skills/\${SKILL_NAME}/SKILL.md" \\`)
  lines.push(`  -o ".claude/skills/\${SKILL_NAME}/SKILL.md"`)
  lines.push(`echo "Installed: .claude/skills/\${SKILL_NAME}/SKILL.md"`)
  lines.push(`\`\`\``)
  lines.push(``)
  lines.push(`**On Windows, replace curl with:**`)
  lines.push(`\`\`\`powershell`)
  lines.push(`$url = "https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/$PLUGIN_SOURCE_PATH/skills/$SKILL_NAME/SKILL.md"`)
  lines.push(`New-Item -ItemType Directory -Force ".claude/skills/$SKILL_NAME" | Out-Null`)
  lines.push(`Invoke-WebRequest $url -OutFile ".claude/skills/$SKILL_NAME/SKILL.md"`)
  lines.push(`\`\`\``)
  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 3 — Search additional sources`)
  lines.push(``)
  for (const source of ADDITIONAL_MARKETPLACE_SOURCES) {
    lines.push(`**${source.name}** — ${source.description}`)
    if ("catalogUrl" in source && source.catalogUrl) {
      lines.push(`Catalog: ${source.catalogUrl}`)
    }
    if (source.note) {
      lines.push(`Note: ${source.note}`)
    }
    lines.push(``)
  }
  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 4 — If no match found in any source, create a custom skill`)
  lines.push(``)
  lines.push(`\`\`\`bash`)
  lines.push(`mkdir -p ".claude/skills/${input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}"`)
  lines.push(`\`\`\``)
  lines.push(`Then create SKILL.md with:`)
  lines.push(`\`\`\`yaml`)
  lines.push(`---`)
  lines.push(`name: ${input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`)
  lines.push(`description: ${input}`)
  lines.push(`---`)
  lines.push(``)
  lines.push(`[Skill instructions here]`)
  lines.push(`\`\`\``)
  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`### Install result format`)
  lines.push(`After installing, confirm:`)
  lines.push(`✅ Installed: .claude/skills/<name>/SKILL.md — [one line: what it does]`)
  lines.push(`⏭ No match: searched [categories], created custom skill instead`)
  lines.push(``)

  return lines.join("\n")
}
