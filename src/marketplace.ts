/**
 * Marketplace intelligence — provides catalog info and decision logic
 * for the add command to suggest plugins, skills, MCP servers, and agents.
 *
 * Implements the 4-catalog exhaustion pipeline (Rule 6) with 3-stage
 * fetch resolution (Rule 7): find entry → navigate directory → download content.
 *
 * Zero API calls at import time. Catalog is fetched only when needed.
 */

// ── Source 1: VoltAgent subagents (agents/sub-agents) ────────────────
export const VOLTAGENT_SUBAGENTS_REPO = "VoltAgent/awesome-claude-code-subagents"
export const VOLTAGENT_SUBAGENTS_API  = `https://api.github.com/repos/${VOLTAGENT_SUBAGENTS_REPO}/contents/categories`
export const VOLTAGENT_SUBAGENTS_RAW  = `https://raw.githubusercontent.com/${VOLTAGENT_SUBAGENTS_REPO}/main/categories`

export const VOLTAGENT_CATEGORIES = [
  "01-core-development",
  "02-language-specialists",
  "03-infrastructure",
  "04-quality-security",
  "05-data-ai",
  "06-developer-experience",
  "07-specialized-domains",
  "08-business-product",
  "09-meta-orchestration",
  "10-research-analysis",
] as const

// ── Source 2: Community skills catalog (416+ plugins) ───────────────────
export const MARKETPLACE_REPO = "jeremylongshore/claude-code-plugins-plus-skills"
export const MARKETPLACE_CATALOG_URL =
  `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/.claude-plugin/marketplace.extended.json`

// ── Source 3: VoltAgent curated agent skills ────────────────────────────
export const VOLTAGENT_SKILLS_REPO = "VoltAgent/awesome-agent-skills"
export const VOLTAGENT_SKILLS_API  = `https://api.github.com/repos/${VOLTAGENT_SKILLS_REPO}/contents`

// ── Source 4: ComposioHQ service integrations (1000+) ───────────────────
export const COMPOSIO_REPO = "ComposioHQ/awesome-claude-skills"
export const COMPOSIO_API  = `https://api.github.com/repos/${COMPOSIO_REPO}/contents`
export const COMPOSIO_RAW  = `https://raw.githubusercontent.com/${COMPOSIO_REPO}/master`

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

// ── Agent detection keywords ────────────────────────────────────────────

const AGENT_KEYWORDS = [
  "agent", "subagent", "sub-agent", "orchestrat", "multi-agent",
  "coordinator", "dispatcher", "workflow agent", "task routing",
  "agent system", "agent framework", "meta-agent",
]

/** Map agent keywords to VoltAgent category directories */
const AGENT_CATEGORY_MAP: Record<string, string> = {
  // Meta / orchestration
  "orchestrat": "09-meta-orchestration",
  "coordinator": "09-meta-orchestration",
  "dispatcher": "09-meta-orchestration",
  "multi-agent": "09-meta-orchestration",
  "meta-agent": "09-meta-orchestration",
  "task routing": "09-meta-orchestration",
  "workflow agent": "09-meta-orchestration",
  "workflow orchestrat": "09-meta-orchestration",

  // Core development
  "code review agent": "01-core-development",
  "api design": "01-core-development",
  "refactor": "01-core-development",

  // Language specialists
  "typescript agent": "02-language-specialists",
  "python agent": "02-language-specialists",
  "rust agent": "02-language-specialists",
  "go agent": "02-language-specialists",
  "java agent": "02-language-specialists",
  "powershell": "02-language-specialists",

  // Infrastructure
  "infra": "03-infrastructure",
  "devops agent": "03-infrastructure",
  "docker agent": "03-infrastructure",
  "kubernetes agent": "03-infrastructure",
  "cloud agent": "03-infrastructure",
  "azure agent": "03-infrastructure",
  "aws agent": "03-infrastructure",

  // Quality & security
  "security agent": "04-quality-security",
  "test agent": "04-quality-security",
  "qa agent": "04-quality-security",
  "audit agent": "04-quality-security",

  // Data & AI
  "data agent": "05-data-ai",
  "data pipeline": "05-data-ai",
  "data engineer": "05-data-ai",
  "ml agent": "05-data-ai",
  "ml pipeline": "05-data-ai",
  "ai agent": "05-data-ai",

  // Developer experience
  "dx agent": "06-developer-experience",
  "productivity agent": "06-developer-experience",
  "documentation agent": "06-developer-experience",

  // Specialized
  "domain agent": "07-specialized-domains",
  "iot agent": "07-specialized-domains",
  "embedded agent": "07-specialized-domains",

  // Business
  "business agent": "08-business-product",
  "product agent": "08-business-product",
  "pm agent": "08-business-product",

  // Research
  "research agent": "10-research-analysis",
  "analysis agent": "10-research-analysis",
}

/** Keyword-to-category mapping for classifying skill requests */
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

  // Communication
  "slack": "13-communication", "email": "13-communication", "notification": "13-communication",
  "discord": "13-communication", "telegram": "13-communication",

  // Content
  "content": "15-content-creation", "blog": "15-content-creation",
  "seo": "15-content-creation", "copywriting": "15-content-creation",

  // Productivity
  "productivity": "20-productivity", "automation": "20-productivity",
  "workflow": "20-productivity",
}

// ── Classification ──────────────────────────────────────────────────────

export interface ClassificationResult {
  categories: string[]
  saasMatches: string[]
  isAgent: boolean
  agentCategories: string[]
}

/** Detect whether the request is about agents/subagents/orchestration */
export function isAgentRequest(input: string): boolean {
  const lower = input.toLowerCase()
  return AGENT_KEYWORDS.some(kw => lower.includes(kw))
}

/** Map input to VoltAgent agent category directories */
export function matchAgentCategories(input: string): string[] {
  const lower = input.toLowerCase()
  const matched = new Set<string>()

  for (const [keyword, category] of Object.entries(AGENT_CATEGORY_MAP)) {
    if (lower.includes(keyword)) {
      matched.add(category)
    }
  }

  // Default to meta-orchestration for generic agent requests
  if (matched.size === 0 && isAgentRequest(input)) {
    matched.add("09-meta-orchestration")
  }

  return [...matched]
}

/** Classify a user request into marketplace categories and detect agent requests */
export function classifyRequest(input: string): ClassificationResult {
  const lower = input.toLowerCase()
  const categories = new Set<string>()
  const saasMatches: string[] = []

  // Check keyword matches for skills
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

  return {
    categories: [...categories],
    saasMatches,
    isAgent: isAgentRequest(input),
    agentCategories: matchAgentCategories(input),
  }
}

// ── Marketplace instruction builder ─────────────────────────────────────
// Implements Rule 6 (4-catalog exhaustion) and Rule 7 (3-stage fetch).
// Agent requests route to VoltAgent subagents first.
// Skill requests route to jeremylongshore → VoltAgent skills → ComposioHQ.

export function buildMarketplaceInstructions(input: string): string {
  const classification = classifyRequest(input)
  const { categories, saasMatches, isAgent: isAgentReq, agentCategories } = classification
  const categoryFilter = categories[0] ?? ""

  const lines: string[] = []
  lines.push(`## Marketplace — fully automated install (DO NOT ASK — JUST DO IT)`)
  lines.push(``)
  lines.push(`4 catalogs available. You MUST search them ALL in order before giving up.`)
  lines.push(`A fetch failure is NOT a stop condition — it is a routing signal to the next source.`)
  lines.push(`**DO NOT ask the user clarifying questions. Execute every command yourself.**`)
  lines.push(`**Rate-limit safe:** all api.github.com calls include GITHUB_TOKEN when set (5000/hr vs 60/hr).`)
  lines.push(`Downloads use raw.githubusercontent.com (no limit). For heavy usage (10+ installs/hr), set GITHUB_TOKEN.`)
  lines.push(``)

  if (isAgentReq || categories.length > 0 || saasMatches.length > 0) {
    lines.push(`### Classification for "${input}":`)
    if (isAgentReq) lines.push(`- **Type: AGENT** — routing to agent catalogs first`)
    for (const cat of agentCategories) lines.push(`- agent-category: ${cat}`)
    for (const cat of categories) lines.push(`- skill-category: ${cat}`)
    for (const saas of saasMatches) lines.push(`- SaaS: ${saas}`)
    lines.push(``)
  }

  // ── Universal resolution rules (applies to every catalog) ──────
  buildUniversalRulesBlock(lines)

  // ── Route based on request type ───────────────────────────────────
  if (isAgentReq) {
    buildAgentPipeline(lines, input, agentCategories, categoryFilter)
  } else {
    buildSkillPipeline(lines, input, categoryFilter, saasMatches)
  }

  // ── Install result format ─────────────────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`### Install result format`)
  lines.push(`After installing, confirm with one of:`)
  if (isAgentReq) {
    lines.push(`✅ Agent installed: .claude/agents/<name>.md — [one line: what it orchestrates]`)
    lines.push(`✅ Then add to CLAUDE.md agents section (separate from skills)`)
  } else {
    lines.push(`✅ Installed: .claude/skills/<name>/SKILL.md — [one line: what it does]`)
  }
  lines.push(`⏭ No match in [source] — moving to next catalog`)
  lines.push(`🔧 All 4 catalogs exhausted — created production-quality custom ${isAgentReq ? "agent" : "skill"}`)
  lines.push(``)

  return lines.join("\n")
}

// ── Agent pipeline (VoltAgent subagents → skills fallback) ──────────

function buildAgentPipeline(
  lines: string[],
  input: string,
  agentCategories: string[],
  categoryFilter: string,
): void {
  const safeName = input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const targetCategories = agentCategories.length > 0
    ? agentCategories
    : ["09-meta-orchestration"]

  // ── STEP 1: VoltAgent/awesome-claude-code-subagents ──────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 1 — VoltAgent subagents (PRIMARY source for agents — 127+ specialized agents)`)
  lines.push(``)
  lines.push(`This is the preferred source for anything agent-shaped. 10 categories, 127+ agents.`)
  lines.push(`If a match is found here, install to \`.claude/agents/\` (NOT .claude/skills/).`)
  lines.push(``)
  lines.push(`**1a. List agent files in the matched categories:**`)
  lines.push(`If any curl below fails, skip to the next category or STEP 2 immediately.`)
  lines.push(``)

  for (const cat of targetCategories) {
    lines.push(`\`\`\`bash`)
    lines.push(`# Category: ${cat}`)
    lines.push(`curl -sf \${GITHUB_TOKEN:+-H "Authorization: token \$GITHUB_TOKEN"} "${VOLTAGENT_SUBAGENTS_API}/${cat}" \\`)
    lines.push(`  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));` +
      `if(!Array.isArray(d)){console.log('SKIP');process.exit(0)}` +
      `d.filter(x=>x.name.endsWith('.md')&&x.name!=='README.md').forEach(x=>console.log(x.name))"`)
    lines.push(`\`\`\``)
    lines.push(``)
  }

  lines.push(`**1b. From the file list above, pick the BEST match for "${input}".**`)
  lines.push(`Match by name and relevance. If multiple candidates exist, pick the closest one.`)
  lines.push(``)
  lines.push(`**1c. Download the matched agent file (3-stage resolution — this is stage 3):**`)
  lines.push(`\`\`\`bash`)
  lines.push(`# Replace CATEGORY and AGENT_FILE with actual values from 1a/1b`)
  lines.push(`CATEGORY="${targetCategories[0]}"`)
  lines.push(`AGENT_FILE="matched-agent.md"`)
  lines.push(`mkdir -p ".claude/agents"`)
  lines.push(`curl -sf "${VOLTAGENT_SUBAGENTS_RAW}/\${CATEGORY}/\${AGENT_FILE}" \\`)
  lines.push(`  -o ".claude/agents/\${AGENT_FILE}"`)
  lines.push(`\`\`\``)
  lines.push(``)
  lines.push(`**1d. Verify the file has real content (Rule 7 — must not be empty):**`)
  lines.push(`\`\`\`bash`)
  lines.push(`# File must have frontmatter (---) and body content`)
  lines.push(`head -3 ".claude/agents/\${AGENT_FILE}"`)
  lines.push(`wc -l ".claude/agents/\${AGENT_FILE}"`)
  lines.push(`\`\`\``)
  lines.push(`If the file is empty or just frontmatter with no body: delete it, log the failure, continue to STEP 2.`)
  lines.push(`If the file has real content: agent is installed. Skip to "Install result format" below.`)
  lines.push(``)
  lines.push(`**README-driven fallback:** If a category listing returns a README.md instead of agent files,`)
  lines.push(`parse the README for entries with links. Entries may point to external repos — follow them`)
  lines.push(`using the universal URL resolution rules (extract {owner}/{repo} dynamically from the link).`)
  lines.push(`Navigate the foreign repo to locate the agent .md file and download it.`)
  lines.push(``)

  // ── STEP 2: jeremylongshore community skills (fallback for agents) ─
  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 2 — Community skills catalog (fallback — 416 plugins)`)
  lines.push(``)
  lines.push(`Only reach here if STEP 1 found no match.`)
  lines.push(`Search for agent-like skills in the community catalog.`)
  lines.push(`If curl fails, skip to STEP 3.`)
  lines.push(``)
  buildCommunitySkillsFetchBlock(lines, categoryFilter)

  // ── STEP 3: ComposioHQ (fallback for SaaS/integration agents) ─────
  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 3 — ComposioHQ service integrations (1000+ skills — fallback)`)
  lines.push(``)
  lines.push(`Only reach here if STEP 1 and 2 found no match.`)
  lines.push(`Strong for API and SaaS automation. Skills live in per-directory SKILL.md files.`)
  lines.push(`If curl fails, skip to STEP 4.`)
  lines.push(``)
  buildComposioFetchBlock(lines, input)

  // ── STEP 4: Create custom agent ───────────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 4 — All 3 catalogs exhausted. Create a production-quality custom agent.`)
  lines.push(``)
  lines.push(`You MUST have attempted all 3 sources above with real fetch calls before reaching here.`)
  lines.push(`The custom agent must be production-valid on first write (Rule 4). No placeholders.`)
  lines.push(``)
  lines.push(`\`\`\`bash`)
  lines.push(`mkdir -p ".claude/agents"`)
  lines.push(`\`\`\``)
  lines.push(`Then create \`.claude/agents/${safeName}.md\` with:`)
  lines.push(`\`\`\`yaml`)
  lines.push(`---`)
  lines.push(`name: ${safeName}`)
  lines.push(`description: "${input}"`)
  lines.push(`tools: Read, Write, Edit, Bash, Glob, Grep`)
  lines.push(`model: sonnet`)
  lines.push(`---`)
  lines.push(``)
  lines.push(`[Complete agent instructions — task routing, responsibilities, integration points]`)
  lines.push(`\`\`\``)
  lines.push(`The body must contain real, actionable agent instructions — not a template stub.`)
  lines.push(``)
}

// ── Skill pipeline (community → VoltAgent skills → ComposioHQ) ──────

function buildSkillPipeline(
  lines: string[],
  input: string,
  categoryFilter: string,
  saasMatches: string[],
): void {
  const safeName = input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  // ── STEP 1: Official Anthropic plugins ────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 1 — Official Anthropic plugins (always work, no schema errors)`)
  lines.push(``)
  lines.push(`Check if any of these 13 official plugins match the request:`)
  lines.push(`agent-sdk-dev, claude-opus-4-5-migration, code-review, commit-commands,`)
  lines.push(`explanatory-output-style, feature-dev, frontend-design, hookify, learning-output-style,`)
  lines.push(`plugin-dev, pr-review-toolkit, ralph-wiggum, security-guidance`)
  lines.push(``)
  lines.push(`If a name above matches "${input}": install with \`/plugin install <name>@claude-code-plugins\``)
  lines.push(`If no match, continue to STEP 2.`)
  lines.push(``)

  // ── STEP 2: jeremylongshore community skills ──────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 2 — Community skills catalog (jeremylongshore — 416 plugins)`)
  lines.push(``)
  lines.push(`NOTE: /plugin marketplace add FAILS for this repo (one entry has broken schema).`)
  lines.push(`Use the DIRECT FETCH approach below. If curl fails, skip to STEP 3.`)
  lines.push(``)
  buildCommunitySkillsFetchBlock(lines, categoryFilter)

  // ── STEP 3: VoltAgent curated skills ──────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 3 — VoltAgent curated agent skills (production-proven)`)
  lines.push(``)
  lines.push(`Only reach here if STEP 2 found no match.`)
  lines.push(`Curated real-world skills from engineering teams. If curl fails, skip to STEP 4.`)
  lines.push(``)
  lines.push(`\`\`\`bash`)
  lines.push(`curl -sf \${GITHUB_TOKEN:+-H "Authorization: token \$GITHUB_TOKEN"} "${VOLTAGENT_SKILLS_API}" \\`)
  lines.push(`  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));` +
    `if(!Array.isArray(d)){console.log('SKIP');process.exit(0)}` +
    `d.filter(x=>x.type==='dir'&&!x.name.startsWith('.')).forEach(x=>console.log(x.name))"`)
  lines.push(`\`\`\``)
  lines.push(`If any directory name matches "${input}", fetch its SKILL.md:`)
  lines.push(`\`\`\`bash`)
  lines.push(`SKILL_DIR="matched-skill"`)
  lines.push(`mkdir -p ".claude/skills/\${SKILL_DIR}"`)
  lines.push(`curl -sf "https://raw.githubusercontent.com/${VOLTAGENT_SKILLS_REPO}/main/\${SKILL_DIR}/SKILL.md" \\`)
  lines.push(`  -o ".claude/skills/\${SKILL_DIR}/SKILL.md"`)
  lines.push(`\`\`\``)
  lines.push(`Verify content is real (not empty). If empty, delete and continue.`)
  lines.push(``)
  lines.push(`**README-driven fallback:** If the API returns a single file (README.md) instead of a directory listing,`)
  lines.push(`parse its markdown sections for entries matching "${input}". Entries may link to external repos owned by`)
  lines.push(`different authors — follow those links using the universal URL resolution rules above (extract {owner}/{repo}`)
  lines.push(`dynamically, never hardcode). Navigate the foreign repo to find the installable .md file and download it.`)
  lines.push(``)

  // ── STEP 4: ComposioHQ service integrations ───────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 4 — ComposioHQ service integrations (1000+ skills)`)
  lines.push(``)
  lines.push(`Only reach here if STEPs 2+3 found no match.`)
  lines.push(`Strong for API/SaaS automation: Gmail, Slack, GitHub, Notion, Stripe, Shopify, etc.`)
  lines.push(`If curl fails, skip to STEP 5.`)
  lines.push(``)
  buildComposioFetchBlock(lines, input)

  // ── STEP 5: Create custom skill ───────────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`### STEP 5 — All 4 catalogs exhausted. Create a production-quality custom skill.`)
  lines.push(``)
  lines.push(`You MUST have attempted all 4 sources above with real fetch calls before reaching here.`)
  lines.push(`The custom skill must be production-valid on first write (Rule 4). No placeholders.`)
  lines.push(``)
  lines.push(`\`\`\`bash`)
  lines.push(`mkdir -p ".claude/skills/${safeName}"`)
  lines.push(`\`\`\``)
  lines.push(`Then create \`.claude/skills/${safeName}/SKILL.md\` with:`)
  lines.push(`\`\`\`yaml`)
  lines.push(`---`)
  lines.push(`name: ${safeName}`)
  lines.push(`description: "${input}"`)
  lines.push(`---`)
  lines.push(``)
  lines.push(`[Complete skill instructions — not a stub. Must work on first use.]`)
  lines.push(`\`\`\``)
  lines.push(``)
}

// ── Universal catalog resolution rules (applies to all sources) ─────────

function buildUniversalRulesBlock(lines: string[]): void {
  lines.push(`### Universal catalog resolution rules`)
  lines.push(``)
  lines.push(`These rules apply to EVERY source below. Read them first.`)
  lines.push(``)
  lines.push(`**1. Catalog shape detection — detect before processing:**`)
  lines.push(`When you fetch a catalog endpoint, the response determines your strategy:`)
  lines.push(`- **JSON catalog**: valid JSON with a structured list (array of objects with name/source/description). Filter by relevance, navigate source paths, download.`)
  lines.push(`- **README-driven catalog**: markdown organized into sections with headings. Each entry has a name, description, and a link — but that link may point to a **completely different external repository**. Parse sections, collect entries, follow external links.`)
  lines.push(`- **Directory listing**: GitHub API array with "type"/"name"/"download_url" fields. List entries, match by name, download via raw URL.`)
  lines.push(`Detect the shape first. Never assume one format.`)
  lines.push(``)
  lines.push(`**2. Universal GitHub URL resolution — works for ANY repo, ANY author:**`)
  lines.push(`Convert any GitHub URL to a downloadable form by extracting {owner}, {repo}, {branch}, {path} dynamically:`)
  lines.push(`- \`github.com/{owner}/{repo}/tree/{branch}/{path}\` → \`https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}\``)
  lines.push(`- \`github.com/{owner}/{repo}/blob/{branch}/{path}\` → \`https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}\``)
  lines.push(`- Directory URL → list via \`https://api.github.com/repos/{owner}/{repo}/contents/{path}\`, then download individual files`)
  lines.push(`**Never hardcode a specific owner or repo in the resolution logic.** Always derive them dynamically from whatever link the catalog provides.`)
  lines.push(``)
  lines.push(`**3. README-driven external link navigation:**`)
  lines.push(`When a catalog entry links to an external repository (different {owner}/{repo}):`)
  lines.push(`1. Extract {owner}/{repo} from the link URL`)
  lines.push(`2. Resolve to the raw file or directory listing in that foreign repo`)
  lines.push(`3. If it points to a directory, list contents via API to find the installable .md file`)
  lines.push(`4. Download from the foreign repo using universal resolution above`)
  lines.push(`The catalog is just a curated map — the real content lives in the external repo.`)
  lines.push(``)
  lines.push(`**4. Candidate scoring — compare before choosing:**`)
  lines.push(`When multiple candidates match, score each on three axes:`)
  lines.push(`- **Relevance** (highest weight): does the description directly address the request?`)
  lines.push(`- **Scope**: is it surgical and focused, or a kitchen-sink tool? Prefer focused — lower cost, easier to reason about.`)
  lines.push(`- **Uniqueness**: does it duplicate something already installed in .claude/skills/ or .claude/agents/? Deprioritize duplicates.`)
  lines.push(`Install only the highest-scoring candidate. One high-quality tool per task.`)
  lines.push(``)
  lines.push(`**5. Content verification — never keep stubs:**`)
  lines.push(`After downloading any file, verify ALL of these before accepting:`)
  lines.push(`- Not empty (0 bytes)`)
  lines.push(`- Not only YAML frontmatter with no body (just \`---\\nname: x\\n---\` and nothing after)`)
  lines.push(`- Contains at least 50 characters of instruction content after frontmatter`)
  lines.push(`If verification fails: delete the file, log which source/candidate failed, continue to next candidate or next STEP.`)
  lines.push(``)
}

// ── Shared fetch blocks ─────────────────────────────────────────────────

function buildCommunitySkillsFetchBlock(lines: string[], categoryFilter: string): void {
  lines.push(`**Stage 1 — Fetch catalog and find matching plugin:**`)
  lines.push(`\`\`\`bash`)
  lines.push(`curl -sf "${MARKETPLACE_CATALOG_URL}" \\`)
  lines.push(`  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));` +
    `const q='${categoryFilter}';` +
    `const r=d.plugins.filter(p=>(q===''||p.category.includes(q))&&p.name&&p.source).slice(0,10)` +
    `.map(p=>({name:p.name,source:p.source,desc:p.description}));` +
    `console.log(JSON.stringify(r,null,2));"`)
  lines.push(`\`\`\``)
  lines.push(`If this returns an error or empty array, skip to the next STEP.`)
  lines.push(``)
  lines.push(`**Stage 2 — Score candidates and pick the best match (see rule 4: Relevance > Scope > Uniqueness):**`)
  lines.push(`\`\`\`bash`)
  lines.push(`# Replace PLUGIN_SOURCE_PATH with the "source" value from Stage 1`)
  lines.push(`PLUGIN_SOURCE_PATH="plugins/category/plugin-name"`)
  lines.push(`curl -sf \${GITHUB_TOKEN:+-H "Authorization: token \$GITHUB_TOKEN"} "https://api.github.com/repos/${MARKETPLACE_REPO}/contents/\${PLUGIN_SOURCE_PATH}/skills" \\`)
  lines.push(`  | node -e "const a=JSON.parse(require('fs').readFileSync(0,'utf8'));` +
    `if(!Array.isArray(a)){console.log('NO_SKILLS_DIR');process.exit(0)}` +
    `a.forEach(x=>console.log(x.name))"`)
  lines.push(`\`\`\``)
  lines.push(`If this fails or shows NO_SKILLS_DIR, the plugin has no installable skills — skip.`)
  lines.push(``)
  lines.push(`**Stage 3 — Download each skill file and install:**`)
  lines.push(`\`\`\`bash`)
  lines.push(`# Replace PLUGIN_SOURCE_PATH and SKILL_NAME with actual values`)
  lines.push(`PLUGIN_SOURCE_PATH="plugins/category/plugin-name"`)
  lines.push(`SKILL_NAME="skill-directory-name"`)
  lines.push(`mkdir -p ".claude/skills/\${SKILL_NAME}"`)
  lines.push(`curl -sf "https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/\${PLUGIN_SOURCE_PATH}/skills/\${SKILL_NAME}/SKILL.md" \\`)
  lines.push(`  -o ".claude/skills/\${SKILL_NAME}/SKILL.md"`)
  lines.push(`\`\`\``)
  lines.push(`Verify the file has real content (not empty, not just frontmatter). If empty: delete and move on.`)
  lines.push(``)
}

function buildComposioFetchBlock(lines: string[], input: string): void {
  lines.push(`**Stage 1 — List available skill directories:**`)
  lines.push(`\`\`\`bash`)
  lines.push(`curl -sf \${GITHUB_TOKEN:+-H "Authorization: token \$GITHUB_TOKEN"} "${COMPOSIO_API}" \\`)
  lines.push(`  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));` +
    `if(!Array.isArray(d)){console.log('SKIP');process.exit(0)}` +
    `d.filter(x=>x.type==='dir'&&!x.name.startsWith('.')).forEach(x=>console.log(x.name))"`)
  lines.push(`\`\`\``)
  lines.push(``)
  lines.push(`**Stage 2 — Pick the directory that best matches "${input}":**`)
  lines.push(`Match by name similarity. If no directory name is relevant, skip.`)
  lines.push(``)
  lines.push(`**Stage 3 — Download the SKILL.md from the matched directory:**`)
  lines.push(`\`\`\`bash`)
  lines.push(`SKILL_DIR="matched-directory"`)
  lines.push(`mkdir -p ".claude/skills/\${SKILL_DIR}"`)
  lines.push(`curl -sf "${COMPOSIO_RAW}/\${SKILL_DIR}/SKILL.md" \\`)
  lines.push(`  -o ".claude/skills/\${SKILL_DIR}/SKILL.md"`)
  lines.push(`\`\`\``)
  lines.push(`Verify the file has real content (rule 5 above). If empty: delete and move on.`)
  lines.push(``)
  lines.push(`**README-driven fallback:** If the directory listing above fails or returns unexpected content,`)
  lines.push(`fetch the repo's README.md and parse it for sections matching "${input}":`)
  lines.push(`\`\`\`bash`)
  lines.push(`# Derive owner/repo dynamically from the catalog source — never hardcode`)
  lines.push(`curl -sf "https://raw.githubusercontent.com/${COMPOSIO_REPO}/master/README.md" | head -300`)
  lines.push(`\`\`\``)
  lines.push(`Scan sections for entries with external links. Follow those links using universal URL resolution`)
  lines.push(`(rule 2+3 above) to download from the linked repo, regardless of its owner.`)
  lines.push(``)
}
