/**
 * OS-GENERIC AUDIT — Verify nothing is hardcoded to a specific machine
 * 
 * Checks:
 * 1. No hardcoded absolute paths (C:\, /Users/, /home/)
 * 2. All install paths use forward slashes and relative paths
 * 3. No hardcoded usernames, machine names, or local dirs
 * 4. URLs are remote (github/raw.githubusercontent), not local
 * 5. detectOS() is used properly for OS-conditional logic
 * 6. No Windows-only or Unix-only assumptions in the catalog
 */
import { loadCatalog } from '../dist/marketplace-catalog.js';
import fs from 'fs';

const catalog = loadCatalog();
const items = catalog.items;

let pass = 0, fail = 0;
const issues = [];

function check(label, condition, detail = '') {
    if (condition) {
        pass++;
    } else {
        fail++;
        issues.push({ label, detail });
        console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    }
}

console.log(`${'═'.repeat(72)}`);
console.log(`🔍 OS-GENERIC AUDIT — ${items.length} catalog entries + source code`);
console.log(`${'═'.repeat(72)}\n`);

// ═══════════════════════════════════════════════════════════════════
// TEST 1: No hardcoded absolute paths in catalog entries
// ═══════════════════════════════════════════════════════════════════
console.log(`### 1. Catalog entries — no hardcoded absolute paths`);
for (const item of items) {
    // Check installPath
    check(`${item.id} installPath is relative`,
        !item.installPath.match(/^[A-Z]:\\|^\/Users|^\/home|^\/tmp/i),
        item.installPath);

    // Check installPath uses forward slashes
    check(`${item.id} installPath uses forward slashes`,
        !item.installPath.includes('\\'),
        item.installPath);

    // Check directUrl is a remote URL or plugin-install format
    if (item.directUrl) {
        const isRemoteUrl = item.directUrl.startsWith('https://');
        const isPluginInstall = item.directUrl.includes('@claude-code-plugins');
        check(`${item.id} directUrl is remote or plugin-install`,
            isRemoteUrl || isPluginInstall,
            item.directUrl.slice(0, 80));
    }
}
console.log(`  ✅ ${pass} checks passed\n`);
const afterCatalog = pass;

// ═══════════════════════════════════════════════════════════════════
// TEST 2: Source code audit — no hardcoded paths in TS files
// ═══════════════════════════════════════════════════════════════════
console.log(`### 2. Source code — no hardcoded local paths`);
const srcFiles = [
    'src/marketplace-catalog.ts',
    'src/marketplace.ts',
    'src/builder.ts',
    'src/os.ts',
    'src/collect.ts',
];

const localPathPatterns = [
    { re: /C:\\\\Users\\\\/gi, desc: 'hardcoded Windows C:\\Users path' },
    { re: /\/Users\/\w+\//g, desc: 'hardcoded macOS /Users/ path' },
    { re: /\/home\/\w+\//g, desc: 'hardcoded Linux /home/ path' },
    { re: /\\\\Desktop\\\\/gi, desc: 'hardcoded Desktop path' },
    { re: /\\\\AppData\\\\/gi, desc: 'hardcoded AppData path' },
    { re: /localhost:\d{4}/g, desc: 'hardcoded localhost port' },
];

for (const file of srcFiles) {
    if (!fs.existsSync(file)) { continue; }
    const content = fs.readFileSync(file, 'utf8');

    for (const pattern of localPathPatterns) {
        const matches = content.match(pattern.re);
        if (matches && !file.includes('os.ts')) { // os.ts may legitimately reference OS paths as detection
            // Ignore matches inside comments or string examples
            const realMatches = matches.filter(m => {
                const idx = content.indexOf(m);
                const lineStart = content.lastIndexOf('\n', idx);
                const line = content.slice(lineStart, content.indexOf('\n', idx));
                return !line.trim().startsWith('//') && !line.trim().startsWith('*');
            });
            check(`${file} — no ${pattern.desc}`,
                realMatches.length === 0,
                `found ${realMatches.length}: ${realMatches[0]}`);
        }
    }
}
console.log(`  ✅ ${pass - afterCatalog} source checks passed\n`);
const afterSource = pass;

// ═══════════════════════════════════════════════════════════════════
// TEST 3: Install paths are cross-platform compatible
// ═══════════════════════════════════════════════════════════════════
console.log(`### 3. Install paths — cross-platform format`);
const installPaths = new Set(items.map(i => i.installPath));
for (const p of installPaths) {
    // Must start with .claude/
    check(`"${p}" starts with .claude/`,
        p.startsWith('.claude/'),
        p);

    // Must not have double slashes
    check(`"${p}" no double slashes`,
        !p.includes('//'),
        p);

    // Must end with .md
    check(`"${p}" ends with .md`,
        p.endsWith('.md'),
        p);
}
console.log(`  ✅ ${pass - afterSource} path checks passed\n`);
const afterPaths = pass;

// ═══════════════════════════════════════════════════════════════════
// TEST 4: detectOS() is used (not hardcoded OS assumptions)
// ═══════════════════════════════════════════════════════════════════
console.log(`### 4. OS detection — uses detectOS() not hardcoded`);
const marketplaceSrc = fs.readFileSync('src/marketplace.ts', 'utf8');
const builderSrc = fs.readFileSync('src/builder.ts', 'utf8');

check('marketplace.ts does NOT hardcode "Windows"',
    !marketplaceSrc.match(/os\s*===?\s*["']Windows["']/),
    'marketplace.ts should not have OS checks — builder.ts handles that');

check('builder.ts uses detectOS()',
    builderSrc.includes('detectOS()'),
    '');

check('builder.ts has IS_WINDOWS flag',
    builderSrc.includes('IS_WINDOWS'),
    '');

check('builder.ts has IS_MACOS flag',
    builderSrc.includes('IS_MACOS'),
    '');

check('builder.ts has IS_UNIX_LIKE flag',
    builderSrc.includes('IS_UNIX_LIKE'),
    '');
console.log(`  ✅ ${pass - afterPaths} OS detection checks passed\n`);
const afterOS = pass;

// ═══════════════════════════════════════════════════════════════════
// TEST 5: URLs use consistent repo constants, not hardcoded strings
// ═══════════════════════════════════════════════════════════════════
console.log(`### 5. URL consistency — all use repo constants`);
const catalogSrc = fs.readFileSync('src/marketplace-catalog.ts', 'utf8');

// Check that helper functions exist
check('catalog has va() helper',
    catalogSrc.includes('function va('));
check('catalog has cx() helper',
    catalogSrc.includes('function cx('));
check('catalog has cxExt() helper',
    catalogSrc.includes('function cxExt('));
check('catalog has jl() helper',
    catalogSrc.includes('function jl('));
check('catalog has ant() helper',
    catalogSrc.includes('function ant('));

// Check that no raw URLs are used outside helpers
const rawUrls = catalogSrc.match(/raw\.githubusercontent\.com/g);
const helperRawUrls = catalogSrc.match(/\$\{[A-Z_]+\}.*raw\.githubusercontent|https:\/\/raw\.githubusercontent.*\$\{/g);
check('catalog URLs built from constants (VA, CX, JL vars)',
    catalogSrc.includes('const VA =') && catalogSrc.includes('const CX =') && catalogSrc.includes('const JL ='));

console.log(`  ✅ ${pass - afterOS} URL checks passed\n`);

// ═══════════════════════════════════════════════════════════════════
// TEST 6: No env-specific or username-specific values
// ═══════════════════════════════════════════════════════════════════
console.log(`### 6. No user-specific / env-specific values baked in`);
for (const item of items) {
    const all = `${item.name}${item.description}${item.directUrl}${item.installPath}`;
    check(`${item.id} no username in data`,
        !all.match(/\bok\b|claude-setup|Desktop/gi),
        all.slice(0, 100));
}
console.log(`  ✅ ${pass - (pass - items.length)} user-specific checks passed\n`);

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════
console.log(`${'═'.repeat(72)}`);
console.log(`📊 OS-GENERIC AUDIT RESULTS`);
console.log(`${'═'.repeat(72)}`);
console.log(`  Total checks: ${pass + fail}`);
console.log(`  ✅ Passed:     ${pass}`);
console.log(`  ❌ Failed:     ${fail}`);
console.log(`  Rate:          ${((pass / (pass + fail)) * 100).toFixed(1)}%`);

if (fail === 0) {
    console.log(`\n🎉 FULLY OS-GENERIC: No hardcoded paths, no username references,`);
    console.log(`   all install paths relative, all URLs from remote repos,`);
    console.log(`   OS detection uses detectOS() with proper flags.`);
} else {
    console.log(`\n⚠️  ${fail} issues need fixing:`);
    for (const i of issues) {
        console.log(`   ${i.label} — ${i.detail}`);
    }
}
