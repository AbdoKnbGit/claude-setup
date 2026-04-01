// Discovers all JL plugins and their first skill name for catalog population
const https = require("https");

const BASE = "https://api.github.com/repos/jeremylongshore/claude-code-plugins-plus-skills/contents/plugins";
const TOKEN = process.env.GITHUB_TOKEN;

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const opts = { headers: { "User-Agent": "catalog-builder" } };
        if (TOKEN) opts.headers.Authorization = `token ${TOKEN}`;
        https.get(url, opts, (res) => {
            let data = "";
            res.on("data", (c) => data += c);
            res.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve(null); }
            });
        }).on("error", reject);
    });
}

async function main() {
    // Categories to scan (skip non-plugin dirs)
    const cats = ["ai-agency", "ai-ml", "api-development", "automation", "business-tools",
        "community", "crypto", "database", "design", "devops", "finance",
        "mcp", "packages", "performance", "productivity", "saas-packs",
        "security", "skill-enhancers", "testing"];

    const results = [];

    for (const cat of cats) {
        const items = await fetchJSON(`${BASE}/${cat}`);
        if (!Array.isArray(items)) { console.log(`SKIP ${cat}: not array`); continue; }
        const plugins = items.filter(x => x.type === "dir");
        console.log(`\n=== ${cat} (${plugins.length} plugins) ===`);

        // Sample first 3 plugins to find their skill names
        for (const plug of plugins.slice(0, 3)) {
            const skillsUrl = `${BASE}/${cat}/${plug.name}/skills`;
            const skills = await fetchJSON(skillsUrl);
            if (!Array.isArray(skills)) {
                console.log(`  ${plug.name}: NO skills/ dir`);
                continue;
            }
            const skillDirs = skills.filter(x => x.type === "dir");
            if (skillDirs.length === 0) {
                console.log(`  ${plug.name}: skills/ empty`);
                continue;
            }
            console.log(`  ${plug.name}: ${skillDirs.map(s => s.name).join(", ")}`);
            results.push({ cat, plugin: plug.name, skills: skillDirs.map(s => s.name) });
        }
    }

    console.log(`\n\n=== SUMMARY: ${results.length} plugins with skills ===`);
    for (const r of results) {
        console.log(`jl("${r.plugin}", "${r.plugin}", "<desc>", ["${r.cat}"], "plugins/${r.cat}/${r.plugin}", "${r.skills[0]}", [<tags>])`);
    }
}

main().catch(console.error);
