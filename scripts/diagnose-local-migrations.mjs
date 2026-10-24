#!/usr/bin/env node
// Public CI must NEVER print migration SQL, secrets, database URLs, or stderr/stdout.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const report='migration-replay-status.md';
const lines=['## Isolated Supabase migration diagnostic',
  'Target: disposable local containers on the GitHub-hosted runner; no hosted project or production connection.',
  'No raw CLI output is printed or uploaded. Failures must be inspected in a restricted environment if SQL context is required.'];
const safeRun=(args,timeout)=>{
  const r=spawnSync('supabase',args,{
    env:{...process.env,SUPABASE_ACCESS_TOKEN:'',SUPABASE_DB_PASSWORD:'',SUPABASE_PROJECT_ID:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:''},
    encoding:'utf8',timeout,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']
  });
  return {ok:r.status===0&&!r.error,code:r.status===0?0:1,timedOut:r.error?.code==='ETIMEDOUT'};
};
let started=false,failed=false;
try{
  const start=safeRun(['start'],20*60*1000);
  if(!start.ok){
    failed=true;
    lines.push('Local stack startup / initial migration application: FAILED'+(start.timedOut?' (timeout)':'')+'.');
    lines.push('First failing migration identifier unavailable in sanitized mode; inspect in a secured private environment.');
  }else{
    started=true;
    lines.push('Local stack startup: PASSED.');
    const reset=safeRun(['db','reset','--local','--yes'],20*60*1000);
    if(!reset.ok){
      failed=true;
      lines.push('Fresh local schema replay: FAILED'+(reset.timedOut?' (timeout)':'')+'.');
    } else lines.push('Fresh local schema replay: PASSED (structural and race-workload validation still required).');
  }
}finally{
  if(started) safeRun(['stop','--no-backup'],2*60*1000);
  writeFileSync(report,lines.join('\n')+'\n');
  console.log(lines.join('\n'));
}
if(failed) process.exitCode=1;
