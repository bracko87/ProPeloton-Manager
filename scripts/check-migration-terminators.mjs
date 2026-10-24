#!/usr/bin/env node
// Read-only migration syntax preflight; prints file names and counts, never SQL.
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
const root='supabase/migrations';
const files=readdirSync(root).filter(x=>/^\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(x)).sort();
let issues=0;
for(const file of files) {
  const sql=readFileSync(join(root,file),'utf8');
  let defects=0;
  for(const tag of ['$function$','$procedure$','$fn$']) {
    const indexes=[];
    let at=0;
    while ((at=sql.indexOf(tag,at))>=0) {
      indexes.push(at);
      at+=tag.length;
    }
    // The matching opening and closing tags for these outer definitions
    // alternate. Every closing tag must terminate the CREATE statement.
    if(indexes.length%2!==0) {
      console.log(file+': unpaired outer '+tag+' delimiter');
      defects++;
      continue;
    }
    for(let i=1;i<indexes.length;i+=2) {
      const end=indexes[i]+tag.length;
      if(!/^\s*;/.test(sql.slice(end,end+50))) defects++;
    }
  }
  if(defects) {
    issues+=defects;
    console.log(file+': '+defects+' unterminated function definition(s)');
  }
}
console.log('Migration preflight: '+files.length+' files checked; '+issues+' unterminated or unmatched outer function delimiters.');
if(issues) process.exitCode=1;
