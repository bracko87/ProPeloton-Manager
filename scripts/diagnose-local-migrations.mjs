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
  // Strip terminal color/control markers before detecting PostgreSQL errors.
  const normalized=raw.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
  const versions=[...raw.matchAll(/\b(20\d{12})_[a-zA-Z0-9_-]+\.sql\b/g)]
    .filter(match=>migrationFiles.has(match[0])).map(match=>match[1]);
  // Allowlisted signal only. Never expose arbitrary error text or SQL excerpts.
  const stateMatch=normalized.match(/\\bSQLSTATE[\\s:=(]*([A-Z0-9]{5})\\b/i);
  const sqlstate=stateMatch ? stateMatch[1].toUpperCase() : null;
  const errorContext=normalized.split(/\r?\n/).map(line=>line.trim()).filter(line=>/^(?:ERROR|FATAL)(?:\s|:)|^Error:/i.test(line)).slice(0,8).join('\n');
  let sqlCategory=null;
  if (/relation [^\\n]{0,120} does not exist/i.test(errorContext)) sqlCategory='MISSING_RELATION';
  else if (/function [^\\n]{0,120} does not exist/i.test(errorContext)) sqlCategory='MISSING_FUNCTION';
  else if (/type [^\\n]{0,120} does not exist/i.test(errorContext)) sqlCategory='MISSING_TYPE';
  else if (/schema [^\\n]{0,120} does not exist/i.test(errorContext)) sqlCategory='MISSING_SCHEMA';
  else if (/already exists|duplicate (key|object|table)/i.test(errorContext)) sqlCategory='DUPLICATE_OBJECT';
  else if (/syntax error/i.test(errorContext)) sqlCategory='SYNTAX_ERROR';
  else if (/permission denied/i.test(errorContext)) sqlCategory='PERMISSION_ERROR';
  else if (/violates.*constraint/i.test(errorContext)) sqlCategory='CONSTRAINT_ERROR';
  let category='UNCLASSIFIED';
  if(result.error?.code==='ETIMEDOUT') category='TIMEOUT';
  else if(/config\.toml.*(not found|missing)|failed to load config|cannot read config|supabase init/i.test(raw)) category='LOCAL_CONFIG';
  else if(/docker daemon|cannot connect to the docker|docker.*not running|permission denied.*docker/i.test(raw)) category='DOCKER_UNAVAILABLE';
  else if(/failed to (start|create|inspect).*container|health.check|unhealthy|connection refused|port is already allocated/i.test(raw)) category='CONTAINER_OR_HEALTH';
  else if(/applying migration|migration.*failed|error.*migration|sqlstate|ERROR:\s/i.test(raw)) category='MIGRATION_OR_SQL';
  else if(result.error?.code==='ENOENT') category='COMMAND_UNAVAILABLE';
  // Strictly enumerated, non-content progress markers: never echo raw CLI output.
  const phaseSignals={
    imagePull:/pulling|downloading|extracting|waiting for image/i.test(raw),
    dbStartup:/starting database|starting supabase|postgres.*starting|waiting for (health|container|database)/i.test(raw),
    migration:/applying migration|applying local migrations|migration file/i.test(raw),
    containerFailure:/container.*(?:exited|failed)|failed.*container|container .* unhealthy/i.test(raw),
    imageFailure:/failed to pull|toomanyrequests|manifest unknown|image not found/i.test(raw),
    networkFailure:/timeout|context deadline exceeded|TLS handshake timeout|dial tcp|network is unreachable/i.test(raw),
    resourceFailure:/no space left on device|out of memory|cannot allocate memory|killed by signal/i.test(raw),
    dependencyFailure:/extension .*not available|depends on|missing dependency/i.test(raw),
    flagFailure:/unknown flag|unknown shorthand flag|invalid value for.*-x/i.test(raw),
    configFailure:/config.toml|failed to read config|failed to parse config/i.test(raw),
    databaseFailure:/database.*failed|postgres.*failed|SQLSTATE|ERROR:/i.test(raw),
  };
  const allowedErrorWords=new Set([
    'error','fatal','relation','type','function','operator','schema','column','constraint',
    'cannot','does','not','exist','exists','default','for','of','must','record','extension',
    'syntax','at','or','near','invalid','permission','denied','duplicate','object','missing',
    'required','database','cast','reference','create','trigger','policy','conflict','row',
    'value','procedure','call','expected','aggregate','enum','table','sequence','dependency',
    'unknown','unrecognized','insufficient','privilege','has','no','been','was','result',
    'in','wrong','number','is','be','used','references','defined','failed','language',
    'unsupported','with','without','input','already','available','automatically','data'
  ]);
  // Output only a finite vocabulary of SQL error concepts; discard all untrusted identifiers/values.
  const safeErrorSignature=errorContext.toLowerCase().match(/[a-z]+/g)?.filter(word=>allowedErrorWords.has(word)).slice(0,28).join(' ') || 'NO_ALLOWLISTED_TERMS';
  const errorLineCount=normalized.split(/\r?\n/).map(line=>line.trim()).filter(line=>/^(?:ERROR|FATAL)(?:\s|:)|^Error:/i.test(line)).length;
  const registry=/(?:ghcr\\.io|docker\\.io|registry-1\\.docker\\.io|public\\.ecr\\.aws)/i.exec(normalized)?.[0]?.toLowerCase() || 'UNKNOWN';
  let imageReason='UNCLASSIFIED';
  if(/unauthorized|authentication required|denied:|forbidden|http 403/i.test(normalized)) imageReason='AUTHORIZATION';
  else if(/rate limit|too many requests|http 429|toomanyrequests/i.test(normalized)) imageReason='RATE_LIMIT';
  else if(/manifest unknown|manifest not found|not found|http 404/i.test(normalized)) imageReason='IMAGE_NOT_FOUND';
  else if(/x509|certificate|TLS handshake/i.test(normalized)) imageReason='TLS_OR_CERTIFICATE';
  else if(/no such host|dial tcp|dns lookup|timeout|context deadline|network is unreachable|connection reset|EOF/i.test(normalized)) imageReason='NETWORK_OR_DNS';
  else if(/no space left|out of memory|cannot allocate/i.test(normalized)) imageReason='RESOURCE';
  const exitCode=Number.isInteger(result.status)&&result.status>=0&&result.status<=255?result.status:null;
  const processError=['ETIMEDOUT','ENOENT','ENOBUFS','EACCES'].includes(result.error?.code)?result.error.code:null;
  return {ok:result.status===0&&!result.error,category,sqlstate,sqlCategory,exitCode,processError,lastMentionedVersion:versions.at(-1)||null,phaseSignals,registry,imageReason,errorLineCount,safeErrorSignature,stdoutBytes:Buffer.byteLength(result.stdout||''),stderrBytes:Buffer.byteLength(result.stderr||'')};
}
function status(step,result){
  lines.push(step+': '+(result.ok?'PASSED':'FAILED')+(result.ok?'':' ('+result.category+')')+'.');
  if(!result.ok && result.exitCode!==null) lines.push('Exit status: '+result.exitCode+'.');
  if(!result.ok && result.processError) lines.push('Process error category: '+result.processError+'.');
  if(!result.ok) {
    lines.push('Sanitized CLI signal flags: '+Object.entries(result.phaseSignals).filter(([key,v])=>v).map(([key])=>key).join(', ')+'.');
    if(result.phaseSignals.imageFailure) lines.push('Image registry: '+result.registry+'; image error category: '+result.imageReason+'.');
    lines.push('CLI output sizes: stdout='+result.stdoutBytes+' bytes, stderr='+result.stderrBytes+' bytes; error lines='+result.errorLineCount+'.');
  }
  if(!result.ok && result.errorLineCount) lines.push('Allowlisted error concepts: '+result.safeErrorSignature+'.');
  if(!result.ok && result.sqlCategory) lines.push('SQL error class: '+result.sqlCategory+'.');
  if(!result.ok && result.sqlstate) lines.push('SQLSTATE: '+result.sqlstate+'.');
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
    // Database-only startup applies checked-in migrations in a fresh local Postgres container.
    // Deliberately avoid the full Supabase stack and its unrelated image pulls.
    let start=run('supabase',['db','start'],12*60*1000);
    // Exactly one retry for pre-migration image/network download errors.
    // Never retry when any checked-in migration was mentioned or SQL error detected.
    const preMigrationDownloadFailure=!start.ok &&
      !start.phaseSignals.migration && !start.lastMentionedVersion &&
      !start.sqlCategory && !start.sqlstate &&
      (start.phaseSignals.imageFailure || start.phaseSignals.networkFailure);
    if(preMigrationDownloadFailure) {
      lines.push('Pre-migration image/network failure; one isolated retry authorized.');
      start=run('supabase',['db','start'],12*60*1000);
      lines.push('Pre-migration retry attempted (no production connection).');
    }
    status('LOCAL Postgres startup and repository migration replay',start);
    if(!start.ok) failed=true;
    else lines.push('Fresh LOCAL migration application completed; race workload/parity checks still required.');
  }
} finally {
  // Cleanup is best-effort even after failed initialization; runner is disposable.
  run('supabase',['stop','--no-backup'],2*60*1000);
  lines.push('No production writes. Passing startup alone does not prove schema or race-engine parity.');
  writeFileSync(report,lines.join('\n')+'\n');
  console.log(lines.join('\n'));
}
if(failed) process.exitCode=1;
