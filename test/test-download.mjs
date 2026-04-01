/**
 * Download verification — uses the ACTUAL compiled catalog directUrls.
 * Picks 5 random entries from each source and tests real downloads.
 */
import { loadCatalog } from '../dist/marketplace-catalog.js';
import https from 'https';

const catalog = loadCatalog();
const items = catalog.items;

// Group by source
const grouped = { stk: [], cx: [], jl: [], ant: [] };
for (const item of items) {
    const url = item.directUrl || '';
    if (item.source === 'anthropic') grouped.ant.push(item);
    else if (url.includes('jeremylongshore')) grouped.jl.push(item);
    else if (url.includes('ComposioHQ') || url.includes('composiohq')) grouped.cx.push(item);
    else grouped.stk.push(item);
}

// Pick random sample from each
function sample(arr, n) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
}

const testItems = [
    ...sample(grouped.stk, 5).map(i => ({ ...i, _src: 'STK' })),
    ...sample(grouped.cx, 5).map(i => ({ ...i, _src: 'CX' })),
    ...sample(grouped.jl, 5).map(i => ({ ...i, _src: 'JL' })),
    ...sample(grouped.ant, 3).map(i => ({ ...i, _src: 'ANT' })),
];

function fetchUrl(url) {
    return new Promise((resolve) => {
        const opts = { headers: { 'User-Agent': 'catalog-test' } };
        const token = process.env.GITHUB_TOKEN;
        if (token) opts.headers.Authorization = `token ${token}`;

        https.get(url, opts, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                https.get(res.headers.location, opts, (res2) => {
                    let data = '';
                    res2.on('data', c => data += c);
                    res2.on('end', () => resolve({ status: res2.statusCode, size: data.length, preview: data.slice(0, 120) }));
                }).on('error', () => resolve({ status: 0, size: 0, preview: 'REDIRECT_ERROR' }));
                return;
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, size: data.length, preview: data.slice(0, 120) }));
        }).on('error', (e) => resolve({ status: 0, size: 0, preview: e.message }));
    });
}

async function main() {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📥 DOWNLOAD VERIFICATION — Real catalog URLs`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`Catalog: ${items.length} total | STK:${grouped.stk.length} CX:${grouped.cx.length} JL:${grouped.jl.length} ANT:${grouped.ant.length}`);
    console.log(`Testing ${testItems.length} random entries...\n`);

    const results = { STK: { pass: 0, fail: 0 }, CX: { pass: 0, fail: 0 }, JL: { pass: 0, fail: 0 }, ANT: { pass: 0, fail: 0 } };
    const failures = [];

    for (const item of testItems) {
        const url = item.directUrl;
        if (!url) {
            console.log(`❓ [${item._src}] ${item.name} — NO directUrl!`);
            results[item._src].fail++;
            failures.push({ source: item._src, name: item.name, url: '(missing)', reason: 'no directUrl' });
            continue;
        }

        const r = await fetchUrl(url);
        const ok = r.status === 200 && r.size > 50;

        if (ok) {
            results[item._src].pass++;
            console.log(`✅ [${item._src.padEnd(3)}] ${item.name.padEnd(42)} ${r.status} ${r.size.toLocaleString().padStart(7)}B`);
            console.log(`   📄 ${r.preview.replace(/\n/g, ' ').trim().slice(0, 90)}...`);
        } else {
            results[item._src].fail++;
            failures.push({ source: item._src, name: item.name, url, reason: `HTTP ${r.status}` });
            console.log(`❌ [${item._src.padEnd(3)}] ${item.name.padEnd(42)} HTTP ${r.status} (${r.size}B)`);
            console.log(`   🔗 ${url.slice(0, 100)}...`);
        }
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📊 RESULTS`);
    console.log(`${'═'.repeat(70)}`);
    let tp = 0, tf = 0;
    for (const [src, r] of Object.entries(results)) {
        const total = r.pass + r.fail;
        if (total === 0) continue;
        const icon = r.fail === 0 ? '✅' : '⚠️';
        console.log(`  ${icon} ${src.padEnd(5)} ${r.pass}/${total} downloadable`);
        tp += r.pass; tf += r.fail;
    }
    console.log(`\n  TOTAL: ${tp}/${tp + tf} (${((tp / (tp + tf)) * 100).toFixed(0)}%)`);

    if (failures.length > 0) {
        console.log(`\n❌ FAILED:`);
        for (const f of failures) {
            console.log(`   [${f.source}] ${f.name} — ${f.reason}`);
            if (f.url !== '(missing)') console.log(`   ${f.url}`);
        }
    }
}

main().catch(console.error);
