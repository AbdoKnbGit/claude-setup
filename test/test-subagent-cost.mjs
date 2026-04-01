/**
 * SUB-AGENT MODEL + COST AUDIT
 * 
 * Tests:
 * 1. marketplace-fetcher.md is wired to model: haiku
 * 2. add.md template tells the agent to spawn on Haiku
 * 3. Token cost estimate for a typical marketplace fetch (Haiku pricing)
 * 4. Cost comparison: Haiku subagent vs Sonnet inline vs Opus inline
 * 5. Catalog size vs instruction size ratio (bloat check)
 */
import { loadCatalog, queryCatalog } from '../dist/marketplace-catalog.js';
import { buildMarketplaceInstructions } from '../dist/marketplace.js';
import { estimateTokens, estimateCost, formatCost } from '../dist/tokens.js';
import fs from 'fs';

const catalog = loadCatalog();

let pass = 0, fail = 0;
const issues = [];

function check(label, condition, detail = '') {
    if (condition) {
        pass++;
        console.log(`  ✅ ${label}`);
    } else {
        fail++;
        issues.push({ label, detail });
        console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    }
}

console.log(`${'═'.repeat(72)}`);
console.log(`🔬 SUB-AGENT MODEL + COST AUDIT`);
console.log(`${'═'.repeat(72)}\n`);

// ═══════════════════════════════════════════════════════════════════
// TEST 1: marketplace-fetcher.md has model: haiku
// ═══════════════════════════════════════════════════════════════════
console.log(`### 1. Fetcher agent definition (init.ts → marketplace-fetcher.md)`);
const initSrc = fs.readFileSync('src/commands/init.ts', 'utf8');

// Check the installMarketplaceFetcher function writes model: haiku
const fetcherContent = initSrc.match(/writeFileSync\(filepath,\s*`([\s\S]*?)`,\s*"utf8"\)/);
const fetcherBody = fetcherContent?.[1] || '';

check('marketplace-fetcher.md has "model: haiku" in frontmatter',
    fetcherBody.includes('model: haiku'));

check('marketplace-fetcher.md has "tools: Bash" (can run curl)',
    fetcherBody.includes('tools: Bash'));

check('marketplace-fetcher.md has name: marketplace-fetcher',
    fetcherBody.includes('name: marketplace-fetcher'));

check('Fetcher description mentions isolation',
    fetcherBody.includes('isolation') || fetcherBody.includes('spawned'));

// ═══════════════════════════════════════════════════════════════════
// TEST 2: add.md template spawns correctly
// ═══════════════════════════════════════════════════════════════════
console.log(`\n### 2. add.md template — sub-agent spawning`);
const addTemplate = fs.readFileSync('templates/add.md', 'utf8');

check('add.md mentions "Haiku"',
    addTemplate.includes('Haiku'));

check('add.md uses "Agent tool" for spawning',
    addTemplate.includes('Agent tool'));

check('add.md has BEGIN/END markers for subagent prompt',
    addTemplate.includes('BEGIN MARKETPLACE INSTRUCTIONS') && addTemplate.includes('END MARKETPLACE INSTRUCTIONS'));

check('add.md passes {{MARKETPLACE_INSTRUCTIONS}} to subagent',
    addTemplate.includes('{{MARKETPLACE_INSTRUCTIONS}}'));

check('add.md says "AUTOMATICALLY spawn"',
    addTemplate.includes('AUTOMATICALLY spawn'));

check('add.md says subagent runs in isolation',
    addTemplate.includes('isolation'));

// ═══════════════════════════════════════════════════════════════════
// TEST 3: Token cost estimate for a typical fetch
// ═══════════════════════════════════════════════════════════════════
console.log(`\n### 3. Token cost estimate — typical marketplace fetch`);

// Simulate a real query through the entire pipeline
const testQuery = 'kubernetes deployment CI/CD pipeline';
const instructions = buildMarketplaceInstructions(testQuery);
const instrTokens = estimateTokens(instructions);
const instrCost = estimateCost(instrTokens);

console.log(`  Query: "${testQuery}"`);
console.log(`  Instruction block: ${instructions.length.toLocaleString()} chars → ~${instrTokens.toLocaleString()} tokens`);
console.log(`  Cost as input to Haiku: $${instrCost.haiku.toFixed(6)}`);
console.log(`  Cost as input to Sonnet: $${instrCost.sonnet.toFixed(6)}`);
console.log(`  Cost as input to Opus: $${instrCost.opus.toFixed(6)}`);

check('Instruction block is under 30K tokens (Haiku window)',
    instrTokens < 30000,
    `${instrTokens} tokens`);

// ═══════════════════════════════════════════════════════════════════
// TEST 4: Cost comparison table
// ═══════════════════════════════════════════════════════════════════
console.log(`\n### 4. Cost comparison — Haiku subagent vs inline`);

// Typical subagent session: instruction block + catalog hits + 3 curl outputs + response
const subagentInput = instrTokens;
const subagentOutput = 200; // one-line response "INSTALLED .claude/skills/xxx/SKILL.md 5000b"
const curlOutputTokens = 3 * 500; // 3 curl outputs, ~500 tokens each

// Haiku sub-agent cost
const haikuInputCost = subagentInput * 0.8e-6;
const haikuOutputCost = subagentOutput * 4e-6;
const haikuCurlCost = curlOutputTokens * 0.8e-6; // curl output is input to next turn
const haikuTotal = haikuInputCost + haikuOutputCost + haikuCurlCost;

// If the same work ran inline on Sonnet
const sonnetInputCost = subagentInput * 3e-6;
const sonnetOutputCost = subagentOutput * 15e-6;
const sonnetCurlCost = curlOutputTokens * 3e-6;
const sonnetTotal = sonnetInputCost + sonnetOutputCost + sonnetCurlCost;

// If on Opus
const opusInputCost = subagentInput * 15e-6;
const opusOutputCost = subagentOutput * 75e-6;
const opusCurlCost = curlOutputTokens * 15e-6;
const opusTotal = opusInputCost + opusOutputCost + opusCurlCost;

console.log(`\n  ┌─────────────────┬──────────────┬──────────────┬──────────────┐`);
console.log(`  │ Model           │ Input cost   │ Output cost  │ TOTAL        │`);
console.log(`  ├─────────────────┼──────────────┼──────────────┼──────────────┤`);
console.log(`  │ Haiku subagent  │ $${haikuInputCost.toFixed(6).padStart(9)} │ $${haikuOutputCost.toFixed(6).padStart(9)} │ $${haikuTotal.toFixed(6).padStart(9)} │`);
console.log(`  │ Sonnet inline   │ $${sonnetInputCost.toFixed(6).padStart(9)} │ $${sonnetOutputCost.toFixed(6).padStart(9)} │ $${sonnetTotal.toFixed(6).padStart(9)} │`);
console.log(`  │ Opus inline     │ $${opusInputCost.toFixed(6).padStart(9)} │ $${opusOutputCost.toFixed(6).padStart(9)} │ $${opusTotal.toFixed(6).padStart(9)} │`);
console.log(`  └─────────────────┴──────────────┴──────────────┴──────────────┘`);
console.log(`  Haiku savings vs Sonnet: ${(sonnetTotal / haikuTotal).toFixed(1)}x cheaper`);
console.log(`  Haiku savings vs Opus:   ${(opusTotal / haikuTotal).toFixed(1)}x cheaper`);

check('Haiku subagent is at least 3x cheaper than Sonnet',
    sonnetTotal / haikuTotal >= 3);

check('Haiku subagent is at least 15x cheaper than Opus',
    opusTotal / haikuTotal >= 15);

// ═══════════════════════════════════════════════════════════════════
// TEST 5: Catalog bloat check
// ═══════════════════════════════════════════════════════════════════
console.log(`\n### 5. Catalog bloat check — is the catalog lean?`);

// Catalog size in the source
const catalogSrc = fs.readFileSync('src/marketplace-catalog.ts', 'utf8');
const catalogTokens = estimateTokens(catalogSrc);

console.log(`  marketplace-catalog.ts: ${catalogSrc.length.toLocaleString()} chars → ~${catalogTokens.toLocaleString()} tokens`);

check('Catalog source stays under 25K tokens (TypeScript compiles away)',
    catalogTokens < 25000,
    `${catalogTokens} tokens`);

// The INSTRUCTION block sent to the subagent (what actually costs money)
console.log(`  Instruction block (sent to Haiku): ~${instrTokens.toLocaleString()} tokens`);
const catalogHitRatio = (instrTokens / catalog.items.length);
console.log(`  Per-catalog-entry cost: ~${catalogHitRatio.toFixed(0)} tokens/entry`);

check('Instruction block is under 15K tokens',
    instrTokens < 15000,
    `${instrTokens} tokens`);

// ═══════════════════════════════════════════════════════════════════
// TEST 6: Project context injection check (new feature)
// ═══════════════════════════════════════════════════════════════════
console.log(`\n### 6. Project context injection`);

const withCtx = buildMarketplaceInstructions(testQuery, '## Digest\nFramework: React 18\nRuntime: Node 20\nDeps: express, prisma, jest');
const withoutCtx = buildMarketplaceInstructions(testQuery);

check('With project context → instructions are LARGER',
    withCtx.length > withoutCtx.length);

check('With project context → includes "Project Context" section',
    withCtx.includes('Project Context'));

check('Without project context → no "Project Context" section',
    !withoutCtx.includes('Project Context'));

const ctxDelta = estimateTokens(withCtx) - estimateTokens(withoutCtx);
console.log(`  Context injection adds ~${ctxDelta} tokens (${(ctxDelta * 0.8e-6 * 1000000).toFixed(2)}¢ per M on Haiku)`);

check('Context injection adds less than 500 tokens overhead',
    ctxDelta < 500,
    `${ctxDelta} tokens`);

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(72)}`);
console.log(`📊 AUDIT RESULTS`);
console.log(`${'═'.repeat(72)}`);
console.log(`  Checks: ${pass + fail} total | ✅ ${pass} | ❌ ${fail}`);
console.log(`\n  💰 COST ANALYSIS (per marketplace fetch):`);
console.log(`     Haiku subagent: ~$${haikuTotal.toFixed(4)} per fetch`);
console.log(`     Sonnet inline:  ~$${sonnetTotal.toFixed(4)} per fetch  (${(sonnetTotal / haikuTotal).toFixed(1)}x more expensive)`);
console.log(`     Opus inline:    ~$${opusTotal.toFixed(4)} per fetch  (${(opusTotal / haikuTotal).toFixed(1)}x more expensive)`);
console.log(`\n  📦 Per 100 skill installs:`);
console.log(`     Haiku:  ~$${(haikuTotal * 100).toFixed(2)}`);
console.log(`     Sonnet: ~$${(sonnetTotal * 100).toFixed(2)}`);
console.log(`     Opus:   ~$${(opusTotal * 100).toFixed(2)}`);

if (fail > 0) {
    console.log(`\n  ⚠️  Issues:`);
    for (const i of issues) console.log(`     ${i.label} — ${i.detail}`);
}
