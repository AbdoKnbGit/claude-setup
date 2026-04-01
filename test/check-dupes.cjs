const fs = require('fs');
const src = fs.readFileSync('src/marketplace-catalog.ts', 'utf8');
const re = /(?:jl|cx|va|ant|cxExt)\("([^"]+)"/g;
const ids = [];
const dupes = [];
let m;
while ((m = re.exec(src)) !== null) {
    if (ids.includes(m[1])) dupes.push(m[1]);
    ids.push(m[1]);
}
console.log('Total catalog entries:', ids.length);
console.log('JL entries:', ids.filter((_, i) => src.split('\n').some(l => l.includes('jl("' + ids[i]))).length);
console.log('Duplicates:', dupes.length ? dupes.join(', ') : 'NONE ✅');

// Count by source
const lines = src.split('\n');
let jlCount = 0, cxCount = 0, vaCount = 0, antCount = 0, cxExtCount = 0;
for (const l of lines) {
    if (/^\s+jl\(/.test(l)) jlCount++;
    if (/^\s+cx\(/.test(l)) cxCount++;
    if (/^\s+va\(/.test(l)) vaCount++;
    if (/^\s+ant\(/.test(l)) antCount++;
    if (/^\s+cxExt\(/.test(l)) cxExtCount++;
}
console.log('\nBreakdown:');
console.log('  va() STK original:', vaCount);
console.log('  cx() ComposioHQ:', cxCount);
console.log('  cxExt() CX external:', cxExtCount);
console.log('  jl() jeremylongshore:', jlCount);
console.log('  ant() Anthropic:', antCount);
console.log('  TOTAL:', vaCount + cxCount + cxExtCount + jlCount + antCount);
