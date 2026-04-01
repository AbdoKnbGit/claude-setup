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
 * SOURCE 3 — ComposioHQ/awesome-claude-skills (100+ skills, FLAT root dirs)
 *   URL: https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/{skill-name}/SKILL.md
 *   Sub-dirs: .../document-skills/{type}/SKILL.md  |  .../composio-skills/{app}/SKILL.md
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

const VA  = "https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/categories"
const JL  = "https://raw.githubusercontent.com/jeremylongshore/claude-code-plugins-plus-skills/main"
const CX  = "https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master"

// ── Category taxonomy ───────────────────────────────────────────────────
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "code-quality":        ["lint","format","prettier","eslint","code quality","style","clean code","code review","refactor","anti-pattern"],
  "testing":             ["test","jest","vitest","playwright","cypress","e2e","unit test","integration test","tdd","qa","quality assurance","bdd","coverage"],
  "security":            ["security","auth","authentication","oauth","jwt","encryption","owasp","vulnerability","cve","pentest","penetration","audit","secrets","xss","injection","hardening","compliance","sigma","forensics"],
  "devops":              ["devops","ci","cd","docker","kubernetes","k8s","deploy","infrastructure","terraform","ansible","helm","pipeline","github actions","circleci","gitops","sre","argocd"],
  "api":                 ["api","rest","graphql","swagger","openapi","grpc","webhook","endpoint","postman"],
  "database":            ["database","sql","postgres","mysql","mongodb","redis","prisma","orm","migration","schema","query","sqlite","supabase","nosql","sharding"],
  "frontend":            ["frontend","react","vue","svelte","angular","css","tailwind","ui","component","nextjs","nuxt","html","typescript","design system","a11y","accessibility"],
  "backend":             ["backend","express","fastapi","django","spring","nestjs","laravel","rails","server","node","golang","rust","java","csharp","dotnet","php"],
  "mobile":              ["mobile","react native","flutter","ios","android","swift","kotlin","expo","swiftui","compose"],
  "data-science":        ["data","ml","machine learning","pandas","numpy","jupyter","pytorch","tensorflow","scikit","analytics","data pipeline","etl","elt","dbt","airflow","spark"],
  "documentation":       ["docs","documentation","readme","jsdoc","typedoc","wiki","openapi spec","technical writing","changelog","adr","runbook"],
  "git":                 ["git","github","gitlab","pull request","commit","branch","merge","bitbucket","worktree","gitops","gitflow"],
  "orchestration":       ["orchestrat","coordinator","dispatcher","multi-agent","task routing","workflow agent","subagent","agentic","agent system","multi agent"],
  "research":            ["research","analysis","report","survey","compare","summarize","literature","market research","competitive","intelligence"],
  "crm":                 ["crm","salesforce","hubspot","pipedrive","zoho","close crm","customer relationship","lead","opportunity","deal","contact"],
  "project-management":  ["project management","agile","sprint","kanban","scrum","jira","milestone","planning","asana","clickup","linear","monday","basecamp","notion","confluence","trello"],
  "communication":       ["slack","email","notification","discord","telegram","teams","chat","messaging","internal comms","newsletter","broadcast"],
  "email-marketing":     ["email marketing","newsletter","mailchimp","convertkit","brevo","activecampaign","campaign","drip","sendgrid","sendinblue"],
  "payment":             ["payment","stripe","paypal","billing","checkout","subscription","invoice","mpesa","daraja","fintech","pci"],
  "cloud":               ["cloud","aws","azure","gcp","s3","lambda","ec2","cloudflare","vercel","fly.io","heroku","digitalocean","lightsail"],
  "monitoring":          ["monitoring","observability","logging","metrics","alerting","grafana","prometheus","datadog","sentry","posthog","amplitude","mixpanel","langsmith","traces"],
  "design":              ["design","figma","canva","lucidchart","ui design","graphic design","brand","visual","diagram","mockup","illustration"],
  "analytics":           ["analytics","amplitude","mixpanel","posthog","segment","gtm","google analytics","tracking","funnel","retention","cohort"],
  "scheduling":          ["scheduling","calendar","calendly","cal.com","appointment","meeting","booking","availability"],
  "file-storage":        ["file","storage","drive","dropbox","box","s3","blob","upload","download","attachment"],
  "hr":                  ["hr","human resources","bamboohr","payroll","employee","recruitment","onboarding","offboarding","pto"],
  "legal":               ["legal","contract","docusign","compliance","gdpr","terms","policy","e-signature","esign","envelope"],
  "content":             ["content","blog","seo","copywriting","marketing","social media","twitter","linkedin","writing"],
  "productivity":        ["productivity","automation","workflow","zapier","make","n8n","task","todo","ccpi"],
  "ai-ml":               ["ai","llm","gpt","claude","openai","langchain","langgraph","embeddings","vector","rag","prompt engineering","mlops","mcp","fine-tuning","evaluation"],
  "documents":           ["word","excel","powerpoint","docx","xlsx","pptx","pdf","spreadsheet","presentation","document","office"],
}

export const VA_CATEGORIES: Record<string, string> = {
  "code-quality":"01-core-development","testing":"04-quality-security","security":"04-quality-security",
  "devops":"03-infrastructure","api":"01-core-development","database":"07-specialized-domains",
  "frontend":"02-language-specialists","backend":"02-language-specialists","mobile":"02-language-specialists",
  "data-science":"05-data-ai","documentation":"06-developer-experience","orchestration":"09-meta-orchestration",
  "research":"10-research-analysis","project-management":"08-business-product","ai-ml":"05-data-ai",
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

// ── Seed catalog ─────────────────────────────────────────────────────────
function va(id: string, name: string, desc: string, cats: string[], dir: string, file: string, tags: string[]): CatalogItem {
  return { id:`va-${id}`, name, description:desc, type:"agent", source:"voltagent-agents", categories:cats, directUrl:`${VA}/${dir}/${file}.md`, installPath:`.claude/agents/${file}.md`, tags }
}
function cx(id: string, name: string, desc: string, cats: string[], dir: string, tags: string[]): CatalogItem {
  return { id:`cx-${id}`, name, description:desc, type:"skill", source:"composio", categories:cats, directUrl:`${CX}/${dir}/SKILL.md`, installPath:`.claude/skills/${dir}/SKILL.md`, tags }
}
function jl(id: string, name: string, desc: string, cats: string[], pluginPath: string, skillName: string, tags: string[]): CatalogItem {
  return { id:`jl-${id}`, name, description:desc, type:"skill", source:"community", categories:cats, directUrl:`${JL}/${pluginPath}/skills/${skillName}/SKILL.md`, installPath:`.claude/skills/${skillName}/SKILL.md`, tags }
}
function ant(id: string, name: string, desc: string, cats: string[], slug: string, tags: string[]): CatalogItem {
  return { id:`ant-${id}`, name, description:desc, type:"plugin", source:"anthropic", categories:cats, directUrl:`${slug}@claude-code-plugins`, installPath:`.claude/skills/${slug}/SKILL.md`, tags }
}

export const SEED_CATALOG: MarketplaceCatalog = {
  version: "2.0.0",
  builtAt: "2026-03-31T00:00:00Z",
  items: [
    // ── VoltAgent 01: Core Development ────────────────────────────────
    va("api-designer","API designer","REST & GraphQL API architect — OpenAPI spec, versioning, rate limiting, pagination",["api","backend"],"01-core-development","api-designer",["api","rest","graphql","openapi","versioning"]),
    va("backend-developer","Backend developer","Server-side expert — Node, Python, Java, Go, databases, caching, auth flows",["backend","api"],"01-core-development","backend-developer",["backend","node","python","java","go","api"]),
    va("fullstack-developer","Full-stack developer","End-to-end feature development — frontend, backend, DB schema, deployment",["frontend","backend"],"01-core-development","fullstack-developer",["fullstack","react","node","postgres"]),
    va("frontend-developer","Frontend developer","UI/UX specialist — React, Vue, Angular, CSS, accessibility, state management",["frontend"],"01-core-development","frontend-developer",["frontend","react","vue","angular","css","a11y"]),
    va("graphql-architect","GraphQL architect","GraphQL schema & federation — resolvers, subscriptions, DataLoader, persisted queries",["api"],"01-core-development","graphql-architect",["graphql","schema","federation","resolver","dataloader"]),
    va("microservices-arch","Microservices architect","Distributed systems — service mesh, event bus, saga, CQRS, API gateway, observability",["backend","devops"],"01-core-development","microservices-architect",["microservices","distributed","cqrs","saga","kafka","mesh"]),
    va("websocket-engineer","WebSocket engineer","Real-time communication — WebSocket, SSE, MQTT, Socket.io, pub/sub",["backend","api"],"01-core-development","websocket-engineer",["websocket","realtime","sse","socket","mqtt","pubsub"]),
    va("mobile-developer","Mobile developer","Cross-platform mobile — React Native, Flutter, Expo, native APIs, push notifications",["mobile"],"01-core-development","mobile-developer",["mobile","react-native","flutter","expo","push"]),
    va("electron-pro","Electron expert","Desktop apps — Electron, Tauri, IPC, auto-update, code signing, packaging",["frontend"],"01-core-development","electron-pro",["electron","tauri","desktop","ipc","auto-update"]),
    va("ui-designer","UI designer","Visual design & interaction — design systems, Figma, motion, dark mode, tokens",["frontend","design"],"01-core-development","ui-designer",["design","figma","ui","motion","tokens","dark-mode"]),

    // ── VoltAgent 02: Language Specialists ───────────────────────────
    va("typescript-pro","TypeScript specialist","Strict types, generics, conditional types, decorators, declaration files, Zod",["frontend","backend"],"02-language-specialists","typescript-pro",["typescript","generics","zod","types","strict"]),
    va("python-pro","Python master","FastAPI, Django, asyncio, type hints, packaging, testing, mypy, ruff",["backend","data-science"],"02-language-specialists","python-pro",["python","fastapi","django","asyncio","pytest","mypy"]),
    va("golang-pro","Go concurrency specialist","Goroutines, channels, interfaces, stdlib, gRPC, performance profiling",["backend"],"02-language-specialists","golang-pro",["go","golang","goroutine","grpc","channel","concurrency"]),
    va("rust-engineer","Rust systems engineer","Ownership, lifetimes, traits, async/await, embedded, WASM, unsafe",["backend"],"02-language-specialists","rust-engineer",["rust","ownership","wasm","embedded","unsafe","lifetime"]),
    va("java-architect","Java architect","Enterprise Java — Spring Boot, JPA, Kafka, microservices, virtual threads, GraalVM",["backend"],"02-language-specialists","java-architect",["java","spring","jpa","kafka","maven","gradle","graalvm"]),
    va("spring-boot","Spring Boot engineer","Spring Boot 3 / Java 21 — Security, Actuator, Data JPA, WebFlux, GraalVM native",["backend"],"02-language-specialists","spring-boot-engineer",["spring","springboot","security","jpa","webflux","native"]),
    va("csharp-developer","C# / .NET specialist",".NET 8 — ASP.NET Core, EF Core, Blazor, SignalR, minimal APIs, gRPC",["backend","frontend"],"02-language-specialists","csharp-developer",["csharp","dotnet","aspnet","ef","blazor","signalr"]),
    va("dotnet-core","ASP.NET Core expert",".NET 8 cross-platform — minimal APIs, Orleans, native AOT, source generators",["backend"],"02-language-specialists","dotnet-core-expert",["dotnet","aspnetcore","grpc","orleans","native-aot"]),
    va("react-specialist","React 18 specialist","Hooks, concurrent, Server Components, Zustand, TanStack Query, Remix",["frontend"],"02-language-specialists","react-specialist",["react","hooks","zustand","rsc","nextjs","tanstack"]),
    va("nextjs-developer","Next.js developer","Next.js 14+ App Router, RSC, ISR, Turbopack, Vercel, edge runtime",["frontend"],"02-language-specialists","nextjs-developer",["nextjs","app-router","rsc","vercel","turbopack","ssr"]),
    va("vue-expert","Vue 3 expert","Composition API, Pinia, Nuxt 3, Vite, TypeScript, Vitest, SSR",["frontend"],"02-language-specialists","vue-expert",["vue","composition","pinia","nuxt","vite","vitest"]),
    va("flutter-expert","Flutter specialist","Flutter 3+ — Bloc, Riverpod, platform channels, Flavor builds, CI/CD",["mobile"],"02-language-specialists","flutter-expert",["flutter","dart","bloc","riverpod","mobile","flavor"]),
    va("kotlin-specialist","Kotlin specialist","Kotlin — coroutines, Ktor, Android Jetpack, Compose, KMM, Coroutine flows",["mobile","backend"],"02-language-specialists","kotlin-specialist",["kotlin","coroutines","ktor","android","compose","kmm"]),
    va("swift-expert","Swift / iOS expert","SwiftUI, Combine, CloudKit, Core Data, StoreKit, App Store review",["mobile"],"02-language-specialists","swift-expert",["swift","swiftui","ios","macos","combine","cloudkit"]),
    va("php-pro","PHP developer","PHP 8.3, Symfony, Laravel, Composer, PHPUnit, type declarations, fibers",["backend"],"02-language-specialists","php-pro",["php","laravel","symfony","composer","phpunit"]),
    va("laravel-specialist","Laravel specialist","Laravel 10+ — Eloquent, queues, broadcasting, Nova, Forge, Vapor",["backend"],"02-language-specialists","laravel-specialist",["laravel","eloquent","queue","broadcast","vapor"]),
    va("fastapi","FastAPI developer","Pydantic v2, SQLModel, OAuth2, WebSocket, background tasks, OpenAPI",["backend","api"],"02-language-specialists","fastapi-developer",["fastapi","pydantic","async","python","websocket"]),
    va("django","Django developer","Django 4+ — DRF, Celery, Channels, Wagtail, multi-tenancy, permissions",["backend"],"02-language-specialists","django-developer",["django","drf","celery","channels","wagtail"]),
    va("rails","Rails expert","Rails 8.1 — Hotwire, Turbo, Solid Queue, Kamal, Rubocop, RSpec, Minitest",["backend"],"02-language-specialists","rails-expert",["rails","ruby","hotwire","turbo","rspec","kamal"]),
    va("sql-pro","SQL expert","Complex queries — window functions, CTEs, indexes, EXPLAIN plans, query optimization",["database"],"02-language-specialists","sql-pro",["sql","window","cte","index","explain","optimize"]),
    va("angular","Angular architect","Angular 17+ — signals, standalone, Nx monorepo, RxJS, NgRx, testing",["frontend"],"02-language-specialists","angular-architect",["angular","rxjs","nx","signals","ngrx","standalone"]),
    va("expo-rn","Expo / React Native expert","Expo SDK, EAS build/submit, over-the-air updates, native modules",["mobile"],"02-language-specialists","expo-react-native-expert",["expo","react-native","eas","ota","native-modules"]),
    va("js-pro","JavaScript developer","Modern JS — ES2024, modules, workers, Streams API, patterns, performance",["frontend","backend"],"02-language-specialists","javascript-pro",["javascript","es2024","worker","streams","modules"]),
    va("powershell-7","PowerShell 7 expert","Cross-platform PS 7+ — REST APIs, SSH, parallel foreach, classes, Pester",["backend","devops"],"02-language-specialists","powershell-7-expert",["powershell","ps7","rest","ssh","pester","parallel"]),

    // ── VoltAgent 03: Infrastructure ─────────────────────────────────
    va("cloud-architect","Cloud architect","AWS/GCP/Azure — VPC, IAM, Lambda, ECS/EKS, RDS, cost optimization, Well-Architected",["cloud","devops"],"03-infrastructure","cloud-architect",["aws","gcp","azure","vpc","iam","lambda"]),
    va("devops-engineer","DevOps engineer","CI/CD — GitHub Actions, GitLab CI, Jenkins, ArgoCD, Tekton, GitOps",["devops"],"03-infrastructure","devops-engineer",["devops","cicd","github-actions","jenkins","argocd"]),
    va("kubernetes","Kubernetes specialist","Helm, Kustomize, RBAC, HPA/VPA, service mesh, GitOps with ArgoCD/Flux",["devops","cloud"],"03-infrastructure","kubernetes-specialist",["k8s","helm","rbac","hpa","argocd","flux","istio"]),
    va("docker-expert","Docker expert","Multi-stage builds, BuildKit, Compose, registries, layer caching, Dive, Trivy",["devops"],"03-infrastructure","docker-expert",["docker","compose","dockerfile","buildkit","trivy","dive"]),
    va("terraform-engineer","Terraform engineer","IaC — modules, workspaces, state management, drift detection, Atlantis",["devops","cloud"],"03-infrastructure","terraform-engineer",["terraform","iac","module","workspace","state","atlantis"]),
    va("terragrunt","Terragrunt expert","DRY IaC orchestration — multiple environments, remote state, dependencies",["devops","cloud"],"03-infrastructure","terragrunt-expert",["terragrunt","terraform","dry","environment","remote-state"]),
    va("database-admin","Database administrator","Backup, replication, sharding, VACUUM, query plans, connection pooling",["database"],"03-infrastructure","database-administrator",["dba","postgres","mysql","backup","replication","sharding"]),
    va("security-infra","Infrastructure security engineer","Hardening, secrets management, IAM, network policies, SAST, CVE patching",["security","cloud"],"03-infrastructure","security-engineer",["security","hardening","secrets","iam","sast","cve"]),
    va("sre","SRE engineer","SLOs, error budgets, runbooks, on-call, incident response, chaos engineering",["devops","monitoring"],"03-infrastructure","sre-engineer",["sre","slo","incident","runbook","oncall","chaos"]),
    va("deployment-engineer","Deployment engineer","Blue/green, canary, feature flags, rollback, Spinnaker, Argo Rollouts",["devops"],"03-infrastructure","deployment-engineer",["deploy","blue-green","canary","feature-flags","rollback"]),
    va("network-engineer","Network engineer","DNS, load balancing, VPN, CDN, BGP, iptables, Nginx, Envoy, firewall",["devops","cloud"],"03-infrastructure","network-engineer",["network","dns","load-balancer","vpn","cdn","bgp","nginx"]),
    va("platform-engineer","Platform engineer","Internal developer platform, golden paths, Backstage, Crossplane, templates",["devops"],"03-infrastructure","platform-engineer",["platform","idp","backstage","crossplane","golden-path"]),
    va("azure-infra","Azure infrastructure engineer","Azure — AKS, ACA, Bicep, Az CLI, Azure AD, policy, cost management",["cloud","devops"],"03-infrastructure","azure-infra-engineer",["azure","aks","aca","bicep","aad","policy"]),

    // ── VoltAgent 04: Quality & Security ─────────────────────────────
    va("security-auditor","Security auditor","OWASP Top 10, JWT/OAuth review, SQL injection/XSS, CVE audit, secrets scanning",["security"],"04-quality-security","security-auditor",["owasp","jwt","xss","sqli","cve","secrets"]),
    va("penetration-tester","Penetration tester","Ethical hacking — recon, exploit research, CVSS scoring, MITRE ATT&CK",["security"],"04-quality-security","penetration-tester",["pentest","exploit","recon","cvss","mitre"]),
    va("code-reviewer","Code reviewer","Code quality — logic bugs, security, performance, naming, SOLID, DRY",["code-quality"],"04-quality-security","code-reviewer",["review","quality","bug","naming","solid","dry"]),
    va("qa-expert","QA expert","Test automation — Jest, Playwright, Cypress, Selenium, coverage strategy",["testing"],"04-quality-security","qa-expert",["qa","jest","playwright","cypress","selenium","coverage"]),
    va("debugger","Debugger","Stack traces, memory leaks, race conditions, core dumps, profiling",["code-quality"],"04-quality-security","debugger",["debug","memory","race","profiling","core-dump"]),
    va("performance-engineer","Performance engineer","Profiling, caching, CDN, DB query tuning, k6, Lighthouse, Core Web Vitals",["code-quality","monitoring"],"04-quality-security","performance-engineer",["performance","profiling","cache","k6","lighthouse","cwv"]),
    va("compliance-auditor","Compliance auditor","GDPR, SOC2, HIPAA, PCI-DSS, ISO 27001, audit trails, policy enforcement",["security","legal"],"04-quality-security","compliance-auditor",["compliance","gdpr","soc2","hipaa","pci","iso27001"]),
    va("accessibility-tester","Accessibility tester","WCAG 2.1/3.0, screen readers, ARIA, axe-core, keyboard navigation, color contrast",["testing","frontend"],"04-quality-security","accessibility-tester",["a11y","wcag","aria","axe","screen-reader","contrast"]),
    va("chaos-engineer","Chaos engineer","Fault injection, Netflix Chaos Monkey, LitmusChaos, game days, blast radius",["testing","devops"],"04-quality-security","chaos-engineer",["chaos","fault","litmus","game-day","resilience"]),
    va("test-automator","Test automator","BDD, Cucumber, Robot Framework, Selenium, CI/CD test pipelines",["testing"],"04-quality-security","test-automator",["bdd","cucumber","robot","selenium","test-pipeline"]),
    va("architect-reviewer","Architecture reviewer","Architecture reviews — patterns, scalability, coupling, ADRs, tech debt",["code-quality"],"04-quality-security","architect-reviewer",["architecture","review","adr","coupling","tech-debt"]),
    va("ad-security","Active Directory security reviewer","AD security, GPO audit, password policies, privileged accounts, lateral movement",["security"],"04-quality-security","ad-security-reviewer",["active-directory","gpo","ad","privilege","lateral-movement"]),
    va("powershell-security","PowerShell security hardening","PS execution policy, script signing, JEA, AMSI, logging, constrained mode",["security","devops"],"04-quality-security","powershell-security-hardening",["powershell","signing","jea","amsi","logging"]),

    // ── VoltAgent 05: Data & AI ───────────────────────────────────────
    va("ai-engineer","AI engineer","RAG pipelines, agents, fine-tuning, evaluation, production LLM systems",["ai-ml"],"05-data-ai","ai-engineer",["ai","rag","agents","fine-tuning","llm","evals"]),
    va("llm-architect","LLM architect","Prompt chains, evals, observability, context management, LangChain, LangGraph",["ai-ml"],"05-data-ai","llm-architect",["llm","prompt","chains","evals","langchain","langgraph"]),
    va("ml-engineer","ML engineer","Model training, serving, monitoring, MLOps, PyTorch, scikit-learn, drift detection",["ai-ml","data-science"],"05-data-ai","ml-engineer",["ml","pytorch","sklearn","mlops","serving","drift"]),
    va("mlops","MLOps engineer","Model deployment — Kubernetes, MLflow, Kubeflow, Seldon, BentoML, feature stores",["ai-ml","devops"],"05-data-ai","mlops-engineer",["mlops","mlflow","kubeflow","seldon","bentoml","feature-store"]),
    va("data-engineer","Data engineer","ETL/ELT pipelines, dbt, Airflow, Spark, Kafka, Snowflake, Delta Lake",["data-science"],"05-data-ai","data-engineer",["etl","dbt","airflow","spark","kafka","snowflake","delta"]),
    va("data-analyst","Data analyst","Pandas, SQL, Tableau, Power BI, statistics, A/B testing, visualization",["data-science","analytics"],"05-data-ai","data-analyst",["pandas","sql","tableau","powerbi","statistics","ab-test"]),
    va("data-scientist","Data scientist","Analytics, hypothesis testing, predictive models, feature engineering, Jupyter",["data-science"],"05-data-ai","data-scientist",["datascience","hypothesis","prediction","feature","jupyter"]),
    va("database-optimizer","Database optimizer","Query optimization, EXPLAIN, indexes, materialized views, partitioning, caching",["database"],"05-data-ai","database-optimizer",["optimizer","explain","index","materialized","partition","cache"]),
    va("postgres-pro","PostgreSQL expert","Extensions, JSONB, pgvector, partitioning, replication, Supabase, TimescaleDB",["database"],"05-data-ai","postgres-pro",["postgres","jsonb","pgvector","supabase","timescale","partition"]),
    va("nlp-engineer","NLP engineer","Text classification, NER, embeddings, transformers, BERT, fine-tuning, spaCy",["ai-ml"],"05-data-ai","nlp-engineer",["nlp","ner","embeddings","bert","transformers","spacy"]),
    va("prompt-engineer","Prompt engineer","Prompt optimization — few-shot, CoT, structured output, adversarial testing",["ai-ml"],"05-data-ai","prompt-engineer",["prompt","few-shot","cot","structured","adversarial"]),
    va("rl-engineer","Reinforcement learning engineer","RL and agent training — PPO, DQN, reward shaping, environments, RLHF",["ai-ml"],"05-data-ai","reinforcement-learning-engineer",["rl","ppo","dqn","reward","rlhf","environment"]),

    // ── VoltAgent 06: Developer Experience ───────────────────────────
    va("documentation-eng","Documentation engineer","API docs, ADRs, runbooks, README, changelog, Docusaurus, MkDocs",["documentation"],"06-developer-experience","documentation-engineer",["docs","adr","runbook","readme","changelog","docusaurus"]),
    va("git-workflow","Git workflow manager","Trunk-based dev, gitflow, rebase strategy, conflict resolution, hooks",["git"],"06-developer-experience","git-workflow-manager",["git","branch","rebase","conflict","hooks","trunk"]),
    va("refactoring","Refactoring specialist","Design patterns, clean code, anti-pattern elimination, modularity, SOLID",["code-quality"],"06-developer-experience","refactoring-specialist",["refactor","patterns","clean","solid","modularity"]),
    va("legacy-modernizer","Legacy modernizer","Migration strategies — strangler fig, incremental rewrite, anti-corruption layer",["code-quality"],"06-developer-experience","legacy-modernizer",["legacy","migration","strangler","acl","modernize"]),
    va("cli-developer","CLI developer","CLI tools — argument parsing, interactive prompts, shell completion, oclif, Click",["backend"],"06-developer-experience","cli-developer",["cli","shell","bash","prompts","oclif","click"]),
    va("mcp-developer","MCP developer","Model Context Protocol — server creation, tool design, resource URIs, testing",["ai-ml"],"06-developer-experience","mcp-developer",["mcp","protocol","server","tool","resource","claude"]),
    va("build-engineer","Build engineer","Build systems — webpack, Vite, Turbopack, Nx, Bazel, Gradle, caching",["devops"],"06-developer-experience","build-engineer",["build","webpack","vite","turbopack","nx","bazel","gradle"]),
    va("dependency-manager","Dependency manager","Package management — npm, pnpm, Yarn, Cargo, Maven, security audits, updates",["code-quality"],"06-developer-experience","dependency-manager",["npm","pnpm","yarn","cargo","maven","dependency","audit"]),
    va("dx-optimizer","DX optimizer","Developer experience — inner loop, local dev, onboarding, tooling, docs quality",["productivity"],"06-developer-experience","dx-optimizer",["dx","developer","inner-loop","tooling","onboarding"]),

    // ── VoltAgent 07: Specialized Domains ────────────────────────────
    va("payment-integration","Payment integration","Stripe, PayPal, Braintree, webhooks, PCI compliance, subscription billing",["payment"],"07-specialized-domains","payment-integration",["stripe","paypal","braintree","pci","subscription","webhook"]),
    va("game-developer","Game developer","Unity, Godot, game loops, physics, networking, ECS, shaders, level design",["frontend","backend"],"07-specialized-domains","game-developer",["game","unity","godot","ecs","shader","physics","multiplayer"]),
    va("fintech","Fintech engineer","Trading systems, financial APIs, compliance, risk, reconciliation, SWIFT, ISO 20022",["payment","security"],"07-specialized-domains","fintech-engineer",["fintech","trading","risk","compliance","swift","iso20022"]),
    va("seo-specialist","SEO specialist","Technical SEO, Core Web Vitals, structured data, sitemaps, robots.txt, hreflang",["content"],"07-specialized-domains","seo-specialist",["seo","cwv","schema","sitemap","robots","hreflang"]),
    va("blockchain","Blockchain developer","Solidity, Hardhat, smart contracts, DeFi, NFT, EVM, TheGraph, IPFS",["backend"],"07-specialized-domains","blockchain-developer",["blockchain","solidity","hardhat","defi","nft","evm","ipfs"]),
    va("iot-engineer","IoT engineer","MQTT, edge computing, firmware OTA, sensor data, AWS IoT, Azure IoT Hub",["backend","devops"],"07-specialized-domains","iot-engineer",["iot","mqtt","edge","firmware","ota","sensor"]),
    va("embedded-systems","Embedded systems expert","Firmware — C/C++, RTOS, FreeRTOS, Zephyr, HAL, bare-metal, peripherals",["backend"],"07-specialized-domains","embedded-systems",["embedded","rtos","freertos","zephyr","hal","firmware","c"]),
    va("api-documenter","API documenter","API documentation — OpenAPI 3.1, Redoc, Swagger UI, Postman collections",["api","documentation"],"07-specialized-domains","api-documenter",["api","openapi","redoc","swagger","postman","documentation"]),
    va("quant-analyst","Quant analyst","Quantitative analysis — backtesting, factor models, time-series, risk metrics",["data-science","payment"],"07-specialized-domains","quant-analyst",["quant","backtest","factor","time-series","risk","sharpe"]),

    // ── VoltAgent 08: Business & Product ──────────────────────────────
    va("product-manager","Product manager","PRDs, roadmaps, OKRs, user stories, RICE/ICE prioritization, Figma reviews",["project-management"],"08-business-product","product-manager",["product","prd","roadmap","okr","rice","user-story"]),
    va("project-manager","Project manager","Sprint planning, WBS, milestones, risk register, stakeholder comms, RAID log",["project-management"],"08-business-product","project-manager",["sprint","milestone","wbs","risk","raid","stakeholder"]),
    va("business-analyst","Business analyst","BRDs, use cases, process modeling, BPMN, gap analysis, stakeholder workshops",["project-management"],"08-business-product","business-analyst",["brd","use-case","bpmn","gap","stakeholder","process"]),
    va("technical-writer","Technical writer","User guides, API references, release notes, style guide enforcement, Diataxis",["documentation"],"08-business-product","technical-writer",["user-guide","api-ref","release-notes","diataxis","style"]),
    va("scrum-master","Scrum master","Ceremonies, velocity, retrospectives, impediments, Jira, SAFe, estimation",["project-management"],"08-business-product","scrum-master",["scrum","velocity","retrospective","safe","jira","estimation"]),
    va("content-marketer","Content marketer","SEO content, social media strategy, email campaigns, content calendar, analytics",["content","email-marketing"],"08-business-product","content-marketer",["content","seo","social","email","campaign","analytics"]),
    va("customer-success","Customer success manager","Onboarding, health scores, QBRs, churn prevention, NPS, Gainsight",["crm"],"08-business-product","customer-success-manager",["csm","onboarding","churn","nps","gainsight","health"]),
    va("ux-researcher","UX researcher","User research — interviews, usability testing, heuristic evaluation, affinity mapping",["frontend","design"],"08-business-product","ux-researcher",["ux","research","usability","interview","heuristic","affinity"]),
    va("wordpress-master","WordPress master","WordPress themes, plugins, Gutenberg, WooCommerce, performance, multisite",["frontend","backend"],"08-business-product","wordpress-master",["wordpress","woocommerce","gutenberg","plugin","theme"]),

    // ── VoltAgent 09: Meta & Orchestration ───────────────────────────
    va("multi-agent-coord","Multi-agent coordinator","Advanced multi-agent orchestration — decomposition, parallel execution, aggregation",["orchestration"],"09-meta-orchestration","multi-agent-coordinator",["orchestration","multi-agent","parallel","aggregate","routing"]),
    va("workflow-orchestrator","Workflow orchestrator","Complex workflow automation — DAGs, retries, state machines, event-driven flows",["orchestration","productivity"],"09-meta-orchestration","workflow-orchestrator",["workflow","dag","state-machine","event","retry"]),
    va("task-distributor","Task distributor","Load balancing, priority queues, agent routing, work-stealing, backpressure",["orchestration"],"09-meta-orchestration","task-distributor",["task","distribute","queue","routing","priority","backpressure"]),
    va("context-manager","Context manager","Token budget, memory summarization, relevance filtering, progressive disclosure",["orchestration","ai-ml"],"09-meta-orchestration","context-manager",["context","token","memory","summarize","filter","budget"]),
    va("pied-piper","Pied Piper (SDLC orchestrator)","Orchestrate team of AI subagents for repetitive SDLC workflows",["orchestration","devops"],"09-meta-orchestration","pied-piper",["sdlc","orchestrate","subagent","workflow","team"]),
    va("agent-organizer","Agent organizer","Multi-agent coordinator — routing, sequencing, result merging, error recovery",["orchestration"],"09-meta-orchestration","agent-organizer",["agent","organize","route","sequence","merge"]),
    va("performance-monitor","Performance monitor","Agent performance optimization — latency tracking, cost analysis, bottleneck detection",["orchestration","monitoring"],"09-meta-orchestration","performance-monitor",["performance","latency","cost","bottleneck","agent"]),
    va("it-ops-orchestrator","IT ops orchestrator","IT operations workflow orchestration — incident triage, runbook execution, escalation",["orchestration","devops"],"09-meta-orchestration","it-ops-orchestrator",["it-ops","incident","runbook","escalation","triage"]),

    // ── VoltAgent 10: Research & Analysis ────────────────────────────
    va("research-analyst","Research analyst","Web synthesis, competitive analysis, literature review, report generation",["research"],"10-research-analysis","research-analyst",["research","synthesis","competitive","report","literature"]),
    va("competitive-analyst","Competitive analyst","Feature comparison, pricing analysis, market positioning, SWOT, battlecards",["research"],"10-research-analysis","competitive-analyst",["competitive","swot","battlecard","pricing","positioning"]),
    va("market-researcher","Market researcher","Market analysis, consumer insights, surveys, segmentation, TAM/SAM/SOM",["research"],"10-research-analysis","market-researcher",["market","consumer","survey","segmentation","tam"]),
    va("trend-analyst","Trend analyst","Emerging trends, forecasting, technology radar, weak signals, prediction",["research"],"10-research-analysis","trend-analyst",["trend","forecast","radar","signal","prediction"]),
    va("search-specialist","Search specialist","Advanced information retrieval — Boolean logic, academic DBs, citation analysis",["research"],"10-research-analysis","search-specialist",["search","retrieval","boolean","citation","academic"]),
    va("data-researcher","Data researcher","Data discovery and analysis — open datasets, APIs, scraping, provenance",["research","data-science"],"10-research-analysis","data-researcher",["data","discovery","open-data","scraping","provenance"]),

    // ── ComposioHQ: CRM ──────────────────────────────────────────────
    cx("salesforce","Salesforce automation","Automate Salesforce — SOQL queries, records, bulk operations, Apex triggers, flows",["crm"],"salesforce-automation",["salesforce","crm","soql","apex","object","flow"]),
    cx("hubspot","HubSpot automation","Automate HubSpot — contacts, deals, companies, tickets, email engagement, sequences",["crm","email-marketing"],"hubspot-automation",["hubspot","crm","contact","deal","email","sequence"]),
    cx("pipedrive","Pipedrive automation","Automate Pipedrive — deals, contacts, organizations, activities, pipelines",["crm"],"pipedrive-automation",["pipedrive","crm","deal","contact","pipeline","activity"]),
    cx("close-crm","Close CRM automation","Automate Close — leads, contacts, opportunities, call logging, sequences",["crm"],"close-automation",["close","crm","lead","opportunity","call","sequence"]),
    cx("zoho","Zoho CRM automation","Automate Zoho — leads, contacts, deals, accounts, blueprints, modules",["crm"],"zoho-automation",["zoho","crm","lead","blueprint","module"]),
    cx("activecampaign","ActiveCampaign automation","Contacts, lists, campaigns, automations, deals, pipelines",["crm","email-marketing"],"activecampaign-automation",["activecampaign","email","campaign","list","crm"]),

    // ── ComposioHQ: Project Management ───────────────────────────────
    cx("asana","Asana automation","Automate Asana — tasks, projects, sections, assignments, custom fields",["project-management"],"asana-automation",["asana","task","project","section","assignment"]),
    cx("clickup","ClickUp automation","Automate ClickUp — tasks, lists, spaces, goals, docs, time tracking",["project-management"],"clickup-automation",["clickup","task","list","space","goal","time"]),
    cx("basecamp","Basecamp automation","Automate Basecamp — to-do lists, messages, campfire chats, schedule",["project-management"],"basecamp-automation",["basecamp","todo","message","schedule","project"]),
    cx("confluence","Confluence automation","Automate Confluence — pages, spaces, comments, macros, search",["project-management","documentation"],"confluence-automation",["confluence","page","space","wiki","macro"]),
    cx("coda","Coda automation","Automate Coda — docs, tables, views, automations, packs, formulas",["project-management","productivity"],"coda-automation",["coda","doc","table","pack","formula","automation"]),
    cx("airtable","Airtable automation","Automate Airtable — bases, tables, records, views, automations, linked records",["project-management","database"],"airtable-automation",["airtable","base","table","record","view","linked"]),

    // ── ComposioHQ: Communication ────────────────────────────────────
    cx("discord","Discord automation","Automate Discord — messages, channels, roles, webhooks, bots, threads, forums",["communication"],"discord-automation",["discord","message","channel","role","webhook","bot","thread"]),
    cx("internal-comms","Internal communications","Status reports, newsletters, team announcements, FAQs, meeting summaries",["communication","content"],"internal-comms",["internal","comms","status","newsletter","announcement","memo"]),

    // ── ComposioHQ: Analytics & Monitoring ───────────────────────────
    cx("amplitude","Amplitude analytics","Events, user properties, charts, cohorts, funnel analysis, retention",["analytics","monitoring"],"amplitude-automation",["amplitude","analytics","event","funnel","cohort","retention"]),
    cx("datadog","Datadog automation","Metrics, logs, traces, monitors, dashboards, SLOs, alerts, APM",["monitoring"],"datadog-automation",["datadog","metrics","logs","traces","monitor","dashboard","apm"]),

    // ── ComposioHQ: DevOps ───────────────────────────────────────────
    cx("bitbucket","Bitbucket automation","Repos, PRs, branches, pipelines, deployments, code insights",["git","devops"],"bitbucket-automation",["bitbucket","git","pr","pipeline","deployment","branch"]),
    cx("circleci","CircleCI automation","Pipelines, jobs, workflows, artifacts, orbs, test results, insights",["devops"],"circleci-automation",["circleci","pipeline","workflow","orb","artifact","job"]),

    // ── ComposioHQ: Design ───────────────────────────────────────────
    cx("canva","Canva automation","Designs, templates, assets, brand kit, resize, exports",["design"],"canva-automation",["canva","design","template","brand","asset","export"]),
    cx("canvas-design","Canvas design skill","Create visual art in PNG/PDF using design philosophy for posters, print pieces",["design"],"canvas-design",["design","art","poster","png","pdf","visual","print"]),
    cx("brand-guidelines","Brand guidelines","Apply official brand colors and typography consistently across artifacts",["design","content"],"brand-guidelines",["brand","color","typography","style","guideline","logo"]),

    // ── ComposioHQ: Scheduling ───────────────────────────────────────
    cx("calendly","Calendly automation","Event types, bookings, availability, invitees, routing, webhooks",["scheduling"],"calendly-automation",["calendly","booking","availability","event","routing","webhook"]),
    cx("calcom","Cal.com automation","Open-source scheduling — bookings, event types, availability, webhooks",["scheduling"],"cal-com-automation",["cal.com","booking","open-source","availability","event"]),

    // ── ComposioHQ: File Storage ─────────────────────────────────────
    cx("box","Box automation","Files, folders, collaborations, metadata, search, watermarking, Shield",["file-storage"],"box-automation",["box","file","folder","collaboration","metadata","shield"]),
    cx("dropbox","Dropbox automation","Files, folders, sharing, Paper docs, Business teams, backup",["file-storage"],"dropbox-automation",["dropbox","file","folder","share","paper","backup"]),

    // ── ComposioHQ: Legal ────────────────────────────────────────────
    cx("docusign","DocuSign automation","Envelopes, templates, signing flows, webhooks, bulk send, certificate",["legal"],"docusign-automation",["docusign","esignature","envelope","template","signing","contract"]),

    // ── ComposioHQ: HR ───────────────────────────────────────────────
    cx("bamboohr","BambooHR automation","Employees, time-off requests, reports, onboarding, offboarding, custom fields",["hr"],"bamboohr-automation",["bamboohr","hr","employee","pto","onboarding","offboarding"]),

    // ── ComposioHQ: Email Marketing ──────────────────────────────────
    cx("convertkit","ConvertKit automation","Subscribers, tags, sequences, broadcasts, forms, automations",["email-marketing"],"convertkit-automation",["convertkit","email","subscriber","sequence","broadcast","tag"]),
    cx("brevo","Brevo automation","Contacts, campaigns, transactional emails, SMS, automations, templates",["email-marketing"],"brevo-automation",["brevo","sendinblue","email","sms","campaign","transactional"]),

    // ── ComposioHQ: Content & Writing ────────────────────────────────
    cx("content-writer","Content research writer","High-quality content with research, citations, hooks, section-by-section feedback",["content"],"content-research-writer",["content","research","writing","blog","citation","hook"]),
    cx("changelog","Changelog generator","User-facing changelogs from git commits — semantic grouping, markdown output",["git","documentation"],"changelog-generator",["changelog","git","release","commit","semantic","version"]),

    // ── ComposioHQ: AI & Development ─────────────────────────────────
    cx("mcp-builder","MCP server builder","High-quality MCP server creation — tools, resources, prompts, TypeScript/Python",["ai-ml"],"mcp-builder",["mcp","server","tool","resource","typescript","python","protocol"]),
    cx("n8n","n8n workflow automation","Operate n8n — nodes, triggers, expressions, credentials, executions, HTTP requests",["productivity","ai-ml"],"n8n-skills",["n8n","workflow","automation","node","trigger","expression"]),
    cx("artifacts-builder","Claude Artifacts builder","Elaborate claude.ai HTML artifacts — React, Tailwind CSS, shadcn/ui components",["frontend","ai-ml"],"artifacts-builder",["artifacts","react","tailwind","shadcn","html","claude","web"]),
    cx("langsmith","LangSmith fetch","Debug LangChain/LangGraph agents by fetching execution traces from LangSmith",["ai-ml","monitoring"],"langsmith-fetch",["langsmith","langchain","langgraph","trace","debug","observability"]),
    cx("prompt-engineering","Prompt engineering","Anthropic best practices, few-shot, CoT, structured output, agent patterns",["ai-ml"],"prompt-engineering",["prompt","few-shot","cot","structured","anthropic","pattern"]),
    cx("software-arch","Software architecture","Clean Architecture, SOLID, DDD, hexagonal, ports-and-adapters, best practices",["code-quality","backend"],"software-architecture",["architecture","solid","ddd","clean","hexagonal","ports"]),
    cx("tdd","Test-driven development","Red-green-refactor cycle, test-first for any feature or bugfix, mutation testing",["testing"],"test-driven-development",["tdd","test","red-green","refactor","unit","mutation"]),
    cx("subagent-dev","Subagent-driven development","Independent subagents per task with code review checkpoints between iterations",["orchestration","testing"],"subagent-driven-development",["subagent","dispatch","review","iteration","checkpoint"]),
    cx("git-worktrees","Git worktrees skill","Isolated git worktrees — smart directory selection, safety verification, parallel",["git"],"using-git-worktrees",["git","worktree","isolated","parallel","branch","safety"]),
    cx("webapp-testing","Webapp testing (Playwright)","Test local web apps with Playwright — UI verification, debugging, screenshots",["testing"],"webapp-testing",["playwright","browser","testing","ui","screenshot","debug"]),
    cx("skill-creator","Skill creator","Guided skill creation — Q&A interview process to build new Claude skills",["productivity","ai-ml"],"skill-creator",["skill","create","template","claude","guide","interview"]),
    cx("composio-sdk","Composio SDK integration","Connect Claude to 500+ apps via Composio — auth, actions, triggers",["productivity","ai-ml"],"composio-sdk",["composio","sdk","apps","auth","action","trigger"]),

    // ── ComposioHQ: Document Skills (sub-directory) ───────────────────
    cx("docx","Word documents (docx)","Create, edit, analyze Word docs — tracked changes, comments, formatting, templates",["documents"],"document-skills/docx",["word","docx","tracked-changes","comment","formatting","template"]),
    cx("pdf","PDF manipulation","Extract text, tables, metadata, merge, split, annotate, fill forms, OCR",["documents"],"document-skills/pdf",["pdf","extract","merge","split","ocr","annotation","form"]),
    cx("pptx","PowerPoint presentations","Read, generate, adjust slides — layouts, templates, speaker notes, themes",["documents"],"document-skills/pptx",["powerpoint","pptx","slide","layout","template","theme","speaker-notes"]),
    cx("xlsx","Excel spreadsheets","Formulas, charts, pivot tables, data validation, macros, data transformations",["documents","data-science"],"document-skills/xlsx",["excel","xlsx","formula","chart","pivot","validation","macro"]),

    // ── jeremylongshore Community ─────────────────────────────────────
    jl("devops-automation","DevOps automation pack","Full devops — CI/CD, Docker, K8s, IaC, monitoring, alerting, GitOps skills",["devops"],"plugins/devops/devops-automation-pack","devops-automation",["devops","cicd","docker","k8s","monitoring","iac","gitops"]),
    jl("ansible","Ansible playbook creator","Ansible playbooks — roles, handlers, vault, templates, molecule testing",["devops"],"plugins/devops/ansible-playbook-creator","ansible-playbook-creator",["ansible","playbook","role","vault","template","molecule"]),
    jl("git-commit","Git commit (smart)","Conventional commits, semantic versioning, changelog generation, scope inference",["git","productivity"],"plugins/devops/git-commit-smart","git-commit-smart",["git","commit","conventional","changelog","semantic"]),
    jl("threat-hunting","Threat hunting with Sigma","Sigma rules, SIEM query generation, log analysis, IOC detection, detection engineering",["security","monitoring"],"plugins/security/threat-hunting-with-sigma-rules","threat-hunting-with-sigma-rules",["sigma","siem","ioc","detection","log","threat"]),
    jl("pentest","Penetration testing v2","Python security scanners, OWASP, network recon, exploitation, reporting v2.0",["security"],"plugins/security/penetration-tester","penetration-tester",["pentest","owasp","scanner","recon","report","python"]),
    jl("forensics","Computer forensics","Disk image analysis, memory dumps, file recovery, timeline forensics, chain of custody",["security"],"plugins/security/computer-forensics","computer-forensics",["forensics","disk","memory","timeline","recovery","custody"]),
    jl("ai-ethics","AI ethics validator","Bias detection, fairness metrics, transparency, accountability, AI audit",["ai-ml","code-quality"],"plugins/ai-ml/ai-ethics-validator","validating-ai-ethics-and-fairness",["ai","ethics","bias","fairness","transparency","audit"]),
    jl("lucidchart","Lucidchart integration","Lucid REST API — programmatic diagram creation, data-linked visualizations",["design","documentation"],"plugins/saas-packs/lucidchart-pack","lucidchart",["lucidchart","diagram","visualization","api","data-linked"]),
    jl("posthog","PostHog analytics","Product analytics — events, feature flags, session replay, funnels, experiments",["analytics","monitoring"],"plugins/saas-packs/skill-databases/posthog","posthog",["posthog","analytics","feature-flag","session","funnel","experiment"]),
    jl("flyio","Fly.io deployment","Fly.io — machines, volumes, secrets, production checklist, multi-region",["cloud","devops"],"plugins/saas-packs/flyio-pack","flyio-prod-checklist",["flyio","deploy","machine","volume","secret","multi-region"]),
    jl("mistral-security","Mistral API security","Mistral API key management, rate limits, content filtering, audit logging",["security","ai-ml"],"plugins/saas-packs/mistral-pack","mistral-security-basics",["mistral","api-key","rate-limit","filter","audit"]),
    jl("cursor-multi-repo","Cursor multi-repo","Cursor IDE — multi-repo workflows, SSO, AI settings, advanced configs",["productivity"],"plugins/saas-packs/cursor-pack","cursor-multi-repo",["cursor","ide","multi-repo","sso","ai","editor"]),

    // ── Anthropic Official Plugins ────────────────────────────────────
    ant("frontend-design","Frontend design (official)","Avoid AI slop — bold, production-grade React & Tailwind UI with real design decisions",["frontend","design"],"frontend-design",["react","tailwind","design","ui","component","production"]),
    ant("code-review","Code review (official)","Systematic PR review — logic, security, performance, naming, test coverage",["code-quality"],"code-review",["review","pr","quality","bug","naming","coverage"]),
    ant("feature-dev","Feature development (official)","End-to-end feature workflow — planning, implementation, testing, documentation",["backend","frontend"],"feature-dev",["feature","planning","implementation","testing","docs"]),
    ant("commit-commands","Commit commands (official)","Smart commit messages, PR descriptions, changelog from staged changes",["git"],"commit-commands",["commit","pr","changelog","staged","message"]),
    ant("security-guidance","Security guidance (official)","OWASP, secrets detection, input validation, dependency audit, secure coding",["security"],"security-guidance",["owasp","secrets","validation","audit","secure"]),
    ant("pr-review-toolkit","PR review toolkit (official)","Comprehensive PR review — diff analysis, feedback templates, CI integration",["code-quality","git"],"pr-review-toolkit",["pr","diff","feedback","ci","review","template"]),
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

  const scored: ScoredItem[] = catalog.items.map(item => {
    let score = 0
    const reasons: string[] = []

    // Direct name match
    const nameLower = item.name.toLowerCase()
    const stripped = lower.replace(/^(add|install|get|use|need|setup|set up)\s+/i, "")
    if (lower.includes(nameLower) || nameLower.includes(stripped)) {
      score += 40; reasons.push("name")
    }

    // Description word overlap
    const descWords = item.description.toLowerCase().split(/\W+/)
    const inputWords = lower.split(/\W+/).filter(w => w.length > 2)
    const overlap = inputWords.filter(w => descWords.includes(w)).length
    if (overlap > 0) { score += Math.min(overlap * 8, 32); reasons.push(`desc:${overlap}`) }

    // Category keyword match
    for (const cat of item.categories) {
      const kws = CATEGORY_KEYWORDS[cat] ?? []
      const hit = kws.filter(kw => lower.includes(kw))
      if (hit.length > 0) {
        score += hit.length * 10
        matchedCategories.add(cat)
        reasons.push(`cat:${cat}`)
      }
    }

    // Tag match
    const hitTags = item.tags.filter(t => lower.includes(t))
    if (hitTags.length > 0) { score += hitTags.length * 6; reasons.push(`tags:${hitTags.slice(0,3).join(",")}`) }

    // Type preference
    if (isAgent && item.type === "agent")   score += 18
    if (!isAgent && item.type === "skill")  score += 12
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
