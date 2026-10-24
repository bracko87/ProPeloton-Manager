import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const sample={components:13896,fingerprint:'51f5fe5e019d596ca44880127deef490'};
function run(a,b){ const dir=mkdtempSync(join(tmpdir(),'ppm-structural-'));try{const x=join(dir,'a.json'),y=join(dir,'b.json');writeFileSync(x,JSON.stringify(a));writeFileSync(y,JSON.stringify(b));return spawnSync(process.execPath,['scripts/verify-schema-fingerprint.mjs',x,y],{encoding:'utf8'});}finally{rmSync(dir,{recursive:true,force:true})}}
test('equal manifest passes but warns of limits',()=>{let r=run(sample,sample);assert.equal(r.status,0);assert.match(r.stdout,/NOT proof/)});
test('different fingerprint fails',()=>assert.equal(run(sample,{...sample,fingerprint:'a'.repeat(32)}).status,1));
test('different component count fails',()=>assert.equal(run(sample,{...sample,components:1}).status,1));
test('unexpected fields rejected',()=>assert.notEqual(run(sample,{...sample,sql:'SECRET'}).status,0));
