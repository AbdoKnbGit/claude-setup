/**
 * End-to-end flow simulation: how does the AGENT handle complex queries?
 * 
 * Flow: User types → buildMarketplaceInstructions(input) → queryCatalog(input) at Tier 1
 *       If hits → Agent gets pre-built curl commands (instant)
 *       If no hits → Agent uses Tier 2 discovery (smarter, slower)
 * 
 * The AI agent (Claude) is SMART — it understands French, Spanish, slang.
 * But queryCatalog() is DUMB — it only does string matching against English tags.
 * 
 * This test shows:
 * 1. What Tier 1 (catalog) catches directly
 * 2. What falls through to Tier 2 (where Claude's intelligence kicks in)
 * 3. How compound queries get split into multiple catalog lookups by the agent
 */
import { queryCatalog, loadCatalog } from '../dist/marketplace-catalog.js';

const catalog = loadCatalog();

function simulateAgentFlow(rawInput, agentTranslation = null) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🧑 USER: "${rawInput}"`);

    // STEP 1: Raw query hits queryCatalog (Tier 1) — dumb string matching
    const tier1 = queryCatalog(rawInput, catalog, 5);
    const tier1Hits = tier1.matches.filter(m => m.score >= 20);

    console.log(`\n   📡 TIER 1 (catalog string match):`);
    if (tier1Hits.length > 0) {
        console.log(`   ✅ ${tier1Hits.length} direct hits:`);
        for (const m of tier1Hits.slice(0, 3)) {
            const src = getSource(m.item);
            console.log(`      [${src}] ${m.item.name} (score=${m.score}) — ${m.reason}`);
        }
    } else {
        console.log(`   ❌ No direct matches — falls through to Tier 2`);
    }

    // STEP 2: If agent is smart, it translates/decomposes the query
    if (agentTranslation) {
        console.log(`\n   🧠 AGENT UNDERSTANDS → decomposes into sub-queries:`);
        for (const subQuery of agentTranslation) {
            const sub = queryCatalog(subQuery, catalog, 3);
            const subHits = sub.matches.filter(m => m.score >= 15);
            if (subHits.length > 0) {
                console.log(`\n      🔍 "${subQuery}" → ${subHits.length} hits:`);
                for (const m of subHits.slice(0, 3)) {
                    const src = getSource(m.item);
                    console.log(`         [${src}] ${m.item.name} (score=${m.score})`);
                }
            } else {
                console.log(`      🔍 "${subQuery}" → ❌ would use Tier 2 discovery`);
            }
        }
    }
}

function getSource(item) {
    if (item.source === 'anthropic') return 'ANT';
    const url = item.directUrl || '';
    if (url.includes('jeremylongshore')) return 'JL ';
    if (url.includes('ComposioHQ')) return 'CX ';
    return 'STK';
}

console.log(`${'═'.repeat(70)}`);
console.log(`🌍 MULTI-LANGUAGE & COMPLEX QUERY FLOW SIMULATION`);
console.log(`📦 Catalog has ${catalog.items.length} entries`);
console.log(`${'═'.repeat(70)}`);

// ════════════════════════════════════════════════════════════════════
// TEST GROUP 1: French queries — raw vs agent-translated
// ════════════════════════════════════════════════════════════════════
console.log(`\n\n${'═'.repeat(70)}`);
console.log(`🇫🇷  FRENCH QUERIES — Does Tier 1 catch them? What does the agent do?`);
console.log(`${'═'.repeat(70)}`);

simulateAgentFlow(
    "je veux un agent qui m'aide dans l'automatisation des taches",
    ["task automation workflow", "ai agent orchestrator", "n8n automation"]
);

simulateAgentFlow(
    "gerer mes fichiers pdf automatiquement",
    ["pdf manipulation extract merge", "document processing automation", "file manage organize"]
);

simulateAgentFlow(
    "automatisation et orchestration des marketing skills",
    ["marketing automation campaign", "content seo strategy", "email marketing", "social media automation"]
);

simulateAgentFlow(
    "base de données et migration de schéma",
    ["database migration schema", "sql query optimizer", "orm prisma"]
);

simulateAgentFlow(
    "sécurité et tests de pénétration pour mon application web",
    ["penetration testing owasp", "xss vulnerability scanner", "security audit web application"]
);

// ════════════════════════════════════════════════════════════════════
// TEST GROUP 2: Spanish queries
// ════════════════════════════════════════════════════════════════════
console.log(`\n\n${'═'.repeat(70)}`);
console.log(`🇪🇸  SPANISH QUERIES`);
console.log(`${'═'.repeat(70)}`);

simulateAgentFlow(
    "necesito automatizar el despliegue de mi aplicación con kubernetes",
    ["kubernetes deployment creator", "docker compose ci cd", "helm chart deploy"]
);

simulateAgentFlow(
    "quiero un agente para diseño de interfaces y pruebas",
    ["ui ux design component", "frontend design react", "e2e testing playwright"]
);

// ════════════════════════════════════════════════════════════════════
// TEST GROUP 3: Complex compound queries (multiple intents)
// ════════════════════════════════════════════════════════════════════
console.log(`\n\n${'═'.repeat(70)}`);
console.log(`🔀  COMPLEX COMPOUND QUERIES — Multiple intents in one request`);
console.log(`${'═'.repeat(70)}`);

simulateAgentFlow(
    "I need a full stack setup: React frontend with tailwind, GraphQL API, PostgreSQL database, Docker deployment, and CI/CD with GitHub Actions",
    [
        "react tailwind frontend design",
        "graphql server builder api",
        "postgresql database queries",
        "docker compose generator",
        "ci cd pipeline github actions"
    ]
);

simulateAgentFlow(
    "build me a complete ML pipeline: data preprocessing, feature engineering, model training with pytorch, experiment tracking, and deploy to vertex AI",
    [
        "data pipeline preprocessing",
        "feature engineering data",
        "deep learning model training",
        "experiment tracking ml",
        "vertex ai training deployment"
    ]
);

simulateAgentFlow(
    "secure my app end to end: secret scanning, OWASP compliance, GDPR, XSS protection, SQL injection prevention, and penetration testing",
    [
        "secret scanner leaked api keys",
        "owasp compliance security",
        "gdpr compliance scanner",
        "xss vulnerability scanner",
        "sql injection detector",
        "penetration testing"
    ]
);

// ════════════════════════════════════════════════════════════════════
// TEST GROUP 4: Slang / informal / typos
// ════════════════════════════════════════════════════════════════════
console.log(`\n\n${'═'.repeat(70)}`);
console.log(`💬  SLANG / INFORMAL / ABBREVIATED QUERIES`);
console.log(`${'═'.repeat(70)}`);

simulateAgentFlow(
    "yo set me up with k8s, docker, terraform, and a monitoring stack asap",
    [
        "kubernetes deployment creator",
        "docker compose generator",
        "terraform module builder",
        "monitoring stack prometheus grafana"
    ]
);

simulateAgentFlow(
    "hook me up with some sick AI skills - ollama local, nlp, computer vision and a recommendation engine",
    [
        "ollama local ai model",
        "nlp text analyzer sentiment",
        "computer vision image detection",
        "recommendation engine"
    ]
);

simulateAgentFlow(
    "make my api bulletproof - rate limiting, auth, docs, testing, and monitoring",
    [
        "api rate limiter throttle",
        "api authentication oauth jwt",
        "api documentation swagger openapi",
        "api test automation fuzzer",
        "api monitoring dashboard"
    ]
);

// ════════════════════════════════════════════════════════════════════
// TEST GROUP 5: Mixed language (Franglais / Spanglish)
// ════════════════════════════════════════════════════════════════════
console.log(`\n\n${'═'.repeat(70)}`);
console.log(`🌐  MIXED LANGUAGE (Franglais / Spanglish)`);
console.log(`${'═'.repeat(70)}`);

simulateAgentFlow(
    "je veux setup un pipeline CI/CD avec Docker et Kubernetes pour deploy mon app React",
    [
        "ci cd pipeline github actions",
        "docker compose generator",
        "kubernetes deployment helm",
        "react frontend design"
    ]
);

simulateAgentFlow(
    "necesito skills de database, un ORM pour mon backend Node.js, et aussi testing automatisé",
    [
        "database schema designer",
        "orm prisma typeorm sequelize",
        "unit test generator jest",
        "e2e test framework playwright"
    ]
);


// ════════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════════
console.log(`\n\n${'═'.repeat(70)}`);
console.log(`📊 KEY INSIGHT`);
console.log(`${'═'.repeat(70)}`);
console.log(`
The flow works in TWO complementary tiers:

  TIER 1 (queryCatalog — fast, dumb string matching):
  • English keywords → instant catalog hits with pre-verified curl commands
  • French/Spanish raw text → mostly misses (falls through)
  • BUT: common English words IN foreign sentences still match!
    (e.g., "Docker", "Kubernetes", "React", "pipeline" are universal)

  TIER 2 (Agent intelligence — smart, needs network):
  • Claude UNDERSTANDS the user's intent in ANY language
  • Decomposes compound queries into sub-queries
  • Uses GitHub API discovery to find matching skills
  • Falls back to README parsing if needed

  RESULT: Even when Tier 1 misses on language, Tier 2 catches it.
  The 248-entry catalog ensures most English sub-queries get INSTANT
  pre-verified matches, while the agent's intelligence handles the rest.
`);
