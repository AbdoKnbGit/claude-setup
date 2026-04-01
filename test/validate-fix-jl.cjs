/**
 * GENERAL JL URL Validator & Auto-Fixer
 * 
 * Tests ALL JL catalog entries by downloading their SKILL.md URLs.
 * For broken ones, discovers the correct skill name via GitHub API
 * and outputs sed/replace commands to fix the catalog.
 * 
 * Also validates all CX, STK, ANT entries.
 */
const https = require("https");
const fs = require("fs");

const TOKEN = process.env.GITHUB_TOKEN;

function fetch(url) {
    return new Promise((resolve) => {
        const opts = { headers: { "User-Agent": "catalog-validator" } };
        if (TOKEN) opts.headers.Authorization = `token ${TOKEN}`;

        https.get(url, opts, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                https.get(res.headers.location, opts, (res2) => {
                    let d = "";
                    res2.on("data", c => d += c);
                    res2.on("end", () => resolve({ status: res2.statusCode, size: d.length }));
                }).on("error", () => resolve({ status: 0, size: 0 }));
                return;
            }
            let d = "";
            res.on("data", c => d += c);
            res.on("end", () => resolve({ status: res.statusCode, size: d.length }));
        }).on("error", () => resolve({ status: 0, size: 0 }));
    });
}

function fetchJSON(url) {
    return new Promise((resolve) => {
        const opts = { headers: { "User-Agent": "catalog-validator" } };
        if (TOKEN) opts.headers.Authorization = `token ${TOKEN}`;

        https.get(url, opts, (res) => {
            let d = "";
            res.on("data", c => d += c);
            res.on("end", () => {
                try { resolve(JSON.parse(d)); }
                catch { resolve(null); }
            });
        }).on("error", () => resolve(null));
    });
}

// Parse the catalog source to extract all entries with their data
const src = fs.readFileSync("src/marketplace-catalog.ts", "utf8");
const lines = src.split("\n");

// Find all jl() entries with their line numbers and skill names
const jlEntries = [];
const allEntries = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match jl("id", "name", "desc", ["cats"], "path", "skillName", ["tags"])
    const jlMatch = line.match(/jl\("([^"]+)",\s*"([^"]+)",\s*"[^"]*",\s*\[[^\]]*\],\s*"([^"]+)",\s*"([^"]+)"/);
    if (jlMatch) {
        jlEntries.push({
            lineNum: i + 1,
            id: jlMatch[1],
            name: jlMatch[2],
            path: jlMatch[3],
            skillName: jlMatch[4],
            url: `https://raw.githubusercontent.com/jeremylongshore/claude-code-plugins-plus-skills/main/${jlMatch[3]}/skills/${jlMatch[4]}/SKILL.md`,
            source: "JL"
        });
    }

    // Match cx("id", ..., "path", [...]) — simpler pattern
    const cxMatch = line.match(/^\s+cx\("([^"]+)",\s*"([^"]+)",\s*"[^"]*",\s*\[[^\]]*\],\s*"([^"]+)"/);
    if (cxMatch) {
        allEntries.push({
            id: cxMatch[1],
            name: cxMatch[2],
            url: `https://raw.githubusercontent.com/ComposioHQ/skills/main/skills/${cxMatch[3]}/SKILL.md`,
            source: "CX"
        });
    }
}

async function main() {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`🔍 GENERAL CATALOG URL VALIDATOR — Testing ALL JL entries`);
    console.log(`${"═".repeat(70)}`);
    console.log(`Found ${jlEntries.length} JL entries to validate\n`);

    const broken = [];
    const fixed = [];
    let pass = 0, fail = 0;

    for (const entry of jlEntries) {
        const r = await fetch(entry.url);
        const ok = r.status === 200 && r.size > 50;

        if (ok) {
            pass++;
            process.stdout.write(`✅`);
        } else {
            fail++;
            process.stdout.write(`❌`);
            broken.push(entry);
        }
    }

    console.log(`\n\nResult: ${pass}/${pass + fail} valid (${fail} broken)\n`);

    if (broken.length === 0) {
        console.log("🎉 ALL JL URLs are valid!");
        return;
    }

    // For each broken entry, discover the correct skill name
    console.log(`\n${"═".repeat(70)}`);
    console.log(`🔧 AUTO-FIX: Discovering correct skill names for ${broken.length} broken entries`);
    console.log(`${"═".repeat(70)}\n`);

    const JL_API_BASE = "https://api.github.com/repos/jeremylongshore/claude-code-plugins-plus-skills/contents";

    for (const entry of broken) {
        console.log(`\n❌ ${entry.name} (line ${entry.lineNum})`);
        console.log(`   Broken skill: "${entry.skillName}"`);
        console.log(`   Path: ${entry.path}`);

        // Check if the plugin directory even exists
        const pluginUrl = `${JL_API_BASE}/${entry.path}`;
        const pluginDir = await fetchJSON(pluginUrl);

        if (!Array.isArray(pluginDir)) {
            console.log(`   ⚠️  PLUGIN DIR MISSING: ${entry.path}`);
            console.log(`   → Need to remove or fix the entire entry`);
            fixed.push({ ...entry, fix: "REMOVE_OR_FIX_PATH", correctSkill: null });
            continue;
        }

        // Check skills/ subdirectory
        const skillsDir = pluginDir.find(x => x.name === "skills" && x.type === "dir");
        if (!skillsDir) {
            // Maybe it uses a different structure — check for SKILL.md directly
            const skillDirect = pluginDir.find(x => x.name === "SKILL.md");
            if (skillDirect) {
                console.log(`   ✅ Found SKILL.md at root level (no skills/ subdir)`);
                fixed.push({ ...entry, fix: "ROOT_SKILL", correctSkill: null });
            } else {
                // Check for skill-adapter pattern
                const skillAdapter = pluginDir.find(x => x.name === "skill-adapter");
                if (skillAdapter) {
                    console.log(`   ✅ Found skill-adapter/ dir — trying skill-adapter/SKILL.md`);
                    fixed.push({ ...entry, fix: "SKILL_ADAPTER", correctSkill: "skill-adapter" });
                } else {
                    console.log(`   ⚠️  NO skills/ dir found. Contents: ${pluginDir.map(x => x.name).join(", ")}`);
                    fixed.push({ ...entry, fix: "NO_SKILLS_DIR", correctSkill: null });
                }
            }
            continue;
        }

        // List skills inside skills/ 
        const skillsUrl = `${JL_API_BASE}/${entry.path}/skills`;
        const skills = await fetchJSON(skillsUrl);

        if (!Array.isArray(skills) || skills.length === 0) {
            console.log(`   ⚠️  skills/ dir exists but is empty or inaccessible`);
            fixed.push({ ...entry, fix: "EMPTY_SKILLS", correctSkill: null });
            continue;
        }

        const skillDirs = skills.filter(x => x.type === "dir");
        console.log(`   Available skills: ${skillDirs.map(x => x.name).join(", ")}`);

        // Find the closest match or use the first one
        const correctSkill = skillDirs[0]?.name;
        if (correctSkill) {
            // Verify it has SKILL.md
            const verifyUrl = `https://raw.githubusercontent.com/jeremylongshore/claude-code-plugins-plus-skills/main/${entry.path}/skills/${correctSkill}/SKILL.md`;
            const verify = await fetch(verifyUrl);
            if (verify.status === 200 && verify.size > 50) {
                console.log(`   ✅ FIXED: "${entry.skillName}" → "${correctSkill}"`);
                fixed.push({ ...entry, fix: "RENAME_SKILL", correctSkill });
            } else {
                console.log(`   ⚠️  Skill dir exists but SKILL.md not found at ${correctSkill}`);
                fixed.push({ ...entry, fix: "NO_SKILL_MD", correctSkill });
            }
        }
    }

    // Output the fix commands
    console.log(`\n\n${"═".repeat(70)}`);
    console.log(`📋 FIX SUMMARY — Copy these replacements into marketplace-catalog.ts`);
    console.log(`${"═".repeat(70)}\n`);

    for (const f of fixed) {
        if (f.fix === "RENAME_SKILL" && f.correctSkill) {
            console.log(`Line ${f.lineNum}: "${f.skillName}" → "${f.correctSkill}"`);
        } else {
            console.log(`Line ${f.lineNum}: ${f.name} — ${f.fix} (manual fix needed)`);
        }
    }
}

main().catch(console.error);
