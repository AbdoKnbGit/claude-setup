/**
 * marketplace-catalog.ts  — v2
 *
 * Pre-built, category-indexed catalog. All URLs verified against actual repo structures:
 *
 * SOURCE 1 — VoltAgent/awesome-claude-code-subagents (127+ agents)
 *   URL: https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/categories/{cat}/{file}.md
 *
 * SOURCE 2 — jeremylongshore/claude-code-plugins-plus-skills (340 plugins, 1367 skills)
 *   URL: https://raw.githubusercontent.com/jeremylongshore/claude-code-plugins-plus-skills/main/plugins/{cat}/{plugin}/skills/{skill}/SKILL.md
 *   Standalone skills: .../skills/{skill}/SKILL.md (500 standalone at /skills root)
 *
 * SOURCE 3 — ComposioHQ/awesome-claude-skills (100+ skills)
 *   Root skills: https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/{skill-name}/SKILL.md
 *   SaaS automations: .../composio-skills/{app}-automation/SKILL.md
 *   Document skills: .../document-skills/{type}/SKILL.md
 *
 * SOURCE 4 — Anthropic official plugins (installed via /plugin install)
 */

import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { MarketplaceCatalog, CatalogItem, CatalogQueryResult, ScoredItem } from "./marketplace-types.js"
import { classifyRequest, isAgentRequest } from "./marketplace.js"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const CATALOG_PATH = join(__dirname, "..", "data", "marketplace-catalog.json")

const VA = "https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/categories"
const JL = "https://raw.githubusercontent.com/jeremylongshore/claude-code-plugins-plus-skills/main"
const CX = "https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master"

// ── Category taxonomy ───────────────────────────────────────────────────
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "code-quality": ["lint", "format", "prettier", "eslint", "code quality", "style", "clean code", "code review", "refactor", "anti-pattern"],
  "testing": ["test", "jest", "vitest", "playwright", "cypress", "e2e", "unit test", "integration test", "tdd", "qa", "quality assurance", "bdd", "coverage"],
  "security": ["security", "auth", "authentication", "oauth", "jwt", "encryption", "owasp", "vulnerability", "cve", "pentest", "penetration", "audit", "secrets", "xss", "injection", "hardening", "compliance", "sigma", "forensics"],
  "devops": ["devops", "ci", "cd", "docker", "kubernetes", "k8s", "deploy", "infrastructure", "terraform", "ansible", "helm", "pipeline", "github actions", "circleci", "gitops", "sre", "argocd"],
  "api": ["api", "rest", "graphql", "swagger", "openapi", "grpc", "webhook", "endpoint", "postman"],
  "database": ["database", "sql", "postgres", "mysql", "mongodb", "redis", "prisma", "orm", "migration", "schema", "query", "sqlite", "supabase", "nosql", "sharding"],
  "frontend": ["frontend", "react", "vue", "svelte", "angular", "css", "tailwind", "ui", "component", "nextjs", "nuxt", "html", "typescript", "design system", "a11y", "accessibility"],
  "backend": ["backend", "express", "fastapi", "django", "spring", "nestjs", "laravel", "rails", "server", "node", "golang", "rust", "java", "csharp", "dotnet", "php"],
  "mobile": ["mobile", "react native", "flutter", "ios", "android", "swift", "kotlin", "expo", "swiftui", "compose"],
  "data-science": ["data", "ml", "machine learning", "pandas", "numpy", "jupyter", "pytorch", "tensorflow", "scikit", "analytics", "data pipeline", "etl", "elt", "dbt", "airflow", "spark"],
  "documentation": ["docs", "documentation", "readme", "jsdoc", "typedoc", "wiki", "openapi spec", "technical writing", "changelog", "adr", "runbook"],
  "git": ["git", "github", "gitlab", "pull request", "commit", "branch", "merge", "bitbucket", "worktree", "gitops", "gitflow"],
  "orchestration": ["orchestrat", "coordinator", "dispatcher", "multi-agent", "task routing", "workflow agent", "subagent", "agentic", "agent system", "multi agent"],
  "research": ["research", "analysis", "report", "survey", "compare", "summarize", "literature", "market research", "competitive", "intelligence"],
  "crm": ["crm", "salesforce", "hubspot", "pipedrive", "zoho", "close crm", "customer relationship", "lead", "opportunity", "deal", "contact"],
  "project-management": ["project management", "agile", "sprint", "kanban", "scrum", "jira", "milestone", "planning", "asana", "clickup", "linear", "monday", "basecamp", "notion", "confluence", "trello"],
  "communication": ["slack", "email", "notification", "discord", "telegram", "teams", "chat", "messaging", "internal comms", "newsletter", "broadcast"],
  "email-marketing": ["email marketing", "newsletter", "mailchimp", "convertkit", "brevo", "activecampaign", "campaign", "drip", "sendgrid", "sendinblue"],
  "payment": ["payment", "stripe", "paypal", "billing", "checkout", "subscription", "invoice", "mpesa", "daraja", "fintech", "pci"],
  "cloud": ["cloud", "aws", "azure", "gcp", "s3", "lambda", "ec2", "cloudflare", "vercel", "fly.io", "heroku", "digitalocean", "lightsail"],
  "monitoring": ["monitoring", "observability", "logging", "metrics", "alerting", "grafana", "prometheus", "datadog", "sentry", "posthog", "amplitude", "mixpanel", "langsmith", "traces"],
  "design": ["design", "figma", "canva", "lucidchart", "ui design", "graphic design", "brand", "visual", "diagram", "mockup", "illustration"],
  "analytics": ["analytics", "amplitude", "mixpanel", "posthog", "segment", "gtm", "google analytics", "tracking", "funnel", "retention", "cohort"],
  "scheduling": ["scheduling", "calendar", "calendly", "cal.com", "appointment", "meeting", "booking", "availability"],
  "file-storage": ["file", "storage", "drive", "dropbox", "box", "s3", "blob", "upload", "download", "attachment"],
  "hr": ["hr", "human resources", "bamboohr", "payroll", "employee", "recruitment", "onboarding", "offboarding", "pto"],
  "legal": ["legal", "contract", "docusign", "compliance", "gdpr", "terms", "policy", "e-signature", "esign", "envelope"],
  "content": ["content", "blog", "seo", "copywriting", "marketing", "social media", "twitter", "linkedin", "writing"],
  "productivity": ["productivity", "automation", "workflow", "zapier", "make", "n8n", "task", "todo", "ccpi"],
  "ai-ml": ["ai", "llm", "gpt", "claude", "openai", "langchain", "langgraph", "embeddings", "vector", "rag", "prompt engineering", "mlops", "mcp", "fine-tuning", "evaluation"],
  "documents": ["word", "excel", "powerpoint", "docx", "xlsx", "pptx", "pdf", "spreadsheet", "presentation", "document", "office"],
}

export const VA_CATEGORIES: Record<string, string> = {
  "code-quality": "01-core-development", "testing": "04-quality-security", "security": "04-quality-security",
  "devops": "03-infrastructure", "api": "01-core-development", "database": "07-specialized-domains",
  "frontend": "02-language-specialists", "backend": "02-language-specialists", "mobile": "02-language-specialists",
  "data-science": "05-data-ai", "documentation": "06-developer-experience", "orchestration": "09-meta-orchestration",
  "research": "10-research-analysis", "project-management": "08-business-product", "ai-ml": "05-data-ai",
}

export function loadCatalog(): MarketplaceCatalog {
  if (existsSync(CATALOG_PATH)) {
    try {
      const raw = readFileSync(CATALOG_PATH, "utf-8")
      const parsed = JSON.parse(raw) as MarketplaceCatalog
      if (parsed.version && Array.isArray(parsed.items) && parsed.items.length > 0) return parsed
    } catch { /**/ }
  }
  return SEED_CATALOG
}

// ── Synonym expansion — maps user intent words to canonical keywords ─────
// "apple phone test" → expands to include "ios", "iphone", "simulator" etc.
export const SYNONYM_MAP: Record<string, string[]> = {
  // Mobile / platform
  "apple": ["ios", "iphone", "ipad", "xcode", "swift", "swiftui", "simulator", "macos"],
  "iphone": ["ios", "apple", "simulator", "xcode", "swift", "mobile"],
  "phone": ["mobile", "ios", "android", "iphone", "simulator"],
  "ios": ["iphone", "apple", "xcode", "swift", "simulator", "mobile"],
  "android": ["kotlin", "gradle", "mobile", "apk", "phone"],
  "mobile": ["ios", "android", "iphone", "phone", "react native", "flutter"],
  // Testing & debugging
  "test": ["testing", "debug", "qa", "verify", "check", "playwright", "jest"],
  "debug": ["testing", "debug", "troubleshoot", "fix", "trace", "breakpoint"],
  "simulate": ["simulator", "emulator", "mock", "test"],
  "emulate": ["simulator", "emulator", "virtual"],
  // Data & analytics
  "database": ["sql", "postgres", "mysql", "sqlite", "db", "query", "schema"],
  "chart": ["visualization", "d3", "graph", "plot", "data"],
  "csv": ["spreadsheet", "data", "excel", "table", "import"],
  // Content creation
  "resume": ["cv", "job", "career", "application", "hire"],
  "blog": ["article", "content", "writing", "post", "seo"],
  "domain": ["url", "website", "dns", "tld", "name"],
  // Video & media
  "video": ["youtube", "mp4", "download", "stream", "yt"],
  "youtube": ["video", "yt", "download", "mp4", "mp3"],
  "image": ["photo", "picture", "screenshot", "png", "jpg", "enhance"],
  "gif": ["animation", "animated", "meme", "reaction"],
  // Communication
  "email": ["mail", "gmail", "inbox", "newsletter", "smtp"],
  "chat": ["slack", "discord", "teams", "messaging"],
  // DevOps & deployment
  "deploy": ["ship", "release", "ci", "cd", "pipeline", "production"],
  "container": ["docker", "kubernetes", "k8s", "pod"],
  // Security
  "forensics": ["forensic", "investigation", "disk", "evidence", "imaging"],
  "hack": ["pentest", "penetration", "security", "exploit", "vulnerability", "fuzzing"],
  "fuzz": ["fuzzing", "fuzz", "ffuf", "security", "vulnerability"],
  // Productivity
  "workflow": ["automation", "n8n", "zapier", "pipeline", "process"],
  "organize": ["file", "sort", "categorize", "cleanup", "tidy"],
  // Research
  "research": ["investigate", "analyze", "study", "survey", "explore"],
  "genealogy": ["family", "ancestors", "history", "tree", "heritage"],
  "family": ["genealogy", "ancestors", "relatives", "heritage"],
  // AI & coding
  "prompt": ["prompting", "prompt engineering", "few-shot", "chain-of-thought"],
  "architect": ["architecture", "ddd", "hexagonal", "design pattern", "layered"],
  // Document formats
  "ebook": ["epub", "kindle", "book", "mobi"],
  "epub": ["ebook", "book", "kindle", "markdown"],
  "podcast": ["audio", "notebooklm", "listen", "episode"],
  "slide": ["presentation", "powerpoint", "pptx", "deck"],
  // SaaS / specific tools
  "reddit": ["subreddit", "post", "comment", "thread"],
  "aws": ["amazon", "s3", "lambda", "cdk", "serverless", "cloud"],
  "google": ["workspace", "drive", "docs", "sheets", "gmail"],
  "twitter": ["x", "tweet", "social", "timeline"],
  "raffle": ["giveaway", "winner", "random", "contest", "prize", "lottery"],
}

// Given user input words, expand them with synonym-mapped terms
export function expandWithSynonyms(words: string[]): string[] {
  const expanded = new Set(words)
  for (const w of words) {
    const syns = SYNONYM_MAP[w]
    if (syns) for (const s of syns) expanded.add(s)
    // Reverse lookup: if any synonym group contains this word, add the group key
    for (const [key, vals] of Object.entries(SYNONYM_MAP)) {
      if (vals.includes(w)) expanded.add(key)
    }
  }
  return [...expanded]
}

// ── Seed catalog ─────────────────────────────────────────────────────────
function va(id: string, name: string, desc: string, cats: string[], dir: string, file: string, tags: string[]): CatalogItem {
  return { id: `va-${id}`, name, description: desc, type: "agent", source: "voltagent-agents", categories: cats, directUrl: `${VA}/${dir}/${file}.md`, installPath: `.claude/agents/${file}.md`, tags }
}
function cx(id: string, name: string, desc: string, cats: string[], dir: string, tags: string[]): CatalogItem {
  const installDir = dir.includes("/") ? dir.split("/").pop()! : dir
  return { id: `cx-${id}`, name, description: desc, type: "skill", source: "composio", categories: cats, directUrl: `${CX}/${dir}/SKILL.md`, installPath: `.claude/skills/${installDir}/SKILL.md`, tags }
}
/** External-repo community skill (hosted outside ComposioHQ — e.g. conorluddy/ios-simulator-skill) */
function cxExt(id: string, name: string, desc: string, cats: string[], repo: string, branch: string, path: string, tags: string[]): CatalogItem {
  const skillDir = id
  const fullPath = path ? `${path}/` : ""
  return { id: `cx-${id}`, name, description: desc, type: "skill", source: "community", categories: cats, directUrl: `https://raw.githubusercontent.com/${repo}/${branch}/${fullPath}SKILL.md`, installPath: `.claude/skills/${skillDir}/SKILL.md`, tags }
}
function jl(id: string, name: string, desc: string, cats: string[], pluginPath: string, skillName: string, tags: string[]): CatalogItem {
  return { id: `jl-${id}`, name, description: desc, type: "skill", source: "community", categories: cats, directUrl: `${JL}/${pluginPath}/skills/${skillName}/SKILL.md`, installPath: `.claude/skills/${skillName}/SKILL.md`, tags }
}
function ant(id: string, name: string, desc: string, cats: string[], slug: string, tags: string[]): CatalogItem {
  return { id: `ant-${id}`, name, description: desc, type: "plugin", source: "anthropic", categories: cats, directUrl: `${slug}@claude-code-plugins`, installPath: `.claude/skills/${slug}/SKILL.md`, tags }
}

export const SEED_CATALOG: MarketplaceCatalog = {
  version: "2.1.0",
  builtAt: "2026-03-31T12:30:00Z",
  items: [
    // ── VoltAgent 01: Core Development ────────────────────────────────
    va("api-designer", "API designer", "REST & GraphQL API architect — OpenAPI spec, versioning, rate limiting, pagination", ["api", "backend"], "01-core-development", "api-designer", ["api", "rest", "graphql", "openapi", "versioning"]),
    va("backend-developer", "Backend developer", "Server-side expert — Node, Python, Java, Go, databases, caching, auth flows", ["backend", "api"], "01-core-development", "backend-developer", ["backend", "node", "python", "java", "go", "api"]),
    va("fullstack-developer", "Full-stack developer", "End-to-end feature development — frontend, backend, DB schema, deployment", ["frontend", "backend"], "01-core-development", "fullstack-developer", ["fullstack", "react", "node", "postgres"]),
    va("frontend-developer", "Frontend developer", "UI/UX specialist — React, Vue, Angular, CSS, accessibility, state management", ["frontend"], "01-core-development", "frontend-developer", ["frontend", "react", "vue", "angular", "css", "a11y"]),
    va("graphql-architect", "GraphQL architect", "GraphQL schema & federation — resolvers, subscriptions, DataLoader, persisted queries", ["api"], "01-core-development", "graphql-architect", ["graphql", "schema", "federation", "resolver", "dataloader"]),
    va("microservices-arch", "Microservices architect", "Distributed systems — service mesh, event bus, saga, CQRS, API gateway, observability", ["backend", "devops"], "01-core-development", "microservices-architect", ["microservices", "distributed", "cqrs", "saga", "kafka", "mesh"]),
    va("websocket-engineer", "WebSocket engineer", "Real-time communication — WebSocket, SSE, MQTT, Socket.io, pub/sub", ["backend", "api"], "01-core-development", "websocket-engineer", ["websocket", "realtime", "sse", "socket", "mqtt", "pubsub"]),
    va("mobile-developer", "Mobile developer", "Cross-platform mobile — React Native, Flutter, Expo, native APIs, push notifications", ["mobile"], "01-core-development", "mobile-developer", ["mobile", "react-native", "flutter", "expo", "push"]),
    va("electron-pro", "Electron expert", "Desktop apps — Electron, Tauri, IPC, auto-update, code signing, packaging", ["frontend"], "01-core-development", "electron-pro", ["electron", "tauri", "desktop", "ipc", "auto-update"]),
    va("ui-designer", "UI designer", "Visual design & interaction — design systems, Figma, motion, dark mode, tokens", ["frontend", "design"], "01-core-development", "ui-designer", ["design", "figma", "ui", "motion", "tokens", "dark-mode"]),

    // ── VoltAgent 02: Language Specialists ───────────────────────────
    va("typescript-pro", "TypeScript specialist", "Strict types, generics, conditional types, decorators, declaration files, Zod", ["frontend", "backend"], "02-language-specialists", "typescript-pro", ["typescript", "generics", "zod", "types", "strict"]),
    va("python-pro", "Python master", "FastAPI, Django, asyncio, type hints, packaging, testing, mypy, ruff", ["backend", "data-science"], "02-language-specialists", "python-pro", ["python", "fastapi", "django", "asyncio", "pytest", "mypy"]),
    va("golang-pro", "Go concurrency specialist", "Goroutines, channels, interfaces, stdlib, gRPC, performance profiling", ["backend"], "02-language-specialists", "golang-pro", ["go", "golang", "goroutine", "grpc", "channel", "concurrency"]),
    va("rust-engineer", "Rust systems engineer", "Ownership, lifetimes, traits, async/await, embedded, WASM, unsafe", ["backend"], "02-language-specialists", "rust-engineer", ["rust", "ownership", "wasm", "embedded", "unsafe", "lifetime"]),
    va("java-architect", "Java architect", "Enterprise Java — Spring Boot, JPA, Kafka, microservices, virtual threads, GraalVM", ["backend"], "02-language-specialists", "java-architect", ["java", "spring", "jpa", "kafka", "maven", "gradle", "graalvm"]),
    va("spring-boot", "Spring Boot engineer", "Spring Boot 3 / Java 21 — Security, Actuator, Data JPA, WebFlux, GraalVM native", ["backend"], "02-language-specialists", "spring-boot-engineer", ["spring", "springboot", "security", "jpa", "webflux", "native"]),
    va("csharp-developer", "C# / .NET specialist", ".NET 8 — ASP.NET Core, EF Core, Blazor, SignalR, minimal APIs, gRPC", ["backend", "frontend"], "02-language-specialists", "csharp-developer", ["csharp", "dotnet", "aspnet", "ef", "blazor", "signalr"]),
    va("dotnet-core", "ASP.NET Core expert", ".NET 8 cross-platform — minimal APIs, Orleans, native AOT, source generators", ["backend"], "02-language-specialists", "dotnet-core-expert", ["dotnet", "aspnetcore", "grpc", "orleans", "native-aot"]),
    va("react-specialist", "React 18 specialist", "Hooks, concurrent, Server Components, Zustand, TanStack Query, Remix", ["frontend"], "02-language-specialists", "react-specialist", ["react", "hooks", "zustand", "rsc", "nextjs", "tanstack"]),
    va("nextjs-developer", "Next.js developer", "Next.js 14+ App Router, RSC, ISR, Turbopack, Vercel, edge runtime", ["frontend"], "02-language-specialists", "nextjs-developer", ["nextjs", "app-router", "rsc", "vercel", "turbopack", "ssr"]),
    va("vue-expert", "Vue 3 expert", "Composition API, Pinia, Nuxt 3, Vite, TypeScript, Vitest, SSR", ["frontend"], "02-language-specialists", "vue-expert", ["vue", "composition", "pinia", "nuxt", "vite", "vitest"]),
    va("flutter-expert", "Flutter specialist", "Flutter 3+ — Bloc, Riverpod, platform channels, Flavor builds, CI/CD", ["mobile"], "02-language-specialists", "flutter-expert", ["flutter", "dart", "bloc", "riverpod", "mobile", "flavor"]),
    va("kotlin-specialist", "Kotlin specialist", "Kotlin — coroutines, Ktor, Android Jetpack, Compose, KMM, Coroutine flows", ["mobile", "backend"], "02-language-specialists", "kotlin-specialist", ["kotlin", "coroutines", "ktor", "android", "compose", "kmm"]),
    va("swift-expert", "Swift / iOS expert", "SwiftUI, Combine, CloudKit, Core Data, StoreKit, App Store review", ["mobile"], "02-language-specialists", "swift-expert", ["swift", "swiftui", "ios", "macos", "combine", "cloudkit"]),
    va("php-pro", "PHP developer", "PHP 8.3, Symfony, Laravel, Composer, PHPUnit, type declarations, fibers", ["backend"], "02-language-specialists", "php-pro", ["php", "laravel", "symfony", "composer", "phpunit"]),
    va("laravel-specialist", "Laravel specialist", "Laravel 10+ — Eloquent, queues, broadcasting, Nova, Forge, Vapor", ["backend"], "02-language-specialists", "laravel-specialist", ["laravel", "eloquent", "queue", "broadcast", "vapor"]),
    va("fastapi", "FastAPI developer", "Pydantic v2, SQLModel, OAuth2, WebSocket, background tasks, OpenAPI", ["backend", "api"], "02-language-specialists", "fastapi-developer", ["fastapi", "pydantic", "async", "python", "websocket"]),
    va("django", "Django developer", "Django 4+ — DRF, Celery, Channels, Wagtail, multi-tenancy, permissions", ["backend"], "02-language-specialists", "django-developer", ["django", "drf", "celery", "channels", "wagtail"]),
    va("rails", "Rails expert", "Rails 8.1 — Hotwire, Turbo, Solid Queue, Kamal, Rubocop, RSpec, Minitest", ["backend"], "02-language-specialists", "rails-expert", ["rails", "ruby", "hotwire", "turbo", "rspec", "kamal"]),
    va("sql-pro", "SQL expert", "Complex queries — window functions, CTEs, indexes, EXPLAIN plans, query optimization", ["database"], "02-language-specialists", "sql-pro", ["sql", "window", "cte", "index", "explain", "optimize"]),
    va("angular", "Angular architect", "Angular 17+ — signals, standalone, Nx monorepo, RxJS, NgRx, testing", ["frontend"], "02-language-specialists", "angular-architect", ["angular", "rxjs", "nx", "signals", "ngrx", "standalone"]),
    va("expo-rn", "Expo / React Native expert", "Expo SDK, EAS build/submit, over-the-air updates, native modules", ["mobile"], "02-language-specialists", "expo-react-native-expert", ["expo", "react-native", "eas", "ota", "native-modules"]),
    va("js-pro", "JavaScript developer", "Modern JS — ES2024, modules, workers, Streams API, patterns, performance", ["frontend", "backend"], "02-language-specialists", "javascript-pro", ["javascript", "es2024", "worker", "streams", "modules"]),
    va("powershell-7", "PowerShell 7 expert", "Cross-platform PS 7+ — REST APIs, SSH, parallel foreach, classes, Pester", ["backend", "devops"], "02-language-specialists", "powershell-7-expert", ["powershell", "ps7", "rest", "ssh", "pester", "parallel"]),

    // ── VoltAgent 03: Infrastructure ─────────────────────────────────
    va("cloud-architect", "Cloud architect", "AWS/GCP/Azure — VPC, IAM, Lambda, ECS/EKS, RDS, cost optimization, Well-Architected", ["cloud", "devops"], "03-infrastructure", "cloud-architect", ["aws", "gcp", "azure", "vpc", "iam", "lambda"]),
    va("devops-engineer", "DevOps engineer", "CI/CD — GitHub Actions, GitLab CI, Jenkins, ArgoCD, Tekton, GitOps", ["devops"], "03-infrastructure", "devops-engineer", ["devops", "cicd", "github-actions", "jenkins", "argocd"]),
    va("kubernetes", "Kubernetes specialist", "Helm, Kustomize, RBAC, HPA/VPA, service mesh, GitOps with ArgoCD/Flux", ["devops", "cloud"], "03-infrastructure", "kubernetes-specialist", ["k8s", "helm", "rbac", "hpa", "argocd", "flux", "istio"]),
    va("docker-expert", "Docker expert", "Multi-stage builds, BuildKit, Compose, registries, layer caching, Dive, Trivy", ["devops"], "03-infrastructure", "docker-expert", ["docker", "compose", "dockerfile", "buildkit", "trivy", "dive"]),
    va("terraform-engineer", "Terraform engineer", "IaC — modules, workspaces, state management, drift detection, Atlantis", ["devops", "cloud"], "03-infrastructure", "terraform-engineer", ["terraform", "iac", "module", "workspace", "state", "atlantis"]),
    va("terragrunt", "Terragrunt expert", "DRY IaC orchestration — multiple environments, remote state, dependencies", ["devops", "cloud"], "03-infrastructure", "terragrunt-expert", ["terragrunt", "terraform", "dry", "environment", "remote-state"]),
    va("database-admin", "Database administrator", "Backup, replication, sharding, VACUUM, query plans, connection pooling", ["database"], "03-infrastructure", "database-administrator", ["dba", "postgres", "mysql", "backup", "replication", "sharding"]),
    va("security-infra", "Infrastructure security engineer", "Hardening, secrets management, IAM, network policies, SAST, CVE patching", ["security", "cloud"], "03-infrastructure", "security-engineer", ["security", "hardening", "secrets", "iam", "sast", "cve"]),
    va("sre", "SRE engineer", "SLOs, error budgets, runbooks, on-call, incident response, chaos engineering", ["devops", "monitoring"], "03-infrastructure", "sre-engineer", ["sre", "slo", "incident", "runbook", "oncall", "chaos"]),
    va("deployment-engineer", "Deployment engineer", "Blue/green, canary, feature flags, rollback, Spinnaker, Argo Rollouts", ["devops"], "03-infrastructure", "deployment-engineer", ["deploy", "blue-green", "canary", "feature-flags", "rollback"]),
    va("network-engineer", "Network engineer", "DNS, load balancing, VPN, CDN, BGP, iptables, Nginx, Envoy, firewall", ["devops", "cloud"], "03-infrastructure", "network-engineer", ["network", "dns", "load-balancer", "vpn", "cdn", "bgp", "nginx"]),
    va("platform-engineer", "Platform engineer", "Internal developer platform, golden paths, Backstage, Crossplane, templates", ["devops"], "03-infrastructure", "platform-engineer", ["platform", "idp", "backstage", "crossplane", "golden-path"]),
    va("azure-infra", "Azure infrastructure engineer", "Azure — AKS, ACA, Bicep, Az CLI, Azure AD, policy, cost management", ["cloud", "devops"], "03-infrastructure", "azure-infra-engineer", ["azure", "aks", "aca", "bicep", "aad", "policy"]),

    // ── VoltAgent 04: Quality & Security ─────────────────────────────
    va("security-auditor", "Security auditor", "OWASP Top 10, JWT/OAuth review, SQL injection/XSS, CVE audit, secrets scanning", ["security"], "04-quality-security", "security-auditor", ["owasp", "jwt", "xss", "sqli", "cve", "secrets"]),
    va("penetration-tester", "Penetration tester", "Ethical hacking — recon, exploit research, CVSS scoring, MITRE ATT&CK", ["security"], "04-quality-security", "penetration-tester", ["pentest", "exploit", "recon", "cvss", "mitre"]),
    va("code-reviewer", "Code reviewer", "Code quality — logic bugs, security, performance, naming, SOLID, DRY", ["code-quality"], "04-quality-security", "code-reviewer", ["review", "quality", "bug", "naming", "solid", "dry"]),
    va("qa-expert", "QA expert", "Test automation — Jest, Playwright, Cypress, Selenium, coverage strategy", ["testing"], "04-quality-security", "qa-expert", ["qa", "jest", "playwright", "cypress", "selenium", "coverage"]),
    va("debugger", "Debugger", "Stack traces, memory leaks, race conditions, core dumps, profiling", ["code-quality"], "04-quality-security", "debugger", ["debug", "memory", "race", "profiling", "core-dump"]),
    va("performance-engineer", "Performance engineer", "Profiling, caching, CDN, DB query tuning, k6, Lighthouse, Core Web Vitals", ["code-quality", "monitoring"], "04-quality-security", "performance-engineer", ["performance", "profiling", "cache", "k6", "lighthouse", "cwv"]),
    va("compliance-auditor", "Compliance auditor", "GDPR, SOC2, HIPAA, PCI-DSS, ISO 27001, audit trails, policy enforcement", ["security", "legal"], "04-quality-security", "compliance-auditor", ["compliance", "gdpr", "soc2", "hipaa", "pci", "iso27001"]),
    va("accessibility-tester", "Accessibility tester", "WCAG 2.1/3.0, screen readers, ARIA, axe-core, keyboard navigation, color contrast", ["testing", "frontend"], "04-quality-security", "accessibility-tester", ["a11y", "wcag", "aria", "axe", "screen-reader", "contrast"]),
    va("chaos-engineer", "Chaos engineer", "Fault injection, Netflix Chaos Monkey, LitmusChaos, game days, blast radius", ["testing", "devops"], "04-quality-security", "chaos-engineer", ["chaos", "fault", "litmus", "game-day", "resilience"]),
    va("test-automator", "Test automator", "BDD, Cucumber, Robot Framework, Selenium, CI/CD test pipelines", ["testing"], "04-quality-security", "test-automator", ["bdd", "cucumber", "robot", "selenium", "test-pipeline"]),
    va("architect-reviewer", "Architecture reviewer", "Architecture reviews — patterns, scalability, coupling, ADRs, tech debt", ["code-quality"], "04-quality-security", "architect-reviewer", ["architecture", "review", "adr", "coupling", "tech-debt"]),
    va("ad-security", "Active Directory security reviewer", "AD security, GPO audit, password policies, privileged accounts, lateral movement", ["security"], "04-quality-security", "ad-security-reviewer", ["active-directory", "gpo", "ad", "privilege", "lateral-movement"]),
    va("powershell-security", "PowerShell security hardening", "PS execution policy, script signing, JEA, AMSI, logging, constrained mode", ["security", "devops"], "04-quality-security", "powershell-security-hardening", ["powershell", "signing", "jea", "amsi", "logging"]),

    // ── VoltAgent 05: Data & AI ───────────────────────────────────────
    va("ai-engineer", "AI engineer", "RAG pipelines, agents, fine-tuning, evaluation, production LLM systems", ["ai-ml"], "05-data-ai", "ai-engineer", ["ai", "rag", "agents", "fine-tuning", "llm", "evals"]),
    va("llm-architect", "LLM architect", "Prompt chains, evals, observability, context management, LangChain, LangGraph", ["ai-ml"], "05-data-ai", "llm-architect", ["llm", "prompt", "chains", "evals", "langchain", "langgraph"]),
    va("ml-engineer", "ML engineer", "Model training, serving, monitoring, MLOps, PyTorch, scikit-learn, drift detection", ["ai-ml", "data-science"], "05-data-ai", "ml-engineer", ["ml", "pytorch", "sklearn", "mlops", "serving", "drift"]),
    va("mlops", "MLOps engineer", "Model deployment — Kubernetes, MLflow, Kubeflow, Seldon, BentoML, feature stores", ["ai-ml", "devops"], "05-data-ai", "mlops-engineer", ["mlops", "mlflow", "kubeflow", "seldon", "bentoml", "feature-store"]),
    va("data-engineer", "Data engineer", "ETL/ELT pipelines, dbt, Airflow, Spark, Kafka, Snowflake, Delta Lake", ["data-science"], "05-data-ai", "data-engineer", ["etl", "dbt", "airflow", "spark", "kafka", "snowflake", "delta"]),
    va("data-analyst", "Data analyst", "Pandas, SQL, Tableau, Power BI, statistics, A/B testing, visualization", ["data-science", "analytics"], "05-data-ai", "data-analyst", ["pandas", "sql", "tableau", "powerbi", "statistics", "ab-test"]),
    va("data-scientist", "Data scientist", "Analytics, hypothesis testing, predictive models, feature engineering, Jupyter", ["data-science"], "05-data-ai", "data-scientist", ["datascience", "hypothesis", "prediction", "feature", "jupyter"]),
    va("database-optimizer", "Database optimizer", "Query optimization, EXPLAIN, indexes, materialized views, partitioning, caching", ["database"], "05-data-ai", "database-optimizer", ["optimizer", "explain", "index", "materialized", "partition", "cache"]),
    va("postgres-pro", "PostgreSQL expert", "Extensions, JSONB, pgvector, partitioning, replication, Supabase, TimescaleDB", ["database"], "05-data-ai", "postgres-pro", ["postgres", "jsonb", "pgvector", "supabase", "timescale", "partition"]),
    va("nlp-engineer", "NLP engineer", "Text classification, NER, embeddings, transformers, BERT, fine-tuning, spaCy", ["ai-ml"], "05-data-ai", "nlp-engineer", ["nlp", "ner", "embeddings", "bert", "transformers", "spacy"]),
    va("prompt-engineer", "Prompt engineer", "Prompt optimization — few-shot, CoT, structured output, adversarial testing", ["ai-ml"], "05-data-ai", "prompt-engineer", ["prompt", "few-shot", "cot", "structured", "adversarial"]),
    va("rl-engineer", "Reinforcement learning engineer", "RL and agent training — PPO, DQN, reward shaping, environments, RLHF", ["ai-ml"], "05-data-ai", "reinforcement-learning-engineer", ["rl", "ppo", "dqn", "reward", "rlhf", "environment"]),

    // ── VoltAgent 06: Developer Experience ───────────────────────────
    va("documentation-eng", "Documentation engineer", "API docs, ADRs, runbooks, README, changelog, Docusaurus, MkDocs", ["documentation"], "06-developer-experience", "documentation-engineer", ["docs", "adr", "runbook", "readme", "changelog", "docusaurus"]),
    va("git-workflow", "Git workflow manager", "Trunk-based dev, gitflow, rebase strategy, conflict resolution, hooks", ["git"], "06-developer-experience", "git-workflow-manager", ["git", "branch", "rebase", "conflict", "hooks", "trunk"]),
    va("refactoring", "Refactoring specialist", "Design patterns, clean code, anti-pattern elimination, modularity, SOLID", ["code-quality"], "06-developer-experience", "refactoring-specialist", ["refactor", "patterns", "clean", "solid", "modularity"]),
    va("legacy-modernizer", "Legacy modernizer", "Migration strategies — strangler fig, incremental rewrite, anti-corruption layer", ["code-quality"], "06-developer-experience", "legacy-modernizer", ["legacy", "migration", "strangler", "acl", "modernize"]),
    va("cli-developer", "CLI developer", "CLI tools — argument parsing, interactive prompts, shell completion, oclif, Click", ["backend"], "06-developer-experience", "cli-developer", ["cli", "shell", "bash", "prompts", "oclif", "click"]),
    va("mcp-developer", "MCP developer", "Model Context Protocol — server creation, tool design, resource URIs, testing", ["ai-ml"], "06-developer-experience", "mcp-developer", ["mcp", "protocol", "server", "tool", "resource", "claude"]),
    va("build-engineer", "Build engineer", "Build systems — webpack, Vite, Turbopack, Nx, Bazel, Gradle, caching", ["devops"], "06-developer-experience", "build-engineer", ["build", "webpack", "vite", "turbopack", "nx", "bazel", "gradle"]),
    va("dependency-manager", "Dependency manager", "Package management — npm, pnpm, Yarn, Cargo, Maven, security audits, updates", ["code-quality"], "06-developer-experience", "dependency-manager", ["npm", "pnpm", "yarn", "cargo", "maven", "dependency", "audit"]),
    va("dx-optimizer", "DX optimizer", "Developer experience — inner loop, local dev, onboarding, tooling, docs quality", ["productivity"], "06-developer-experience", "dx-optimizer", ["dx", "developer", "inner-loop", "tooling", "onboarding"]),

    // ── VoltAgent 07: Specialized Domains ────────────────────────────
    va("payment-integration", "Payment integration", "Stripe, PayPal, Braintree, webhooks, PCI compliance, subscription billing", ["payment"], "07-specialized-domains", "payment-integration", ["stripe", "paypal", "braintree", "pci", "subscription", "webhook"]),
    va("game-developer", "Game developer", "Unity, Godot, game loops, physics, networking, ECS, shaders, level design", ["frontend", "backend"], "07-specialized-domains", "game-developer", ["game", "unity", "godot", "ecs", "shader", "physics", "multiplayer"]),
    va("fintech", "Fintech engineer", "Trading systems, financial APIs, compliance, risk, reconciliation, SWIFT, ISO 20022", ["payment", "security"], "07-specialized-domains", "fintech-engineer", ["fintech", "trading", "risk", "compliance", "swift", "iso20022"]),
    va("seo-specialist", "SEO specialist", "Technical SEO, Core Web Vitals, structured data, sitemaps, robots.txt, hreflang", ["content"], "07-specialized-domains", "seo-specialist", ["seo", "cwv", "schema", "sitemap", "robots", "hreflang"]),
    va("blockchain", "Blockchain developer", "Solidity, Hardhat, smart contracts, DeFi, NFT, EVM, TheGraph, IPFS", ["backend"], "07-specialized-domains", "blockchain-developer", ["blockchain", "solidity", "hardhat", "defi", "nft", "evm", "ipfs"]),
    va("iot-engineer", "IoT engineer", "MQTT, edge computing, firmware OTA, sensor data, AWS IoT, Azure IoT Hub", ["backend", "devops"], "07-specialized-domains", "iot-engineer", ["iot", "mqtt", "edge", "firmware", "ota", "sensor"]),
    va("embedded-systems", "Embedded systems expert", "Firmware — C/C++, RTOS, FreeRTOS, Zephyr, HAL, bare-metal, peripherals", ["backend"], "07-specialized-domains", "embedded-systems", ["embedded", "rtos", "freertos", "zephyr", "hal", "firmware", "c"]),
    va("api-documenter", "API documenter", "API documentation — OpenAPI 3.1, Redoc, Swagger UI, Postman collections", ["api", "documentation"], "07-specialized-domains", "api-documenter", ["api", "openapi", "redoc", "swagger", "postman", "documentation"]),
    va("quant-analyst", "Quant analyst", "Quantitative analysis — backtesting, factor models, time-series, risk metrics", ["data-science", "payment"], "07-specialized-domains", "quant-analyst", ["quant", "backtest", "factor", "time-series", "risk", "sharpe"]),

    // ── VoltAgent 08: Business & Product ──────────────────────────────
    va("product-manager", "Product manager", "PRDs, roadmaps, OKRs, user stories, RICE/ICE prioritization, Figma reviews", ["project-management"], "08-business-product", "product-manager", ["product", "prd", "roadmap", "okr", "rice", "user-story"]),
    va("project-manager", "Project manager", "Sprint planning, WBS, milestones, risk register, stakeholder comms, RAID log", ["project-management"], "08-business-product", "project-manager", ["sprint", "milestone", "wbs", "risk", "raid", "stakeholder"]),
    va("business-analyst", "Business analyst", "BRDs, use cases, process modeling, BPMN, gap analysis, stakeholder workshops", ["project-management"], "08-business-product", "business-analyst", ["brd", "use-case", "bpmn", "gap", "stakeholder", "process"]),
    va("technical-writer", "Technical writer", "User guides, API references, release notes, style guide enforcement, Diataxis", ["documentation"], "08-business-product", "technical-writer", ["user-guide", "api-ref", "release-notes", "diataxis", "style"]),
    va("scrum-master", "Scrum master", "Ceremonies, velocity, retrospectives, impediments, Jira, SAFe, estimation", ["project-management"], "08-business-product", "scrum-master", ["scrum", "velocity", "retrospective", "safe", "jira", "estimation"]),
    va("content-marketer", "Content marketer", "SEO content, social media strategy, email campaigns, content calendar, analytics", ["content", "email-marketing"], "08-business-product", "content-marketer", ["content", "seo", "social", "email", "campaign", "analytics"]),
    va("customer-success", "Customer success manager", "Onboarding, health scores, QBRs, churn prevention, NPS, Gainsight", ["crm"], "08-business-product", "customer-success-manager", ["csm", "onboarding", "churn", "nps", "gainsight", "health"]),
    va("ux-researcher", "UX researcher", "User research — interviews, usability testing, heuristic evaluation, affinity mapping", ["frontend", "design"], "08-business-product", "ux-researcher", ["ux", "research", "usability", "interview", "heuristic", "affinity"]),
    va("wordpress-master", "WordPress master", "WordPress themes, plugins, Gutenberg, WooCommerce, performance, multisite", ["frontend", "backend"], "08-business-product", "wordpress-master", ["wordpress", "woocommerce", "gutenberg", "plugin", "theme"]),

    // ── VoltAgent 09: Meta & Orchestration ───────────────────────────
    va("multi-agent-coord", "Multi-agent coordinator", "Advanced multi-agent orchestration — decomposition, parallel execution, aggregation", ["orchestration"], "09-meta-orchestration", "multi-agent-coordinator", ["orchestration", "multi-agent", "parallel", "aggregate", "routing"]),
    va("workflow-orchestrator", "Workflow orchestrator", "Complex workflow automation — DAGs, retries, state machines, event-driven flows", ["orchestration", "productivity"], "09-meta-orchestration", "workflow-orchestrator", ["workflow", "dag", "state-machine", "event", "retry"]),
    va("task-distributor", "Task distributor", "Load balancing, priority queues, agent routing, work-stealing, backpressure", ["orchestration"], "09-meta-orchestration", "task-distributor", ["task", "distribute", "queue", "routing", "priority", "backpressure"]),
    va("context-manager", "Context manager", "Token budget, memory summarization, relevance filtering, progressive disclosure", ["orchestration", "ai-ml"], "09-meta-orchestration", "context-manager", ["context", "token", "memory", "summarize", "filter", "budget"]),
    va("pied-piper", "Pied Piper (SDLC orchestrator)", "Orchestrate team of AI subagents for repetitive SDLC workflows", ["orchestration", "devops"], "09-meta-orchestration", "pied-piper", ["sdlc", "orchestrate", "subagent", "workflow", "team"]),
    va("agent-organizer", "Agent organizer", "Multi-agent coordinator — routing, sequencing, result merging, error recovery", ["orchestration"], "09-meta-orchestration", "agent-organizer", ["agent", "organize", "route", "sequence", "merge"]),
    va("performance-monitor", "Performance monitor", "Agent performance optimization — latency tracking, cost analysis, bottleneck detection", ["orchestration", "monitoring"], "09-meta-orchestration", "performance-monitor", ["performance", "latency", "cost", "bottleneck", "agent"]),
    va("it-ops-orchestrator", "IT ops orchestrator", "IT operations workflow orchestration — incident triage, runbook execution, escalation", ["orchestration", "devops"], "09-meta-orchestration", "it-ops-orchestrator", ["it-ops", "incident", "runbook", "escalation", "triage"]),

    // ── VoltAgent 10: Research & Analysis ────────────────────────────
    va("research-analyst", "Research analyst", "Web synthesis, competitive analysis, literature review, report generation", ["research"], "10-research-analysis", "research-analyst", ["research", "synthesis", "competitive", "report", "literature"]),
    va("competitive-analyst", "Competitive analyst", "Feature comparison, pricing analysis, market positioning, SWOT, battlecards", ["research"], "10-research-analysis", "competitive-analyst", ["competitive", "swot", "battlecard", "pricing", "positioning"]),
    va("market-researcher", "Market researcher", "Market analysis, consumer insights, surveys, segmentation, TAM/SAM/SOM", ["research"], "10-research-analysis", "market-researcher", ["market", "consumer", "survey", "segmentation", "tam"]),
    va("trend-analyst", "Trend analyst", "Emerging trends, forecasting, technology radar, weak signals, prediction", ["research"], "10-research-analysis", "trend-analyst", ["trend", "forecast", "radar", "signal", "prediction"]),
    va("search-specialist", "Search specialist", "Advanced information retrieval — Boolean logic, academic DBs, citation analysis", ["research"], "10-research-analysis", "search-specialist", ["search", "retrieval", "boolean", "citation", "academic"]),
    va("data-researcher", "Data researcher", "Data discovery and analysis — open datasets, APIs, scraping, provenance", ["research", "data-science"], "10-research-analysis", "data-researcher", ["data", "discovery", "open-data", "scraping", "provenance"]),

    // ── ComposioHQ: Communication ────────────────────────────────────
    cx("internal-comms", "Internal communications", "Status reports, newsletters, team announcements, FAQs, meeting summaries", ["communication", "content"], "internal-comms", ["internal", "comms", "status", "newsletter", "announcement", "memo"]),
    cx("slack-gif-creator", "Slack GIF creator", "Create animated GIFs for Slack — shake, bounce, spin, pulse, fade, zoom effects", ["communication", "design"], "slack-gif-creator", ["slack", "gif", "animation", "emoji", "reaction", "meme"]),
    cx("skill-share", "Skill share (Slack)", "Create & share Claude skills on Slack — packaging, validation, team notification via Rube", ["communication", "productivity"], "skill-share", ["skill", "share", "slack", "rube", "package", "create"]),

    // ── ComposioHQ: Design & Presentation ─────────────────────────────
    cx("canvas-design", "Canvas design skill", "Create visual art in PNG/PDF using design philosophy for posters, print pieces", ["design"], "canvas-design", ["design", "art", "poster", "png", "pdf", "visual", "print"]),
    cx("brand-guidelines", "Brand guidelines", "Apply official brand colors and typography consistently across artifacts", ["design", "content"], "brand-guidelines", ["brand", "color", "typography", "style", "guideline", "logo"]),
    cx("theme-factory", "Theme factory", "10 pre-set color/font themes for slides, docs, reports, landing pages — plus custom themes", ["design", "documents"], "theme-factory", ["theme", "color", "font", "slide", "style", "template", "palette"]),
    cx("image-enhancer", "Image enhancer", "Improve image quality — upscaling, sharpening, artifact removal, batch processing", ["design", "productivity"], "image-enhancer", ["image", "enhance", "upscale", "sharpen", "screenshot", "quality"]),

    // ── ComposioHQ: Content & Writing ─────────────────────────────────
    cx("content-writer", "Content research writer", "High-quality content with research, citations, hooks, section-by-section feedback", ["content"], "content-research-writer", ["content", "research", "writing", "blog", "citation", "hook"]),
    cx("changelog", "Changelog generator", "User-facing changelogs from git commits — semantic grouping, markdown output", ["git", "documentation"], "changelog-generator", ["changelog", "git", "release", "commit", "semantic", "version"]),
    cx("tailored-resume", "Tailored resume generator", "Job-tailored resumes — ATS optimization, keyword mapping, career transition support", ["content", "productivity"], "tailored-resume-generator", ["resume", "cv", "job", "ats", "career", "tailored", "application"]),
    cx("domain-brainstorm", "Domain name brainstormer", "Domain name ideas — TLD suggestions, keyword combos, availability context", ["content", "business"], "domain-name-brainstormer", ["domain", "name", "url", "tld", "brainstorm", "startup"]),

    // ── ComposioHQ: Marketing & Social ────────────────────────────────
    cx("competitive-ads", "Competitive ads extractor", "Extract & analyze competitor ad campaigns — messaging, creative, copy, strategy", ["marketing", "research"], "competitive-ads-extractor", ["ads", "competitive", "campaign", "marketing", "creative", "copy"]),
    cx("twitter-optimizer", "Twitter algorithm optimizer", "Optimize tweets for algorithm — engagement signals, SimClusters, Tweepcred scoring", ["marketing", "content"], "twitter-algorithm-optimizer", ["twitter", "x", "algorithm", "engagement", "tweet", "social"]),

    // ── ComposioHQ: Productivity & Utility ────────────────────────────
    cx("file-organizer", "File organizer", "Organize files & directories — duplicate removal, smart categorization, batch renaming", ["productivity"], "file-organizer", ["file", "organize", "duplicate", "rename", "cleanup", "directory"]),
    cx("invoice-organizer", "Invoice organizer", "Sort, categorize invoices — vendor grouping, tax prep, multi-year archiving", ["productivity", "business"], "invoice-organizer", ["invoice", "receipt", "tax", "expense", "vendor", "organize"]),
    cx("raffle-picker", "Raffle winner picker", "Random winner selection — Google Sheets, CSV, weighted entries, runner-ups", ["productivity"], "raffle-winner-picker", ["raffle", "giveaway", "random", "winner", "contest", "picker"]),
    cx("meeting-insights", "Meeting insights analyzer", "Analyze meeting transcripts — conflict patterns, leadership facilitation, action items", ["productivity", "communication"], "meeting-insights-analyzer", ["meeting", "transcript", "insight", "facilitation", "action-item"]),
    cx("video-downloader", "YouTube video downloader", "Download YouTube videos — quality selection, format options, audio-only MP3, batch", ["productivity"], "video-downloader", ["youtube", "video", "download", "mp3", "mp4", "yt-dlp"]),

    // ── ComposioHQ: Business & Research ───────────────────────────────
    cx("lead-research", "Lead research assistant", "Prospect research — company analysis, contact discovery, lead qualification", ["research", "business"], "lead-research-assistant", ["lead", "prospect", "research", "company", "sales", "contact"]),
    cx("dev-growth", "Developer growth analysis", "Analyze developer career growth — skills mapping, contribution trends, progression", ["research", "productivity"], "developer-growth-analysis", ["developer", "growth", "career", "skills", "analysis", "contribution"]),

    // ── ComposioHQ: AI & Development ──────────────────────────────────
    cx("mcp-builder", "MCP server builder", "High-quality MCP server creation — tools, resources, prompts, TypeScript/Python", ["ai-ml"], "mcp-builder", ["mcp", "server", "tool", "resource", "typescript", "python", "protocol"]),
    cx("artifacts-builder", "Claude Artifacts builder", "Elaborate claude.ai HTML artifacts — React, Tailwind CSS, shadcn/ui components", ["frontend", "ai-ml"], "artifacts-builder", ["artifacts", "react", "tailwind", "shadcn", "html", "claude", "web"]),
    cx("langsmith", "LangSmith fetch", "Debug LangChain/LangGraph agents by fetching execution traces from LangSmith", ["ai-ml", "monitoring"], "langsmith-fetch", ["langsmith", "langchain", "langgraph", "trace", "debug", "observability"]),
    cx("webapp-testing", "Webapp testing (Playwright)", "Test local web apps with Playwright — UI verification, debugging, screenshots", ["testing"], "webapp-testing", ["playwright", "browser", "testing", "ui", "screenshot", "debug"]),
    cx("skill-creator", "Skill creator", "Guided skill creation — Q&A interview process to build new Claude skills", ["productivity", "ai-ml"], "skill-creator", ["skill", "create", "template", "claude", "guide", "interview"]),

    // ── ComposioHQ: Document Skills (sub-directory) ───────────────────
    cx("docx", "Word documents (docx)", "Create, edit, analyze Word docs — tracked changes, comments, formatting, templates", ["documents"], "document-skills/docx", ["word", "docx", "tracked-changes", "comment", "formatting", "template"]),
    cx("pdf", "PDF manipulation", "Extract text, tables, metadata, merge, split, annotate, fill forms, OCR", ["documents"], "document-skills/pdf", ["pdf", "extract", "merge", "split", "ocr", "annotation", "form"]),
    cx("pptx", "PowerPoint presentations", "Read, generate, adjust slides — layouts, templates, speaker notes, themes", ["documents"], "document-skills/pptx", ["powerpoint", "pptx", "slide", "layout", "template", "theme", "speaker-notes"]),
    cx("xlsx", "Excel spreadsheets", "Formulas, charts, pivot tables, data validation, macros, data transformations", ["documents", "data-science"], "document-skills/xlsx", ["excel", "xlsx", "formula", "chart", "pivot", "validation", "macro"]),

    // ── jeremylongshore Community (415 plugins, 2811 skills — verified via GitHub API) ──

    // ai-ml (32 plugins)
    jl("ai-ethics", "AI ethics validator", "Bias detection, fairness metrics, transparency, accountability, AI audit", ["ai-ml", "code-quality"], "plugins/ai-ml/ai-ethics-validator", "validating-ai-ethics-and-fairness", ["ai", "ethics", "bias", "fairness", "transparency", "audit"]),
    jl("ai-sdk-agents", "AI SDK multi-agent", "Orchestrate multi-agent AI systems with Vercel AI SDK", ["ai-ml"], "plugins/ai-ml/ai-sdk-agents", "orchestrating-multi-agent-systems", ["ai", "sdk", "agent", "multi-agent", "vercel", "orchestrate"]),
    jl("anomaly-detection", "Anomaly detection", "Statistical and ML anomaly detection for time-series and tabular data", ["ai-ml", "data-science"], "plugins/ai-ml/anomaly-detection-system", "detecting-data-anomalies", ["anomaly", "detection", "outlier", "statistics", "ml"]),
    jl("automl-pipeline", "AutoML pipeline builder", "Automated ML pipeline — preprocessing, model selection, hyperparameter tuning", ["ai-ml", "data-science"], "plugins/ai-ml/automl-pipeline-builder", "building-automl-pipelines", ["automl", "pipeline", "ml", "model", "hyperparameter"]),
    jl("classification-model", "Classification model builder", "Build classification models — logistic regression, random forest, SVM, XGBoost", ["ai-ml"], "plugins/ai-ml/classification-model-builder", "building-classification-models", ["classification", "model", "logistic", "forest", "svm", "xgboost"]),
    jl("computer-vision", "Computer vision processor", "Image classification, object detection, segmentation, OCR", ["ai-ml"], "plugins/ai-ml/computer-vision-processor", "processing-computer-vision-tasks", ["vision", "image", "detection", "segmentation", "ocr", "classify"]),
    jl("deep-learning", "Deep learning optimizer", "Neural network training — learning rate scheduling, gradient clipping, batch optimization", ["ai-ml"], "plugins/ai-ml/deep-learning-optimizer", "optimizing-deep-learning-models", ["deep-learning", "neural", "optimizer", "gradient", "training"]),
    jl("nlp-text", "NLP text analyzer", "Sentiment analysis, NER, text classification, summarization, tokenization", ["ai-ml"], "plugins/ai-ml/nlp-text-analyzer", "analyzing-text-with-nlp", ["nlp", "sentiment", "ner", "text", "summarize", "tokenize"]),
    jl("ollama", "Ollama local AI", "Run local AI models with Ollama — model management, inference, fine-tuning", ["ai-ml"], "plugins/ai-ml/ollama-local-ai", "ollama-setup", ["ollama", "local", "llm", "inference", "model", "self-hosted"]),
    jl("recommendation", "Recommendation engine", "Collaborative filtering, content-based, hybrid recommendation systems", ["ai-ml", "data-science"], "plugins/ai-ml/recommendation-engine", "building-recommendation-systems", ["recommendation", "collaborative", "content-based", "suggest"]),
    jl("time-series", "Time series forecaster", "ARIMA, Prophet, LSTM time-series forecasting and trend analysis", ["ai-ml", "data-science"], "plugins/ai-ml/time-series-forecaster", "forecasting-time-series-data", ["timeseries", "forecast", "arima", "prophet", "lstm", "trend"]),
    jl("genkit-pro", "Google Genkit Pro", "Multi-model AI with Firebase Genkit — Gemini, Anthropic, local models", ["ai-ml"], "plugins/ai-ml/jeremy-genkit-pro", "genkit-production-expert", ["genkit", "google", "gemini", "firebase", "multi-model"]),
    jl("vertex-engine", "Vertex AI engine", "Google Vertex AI — training, serving, pipelines, model registry", ["ai-ml", "cloud"], "plugins/ai-ml/jeremy-vertex-engine", "vertex-engine-inspector", ["vertex", "google", "gcp", "training", "serving", "mlops"]),

    // api-development (24 plugins)
    jl("api-auth-builder", "API authentication builder", "OAuth 2.0, JWT, API keys, token refresh, RBAC for APIs", ["api", "security"], "plugins/api-development/api-authentication-builder", "building-api-authentication", ["oauth", "jwt", "api-key", "token", "rbac", "auth"]),
    jl("api-gateway", "API gateway builder", "API gateway patterns — routing, load balancing, circuit breaker, caching", ["api", "backend"], "plugins/api-development/api-gateway-builder", "building-api-gateway", ["gateway", "routing", "load-balance", "circuit-breaker"]),
    jl("api-docs-gen", "API documentation generator", "OpenAPI/Swagger auto-generation from code — interactive docs, examples", ["api", "documentation"], "plugins/api-development/api-documentation-generator", "generating-api-docs", ["openapi", "swagger", "docs", "api", "interactive"]),
    jl("graphql-server", "GraphQL server builder", "GraphQL schema, resolvers, subscriptions, federation, Apollo/Yoga", ["api", "backend"], "plugins/api-development/graphql-server-builder", "building-graphql-server", ["graphql", "schema", "resolver", "apollo", "subscription"]),
    jl("rest-api-gen", "REST API generator", "Express/Fastify REST APIs — routes, controllers, validation, middleware", ["api", "backend"], "plugins/api-development/rest-api-generator", "generating-rest-apis", ["rest", "express", "fastify", "routes", "middleware"]),
    jl("webhook-handler", "Webhook handler creator", "Webhook endpoints — signature verification, retry logic, event routing", ["api"], "plugins/api-development/webhook-handler-creator", "creating-webhook-handlers", ["webhook", "handler", "event", "signature", "retry"]),
    jl("grpc-service", "gRPC service generator", "Protocol Buffers, gRPC services, streaming, interceptors", ["api", "backend"], "plugins/api-development/grpc-service-generator", "generating-grpc-services", ["grpc", "protobuf", "streaming", "service", "rpc"]),

    // automation (matchmaking)
    jl("changelog-gen", "Changelog generator", "Automated changelog from commits — conventional commits, grouping, versioning", ["git", "productivity"], "plugins/automation/mattyp-changelog", "changelog-orchestrator", ["changelog", "release", "version", "conventional", "automate"]),

    // business-tools
    jl("brand-strategy", "Brand strategy framework", "Brand positioning, competitor analysis, messaging, visual identity", ["research", "content"], "plugins/business-tools/brand-strategy-framework", "brand-strategy", ["brand", "strategy", "positioning", "competitor", "messaging"]),
    jl("excel-analyst", "Excel analyst pro", "DCF modeling, financial analysis, pivot tables, charting in Excel", ["data-science", "documents"], "plugins/business-tools/excel-analyst-pro", "excel-dcf-modeler", ["excel", "dcf", "financial", "pivot", "analysis", "spreadsheet"]),
    jl("exec-assistant", "Executive assistant", "Action items, meeting notes, Todoist integration, priority management", ["productivity"], "plugins/business-tools/executive-assistant-skills", "action-items-todoist", ["assistant", "todoist", "meetings", "priority", "task"]),

    // community
    jl("b12-website", "B12 website generator", "AI-powered website generation and management via B12 platform", ["frontend", "design"], "plugins/community/b12-claude-plugin", "website-generator", ["website", "b12", "generate", "ai", "builder"]),
    jl("memory-persist", "Claude memory (never forgets)", "Persistent memory across sessions — context recall, knowledge retention", ["ai-ml", "productivity"], "plugins/community/claude-never-forgets", "memory", ["memory", "persist", "context", "recall", "session"]),

    // crypto (blockchain)
    jl("arbitrage-finder", "Crypto arbitrage finder", "Cross-exchange arbitrage opportunities — price monitoring, spread analysis", ["crypto"], "plugins/crypto/arbitrage-opportunity-finder", "finding-arbitrage-opportunities", ["arbitrage", "crypto", "exchange", "spread", "price"]),
    jl("blockchain-explorer", "Blockchain explorer CLI", "Query blockchain data — transactions, blocks, addresses, smart contracts", ["crypto"], "plugins/crypto/blockchain-explorer-cli", "exploring-blockchain-data", ["blockchain", "explorer", "transaction", "block", "address", "web3"]),
    jl("cross-chain-bridge", "Cross-chain bridge monitor", "Monitor bridge transactions, detect anomalies, track cross-chain assets", ["crypto", "monitoring"], "plugins/crypto/cross-chain-bridge-monitor", "monitoring-cross-chain-bridges", ["bridge", "cross-chain", "monitor", "defi"]),

    // database (24 plugins)
    jl("db-migration", "Database migration manager", "Schema migrations — versioning, rollback, seed data, diff comparison", ["database"], "plugins/database/database-migration-manager", "managing-database-migrations", ["migration", "schema", "rollback", "versioning", "diff"]),
    jl("db-schema-designer", "Database schema designer", "ER diagrams, normalization, indexes, constraints, relationships", ["database"], "plugins/database/database-schema-designer", "designing-database-schemas", ["schema", "design", "er-diagram", "normalize", "index", "constraint"]),
    jl("sql-optimizer", "SQL query optimizer", "Query analysis, execution plans, index suggestions, N+1 detection", ["database"], "plugins/database/sql-query-optimizer", "optimizing-sql-queries", ["sql", "query", "optimize", "execution-plan", "index", "n+1"]),
    jl("orm-codegen", "ORM code generator", "Prisma, TypeORM, Sequelize, Drizzle model generation from schemas", ["database", "backend"], "plugins/database/orm-code-generator", "generating-orm-code", ["orm", "prisma", "typeorm", "sequelize", "drizzle", "model"]),

    // design
    jl("ios-hig-design", "iOS HIG design", "Apple Human Interface Guidelines — iOS UI patterns, accessibility, typography", ["design", "mobile"], "plugins/design/wondelai-ios-hig-design", "ios-hig-design", ["ios", "hig", "apple", "ui", "accessibility", "typography"]),
    jl("hooked-ux", "Hooked UX design", "Nir Eyal's Hook Model — trigger, action, reward, investment UX patterns", ["design"], "plugins/design/wondelai-hooked-ux", "hooked-ux", ["ux", "hook", "engagement", "trigger", "reward", "design"]),

    // devops (30 plugins)
    jl("ansible", "Ansible playbook creator", "Ansible playbooks — roles, handlers, vault, templates, molecule testing", ["devops"], "plugins/devops/ansible-playbook-creator", "creating-ansible-playbooks", ["ansible", "playbook", "role", "vault", "template", "molecule"]),
    jl("git-commit", "Git commit (smart)", "Conventional commits, semantic versioning, changelog generation, scope inference", ["git", "productivity"], "plugins/devops/git-commit-smart", "generating-smart-commits", ["git", "commit", "conventional", "changelog", "semantic"]),
    jl("ci-cd-pipeline", "CI/CD pipeline builder", "GitHub Actions, GitLab CI, Jenkins — build, test, deploy pipelines", ["devops"], "plugins/devops/ci-cd-pipeline-builder", "building-cicd-pipelines", ["cicd", "pipeline", "github-actions", "gitlab", "jenkins", "deploy"]),
    jl("docker-compose", "Docker compose generator", "Docker Compose files — multi-service, volumes, networks, health checks", ["devops"], "plugins/devops/docker-compose-generator", "generating-docker-compose-files", ["docker", "compose", "container", "service", "volume"]),
    jl("k8s-deploy", "Kubernetes deployment creator", "K8s manifests — deployments, services, ingress, ConfigMaps, secrets", ["devops"], "plugins/devops/kubernetes-deployment-creator", "creating-kubernetes-deployments", ["kubernetes", "k8s", "deployment", "pod", "ingress", "helm"]),
    jl("terraform", "Terraform module builder", "Terraform modules — AWS, GCP, Azure providers, state management", ["devops", "cloud"], "plugins/devops/terraform-module-builder", "building-terraform-modules", ["terraform", "iac", "module", "aws", "gcp", "azure", "state"]),
    jl("helm-chart", "Helm chart generator", "Kubernetes Helm charts — templates, values, dependencies, hooks", ["devops"], "plugins/devops/helm-chart-generator", "generating-helm-charts", ["helm", "chart", "kubernetes", "template", "values"]),
    jl("monitoring-stack", "Monitoring stack deployer", "Prometheus, Grafana, Alertmanager — full observability deployment", ["devops", "monitoring"], "plugins/devops/monitoring-stack-deployer", "deploying-monitoring-stacks", ["prometheus", "grafana", "alertmanager", "monitoring", "observability"]),
    jl("disaster-recovery", "Disaster recovery planner", "DR planning — RPO, RTO, failover, runbooks, backup verification", ["devops"], "plugins/devops/disaster-recovery-planner", "planning-disaster-recovery", ["disaster", "recovery", "failover", "backup", "rpo", "rto"]),
    jl("gitops-workflow", "GitOps workflow builder", "ArgoCD, Flux — GitOps continuous deployment patterns", ["devops"], "plugins/devops/gitops-workflow-builder", "building-gitops-workflows", ["gitops", "argocd", "flux", "continuous", "deploy"]),

    // finance (openbb-terminal removed — no SKILL.md available)

    // performance
    jl("alerting-rules", "Alerting rule creator", "Prometheus alerting rules — thresholds, expressions, notification routing", ["monitoring", "devops"], "plugins/performance/alerting-rule-creator", "creating-alerting-rules", ["alerting", "rules", "prometheus", "threshold", "notification"]),

    // saas-packs (maintained from original)
    jl("lucidchart", "Lucidchart integration", "Lucid REST API — programmatic diagram creation, data-linked visualizations", ["design", "documentation"], "plugins/saas-packs/lucidchart-pack", "lucidchart-core-workflow-a", ["lucidchart", "diagram", "visualization", "api", "data-linked"]),
    jl("posthog", "PostHog analytics", "Product analytics — events, feature flags, session replay, funnels, experiments", ["analytics", "monitoring"], "plugins/saas-packs/posthog-pack", "posthog-core-workflow-a", ["posthog", "analytics", "feature-flag", "session", "funnel", "experiment"]),
    jl("flyio", "Fly.io deployment", "Fly.io — machines, volumes, secrets, production checklist, multi-region", ["cloud", "devops"], "plugins/saas-packs/flyio-pack", "flyio-prod-checklist", ["flyio", "deploy", "machine", "volume", "secret", "multi-region"]),
    jl("mistral-security", "Mistral API security", "Mistral API key management, rate limits, content filtering, audit logging", ["security", "ai-ml"], "plugins/saas-packs/mistral-pack", "mistral-security-basics", ["mistral", "api-key", "rate-limit", "filter", "audit"]),
    jl("cursor-multi-repo", "Cursor multi-repo", "Cursor IDE — multi-repo workflows, SSO, AI settings, advanced configs", ["productivity"], "plugins/saas-packs/cursor-pack", "cursor-multi-repo", ["cursor", "ide", "multi-repo", "sso", "ai", "editor"]),

    // security (25 plugins)
    jl("pentest", "Penetration testing v2", "Python security scanners, OWASP, network recon, exploitation, reporting v2.0", ["security"], "plugins/security/penetration-tester", "performing-penetration-testing", ["pentest", "owasp", "scanner", "recon", "report", "python"]),
    jl("access-control", "Access control auditor", "RBAC, ABAC, ACL auditing — permissions analysis, privilege escalation detection", ["security"], "plugins/security/access-control-auditor", "auditing-access-control", ["rbac", "abac", "acl", "permissions", "privilege", "access"]),
    jl("gdpr-scanner", "GDPR compliance scanner", "GDPR data flow mapping, consent checks, data retention, right-to-erasure", ["security", "legal"], "plugins/security/gdpr-compliance-scanner", "scanning-for-gdpr-compliance", ["gdpr", "privacy", "consent", "data-protection", "compliance"]),
    jl("secret-scanner", "Secret scanner", "Detect leaked API keys, tokens, passwords in code and git history", ["security"], "plugins/security/secret-scanner", "scanning-for-secrets", ["secret", "api-key", "token", "password", "leak", "git"]),
    jl("sql-injection", "SQL injection detector", "Detect and prevent SQL injection vulnerabilities in application code", ["security", "database"], "plugins/security/sql-injection-detector", "detecting-sql-injection-vulnerabilities", ["sql-injection", "sqli", "security", "database", "vulnerability"]),
    jl("xss-scanner", "XSS vulnerability scanner", "Cross-site scripting detection — DOM XSS, stored XSS, reflected XSS", ["security"], "plugins/security/xss-vulnerability-scanner", "scanning-for-xss-vulnerabilities", ["xss", "cross-site", "scripting", "dom", "injection"]),
    jl("vulnerability-scan", "Vulnerability scanner", "Full vulnerability assessment — CVE checks, dependency audit, code analysis", ["security"], "plugins/security/vulnerability-scanner", "scanning-for-vulnerabilities", ["vulnerability", "cve", "audit", "scan", "dependency"]),

    // testing (22 plugins)
    jl("unit-test-gen", "Unit test generator", "Auto-generate unit tests — Jest, Vitest, pytest, assertion patterns", ["testing"], "plugins/testing/unit-test-generator", "generating-unit-tests", ["unit-test", "jest", "vitest", "pytest", "assertion", "coverage"]),
    jl("e2e-test", "E2E test framework", "End-to-end test scaffolding — Playwright, Cypress, Selenium setup", ["testing"], "plugins/testing/e2e-test-framework", "running-e2e-tests", ["e2e", "playwright", "cypress", "selenium", "end-to-end"]),
    jl("chaos-engineering", "Chaos engineering toolkit", "Chaos testing — fault injection, resilience verification, failure simulation", ["testing", "devops"], "plugins/testing/chaos-engineering-toolkit", "running-chaos-tests", ["chaos", "fault", "resilience", "failure", "injection"]),
    jl("test-data-gen", "Test data generator", "Realistic test data — Faker, factories, fixtures, anonymization", ["testing"], "plugins/testing/test-data-generator", "generating-test-data", ["test-data", "faker", "factory", "fixture", "mock", "seed"]),
    jl("mutation-test", "Mutation test runner", "Mutation testing — Stryker, PIT, code quality beyond coverage", ["testing", "code-quality"], "plugins/testing/mutation-test-runner", "running-mutation-tests", ["mutation", "stryker", "pit", "quality", "coverage"]),
    jl("api-fuzzer", "API fuzzer", "Fuzz testing APIs — random payload generation, edge case discovery", ["testing", "security"], "plugins/testing/api-fuzzer", "fuzzing-apis", ["fuzz", "api", "payload", "edge-case", "random", "boundary"]),
    jl("visual-regression", "Visual regression tester", "Visual diff testing — screenshot comparison, pixel-level regression detection", ["testing", "frontend"], "plugins/testing/visual-regression-tester", "testing-visual-regression", ["visual", "regression", "screenshot", "diff", "pixel"]),

    // ── Anthropic Official Plugins ────────────────────────────────────
    ant("frontend-design", "Frontend design (official)", "Avoid AI slop — bold, production-grade React & Tailwind UI with real design decisions", ["frontend", "design"], "frontend-design", ["react", "tailwind", "design", "ui", "component", "production"]),
    ant("code-review", "Code review (official)", "Systematic PR review — logic, security, performance, naming, test coverage", ["code-quality"], "code-review", ["review", "pr", "quality", "bug", "naming", "coverage"]),
    ant("feature-dev", "Feature development (official)", "End-to-end feature workflow — planning, implementation, testing, documentation", ["backend", "frontend"], "feature-dev", ["feature", "planning", "implementation", "testing", "docs"]),
    ant("commit-commands", "Commit commands (official)", "Smart commit messages, PR descriptions, changelog from staged changes", ["git"], "commit-commands", ["commit", "pr", "changelog", "staged", "message"]),
    ant("security-guidance", "Security guidance (official)", "OWASP, secrets detection, input validation, dependency audit, secure coding", ["security"], "security-guidance", ["owasp", "secrets", "validation", "audit", "secure"]),
    ant("pr-review-toolkit", "PR review toolkit (official)", "Comprehensive PR review — diff analysis, feedback templates, CI integration", ["code-quality", "git"], "pr-review-toolkit", ["pr", "diff", "feedback", "ci", "review", "template"]),

    // ── Community Skills (external repos — ALL URLs verified downloadable) ──
    // Development & Code Tools
    cxExt("d3-visualization", "D3.js visualization", "Produce D3 charts and interactive data visualizations", ["frontend", "data-science"], "chrisvoncsefalvay/claude-d3js-skill", "main", "", ["d3", "chart", "visualization", "graph", "data", "svg", "interactive"]),
    cxExt("finishing-branch", "Finishing a dev branch", "Guides completion of work on a development branch", ["git"], "obra/superpowers", "main", "skills/finishing-a-development-branch", ["git", "branch", "merge", "pr", "finish", "workflow"]),
    cxExt("jules", "Jules AI delegation", "Delegates coding tasks to Google Jules AI agent", ["ai-ml", "productivity"], "sanjay3290/ai-skills", "main", "skills/jules", ["jules", "google", "ai", "delegate", "agent", "coding"]),
    cxExt("move-quality", "Move code quality", "Move language package analysis and quality checks", ["code-quality"], "1NickPappas/move-code-quality-skill", "main", "", ["move", "sui", "aptos", "blockchain", "quality", "analysis"]),
    cxExt("prompt-engineering", "Prompt engineering", "Teaches prompting techniques — few-shot, chain-of-thought, system prompts", ["ai-ml"], "NeoLabHQ/context-engineering-kit", "master", "plugins/customaize-agent/skills/prompt-engineering", ["prompt", "engineering", "few-shot", "cot", "chain-of-thought", "llm"]),
    cxExt("pypict", "PICT test case design", "Design test cases using PICT pairwise combinatorial testing", ["testing"], "omkamal/pypict-claude-skill", "main", "", ["pict", "pairwise", "combinatorial", "test", "test-case", "design"]),
    cxExt("reddit-fetch", "Reddit fetcher", "Search and fetch content from Reddit", ["research", "content"], "ykdojo/claude-code-tips", "main", "skills/reddit-fetch", ["reddit", "subreddit", "post", "fetch", "search", "social"]),
    cxExt("web-artifacts", "Web artifacts builder (Anthropic)", "Create interactive React components as high-fidelity artifacts", ["frontend", "ai-ml"], "anthropics/skills", "main", "skills/web-artifacts-builder", ["artifacts", "react", "interactive", "component", "web", "html"]),

    // Data & Analysis
    cxExt("csv-summarizer", "CSV data summarizer", "Analyze CSV files, generate insights, create visualizations", ["data-science"], "coffeefuelbump/csv-data-summarizer-claude-skill", "main", "", ["csv", "data", "analysis", "visualization", "summarize", "insight"]),
    cxExt("deep-research", "Deep research (Gemini)", "Autonomous research using Gemini Deep Research Agent", ["research", "ai-ml"], "sanjay3290/ai-skills", "main", "skills/deep-research", ["research", "gemini", "deep", "autonomous", "analysis"]),
    cxExt("postgres", "PostgreSQL queries", "Safe read-only SQL queries against PostgreSQL databases", ["database"], "sanjay3290/ai-skills", "main", "skills/postgres", ["postgres", "postgresql", "sql", "database", "query", "read-only"]),

    // Communication & Writing
    cxExt("article-extractor", "Article extractor", "Extract clean article content from URLs", ["content", "research"], "michalparkola/tapestry-skills-for-claude-code", "main", "article-extractor", ["article", "extract", "url", "scrape", "content", "clean"]),
    cxExt("brainstorming", "Brainstorming facilitator", "Facilitates high-quality group or individual brainstorming sessions", ["productivity"], "obra/superpowers", "main", "skills/brainstorming", ["brainstorm", "ideation", "creative", "session", "group", "workshop"]),
    cxExt("family-history", "Family history research", "Professional genealogy research and family tree building", ["research"], "emaynard/claude-family-history-research-skill", "main", "", ["genealogy", "family", "history", "tree", "ancestors", "heritage", "research"]),

    // Creative & Media
    cxExt("imagen", "Google Imagen", "High-quality image generation using Google Imagen", ["ai-ml", "design"], "sanjay3290/ai-skills", "main", "skills/imagen", ["imagen", "google", "image", "generate", "ai", "photo"]),

    // Productivity & Organization
    cxExt("kaizen", "Kaizen improvement", "Code change analysis and continuous improvement suggestions", ["code-quality", "productivity"], "NeoLabHQ/context-engineering-kit", "master", "plugins/kaizen/skills/kaizen", ["kaizen", "improvement", "analysis", "quality", "continuous"]),
    cxExt("ship-learn-next", "Ship Learn Next", "Product development framework planning", ["productivity", "project-management"], "michalparkola/tapestry-skills-for-claude-code", "main", "ship-learn-next", ["ship", "product", "framework", "planning", "development"]),

    // Collaboration & Project Management
    cxExt("git-pushing", "Git push workflow", "Git commit and push workflow assistance", ["git"], "mhattingpete/claude-skills-marketplace", "main", "engineering-workflow-plugin/skills/git-pushing", ["git", "push", "commit", "workflow", "branch"]),
    cxExt("outline", "Outline documentation", "Search and write documentation on Outline wiki", ["documentation"], "sanjay3290/ai-skills", "main", "skills/outline", ["outline", "wiki", "documentation", "knowledge-base", "search"]),
    cxExt("review-implementing", "Review implementing", "Implementing code review feedback systematically", ["code-quality", "git"], "mhattingpete/claude-skills-marketplace", "main", "engineering-workflow-plugin/skills/review-implementing", ["review", "code-review", "feedback", "implement", "pr"]),
    cxExt("test-fixing", "Test fixing", "Diagnosing and fixing test failures automatically", ["testing"], "mhattingpete/claude-skills-marketplace", "main", "engineering-workflow-plugin/skills/test-fixing", ["test", "fix", "failure", "diagnose", "debug", "ci"]),
  ],
}

// ── Query engine ─────────────────────────────────────────────────────────

export function queryCatalog(
  input: string,
  catalog: MarketplaceCatalog = loadCatalog(),
  limit = 5,
): CatalogQueryResult {
  const lower = input.toLowerCase()
  const classification = classifyRequest(input)
  const isAgent = isAgentRequest(input)
  const matchedCategories = new Set<string>()

  // ── Synonym expansion — "apple phone test" → includes "ios", "simulator" etc.
  const rawWords = lower.split(/\W+/).filter(w => w.length > 1)
  const expandedWords = expandWithSynonyms(rawWords)
  const expandedSet = new Set(expandedWords)

  const scored: ScoredItem[] = catalog.items.map(item => {
    let score = 0
    const reasons: string[] = []

    // Direct name match
    const nameLower = item.name.toLowerCase()
    const stripped = lower.replace(/^(add|install|get|use|need|setup|set up)\s+/i, "")
    if (lower.includes(nameLower) || nameLower.includes(stripped)) {
      score += 40; reasons.push("name")
    }

    // Description word overlap (original + synonym-expanded)
    const descWords = item.description.toLowerCase().split(/\W+/)
    const inputWords = lower.split(/\W+/).filter(w => w.length > 2)
    const overlap = inputWords.filter(w => descWords.includes(w)).length
    if (overlap > 0) { score += Math.min(overlap * 8, 32); reasons.push(`desc:${overlap}`) }

    // Category keyword match (uses expanded words for broader matching)
    for (const cat of item.categories) {
      const kws = CATEGORY_KEYWORDS[cat] ?? []
      const hit = kws.filter(kw => lower.includes(kw))
      if (hit.length > 0) {
        score += hit.length * 10
        matchedCategories.add(cat)
        reasons.push(`cat:${cat}`)
      }
    }

    // Tag match — uses BOTH direct AND synonym-expanded words
    const directHitTags = item.tags.filter(t => lower.includes(t))
    const synonymHitTags = item.tags.filter(t => !lower.includes(t) && expandedSet.has(t))
    if (directHitTags.length > 0) {
      score += directHitTags.length * 6
      reasons.push(`tags:${directHitTags.slice(0, 3).join(",")}`)
    }
    if (synonymHitTags.length > 0) {
      score += synonymHitTags.length * 4  // slightly less than direct match
      reasons.push(`syn:${synonymHitTags.slice(0, 3).join(",")}`)
    }

    // Type preference
    if (isAgent && item.type === "agent") score += 18
    if (!isAgent && item.type === "skill") score += 12
    if (!isAgent && item.type === "plugin") score += 10

    // Classification category bonus
    const classCategories = new Set(classification.categories)
    for (const cat of item.categories) {
      if (classCategories.has(cat)) { score += 15; break }
    }

    // Slight boost for Anthropic official
    if (item.source === "anthropic" && score > 0) score += 5

    return { item, score, reason: reasons.join("; ") || "no match" }
  })

  const matches = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return { matches, matchedCategories: [...matchedCategories], isAgent }
}

// ── Format for agent prompt ─────────────────────────────────────────────

export function formatQueryResult(result: CatalogQueryResult): string {
  const { matches, matchedCategories, isAgent } = result

  if (matches.length === 0) {
    return `No catalog matches found — proceed to FALLBACK to create a custom ${isAgent ? "agent" : "skill"}.`
  }

  const lines: string[] = []
  lines.push(`### Catalog matches (${matches.length})`)
  lines.push(`Matched categories: ${matchedCategories.join(", ") || "general"}`)
  lines.push(``)

  matches.forEach((s, i) => {
    const { item } = s
    const rank = i === 0 ? "⭐ BEST" : `   ${i + 1}.`
    lines.push(`${rank}  **${item.name}** · \`${item.type}\` · ${item.source}`)
    lines.push(`      ${item.description}`)
    if (item.source === "anthropic") {
      lines.push(`      📥 \`/plugin install ${item.directUrl}\``)
    } else {
      lines.push(`      📥 \`curl -sf "${item.directUrl}" -o "${item.installPath}"\``)
    }
    lines.push(``)
  })

  const best = matches[0].item
  lines.push(`**Execute BEST MATCH:**`)
  lines.push(`\`\`\`bash`)
  if (best.source === "anthropic") {
    lines.push(`/plugin install ${best.directUrl}`)
  } else {
    lines.push(`mkdir -p "$(dirname "${best.installPath}")"`)
    lines.push(`curl -sf "${best.directUrl}" -o "${best.installPath}"`)
    lines.push(`wc -c "${best.installPath}"   # must be >50 bytes`)
  }
  lines.push(`\`\`\``)
  lines.push(`If empty/404 → try the next match. If ALL fail → see FALLBACK below.`)

  return lines.join("\n")
}
