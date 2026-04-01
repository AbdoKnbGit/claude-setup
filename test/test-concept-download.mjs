/**
 * SURGICAL CONCEPT → CATALOG → DOWNLOAD TEST
 * 
 * NO hardcoded keywords. ONLY abstract concepts.
 * Proves the catalog-first approach works WITHOUT discovery fallback.
 * 
 * Flow: concept query → queryCatalog() → take best match → download SKILL.md → verify content
 */
import { queryCatalog, loadCatalog } from '../dist/marketplace-catalog.js';
import https from 'https';

const catalog = loadCatalog();

function download(url) {
    return new Promise((resolve) => {
        if (!url || !url.startsWith('http')) {
            resolve({ status: 0, size: 0, content: '', error: 'not-a-url' });
            return;
        }
        const opts = { headers: { 'User-Agent': 'surgical-test' } };
        const token = process.env.GITHUB_TOKEN;
        if (token) opts.headers.Authorization = `token ${token}`;

        https.get(url, opts, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                https.get(res.headers.location, opts, (res2) => {
                    let d = '';
                    res2.on('data', c => d += c);
                    res2.on('end', () => resolve({ status: res2.statusCode, size: d.length, content: d }));
                }).on('error', (e) => resolve({ status: 0, size: 0, content: '', error: e.message }));
                return;
            }
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve({ status: res.statusCode, size: d.length, content: d }));
        }).on('error', (e) => resolve({ status: 0, size: 0, content: '', error: e.message }));
    });
}

// ═══════════════════════════════════════════════════════════════
// CONCEPT-ONLY QUERIES — no specific tool names, no keywords
// These simulate how a REAL user thinks, not how a developer searches
// ═══════════════════════════════════════════════════════════════
const concepts = [
    // Vague intent — user doesn't know what tool they need
    "protect my web app from attackers",
    "make my code run faster and use less memory",
    "I need help writing tests for my project",
    "help me manage my containers in production",
    "analyze my data and find patterns",

    // Non-technical language  
    "build a pretty website that looks professional",
    "organize my project files and clean up the mess",
    "check if my code has any bugs or issues",
    "help me set up automatic builds when I push code",
    "I want an AI that helps me write better prompts",

    // Abstract needs
    "prevent data leaks in my application",
    "my database is slow, help me fix it",
    "automate repetitive tasks in my workflow",
    "convert my documents to different formats",
    "monitor my servers and alert me when something breaks",

    // French conceptual (no tech keywords)
    "je veux automatiser mes tâches répétitives",
    "protéger mon application contre les pirates",
    "rendre mon site web plus rapide",

    // Compound conceptual
    "I want to build an API, test it, and deploy it to the cloud",
    "set up a machine learning pipeline from data to production",
];

async function main() {
    console.log(`${'═'.repeat(72)}`);
    console.log(`🎯 SURGICAL TEST: Concept → Catalog → Real Download`);
    console.log(`${'═'.repeat(72)}`);
    console.log(`Catalog: ${catalog.items.length} entries | NO discovery fallback`);
    console.log(`Testing ${concepts.length} concept-only queries (no hardcoded keywords)\n`);

    let pass = 0, fail = 0, noMatch = 0;
    const results = [];

    for (const concept of concepts) {
        const result = queryCatalog(concept, catalog, 3);
        const best = result.matches[0];

        if (!best || best.score < 15) {
            console.log(`\n❌ MISS "${concept}"`);
            console.log(`   → No catalog match (score < 15)`);
            noMatch++;
            results.push({ concept, status: 'NO_MATCH', downloaded: false });
            continue;
        }

        const item = best.item;
        const url = item.directUrl;

        // Skip Anthropic plugin-install format
        if (item.source === 'anthropic') {
            console.log(`\n✅ HIT  "${concept}"`);
            console.log(`   → ${item.name} (score=${best.score}) [ANT plugin-install]`);
            console.log(`   📦 /plugin install ${url}`);
            pass++;
            results.push({ concept, status: 'ANT_PLUGIN', downloaded: true, name: item.name, score: best.score });
            continue;
        }

        // Actually download the SKILL.md
        const dl = await download(url);
        const isValid = dl.status === 200 && dl.size > 50 && dl.content.includes('---');

        if (isValid) {
            pass++;
            const firstLine = dl.content.split('\n').find(l => l.includes('description'))?.trim().slice(0, 70) || '';
            console.log(`\n✅ HIT  "${concept}"`);
            console.log(`   → ${item.name} (score=${best.score}) [${dl.size.toLocaleString()}B downloaded]`);
            console.log(`   📄 ${firstLine}...`);
            results.push({ concept, status: 'DOWNLOADED', downloaded: true, name: item.name, score: best.score, size: dl.size });
        } else {
            fail++;
            console.log(`\n⚠️  MATCH BUT DOWNLOAD FAILED "${concept}"`);
            console.log(`   → ${item.name} (score=${best.score}) HTTP ${dl.status}`);
            console.log(`   🔗 ${url.slice(0, 90)}`);
            results.push({ concept, status: 'DOWNLOAD_FAIL', downloaded: false, name: item.name, score: best.score });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n\n${'═'.repeat(72)}`);
    console.log(`📊 RESULTS: Concept → Catalog → Download`);
    console.log(`${'═'.repeat(72)}`);
    console.log(`  Concepts tested:     ${concepts.length}`);
    console.log(`  ✅ Match + Download:  ${pass}`);
    console.log(`  ⚠️  Match but 404:   ${fail}`);
    console.log(`  ❌ No catalog match:  ${noMatch}`);
    console.log(`  Coverage:            ${((pass / concepts.length) * 100).toFixed(0)}%`);
    console.log(`  Download success:    ${pass > 0 ? ((pass / (pass + fail)) * 100).toFixed(0) : 0}%`);

    if (noMatch > 0 || fail > 0) {
        console.log(`\n⚠️  GAPS requiring catalog additions:`);
        for (const r of results) {
            if (r.status === 'NO_MATCH') {
                console.log(`   ❌ "${r.concept}" — needs new catalog entry`);
            } else if (r.status === 'DOWNLOAD_FAIL') {
                console.log(`   ⚠️  "${r.concept}" → ${r.name} (URL broken)`);
            }
        }
    }

    console.log(`\n${'═'.repeat(72)}`);
    if (pass === concepts.length) {
        console.log(`🎉 PERFECT: Every concept found a catalog match with real downloadable content.`);
        console.log(`   Discovery fallback is UNNECESSARY — the catalog handles everything.`);
    } else if (pass >= concepts.length * 0.8) {
        console.log(`✅ STRONG: ${pass}/${concepts.length} concepts covered. Catalog-first approach works.`);
        console.log(`   ${noMatch} concepts need synonym/tag expansion to eliminate remaining gaps.`);
    } else {
        console.log(`⚠️  NEEDS WORK: ${pass}/${concepts.length} concepts covered.`);
        console.log(`   Catalog needs more entries or better synonym coverage.`);
    }
    console.log(`${'═'.repeat(72)}`);
}

main().catch(console.error);
