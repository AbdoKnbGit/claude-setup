import { queryCatalog, expandWithSynonyms } from "../dist/marketplace-catalog.js"

console.log("=== SYNONYM EXPANSION TEST ===")
console.log("'apple phone test' expands to:")
const exp = expandWithSynonyms(["apple", "phone", "test"])
console.log("  ", exp.join(", "))
console.log()

const tests = [
    { query: "apple phone skill to test", expect: "ios-simulator" },
    { query: "ios simulator", expect: "ios-simulator" },
    { query: "download youtube video", expect: "video-downloader" },
    { query: "family tree ancestors", expect: "family-history" },
    { query: "hack website vulnerabilities", expect: "ffuf-fuzzing" },
    { query: "make a d3 chart", expect: "d3-visualization" },
    { query: "convert markdown to ebook", expect: "md-to-epub" },
    { query: "forensic disk investigation", expect: "computer-forensics" },
    { query: "create podcast from notes", expect: "notebooklm" },
    { query: "automate n8n workflows", expect: "n8n-skills" },
]

let pass = 0
let fail = 0
for (const t of tests) {
    const r = queryCatalog(t.query)
    const top5 = r.matches.slice(0, 5)
    const found = top5.some(m => m.item.id.includes(t.expect))
    const topName = top5[0]?.item.name ?? "NONE"
    const topScore = top5[0]?.score ?? 0
    const topId = top5[0]?.item.id ?? "NONE"

    if (found) {
        pass++
        console.log(`✅ "${t.query}" → found "${t.expect}" in top 5 (top: ${topName} score=${topScore})`)
    } else {
        fail++
        console.log(`❌ "${t.query}" → expected "${t.expect}" in top 5`)
        console.log(`   Got: ${top5.map(m => `${m.item.id}(${m.score})`).join(", ")}`)
    }
}
console.log()
console.log(`Results: ${pass}/${pass + fail} passed`)
