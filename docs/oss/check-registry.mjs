import {readFileSync} from 'node:fs';
const p='docs/oss/ELARIS-OSS-REGISTRY.md';
const src=readFileSync(p,'utf8');
let fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };

// --- extract registry-tsv blocks ---
const blocks=[...src.matchAll(/```registry-tsv\n([\s\S]*?)```/g)].map(m=>m[1].trim());
ok(blocks.length>=2, `expected >=2 registry-tsv blocks, got ${blocks.length}`);
const allRows=[];
for(const b of blocks) for(const l of b.split('\n')) if(l.trim()) allRows.push(l.trim());
console.log('registry-tsv blocks:', blocks.length, 'total rows:', allRows.length);

const FIELDS=10;
const CLASS=new Set(['GREEN','YELLOW','RED','UNKNOWN']);
const UM=new Set(['CODE_EXTRACTION','DIRECT_REUSE','ADAPTER','SIDECAR','REFERENCE_ONLY','REJECT']);
const YN=new Set(['YES','NO','UNKNOWN']);
const RISK=new Set(['LOW','MEDIUM','HIGH','UNKNOWN']);
const ids=new Set(), projects=new Map();

for(const [i,row] of allRows.entries()){
  const f=row.split('|');
  if(f.length!==FIELDS){ fail.push(`row ${i+1} field count ${f.length} != ${FIELDS}: ${row}`); continue;}
  const [id,project,license,commercialUse,closedSource,dpr,spr,cls,um,date]=f;
  if(!/^(G|Y|R|U)-\d{2}$/.test(id) && !/^T-03-\d{2}$/.test(id)) fail.push(`row ${i+1} bad id: ${id}`);
  if(ids.has(id)) fail.push(`duplicate id: ${id}`); ids.add(id);
  if(!CLASS.has(cls)) fail.push(`row ${i+1} bad classification: ${cls}`);
  if(!UM.has(um)) fail.push(`row ${i+1} bad usageMode: ${um}`);
  if(!YN.has(commercialUse)) fail.push(`row ${i+1} bad commercialUse: ${commercialUse}`);
  if(!YN.has(closedSource)) fail.push(`row ${i+1} bad closedSourceAllowed: ${closedSource}`);
  if(!RISK.has(dpr)) fail.push(`row ${i+1} bad dependencyRisk: ${dpr}`);
  if(!RISK.has(spr)) fail.push(`row ${i+1} bad platformRisk: ${spr}`);
  if(!/^2026-09-27$/.test(date)) fail.push(`row ${i+1} bad sourceAuditDate: ${date}`);
  projects.set(project, (projects.get(project)||0)+1);
}

// --- semantic assertions required by task ---
const get=id=>{const r=allRows.find(x=>x.startsWith(id+'|')); return r? r.split('|'):null;};

// pg-boss canonical
const pg=get('G-03');
ok(pg, 'G-03 pg-boss missing');
if(pg){
  ok(pg[2]==='MIT','pg-boss license != MIT: '+pg[2]);
  ok(pg[7]==='GREEN','pg-boss classification != GREEN: '+pg[7]);
  ok(pg[8]==='DIRECT_REUSE','pg-boss usageMode != DIRECT_REUSE: '+pg[8]);
  ok(pg[4]==='YES','pg-boss closedSourceAllowed != YES: '+pg[4]);
}
// email-verifier: no GREEN anywhere, must be UNKNOWN/REFERENCE_ONLY
const ev=get('U-05');
ok(ev,'U-05 email-verifier missing');
if(ev){
  ok(ev[1]==='email-verifier','U-05 project mismatch: '+ev[1]);
  ok(ev[2]==='UNKNOWN','email-verifier license != UNKNOWN: '+ev[2]);
  ok(ev[7]==='UNKNOWN','email-verifier classification != UNKNOWN: '+ev[7]);
  ok(ev[8]==='REFERENCE_ONLY','email-verifier usageMode != REFERENCE_ONLY: '+ev[8]);
}
ok(!allRows.some(r=>/^G-02\|/.test(r)),'G-02 still present in registry-tsv (email-verifier must not be GREEN)');
ok(!allRows.some(r=>r.includes('email-verifier')&&r.includes('GREEN')),'email-verifier marked GREEN somewhere in tsv');
ok(src.includes('NOT_APPROVED'),'NOT_APPROVED missing from Registry doc');

// type-fest MIT branch
const tf=get('T-03-14');
ok(tf,'T-03-14 type-fest missing');
if(tf) ok(tf[2]==='MIT','type-fest license must be selected MIT: '+tf[2]);
ok(/MIT license branch/i.test(src)||/MIT license branch/.test(src),'type-fest MIT branch selection not documented');
ok(/明确选择 MIT license branch/.test(src)||/选定 `MIT` 分支/.test(src),'type-fest conditions MIT branch missing');

// licenseEvidence general field
ok(/`licenseEvidence`/.test(src),'licenseEvidence field missing');
ok(/### 1\.3 `licenseEvidence` 语义（通用字段）/.test(src),'licenseEvidence §1.3 missing');

// pg-boss closure rows T-03-01..T-03-25
for(let i=1;i<=25;i++){
  const id='T-03-'+String(i).padStart(2,'0');
  if(!allRows.some(r=>r.startsWith(id+'|'))) fail.push('missing '+id);
}

// counts
const mainRows=allRows.filter(r=>/^(G|Y|R|U)-\d{2}\|/.test(r));
console.log('main registry rows (G/Y/R/U):', mainRows.length);
ok(mainRows.length===24, 'main §3 registry-tsv must be 24 rows, got '+mainRows.length);
const t03=allRows.filter(r=>/^T-03-/.test(r)).length;
const pgClosure=allRows.filter(r=>/^T-03-/.test(r)||/^G-03\|/.test(r)).length;
ok(t03===25, 'T-03 rows must be 25, got '+t03);
ok(pgClosure===26, 'pg-boss closure (G-03 + T-03-xx) must be 26, got '+pgClosure);
console.log('pg-boss closure rows:', allRows.filter(r=>/^T-03-/.test(r)).length);
console.log('total tsv rows:', allRows.length);

if(fail.length){ console.log('\nRESULT: FAIL'); for(const f of fail) console.log(' - '+f); process.exit(1);}
console.log('\nRESULT: PASS');
