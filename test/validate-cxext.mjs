/**
 * General validator for ALL external-repo (cxExt) catalog entries.
 * Tests every URL and identifies broken ones.
 */
import { loadCatalog } from '../dist/marketplace-catalog.js';
import https from 'https';

const catalog = loadCatalog();

// Find all community entries (cxExt generates source: "community")
const extEntries = catalog.items.filter(i => i.source === 'community');

function download(url) {
    return new Promise((resolve) => {
        if (!url || !url.startsWith('http')) { resolve({ status: 0, size: 0 }); return; }
        const opts = { headers: { 'User-Agent': 'validator' } };
        const token = process.env.GITHUB_TOKEN;
        if (token) opts.headers.Authorization = `token ${token}`;
        https.get(url, opts, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                https.get(res.headers.location, opts, (res2) => {
                    let d = ''; res2.on('data', c => d += c);
                    res2.on('end', () => resolve({ status: res2.statusCode, size: d.length }));
                }).on('error', () => resolve({ status: 0, size: 0 }));
                return;
            }
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => resolve({ status: res.statusCode, size: d.length }));
        }).on('error', () => resolve({ status: 0, size: 0 }));
    });
}

async function main() {
    console.log(`Testing ${extEntries.length} cxExt (community) entries...\n`);
    const broken = [];
    let pass = 0;

    for (const e of extEntries) {
        const r = await download(e.directUrl);
        const ok = r.status === 200 && r.size > 50;
        if (ok) {
            pass++;
            process.stdout.write('✅');
        } else {
            broken.push({ id: e.id, name: e.name, url: e.directUrl, status: r.status });
            process.stdout.write('❌');
        }
    }

    console.log(`\n\nResult: ${pass}/${extEntries.length} valid\n`);
    if (broken.length > 0) {
        console.log('Broken entries:');
        for (const b of broken) {
            console.log(`  ❌ ${b.name} (${b.id}) — HTTP ${b.status}`);
            console.log(`     ${b.url}`);
        }
    } else {
        console.log('🎉 ALL cxExt URLs are valid!');
    }
}

main().catch(console.error);
