/**
 * Live URL validation — tests every directUrl in the SEED_CATALOG.
 * Reports: ✅ (200 + >50 bytes), ⚠️ (200 but small), ❌ (404/error)
 */
const https = require("https");
const http = require("http");

// ── All catalog URLs extracted from marketplace-catalog (1).ts ───────────
const VA = "https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/categories";
const JL = "https://raw.githubusercontent.com/jeremylongshore/claude-code-plugins-plus-skills/main";
const CX = "https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master";

// Helper functions matching catalog builders
function vaUrl(dir, file) { return `${VA}/${dir}/${file}.md`; }
function cxUrl(dir) { return `${CX}/${dir}/SKILL.md`; }
function jlUrl(pluginPath, skillName) { return `${JL}/${pluginPath}/skills/${skillName}/SKILL.md`; }

// ── ALL catalog entries (id, name, url, source) ─────────────────────────
const entries = [
    // VoltAgent 01: Core Development
    { id: "va-api-designer", url: vaUrl("01-core-development", "api-designer"), src: "VA" },
    { id: "va-backend-developer", url: vaUrl("01-core-development", "backend-developer"), src: "VA" },
    { id: "va-fullstack-developer", url: vaUrl("01-core-development", "fullstack-developer"), src: "VA" },
    { id: "va-frontend-developer", url: vaUrl("01-core-development", "frontend-developer"), src: "VA" },
    { id: "va-graphql-architect", url: vaUrl("01-core-development", "graphql-architect"), src: "VA" },
    { id: "va-microservices-arch", url: vaUrl("01-core-development", "microservices-architect"), src: "VA" },
    { id: "va-websocket-engineer", url: vaUrl("01-core-development", "websocket-engineer"), src: "VA" },
    { id: "va-mobile-developer", url: vaUrl("01-core-development", "mobile-developer"), src: "VA" },
    { id: "va-electron-pro", url: vaUrl("01-core-development", "electron-pro"), src: "VA" },
    { id: "va-ui-designer", url: vaUrl("01-core-development", "ui-designer"), src: "VA" },

    // VoltAgent 02: Language Specialists
    { id: "va-typescript-pro", url: vaUrl("02-language-specialists", "typescript-pro"), src: "VA" },
    { id: "va-python-pro", url: vaUrl("02-language-specialists", "python-pro"), src: "VA" },
    { id: "va-golang-pro", url: vaUrl("02-language-specialists", "golang-pro"), src: "VA" },
    { id: "va-rust-engineer", url: vaUrl("02-language-specialists", "rust-engineer"), src: "VA" },
    { id: "va-java-architect", url: vaUrl("02-language-specialists", "java-architect"), src: "VA" },
    { id: "va-spring-boot", url: vaUrl("02-language-specialists", "spring-boot-engineer"), src: "VA" },
    { id: "va-csharp-developer", url: vaUrl("02-language-specialists", "csharp-developer"), src: "VA" },
    { id: "va-dotnet-core", url: vaUrl("02-language-specialists", "dotnet-core-expert"), src: "VA" },
    { id: "va-react-specialist", url: vaUrl("02-language-specialists", "react-specialist"), src: "VA" },
    { id: "va-nextjs-developer", url: vaUrl("02-language-specialists", "nextjs-developer"), src: "VA" },
    { id: "va-vue-expert", url: vaUrl("02-language-specialists", "vue-expert"), src: "VA" },
    { id: "va-flutter-expert", url: vaUrl("02-language-specialists", "flutter-expert"), src: "VA" },
    { id: "va-kotlin-specialist", url: vaUrl("02-language-specialists", "kotlin-specialist"), src: "VA" },
    { id: "va-swift-expert", url: vaUrl("02-language-specialists", "swift-expert"), src: "VA" },
    { id: "va-php-pro", url: vaUrl("02-language-specialists", "php-pro"), src: "VA" },
    { id: "va-laravel-specialist", url: vaUrl("02-language-specialists", "laravel-specialist"), src: "VA" },
    { id: "va-fastapi", url: vaUrl("02-language-specialists", "fastapi-developer"), src: "VA" },
    { id: "va-django", url: vaUrl("02-language-specialists", "django-developer"), src: "VA" },
    { id: "va-rails", url: vaUrl("02-language-specialists", "rails-expert"), src: "VA" },
    { id: "va-sql-pro", url: vaUrl("02-language-specialists", "sql-pro"), src: "VA" },
    { id: "va-angular", url: vaUrl("02-language-specialists", "angular-architect"), src: "VA" },
    { id: "va-expo-rn", url: vaUrl("02-language-specialists", "expo-react-native-expert"), src: "VA" },
    { id: "va-js-pro", url: vaUrl("02-language-specialists", "javascript-pro"), src: "VA" },
    { id: "va-powershell-7", url: vaUrl("02-language-specialists", "powershell-7-expert"), src: "VA" },

    // VoltAgent 03: Infrastructure
    { id: "va-cloud-architect", url: vaUrl("03-infrastructure", "cloud-architect"), src: "VA" },
    { id: "va-devops-engineer", url: vaUrl("03-infrastructure", "devops-engineer"), src: "VA" },
    { id: "va-kubernetes", url: vaUrl("03-infrastructure", "kubernetes-specialist"), src: "VA" },
    { id: "va-docker-expert", url: vaUrl("03-infrastructure", "docker-expert"), src: "VA" },
    { id: "va-terraform-engineer", url: vaUrl("03-infrastructure", "terraform-engineer"), src: "VA" },
    { id: "va-terragrunt", url: vaUrl("03-infrastructure", "terragrunt-expert"), src: "VA" },
    { id: "va-database-admin", url: vaUrl("03-infrastructure", "database-administrator"), src: "VA" },
    { id: "va-security-infra", url: vaUrl("03-infrastructure", "security-engineer"), src: "VA" },
    { id: "va-sre", url: vaUrl("03-infrastructure", "sre-engineer"), src: "VA" },
    { id: "va-deployment-engineer", url: vaUrl("03-infrastructure", "deployment-engineer"), src: "VA" },
    { id: "va-network-engineer", url: vaUrl("03-infrastructure", "network-engineer"), src: "VA" },
    { id: "va-platform-engineer", url: vaUrl("03-infrastructure", "platform-engineer"), src: "VA" },
    { id: "va-azure-infra", url: vaUrl("03-infrastructure", "azure-infra-engineer"), src: "VA" },

    // VoltAgent 04: Quality & Security
    { id: "va-security-auditor", url: vaUrl("04-quality-security", "security-auditor"), src: "VA" },
    { id: "va-penetration-tester", url: vaUrl("04-quality-security", "penetration-tester"), src: "VA" },
    { id: "va-code-reviewer", url: vaUrl("04-quality-security", "code-reviewer"), src: "VA" },
    { id: "va-qa-expert", url: vaUrl("04-quality-security", "qa-expert"), src: "VA" },
    { id: "va-debugger", url: vaUrl("04-quality-security", "debugger"), src: "VA" },
    { id: "va-performance-engineer", url: vaUrl("04-quality-security", "performance-engineer"), src: "VA" },
    { id: "va-compliance-auditor", url: vaUrl("04-quality-security", "compliance-auditor"), src: "VA" },
    { id: "va-accessibility-tester", url: vaUrl("04-quality-security", "accessibility-tester"), src: "VA" },
    { id: "va-chaos-engineer", url: vaUrl("04-quality-security", "chaos-engineer"), src: "VA" },
    { id: "va-test-automator", url: vaUrl("04-quality-security", "test-automator"), src: "VA" },
    { id: "va-architect-reviewer", url: vaUrl("04-quality-security", "architect-reviewer"), src: "VA" },
    { id: "va-ad-security", url: vaUrl("04-quality-security", "ad-security-reviewer"), src: "VA" },
    { id: "va-powershell-security", url: vaUrl("04-quality-security", "powershell-security-hardening"), src: "VA" },

    // VoltAgent 05: Data & AI
    { id: "va-ai-engineer", url: vaUrl("05-data-ai", "ai-engineer"), src: "VA" },
    { id: "va-llm-architect", url: vaUrl("05-data-ai", "llm-architect"), src: "VA" },
    { id: "va-ml-engineer", url: vaUrl("05-data-ai", "ml-engineer"), src: "VA" },
    { id: "va-mlops", url: vaUrl("05-data-ai", "mlops-engineer"), src: "VA" },
    { id: "va-data-engineer", url: vaUrl("05-data-ai", "data-engineer"), src: "VA" },
    { id: "va-data-analyst", url: vaUrl("05-data-ai", "data-analyst"), src: "VA" },
    { id: "va-data-scientist", url: vaUrl("05-data-ai", "data-scientist"), src: "VA" },
    { id: "va-database-optimizer", url: vaUrl("05-data-ai", "database-optimizer"), src: "VA" },
    { id: "va-postgres-pro", url: vaUrl("05-data-ai", "postgres-pro"), src: "VA" },
    { id: "va-nlp-engineer", url: vaUrl("05-data-ai", "nlp-engineer"), src: "VA" },
    { id: "va-prompt-engineer", url: vaUrl("05-data-ai", "prompt-engineer"), src: "VA" },
    { id: "va-rl-engineer", url: vaUrl("05-data-ai", "reinforcement-learning-engineer"), src: "VA" },

    // VoltAgent 06: Developer Experience
    { id: "va-documentation-eng", url: vaUrl("06-developer-experience", "documentation-engineer"), src: "VA" },
    { id: "va-git-workflow", url: vaUrl("06-developer-experience", "git-workflow-manager"), src: "VA" },
    { id: "va-refactoring", url: vaUrl("06-developer-experience", "refactoring-specialist"), src: "VA" },
    { id: "va-legacy-modernizer", url: vaUrl("06-developer-experience", "legacy-modernizer"), src: "VA" },
    { id: "va-cli-developer", url: vaUrl("06-developer-experience", "cli-developer"), src: "VA" },
    { id: "va-mcp-developer", url: vaUrl("06-developer-experience", "mcp-developer"), src: "VA" },
    { id: "va-build-engineer", url: vaUrl("06-developer-experience", "build-engineer"), src: "VA" },
    { id: "va-dependency-manager", url: vaUrl("06-developer-experience", "dependency-manager"), src: "VA" },
    { id: "va-dx-optimizer", url: vaUrl("06-developer-experience", "dx-optimizer"), src: "VA" },

    // VoltAgent 07: Specialized Domains
    { id: "va-payment-integration", url: vaUrl("07-specialized-domains", "payment-integration"), src: "VA" },
    { id: "va-game-developer", url: vaUrl("07-specialized-domains", "game-developer"), src: "VA" },
    { id: "va-fintech", url: vaUrl("07-specialized-domains", "fintech-engineer"), src: "VA" },
    { id: "va-seo-specialist", url: vaUrl("07-specialized-domains", "seo-specialist"), src: "VA" },
    { id: "va-blockchain", url: vaUrl("07-specialized-domains", "blockchain-developer"), src: "VA" },
    { id: "va-iot-engineer", url: vaUrl("07-specialized-domains", "iot-engineer"), src: "VA" },
    { id: "va-embedded-systems", url: vaUrl("07-specialized-domains", "embedded-systems"), src: "VA" },
    { id: "va-api-documenter", url: vaUrl("07-specialized-domains", "api-documenter"), src: "VA" },
    { id: "va-quant-analyst", url: vaUrl("07-specialized-domains", "quant-analyst"), src: "VA" },

    // VoltAgent 08: Business & Product
    { id: "va-product-manager", url: vaUrl("08-business-product", "product-manager"), src: "VA" },
    { id: "va-project-manager", url: vaUrl("08-business-product", "project-manager"), src: "VA" },
    { id: "va-business-analyst", url: vaUrl("08-business-product", "business-analyst"), src: "VA" },
    { id: "va-technical-writer", url: vaUrl("08-business-product", "technical-writer"), src: "VA" },
    { id: "va-scrum-master", url: vaUrl("08-business-product", "scrum-master"), src: "VA" },
    { id: "va-content-marketer", url: vaUrl("08-business-product", "content-marketer"), src: "VA" },
    { id: "va-customer-success", url: vaUrl("08-business-product", "customer-success-manager"), src: "VA" },
    { id: "va-ux-researcher", url: vaUrl("08-business-product", "ux-researcher"), src: "VA" },
    { id: "va-wordpress-master", url: vaUrl("08-business-product", "wordpress-master"), src: "VA" },

    // VoltAgent 09: Meta & Orchestration
    { id: "va-multi-agent-coord", url: vaUrl("09-meta-orchestration", "multi-agent-coordinator"), src: "VA" },
    { id: "va-workflow-orchestrator", url: vaUrl("09-meta-orchestration", "workflow-orchestrator"), src: "VA" },
    { id: "va-task-distributor", url: vaUrl("09-meta-orchestration", "task-distributor"), src: "VA" },
    { id: "va-context-manager", url: vaUrl("09-meta-orchestration", "context-manager"), src: "VA" },
    { id: "va-agent-organizer", url: vaUrl("09-meta-orchestration", "agent-organizer"), src: "VA" },
    { id: "va-performance-monitor", url: vaUrl("09-meta-orchestration", "performance-monitor"), src: "VA" },
    { id: "va-it-ops-orchestrator", url: vaUrl("09-meta-orchestration", "it-ops-orchestrator"), src: "VA" },

    // VoltAgent 10: Research & Analysis
    { id: "va-research-analyst", url: vaUrl("10-research-analysis", "research-analyst"), src: "VA" },
    { id: "va-competitive-analyst", url: vaUrl("10-research-analysis", "competitive-analyst"), src: "VA" },
    { id: "va-market-researcher", url: vaUrl("10-research-analysis", "market-researcher"), src: "VA" },
    { id: "va-trend-analyst", url: vaUrl("10-research-analysis", "trend-analyst"), src: "VA" },
    { id: "va-search-specialist", url: vaUrl("10-research-analysis", "search-specialist"), src: "VA" },
    { id: "va-data-researcher", url: vaUrl("10-research-analysis", "data-researcher"), src: "VA" },

    // ComposioHQ (all root-level & document-skills — verified via GitHub API)
    // Communication
    { id: "cx-internal-comms", url: cxUrl("internal-comms"), src: "CX" },
    { id: "cx-slack-gif-creator", url: cxUrl("slack-gif-creator"), src: "CX" },
    { id: "cx-skill-share", url: cxUrl("skill-share"), src: "CX" },
    // Design & Presentation
    { id: "cx-canvas-design", url: cxUrl("canvas-design"), src: "CX" },
    { id: "cx-brand-guidelines", url: cxUrl("brand-guidelines"), src: "CX" },
    { id: "cx-theme-factory", url: cxUrl("theme-factory"), src: "CX" },
    { id: "cx-image-enhancer", url: cxUrl("image-enhancer"), src: "CX" },
    // Content & Writing
    { id: "cx-content-writer", url: cxUrl("content-research-writer"), src: "CX" },
    { id: "cx-changelog", url: cxUrl("changelog-generator"), src: "CX" },
    { id: "cx-tailored-resume", url: cxUrl("tailored-resume-generator"), src: "CX" },
    { id: "cx-domain-brainstorm", url: cxUrl("domain-name-brainstormer"), src: "CX" },
    // Marketing & Social
    { id: "cx-competitive-ads", url: cxUrl("competitive-ads-extractor"), src: "CX" },
    { id: "cx-twitter-optimizer", url: cxUrl("twitter-algorithm-optimizer"), src: "CX" },
    // Productivity & Utility
    { id: "cx-file-organizer", url: cxUrl("file-organizer"), src: "CX" },
    { id: "cx-invoice-organizer", url: cxUrl("invoice-organizer"), src: "CX" },
    { id: "cx-raffle-picker", url: cxUrl("raffle-winner-picker"), src: "CX" },
    { id: "cx-meeting-insights", url: cxUrl("meeting-insights-analyzer"), src: "CX" },
    { id: "cx-video-downloader", url: cxUrl("video-downloader"), src: "CX" },
    // Business & Research
    { id: "cx-lead-research", url: cxUrl("lead-research-assistant"), src: "CX" },
    { id: "cx-dev-growth", url: cxUrl("developer-growth-analysis"), src: "CX" },
    // AI & Development
    { id: "cx-mcp-builder", url: cxUrl("mcp-builder"), src: "CX" },
    { id: "cx-artifacts-builder", url: cxUrl("artifacts-builder"), src: "CX" },
    { id: "cx-langsmith", url: cxUrl("langsmith-fetch"), src: "CX" },
    { id: "cx-webapp-testing", url: cxUrl("webapp-testing"), src: "CX" },
    { id: "cx-skill-creator", url: cxUrl("skill-creator"), src: "CX" },
    // Document Skills
    { id: "cx-docx", url: cxUrl("document-skills/docx"), src: "CX" },
    { id: "cx-pdf", url: cxUrl("document-skills/pdf"), src: "CX" },
    { id: "cx-pptx", url: cxUrl("document-skills/pptx"), src: "CX" },
    { id: "cx-xlsx", url: cxUrl("document-skills/xlsx"), src: "CX" },

    // jeremylongshore Community (skill names verified via GitHub API)
    { id: "jl-ansible", url: jlUrl("plugins/devops/ansible-playbook-creator", "creating-ansible-playbooks"), src: "JL" },
    { id: "jl-git-commit", url: jlUrl("plugins/devops/git-commit-smart", "generating-smart-commits"), src: "JL" },
    { id: "jl-pentest", url: jlUrl("plugins/security/penetration-tester", "performing-penetration-testing"), src: "JL" },
    { id: "jl-ai-ethics", url: jlUrl("plugins/ai-ml/ai-ethics-validator", "validating-ai-ethics-and-fairness"), src: "JL" },
    { id: "jl-lucidchart", url: jlUrl("plugins/saas-packs/lucidchart-pack", "lucidchart-core-workflow-a"), src: "JL" },
    { id: "jl-posthog", url: jlUrl("plugins/saas-packs/posthog-pack", "posthog-core-workflow-a"), src: "JL" },
    { id: "jl-flyio", url: jlUrl("plugins/saas-packs/flyio-pack", "flyio-prod-checklist"), src: "JL" },
    { id: "jl-mistral-security", url: jlUrl("plugins/saas-packs/mistral-pack", "mistral-security-basics"), src: "JL" },
    { id: "jl-cursor-multi-repo", url: jlUrl("plugins/saas-packs/cursor-pack", "cursor-multi-repo"), src: "JL" },
];

// ── HTTP fetch with redirect following ──────────────────────────────────
function fetchHead(url, maxRedirects = 5) {
    return new Promise((resolve) => {
        const mod = url.startsWith("https") ? https : http;
        const req = mod.get(url, { headers: { "User-Agent": "catalog-validator/1.0" } }, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
                resolve(fetchHead(res.headers.location, maxRedirects - 1));
                return;
            }
            let body = "";
            res.on("data", (chunk) => { body += chunk; });
            res.on("end", () => {
                resolve({ status: res.statusCode, size: Buffer.byteLength(body, "utf8") });
            });
        });
        req.on("error", (err) => {
            resolve({ status: 0, size: 0, error: err.message });
        });
        req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, size: 0, error: "timeout" }); });
    });
}

// ── Batched testing with concurrency limit ──────────────────────────────
async function runBatch(items, concurrency = 10) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(async (entry) => {
                const res = await fetchHead(entry.url);
                return { ...entry, ...res };
            })
        );
        results.push(...batchResults);
        // Small delay between batches to be nice to GitHub
        if (i + concurrency < items.length) {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    return results;
}

async function main() {
    console.log(`\n📦 Validating ${entries.length} catalog URLs...\n`);
    console.log(`Sources: VA=${entries.filter(e => e.src === "VA").length} | CX=${entries.filter(e => e.src === "CX").length} | JL=${entries.filter(e => e.src === "JL").length}\n`);

    const results = await runBatch(entries, 10);

    const ok = results.filter(r => r.status === 200 && r.size > 50);
    const small = results.filter(r => r.status === 200 && r.size <= 50);
    const notFound = results.filter(r => r.status === 404);
    const errors = results.filter(r => r.status !== 200 && r.status !== 404);

    // Print failures first (most important)
    if (notFound.length > 0) {
        console.log(`\n❌ 404 NOT FOUND (${notFound.length}):`);
        notFound.forEach(r => console.log(`  ${r.id} [${r.src}] → ${r.url}`));
    }
    if (small.length > 0) {
        console.log(`\n⚠️  TOO SMALL / EMPTY (${small.length}):`);
        small.forEach(r => console.log(`  ${r.id} [${r.src}] ${r.size}B → ${r.url}`));
    }
    if (errors.length > 0) {
        console.log(`\n🔴 OTHER ERRORS (${errors.length}):`);
        errors.forEach(r => console.log(`  ${r.id} [${r.src}] status=${r.status} ${r.error || ""} → ${r.url}`));
    }

    // Summary by source
    console.log(`\n── Summary ──`);
    for (const src of ["VA", "CX", "JL"]) {
        const srcResults = results.filter(r => r.src === src);
        const srcOk = srcResults.filter(r => r.status === 200 && r.size > 50);
        const srcFail = srcResults.filter(r => r.status !== 200 || r.size <= 50);
        const pct = ((srcOk.length / srcResults.length) * 100).toFixed(0);
        console.log(`  ${src}: ${srcOk.length}/${srcResults.length} valid (${pct}%) | ${srcFail.length} broken`);
    }

    console.log(`\n  TOTAL: ${ok.length}/${results.length} valid (${((ok.length / results.length) * 100).toFixed(0)}%)`);
    console.log(`  ✅ ${ok.length} OK | ⚠️ ${small.length} small | ❌ ${notFound.length} 404 | 🔴 ${errors.length} error\n`);

    // Exit code
    if (notFound.length > 0 || errors.length > 0) {
        process.exit(1);
    }
}

main().catch(err => { console.error(err); process.exit(1); });
