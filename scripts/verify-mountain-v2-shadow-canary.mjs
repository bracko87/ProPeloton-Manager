import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const path='supabase/functions/mountain-v2-shadow-canary/index.ts'
const src=readFileSync(path,'utf8')
const pinned='cdc27d8b89004eeddef369a0ef083cd96a427694'
for(const exported of ['mountainV2SyntheticStage.ts','mountainProfileAuditV2.ts','mountainV2StageRegistry.ts']){
  assert.ok(src.includes(`/${pinned}/src/universal-race-engine/${exported}`),
    'shadow engine imports must have exact immutable GitHub commit')
}
assert.match(src,/runMountainV2SyntheticStage\(entries/)
assert.match(src,/selectMountainV2Stage\(/)
assert.match(src,/selected\.mode!=="sandbox_shadow_only"/)
assert.match(src,/verify_universal_race_worker_secret_v1/)
assert.match(src,/p_secret:secret/)
assert.match(src,/if\(!secret\)return respond\(\{error:"worker_authorization_required"\}/)
assert.ok(src.indexOf('verify_universal_race_worker_secret_v1')<src.indexOf('const stageQuery'),
  'all production data access must follow worker-secret validation')
for(const forbidden of [/\.insert\s*\(/,/\.upsert\s*\(/,/\.update\s*\(/,/\.delete\s*\(/,
  /\.storage\./,/\.functions\.invoke\(/,/fetch\s*\(/,/Deno\.env\.set\(/,
  /\.rpc\s*\(\s*["'](?!verify_universal_race_worker_secret_v1)/]){
  assert.doesNotMatch(src,forbidden,'No writes, nested remote calls or unknown RPCs allowed in stage shadow')
}
assert.match(src,/race_stage_results/)
assert.match(src,/already_completed_stage/)
assert.match(src,/authority:"synthetic_only"/)
assert.match(src,/published_to_game:false/)
assert.match(src,/method!=="POST"/)
assert.match(src,/official_engine_unchanged:true/)
for(const worker of ['universal-race-stage-runner','universal-race-stage-pass1-resume',
  'universal-race-stage-pass2-resume','universal-race-stage-safe-resume']){
  const code=readFileSync(`supabase/functions/${worker}/index.ts`,'utf8')
  assert.doesNotMatch(code,/mountain-v2-shadow-canary/,
    'isolated shadow must not create an incidental runtime dependency in official worker')
}
console.log('PASS isolated V2 canary: immutable source, exact allowlist, worker-secret gate, no race DB mutation, all four production workers untouched')
