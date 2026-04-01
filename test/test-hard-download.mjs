/**
 * HARD DOWNLOAD TEST — 10 random per repo, 40 total
 * Tests actual SKILL.md download from STK, CX, JL, cxExt (community)
 * Verifies: HTTP 200 + size > 50B + starts with "---" (YAML frontmatter)
 */
import { loadCatalog } from '../dist/marketplace-catalog.js';
import https from 'https';

const catalog = loadCatalog();

// Split into 4 repo groups
const repos = { STK: [], CX: [], JL: [], EXT: [] };
for (const item of catalog.items) {
    const url = item.directUrl || '';
    if (item.source === 'anthropic') continue; // skip ANT (plugin-install format)
    if (url.includes('jeremylongshore')) repos.JL.push(item);
    else if (item.source === 'community') repos.EXT.push(item);
    else if (item.source === 'composio') repos.CX.push(item);
    else repos.STK.push(item);
}

function sample(arr, n) {
    return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function dl(url) {
    return new Promise((resolve) => {
        if (!url?.startsWith('http')) { resolve({ s: 0, sz: 0, c: '' }); return; }
        const o = { headers: { 'User-Agent': 'hard-test' } };
        if (process.env.GITHUB_TOKEN) o.headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
        https.get(url, o, (r) => {
            if (r.statusCode === 301 || r.statusCode === 302) {
                https.get(r.headers.location, o, (r2) => {
                    let d = ''; r2.on('data', c => d += c);
                    r2.on('end', () => resolve({ s: r2.statusCode, sz: d.length, c: d }));
                }).on('error', () => resolve({ s: 0, sz: 0, c: '' }));
                return;
            }
            let d = ''; r.on('data', c => d += c);
            r.on('end', () => resolve({ s: r.statusCode, sz: d.length, c: d }));
        }).on('error', () => resolve({ s: 0, sz: 0, c: '' }));
    });
}

// Pick 10 per repo
const tests = [
    ...sample(repos.STK, 10).map(i => ({ ...i, _repo: 'STK' })),
    ...sample(repos.CX, 10).map(i => ({ ...i, _repo: 'CX' })),
    ...sample(repos.JL, 10).map(i => ({ ...i, _repo: 'JL' })),
    ...sample(repos.EXT, 10).map(i => ({ ...i, _repo: 'EXT' })),
];

async function main() {
    console.log(`${'═'.repeat(72)}`);
    console.log(`🔨 HARD DOWNLOAD TEST — 10 per repo × 4 repos = ${tests.length} downloads`);
    console.log(`${'═'.repeat(72)}`);
    console.log(`Pool: STK=${repos.STK.length} CX=${repos.CX.length} JL=${repos.JL.length} EXT=${repos.EXT.length}\n`);

    const stats = { STK: { p: 0, f: 0 }, CX: { p: 0, f: 0 }, JL: { p: 0, f: 0 }, EXT: { p: 0, f: 0 } };
    const fails = [];

    for (const item of tests) {
        const r = await dl(item.directUrl);
        const hasFrontmatter = r.c.trimStart().startsWith('---');
        const ok = r.s === 200 && r.sz > 50 && hasFrontmatter;
        const repo = item._repo;

        if (ok) {
            stats[repo].p++;
            const desc = r.c.split('\n').find(l => l.includes('description'))?.trim().slice(0, 60) || '(yaml ok)';
            console.log(`✅ [${repo.padEnd(3)}] ${item.name.padEnd(42)} ${String(r.sz).padStart(6)}B  ${desc}`);
        } else {
            stats[repo].f++;
            const reason = r.s !== 200 ? `HTTP ${r.s}` : r.sz <= 50 ? 'too small' : 'no frontmatter';
            console.log(`❌ [${repo.padEnd(3)}] ${item.name.padEnd(42)} ${reason}`);
            fails.push({ repo, name: item.name, id: item.id, url: item.directUrl, reason });
        }
    }

    console.log(`\n${'═'.repeat(72)}`);
    console.log(`📊 RESULTS`);
    console.log(`${'═'.repeat(72)}`);
    let tp = 0, tf = 0;
    for (const [repo, s] of Object.entries(stats)) {
        const total = s.p + s.f;
        if (total === 0) continue;
        const pct = ((s.p / total) * 100).toFixed(0);
        const icon = s.f === 0 ? '✅' : '⚠️';
        console.log(`  ${icon} ${repo.padEnd(5)} ${s.p}/${total} (${pct}%)`);
        tp += s.p; tf += s.f;
    }
    console.log(`\n  TOTAL: ${tp}/${tp + tf} (${((tp / (tp + tf)) * 100).toFixed(0)}%)`);

    if (fails.length > 0) {
        console.log(`\n❌ FAILURES:`);
        for (const f of fails) {
            console.log(`  [${f.repo}] ${f.name} — ${f.reason}`);
            console.log(`       ${f.url}`);
        }
    } else {
        console.log(`\n🎉 ALL ${tp} downloads verified! Every SKILL.md has valid YAML frontmatter.`);
    }
}

main().catch(console.error);
