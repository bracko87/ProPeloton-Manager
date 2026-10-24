#!/usr/bin/env node
// PUBLIC CI: never print command stdout/stderr, raw migration SQL or credentials.
// All subcommands operate exclusively on an unlinked, disposable local stack.
import {spawnSync} from 'node:child_process';
import {existsSync, readdirSync, writeFileSync} from 'node:fs';

const report='migration-replay-status.md';
const migrationFiles=new Set(readdirSync('supabase/migrations').filter(name=>/^\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(name)));
const lines=['## Isolated Supabase migration diagnostic',
  'Target: ephemeral GitHub-runner Docker containers (no hosted database).',
  'Only preapproved diagnostic categories and checked-in migration version IDs are printed.'];
const environment={...process.env};
for(const key of Object.keys(environment)) {
  if (/^(SUPABASE_|PGPASSWORD$|PGHOST$|PGUSER$|DATABASE_URL$|POSTGRES_)/.test(key)) delete environment[key];
}
function run(binary,args,timeout=120000) {
  const result=spawnSync(binary,args,{env:environment,encoding:'utf8',timeout,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
  const raw=(result.stdout||'')+'\n'+(result.stderr||'');
  const versions=[...raw.matchAll(/\b(20\d{12})_[a-zA-Z0-9_-]+\.sql\b/g)]
    .filter(match=>migrationFiles.has(match[0])).map(match=>match[1]);
  let category='UNCLASSIFIED';
  if(result.error?.code==='ETIMEDOUT') category='TIMEOUT';
  else if(/config\.toml.*(not found|missing)|failed to load config|cannot read config|supabase init/i.test(raw)) category='LOCAL_CONFIG';
  else if(/docker daemon|cannot connect to the docker|docker.*not running|permission denied.*docker/i.test(raw)) category='DOCKER_UNAVAILABLE';
  else if(/failed to (start|create|inspect).*container|health.check|unhealthy|connection refused|port is already allocated/i.test(raw)) category='CONTAINER_OR_HEALTH';
  else if(/applying migration|migration.*failed|error.*migration|sqlstate|ERROR:\s/i.test(raw)) category='MIGRATION_OR_SQL';
  else if(result.error?.code==='ENOENT') category='COMMAND_UNAVAILABLE';
  return {ok:result.status===0&&!result.error,category,lastMentionedVersion:versions.at(-1)||null};
}
function status(step,result){
  lines.push(step+': '+(result.ok?'PASSED':'FAILED')+(result.ok?'':' ('+result.category+')')+'.');
  if(!result.ok && result.lastMentionedVersion) {
    lines.push('Last migration filename mentioned: version '+result.lastMentionedVersion+' (not necessarily the failing statement).');
  }
}
let failed=false;
try {
  if(!existsSync('supabase/config.toml')) {
    const init=run('supabase',['init','--yes']);
    status('Initialize missing local-only config',init);
    if(!init.ok) {failed=true;} 
  } else lines.push('Local config: already present.');
  if(!failed) {
    const docker=run('docker',['info','--format','{{.ServerVersion}}']);
    status('Docker daemon',docker);
    if(!docker.ok) failed=true;
  }
  if(!failed) {
    const start=run('supabase',['start'],20*60*1000);
    status('Local stack startup and initial migrations',start);
    if(!start.ok) failed=true;
    else {
      const reset=run('supabase',['db','reset','--local','--no-seed','--yes'],20*60*1000);
      status('Fresh LOCAL schema replay',reset);
      if(!reset.ok) failed=true;
    }
  }
} finally {
  // Cleanup is best-effort even after failed initialization; runner is disposable.
  run('supabase',['stop','--no-backup'],2*60*1000);
  lines.push('No production writes. Passing startup alone does not prove schema or race-engine parity.');
  writeFileSync(report,lines.join('\n')+'\n');
  console.log(lines.join('\n'));
}
if(failed) process.exitCode=1;
