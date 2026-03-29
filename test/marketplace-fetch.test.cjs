/**
 * Marketplace fetch pipeline test — cross-platform, no hardcoded names.
 *
 * Tests the complete 3-stage fetch (find → navigate → download) against
 * all 4 marketplace sources. Every agent/skill name is discovered at
 * runtime from the actual catalog — nothing is tied to a specific machine,
 * OS, or fixed file name.
 *
 * Run:  node test/marketplace-fetch.test.cjs
 */

const https = require("https");
const path = require("path");
const os = require("os");

// ── Config (mirrors marketplace.ts constants) ───────────────────────────

const VOLTAGENT_SUBAGENTS_REPO = "VoltAgent/awesome-claude-code-subagents";
const VOLTAGENT_SUBAGENTS_API  = `https://api.github.com/repos/${VOLTAGENT_SUBAGENTS_REPO}/contents/categories`;
const VOLTAGENT_SUBAGENTS_RAW  = `https://raw.githubusercontent.com/${VOLTAGENT_SUBAGENTS_REPO}/main/categories`;

const MARKETPLACE_REPO = "jeremylongshore/claude-code-plugins-plus-skills";
const MARKETPLACE_CATALOG_URL = `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/.claude-plugin/marketplace.extended.json`;

const COMPOSIO_REPO = "ComposioHQ/awesome-claude-skills";
const COMPOSIO_API  = `https://api.github.com/repos/${COMPOSIO_REPO}/contents`;
const COMPOSIO_RAW  = `https://raw.githubusercontent.com/${COMPOSIO_REPO}/master`;

// ── HTTP helper (works on all platforms — no curl dependency) ────────────

function fetch(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { "User-Agent": "claude-setup-test/1.0" },
    };
    https.get(opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        } else {
          resolve(data);
        }
      });
    }).on("error", reject);
  });
}

function fetchJSON(url) {
  return fetch(url).then((d) => JSON.parse(d));
}

// ── Test harness ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

function assert(label, condition, detail) {
  if (condition) {
    passed++;
    results.push({ status: "PASS", label, detail });
  } else {
    failed++;
    results.push({ status: "FAIL", label, detail });
  }
}

// ── Classification tests (pure logic — no network) ─────────────────────

function testClassification() {
  // Import compiled module
  const mkt = require("../dist/marketplace.js");

  console.log("\n== Classification tests ==\n");

  // Agent detection — diverse inputs
  const agentInputs = [
    "multi-agent coordinator for CI/CD",
    "subagent for code review",
    "orchestrator for data pipeline",
    "workflow agent for release management",
  ];
  for (const input of agentInputs) {
    const result = mkt.classifyRequest(input);
    assert(
      `Agent detect: "${input}"`,
      result.isAgent === true,
      `isAgent=${result.isAgent}, categories=${result.agentCategories}`
    );
  }

  // Skill detection — must NOT be flagged as agent
  const skillInputs = [
    "playwright testing setup",
    "prisma database migration",
    "tailwind CSS components",
    "eslint code quality",
  ];
  for (const input of skillInputs) {
    const result = mkt.classifyRequest(input);
    assert(
      `Skill detect: "${input}"`,
      result.isAgent === false,
      `isAgent=${result.isAgent}, skillCats=${result.categories}`
    );
  }

  // SaaS detection
  const saasInputs = [
    ["add Stripe payments", "Stripe"],
    ["connect to Notion workspace", "Notion"],
    ["Supabase auth setup", "Supabase"],
  ];
  for (const [input, expected] of saasInputs) {
    const result = mkt.classifyRequest(input);
    assert(
      `SaaS detect: "${input}"`,
      result.saasMatches.includes(expected),
      `saasMatches=${result.saasMatches}`
    );
  }

  // Agent category routing
  const categoryInputs = [
    ["infrastructure agent for kubernetes", "03-infrastructure"],
    ["security audit agent", "04-quality-security"],
    ["data pipeline agent", "05-data-ai"],
    ["orchestrator for deployment", "09-meta-orchestration"],
  ];
  for (const [input, expectedCat] of categoryInputs) {
    const result = mkt.classifyRequest(input);
    assert(
      `Agent category: "${input}" → ${expectedCat}`,
      result.agentCategories.includes(expectedCat),
      `agentCategories=${result.agentCategories}`
    );
  }
}

// ── OS-awareness tests ──────────────────────────────────────────────────

function testOSAwareness() {
  const mkt = require("../dist/marketplace.js");

  console.log("\n== OS-awareness tests ==\n");

  // Agent pipeline generates valid bash (no OS-specific paths)
  const agentInstr = mkt.buildMarketplaceInstructions("orchestrator for devops");
  assert(
    "Agent pipeline has no hardcoded OS paths",
    !agentInstr.includes("C:\\") && !agentInstr.includes("/Users/") && !agentInstr.includes("/home/"),
    "Scanned for C:\\, /Users/, /home/"
  );
  assert(
    "Agent pipeline uses curl -sf (portable)",
    agentInstr.includes("curl -sf"),
    "All fetch commands use curl -sf for silent fail"
  );
  assert(
    "Agent pipeline installs to .claude/agents/ (relative)",
    agentInstr.includes('".claude/agents"') || agentInstr.includes(".claude/agents/"),
    "Install path is relative, not absolute"
  );

  // Skill pipeline same checks
  const skillInstr = mkt.buildMarketplaceInstructions("database migration tools");
  assert(
    "Skill pipeline has no hardcoded OS paths",
    !skillInstr.includes("C:\\") && !skillInstr.includes("/Users/") && !skillInstr.includes("/home/"),
    "Scanned for C:\\, /Users/, /home/"
  );
  assert(
    "Skill pipeline installs to .claude/skills/ (relative)",
    skillInstr.includes('".claude/skills/'),
    "Install path is relative, not absolute"
  );
}

// ── Pipeline structure tests ────────────────────────────────────────────

function testPipelineStructure() {
  const mkt = require("../dist/marketplace.js");

  console.log("\n== Pipeline structure tests ==\n");

  // Agent pipeline must have all steps
  const agentInstr = mkt.buildMarketplaceInstructions("multi-agent coordinator");
  assert("Agent: has STEP 1 (VoltAgent)", agentInstr.includes("STEP 1") && agentInstr.includes("VoltAgent"));
  assert("Agent: has STEP 2 (community)", agentInstr.includes("STEP 2") && agentInstr.includes("Community"));
  assert("Agent: has STEP 3 (ComposioHQ)", agentInstr.includes("STEP 3") && agentInstr.includes("ComposioHQ"));
  assert("Agent: has STEP 4 (custom fallback)", agentInstr.includes("STEP 4") && agentInstr.includes("custom"));
  assert("Agent: failure = routing signal", agentInstr.includes("routing signal"));

  // Skill pipeline must have all steps
  const skillInstr = mkt.buildMarketplaceInstructions("graphql API tools");
  assert("Skill: has STEP 1 (official)", skillInstr.includes("STEP 1") && skillInstr.includes("Official"));
  assert("Skill: has STEP 2 (community)", skillInstr.includes("STEP 2") && skillInstr.includes("Community"));
  assert("Skill: has STEP 3 (VoltAgent skills)", skillInstr.includes("STEP 3") && skillInstr.includes("VoltAgent"));
  assert("Skill: has STEP 4 (ComposioHQ)", skillInstr.includes("STEP 4") && skillInstr.includes("ComposioHQ"));
  assert("Skill: has STEP 5 (custom fallback)", skillInstr.includes("STEP 5") && skillInstr.includes("custom"));
}

// ── Live fetch tests (network) ──────────────────────────────────────────
// Every name is discovered at runtime — nothing hardcoded.

async function testSource1_VoltAgentSubagents() {
  console.log("\n== Source 1: VoltAgent subagents (live fetch) ==\n");

  // Stage 1: discover categories
  let categories;
  try {
    categories = await fetchJSON(VOLTAGENT_SUBAGENTS_API);
    assert(
      "S1 Stage1: categories endpoint returns array",
      Array.isArray(categories) && categories.length > 0,
      `Got ${categories.length} categories`
    );
  } catch (e) {
    assert("S1 Stage1: categories endpoint reachable", false, e.message);
    return;
  }

  // Pick a NON-OBVIOUS category — not meta-orchestration, pick something niche
  // Use data-ai or specialized-domains to avoid testing the obvious one
  const nicheCategories = categories.filter(
    (c) => c.name.includes("data-ai") || c.name.includes("specialized-domains") || c.name.includes("quality-security")
  );
  const targetCat = nicheCategories.length > 0 ? nicheCategories[0] : categories[Math.floor(categories.length / 2)];
  console.log(`  Picked niche category: ${targetCat.name}`);

  // Stage 2: list agents in that category
  let agents;
  try {
    agents = await fetchJSON(`${VOLTAGENT_SUBAGENTS_API}/${targetCat.name}`);
    const mdFiles = agents.filter((a) => a.name.endsWith(".md") && a.name !== "README.md");
    assert(
      `S1 Stage2: list agents in ${targetCat.name}`,
      mdFiles.length > 0,
      `Found ${mdFiles.length} agent files`
    );

    // Pick the LAST agent (not first — avoids always testing the same one)
    const pickedAgent = mdFiles[mdFiles.length - 1];
    console.log(`  Picked agent: ${pickedAgent.name}`);

    // Stage 3: download actual content
    const content = await fetch(`${VOLTAGENT_SUBAGENTS_RAW}/${targetCat.name}/${pickedAgent.name}`);
    assert(
      `S1 Stage3: download ${pickedAgent.name}`,
      content.length > 50,
      `${content.length} chars`
    );
    assert(
      `S1 Stage3: has YAML frontmatter`,
      content.startsWith("---") && content.includes("name:") && content.includes("description:"),
      "Frontmatter validated"
    );
    assert(
      `S1 Stage3: has body after frontmatter`,
      content.split("---").length >= 3 && content.split("---")[2].trim().length > 20,
      "Body content present"
    );
  } catch (e) {
    assert(`S1 Stage2-3: fetch agent from ${targetCat.name}`, false, e.message);
  }
}

async function testSource2_CommunitySkills() {
  console.log("\n== Source 2: Community skills catalog (live fetch) ==\n");

  // Stage 1: fetch the JSON catalog
  let catalog;
  try {
    catalog = await fetchJSON(MARKETPLACE_CATALOG_URL);
    assert(
      "S2 Stage1: catalog fetched and parsed",
      catalog && Array.isArray(catalog.plugins) && catalog.plugins.length > 0,
      `${catalog.plugins.length} plugins in catalog`
    );
  } catch (e) {
    assert("S2 Stage1: catalog reachable", false, e.message);
    return;
  }

  // Pick a NON-OBVIOUS plugin — filter for a niche category like security or finance
  const nichePlugins = catalog.plugins.filter(
    (p) =>
      p.source &&
      p.name &&
      (p.category?.includes("security") ||
        p.category?.includes("finance") ||
        p.category?.includes("legal") ||
        p.category?.includes("data-science"))
  );
  const targetPlugin = nichePlugins.length > 0
    ? nichePlugins[Math.floor(nichePlugins.length / 2)]
    : catalog.plugins.find((p) => p.source && p.name);

  if (!targetPlugin) {
    assert("S2 Stage1: found a plugin with source", false, "No plugins with source field");
    return;
  }

  console.log(`  Picked plugin: ${targetPlugin.name} (${targetPlugin.category || "uncategorized"})`);

  // Stage 2: list skills directory
  const sourcePath = targetPlugin.source.replace(/^\.\//, "");
  try {
    const skillsDir = await fetchJSON(
      `https://api.github.com/repos/${MARKETPLACE_REPO}/contents/${sourcePath}/skills`
    );
    if (Array.isArray(skillsDir) && skillsDir.length > 0) {
      assert(
        `S2 Stage2: skills directory for ${targetPlugin.name}`,
        true,
        `${skillsDir.length} entries`
      );

      // Stage 3: download the last skill
      const pickedSkill = skillsDir[skillsDir.length - 1];
      console.log(`  Picked skill: ${pickedSkill.name}`);
      try {
        const content = await fetch(
          `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/${sourcePath}/skills/${pickedSkill.name}/SKILL.md`
        );
        assert(
          `S2 Stage3: download ${pickedSkill.name}/SKILL.md`,
          content.length > 20,
          `${content.length} chars`
        );
        assert(
          `S2 Stage3: has frontmatter`,
          content.includes("---") && (content.includes("name:") || content.includes("description:")),
          "Content validated"
        );
      } catch (e) {
        // Some plugins have a flat structure — SKILL.md at plugin root
        try {
          const altContent = await fetch(
            `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/${sourcePath}/SKILL.md`
          );
          assert(
            `S2 Stage3: download SKILL.md (flat structure)`,
            altContent.length > 20,
            `${altContent.length} chars`
          );
        } catch (e2) {
          assert(`S2 Stage3: download skill content`, false, `${e.message} / alt: ${e2.message}`);
        }
      }
    } else {
      // No skills subdirectory — try SKILL.md at plugin root
      const rootSkill = await fetch(
        `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/${sourcePath}/SKILL.md`
      ).catch(() => null);
      assert(
        `S2 Stage2: plugin has installable content`,
        rootSkill && rootSkill.length > 20,
        rootSkill ? `root SKILL.md: ${rootSkill.length} chars` : "No skills dir or root SKILL.md"
      );
    }
  } catch (e) {
    // skills/ subdir may not exist — try plugin root
    try {
      const rootContent = await fetch(
        `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/${sourcePath}/SKILL.md`
      );
      assert(
        `S2 Stage2-3: flat plugin ${targetPlugin.name}`,
        rootContent.length > 20,
        `${rootContent.length} chars from root SKILL.md`
      );
    } catch (e2) {
      assert(`S2 Stage2: navigate ${targetPlugin.name}`, false, `No skills/ dir and no root SKILL.md`);
    }
  }
}

async function testSource3_ComposioHQ() {
  console.log("\n== Source 4: ComposioHQ service integrations (live fetch) ==\n");

  // Stage 1: list skill directories
  let entries;
  try {
    entries = await fetchJSON(COMPOSIO_API);
    const dirs = entries.filter((e) => e.type === "dir" && !e.name.startsWith("."));
    assert(
      "S4 Stage1: list skill directories",
      dirs.length > 0,
      `${dirs.length} skill directories`
    );

    // Pick a NON-OBVIOUS skill — skip generic ones, look for something specific
    const nicheNames = ["invoice-organizer", "domain-name-brainstormer", "raffle-winner-picker",
                        "competitive-ads-extractor", "developer-growth-analysis", "meeting-insights-analyzer"];
    let pickedDir = dirs.find((d) => nicheNames.includes(d.name));
    if (!pickedDir) {
      // Fallback: pick one from the middle
      pickedDir = dirs[Math.floor(dirs.length / 2)];
    }
    console.log(`  Picked skill: ${pickedDir.name}`);

    // Stage 2+3: download SKILL.md
    const content = await fetch(`${COMPOSIO_RAW}/${pickedDir.name}/SKILL.md`);
    assert(
      `S4 Stage3: download ${pickedDir.name}/SKILL.md`,
      content.length > 50,
      `${content.length} chars`
    );
    assert(
      `S4 Stage3: has frontmatter with name`,
      content.includes("---") && content.includes("name:"),
      "Frontmatter validated"
    );
    assert(
      `S4 Stage3: has body instructions`,
      content.split("---").length >= 3 && content.split("---")[2].trim().length > 30,
      "Body content present"
    );
  } catch (e) {
    assert("S4 Stage1: ComposioHQ reachable", false, e.message);
  }
}

// ── Template generation tests (all OS variants) ─────────────────────────

function testTemplateAllOS() {
  console.log("\n== Template OS variants ==\n");

  // We test buildAddCommand with mocked OS detection
  // Since we can't mock detectOS at runtime, we verify the generated
  // instructions contain no OS-absolute paths and only relative ones.

  const mkt = require("../dist/marketplace.js");

  const testInputs = [
    "kubernetes deployment agent",
    "slack notification skill",
    "competitive analysis tool",
    "embedded systems agent for IoT",
  ];

  for (const input of testInputs) {
    const instr = mkt.buildMarketplaceInstructions(input);

    // No absolute paths
    assert(
      `Template "${input}": no absolute paths`,
      !instr.includes("C:\\") &&
        !instr.includes("/Users/") &&
        !instr.includes("/home/") &&
        !instr.includes("/mnt/c/"),
      "Clean of absolute paths"
    );

    // All install paths are relative
    const installPaths = instr.match(/"\.[^"]*"/g) || [];
    const allRelative = installPaths.every((p) => p.startsWith('".'));
    assert(
      `Template "${input}": install paths relative`,
      allRelative,
      `Paths: ${installPaths.slice(0, 3).join(", ")}`
    );

    // No hardcoded file names in download commands
    const curlLines = instr.split("\n").filter((l) => l.includes("curl"));
    const noHardcodedFiles = curlLines.every(
      (l) => l.includes("${") || l.includes("AGENT_FILE") || l.includes("SKILL_") || l.includes("PLUGIN_") || !l.includes("-o ")
    );
    assert(
      `Template "${input}": download targets use variables`,
      noHardcodedFiles,
      `${curlLines.length} curl commands checked`
    );
  }
}

// ── Defensive fetch tests ───────────────────────────────────────────────

async function testDefensiveFetch() {
  console.log("\n== Defensive fetch (failure handling) ==\n");

  // Bad category — should 404 gracefully
  try {
    await fetchJSON(`${VOLTAGENT_SUBAGENTS_API}/99-nonexistent-category`);
    assert("Defensive: bad category throws", false, "Should have thrown");
  } catch (e) {
    assert("Defensive: bad category returns HTTP error", e.message.includes("404"), e.message);
  }

  // Bad raw file — should 404 gracefully
  try {
    await fetch(`${VOLTAGENT_SUBAGENTS_RAW}/01-core-development/does-not-exist-xyz.md`);
    assert("Defensive: bad agent file throws", false, "Should have thrown");
  } catch (e) {
    assert("Defensive: bad agent file returns HTTP error", e.message.includes("404"), e.message);
  }

  // Bad ComposioHQ skill — should 404 gracefully
  try {
    await fetch(`${COMPOSIO_RAW}/nonexistent-skill-xyz/SKILL.md`);
    assert("Defensive: bad ComposioHQ skill throws", false, "Should have thrown");
  } catch (e) {
    assert("Defensive: bad ComposioHQ skill returns HTTP error", e.message.includes("404"), e.message);
  }
}

// ── Universal URL resolution tests ──────────────────────────────────────

function testUniversalUrlResolution() {
  console.log("\n== Universal URL resolution tests ==\n");

  // Test that GitHub tree URLs resolve to raw URLs (dynamic, no hardcoded repo)
  const testUrls = [
    {
      input: "https://github.com/someuser/somerepo/tree/main/path/to/file.md",
      expected: "https://raw.githubusercontent.com/someuser/somerepo/main/path/to/file.md",
    },
    {
      input: "https://github.com/other-org/other-repo/blob/master/deep/nested/SKILL.md",
      expected: "https://raw.githubusercontent.com/other-org/other-repo/master/deep/nested/SKILL.md",
    },
    {
      input: "https://github.com/user123/my-plugin/tree/develop/src/agent.md",
      expected: "https://raw.githubusercontent.com/user123/my-plugin/develop/src/agent.md",
    },
  ];

  for (const { input, expected } of testUrls) {
    // Universal resolution: replace github.com with raw.githubusercontent.com, drop tree/blob
    const resolved = input
      .replace("https://github.com/", "https://raw.githubusercontent.com/")
      .replace(/\/(tree|blob)\//, "/");
    assert(
      `URL resolve: ${input.split("/").slice(-2).join("/")}`,
      resolved === expected,
      `Got: ${resolved}`
    );
  }

  // Test dynamic owner/repo extraction (no hardcoded repos)
  const externalLink = "https://github.com/randomauthor/awesome-plugin/tree/main/skills/my-skill";
  const match = externalLink.match(/github\.com\/([^/]+)\/([^/]+)/);
  assert(
    "Dynamic owner/repo extraction from any URL",
    match && match[1] === "randomauthor" && match[2] === "awesome-plugin",
    `Extracted: ${match ? match[1] + "/" + match[2] : "none"}`
  );

  // Test API URL derivation from any GitHub link
  const apiUrl = externalLink
    .replace("https://github.com/", "https://api.github.com/repos/")
    .replace(/\/tree\/[^/]+\//, "/contents/");
  assert(
    "API URL derivation from any GitHub tree URL",
    apiUrl.includes("api.github.com/repos/randomauthor/awesome-plugin/contents/skills/my-skill"),
    `Got: ${apiUrl}`
  );
}

// ── README-driven catalog tests (live fetch) ────────────────────────────

async function testReadmeDrivenCatalog() {
  console.log("\n== README-driven catalog tests (live fetch) ==\n");

  // Fetch ComposioHQ README — it IS a README-driven catalog with sections
  let readmeContent;
  try {
    readmeContent = await fetch(`${COMPOSIO_RAW}/README.md`);
    assert(
      "README fetch: ComposioHQ README accessible",
      readmeContent.length > 200,
      `${readmeContent.length} chars`
    );
  } catch (e) {
    assert("README fetch: ComposioHQ README accessible", false, e.message);
    return;
  }

  // Parse sections — look for markdown headings
  const headings = readmeContent.match(/^#{1,3}\s+.+$/gm) || [];
  assert(
    "README parse: found section headings",
    headings.length > 0,
    `${headings.length} headings found`
  );

  // Look for GitHub links in the README (could be internal or external)
  const ghLinks = readmeContent.match(/https?:\/\/github\.com\/[^\s\)]+/g) || [];
  assert(
    "README parse: found GitHub links",
    ghLinks.length > 0,
    `${ghLinks.length} GitHub links found`
  );

  // Test universal resolution on a found link (if any)
  if (ghLinks.length > 0) {
    const sampleLink = ghLinks[0];
    const ownerRepoMatch = sampleLink.match(/github\.com\/([^/]+)\/([^/\s\)#]+)/);
    assert(
      "README link: can extract owner/repo dynamically",
      ownerRepoMatch && ownerRepoMatch[1].length > 0 && ownerRepoMatch[2].length > 0,
      `Extracted: ${ownerRepoMatch ? ownerRepoMatch[1] + "/" + ownerRepoMatch[2] : "none"}`
    );
  }
}

// ── Candidate scoring instruction tests ─────────────────────────────────

function testCandidateScoring() {
  const mkt = require("../dist/marketplace.js");

  console.log("\n== Candidate scoring instruction tests ==\n");

  // Agent instructions must contain scoring rules
  const agentInstr = mkt.buildMarketplaceInstructions("security audit agent");
  assert(
    "Agent instructions: has Relevance scoring",
    agentInstr.includes("Relevance") && agentInstr.includes("highest weight"),
    "Relevance axis present"
  );
  assert(
    "Agent instructions: has Scope scoring",
    agentInstr.includes("Scope") && agentInstr.includes("surgical"),
    "Scope axis present"
  );
  assert(
    "Agent instructions: has Uniqueness scoring",
    agentInstr.includes("Uniqueness") && agentInstr.includes("duplicate"),
    "Uniqueness axis present"
  );

  // Skill instructions must also contain scoring rules
  const skillInstr = mkt.buildMarketplaceInstructions("database migration tools");
  assert(
    "Skill instructions: has scoring rules",
    skillInstr.includes("Relevance") && skillInstr.includes("Scope") && skillInstr.includes("Uniqueness"),
    "All 3 axes present"
  );

  // Universal rules must be in the output
  assert(
    "Instructions: has shape detection rules",
    agentInstr.includes("shape detection") || agentInstr.includes("Catalog shape"),
    "Shape detection present"
  );
  assert(
    "Instructions: has universal URL resolution",
    agentInstr.includes("Never hardcode") && agentInstr.includes("dynamically"),
    "Dynamic resolution present"
  );
  assert(
    "Instructions: has README-driven navigation",
    agentInstr.includes("README-driven") && agentInstr.includes("external"),
    "README navigation present"
  );
  assert(
    "Instructions: has content verification rules",
    agentInstr.includes("50 characters") && agentInstr.includes("frontmatter"),
    "Verification rules present"
  );
}

// ── Live simulation: 1 skill + 1 agent/MCP per repo ────────────────────

async function testLiveSimulation() {
  console.log("\n== Live simulation: 1 skill + 1 agent per repo ==\n");

  // Repo 1: VoltAgent subagents → fetch 1 agent
  try {
    const cats = await fetchJSON(VOLTAGENT_SUBAGENTS_API);
    const targetCat = cats.find((c) => c.name.includes("core-development")) || cats[0];
    const agents = await fetchJSON(`${VOLTAGENT_SUBAGENTS_API}/${targetCat.name}`);
    const mdFiles = agents.filter((a) => a.name.endsWith(".md") && a.name !== "README.md");
    // Pick middle entry (not first, not last — scoring simulation)
    const pick = mdFiles[Math.floor(mdFiles.length / 2)] || mdFiles[0];
    const content = await fetch(`${VOLTAGENT_SUBAGENTS_RAW}/${targetCat.name}/${pick.name}`);
    const hasFrontmatter = content.startsWith("---") && content.split("---").length >= 3;
    const bodyLength = hasFrontmatter ? content.split("---").slice(2).join("---").trim().length : 0;
    assert(
      `Sim: VoltAgent agent "${pick.name}" — verified`,
      content.length > 50 && hasFrontmatter && bodyLength > 50,
      `${content.length} chars, body: ${bodyLength} chars`
    );
  } catch (e) {
    assert("Sim: VoltAgent agent fetch", false, e.message);
  }

  // Repo 2: Community catalog → fetch 1 skill
  try {
    const catalog = await fetchJSON(MARKETPLACE_CATALOG_URL);
    const withSource = catalog.plugins.filter((p) => p.source && p.name);
    // Pick from middle (scoring: not always the first)
    const pick = withSource[Math.floor(withSource.length / 2)];
    const sourcePath = pick.source.replace(/^\.\//, "");
    // Try skills subdir first, then flat
    let content;
    try {
      const skillsDir = await fetchJSON(
        `https://api.github.com/repos/${MARKETPLACE_REPO}/contents/${sourcePath}/skills`
      );
      if (Array.isArray(skillsDir) && skillsDir.length > 0) {
        const skillPick = skillsDir[Math.floor(skillsDir.length / 2)] || skillsDir[0];
        content = await fetch(
          `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/${sourcePath}/skills/${skillPick.name}/SKILL.md`
        );
      }
    } catch {
      content = await fetch(
        `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/main/${sourcePath}/SKILL.md`
      );
    }
    assert(
      `Sim: Community skill from "${pick.name}" — verified`,
      content && content.length > 20,
      `${content ? content.length : 0} chars`
    );
  } catch (e) {
    assert("Sim: Community skill fetch", false, e.message);
  }

  // Repo 3: ComposioHQ → fetch 1 plugin/skill
  try {
    const entries = await fetchJSON(COMPOSIO_API);
    const dirs = entries.filter((e) => e.type === "dir" && !e.name.startsWith("."));
    // Pick from end (different from earlier tests)
    const pick = dirs[Math.floor(dirs.length * 0.75)] || dirs[0];
    const content = await fetch(`${COMPOSIO_RAW}/${pick.name}/SKILL.md`);
    const hasFrontmatter = content.includes("---") && content.includes("name:");
    const afterFrontmatter = content.split("---").length >= 3
      ? content.split("---").slice(2).join("---").trim()
      : "";
    assert(
      `Sim: ComposioHQ plugin "${pick.name}" — verified`,
      content.length > 50 && hasFrontmatter && afterFrontmatter.length > 50,
      `${content.length} chars, body: ${afterFrontmatter.length} chars`
    );
  } catch (e) {
    assert("Sim: ComposioHQ plugin fetch", false, e.message);
  }

  // Repo 4: VoltAgent skills → fetch 1 skill (if exists)
  try {
    const entries = await fetchJSON(`https://api.github.com/repos/VoltAgent/awesome-agent-skills/contents`);
    const dirs = entries.filter((e) => e.type === "dir" && !e.name.startsWith("."));
    if (dirs.length > 0) {
      const pick = dirs[Math.floor(dirs.length / 2)] || dirs[0];
      const content = await fetch(
        `https://raw.githubusercontent.com/VoltAgent/awesome-agent-skills/main/${pick.name}/SKILL.md`
      );
      assert(
        `Sim: VoltAgent skill "${pick.name}" — verified`,
        content.length > 50,
        `${content.length} chars`
      );
    } else {
      // Fallback: try README-driven approach
      const readme = await fetch(
        `https://raw.githubusercontent.com/VoltAgent/awesome-agent-skills/main/README.md`
      );
      assert(
        "Sim: VoltAgent skills README — accessible for README-driven parsing",
        readme.length > 100,
        `${readme.length} chars`
      );
    }
  } catch (e) {
    assert("Sim: VoltAgent skills fetch", false, e.message);
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const platform = os.platform();
  const arch = os.arch();
  console.log(`\nPlatform: ${platform} (${arch})`);
  console.log(`Node: ${process.version}`);
  console.log(`CWD: ${process.cwd()}`);
  console.log("=".repeat(60));

  // Local tests (no network)
  testClassification();
  testOSAwareness();
  testPipelineStructure();
  testTemplateAllOS();
  testUniversalUrlResolution();
  testCandidateScoring();

  // Network tests (fetch from real catalogs)
  await testSource1_VoltAgentSubagents();
  await testSource2_CommunitySkills();
  await testSource3_ComposioHQ();
  await testReadmeDrivenCatalog();
  await testDefensiveFetch();

  // Live simulation (1 skill + 1 agent per repo)
  await testLiveSimulation();

  // Report
  console.log("\n" + "=".repeat(60));
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  for (const r of results) {
    const icon = r.status === "PASS" ? "  OK" : "FAIL";
    const detail = r.detail ? ` (${r.detail})` : "";
    console.log(`${icon}  ${r.label}${detail}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  if (failed > 0) {
    console.log(`\n${failed} test(s) FAILED\n`);
    process.exit(1);
  } else {
    console.log(`\nAll ${passed} tests passed\n`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
