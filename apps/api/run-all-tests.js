// Run all node:test files sequentially, parse TAP summary lines, aggregate.
const { spawnSync } = require('child_process');
const { readdirSync, statSync } = require('fs');
const { join } = require('path');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const files = walk(join(process.cwd(), 'src')).sort();
let totals = { tests: 0, pass: 0, fail: 0 };
for (const f of files) {
  const r = spawnSync(`npx ts-node "${f}"`, { shell: true, encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const get = (label) => {
    const m = out.match(new RegExp(`(?:^|\\n)[^\\n]*${label}\\s+(\\d+)`));
    return m ? parseInt(m[1], 10) : 0;
  };
  const t = get('tests');
  const p = get('pass');
  const fl = get('fail');
  totals.tests += t; totals.pass += p; totals.fail += fl;
  console.log(`[${f}] tests=${t} pass=${p} fail=${fl}`);
}
console.log(`\nTOTAL: tests=${totals.tests} pass=${totals.pass} fail=${totals.fail}`);
