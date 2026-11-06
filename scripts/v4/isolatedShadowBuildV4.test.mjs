import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,statSync,mkdtempSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {patchV4CalibratedPhysicalSource} from './calibratedPhysicalTransformV4.mjs'
import {patchV4PhysicalBridgeContactReplaySource} from './phase2BridgeContactResearchPatchV4.mjs'
import {classifyV4SafeExecutionFailure,classifyV4PhysicsFailure,
 classifyV4ReplaySynchronizationFailure,V4_SAFE_REPLAY_ISSUE_STATUSES,
 V4_SAFE_PHYSICS_FAILURE_STATUSES} from './isolatedShadowExecutionFailureV4.mjs'
import {isValidV4PhysicalPatch} from './runIsolatedShadowV4.mjs'

const root=resolve(import.meta.dirname,'../..')
const engine=resolve(root,'src/universal-race-engine/runRaceEngine.ts')
const worker=resolve(root,'src/race-engine-v4/isolatedShadowWorkerV4.ts')
test('private worker exceptions are reported only as fixed categorical stages',()=>{
 assert.equal(classifyV4SafeExecutionFailure('INPUT'),'SHADOW_EXECUTION_REJECTED')
 assert.equal(classifyV4SafeExecutionFailure('PREPARATION'),'SHADOW_AI_PREPARATION_REJECTED')
 assert.equal(classifyV4SafeExecutionFailure('PHYSICS'),'SHADOW_PHYSICS_EXECUTION_REJECTED')
 assert.equal(classifyV4SafeExecutionFailure('REPLAY_GATE'),'SHADOW_REPLAY_GATE_REJECTED')
 assert.equal(classifyV4SafeExecutionFailure('private-rider-name'),'SHADOW_EXECUTION_REJECTED')
 assert.equal(classifyV4SafeExecutionFailure(null),'SHADOW_EXECUTION_REJECTED')
})

test('physics rejection classification is fixed and never exposes raw messages or fields',()=>{
 const error={name:'UniversalRaceEngineValidationError',errors:[
  {field:'stagePlans[0].riders[23].commands.phase3',message:'private-rider-name'}
 ]}
 assert.equal(classifyV4PhysicsFailure(error),'SHADOW_PHYSICS_INPUT_STAGE_PLANS_REJECTED')
 assert.equal(classifyV4PhysicsFailure({name:'UniversalRaceEngineValidationError',errors:[
  {field:'riders[0].availabilityStatus'},{field:'stagePlans[5].teamTactic'}
 ]}),'SHADOW_PHYSICS_INPUT_MIXED_REJECTED')
 assert.equal(classifyV4PhysicsFailure(new Error('Phase 5 grouping must preserve the authoritative Phase 4 winner.')),
  'SHADOW_PHYSICS_PHASE5_REJECTED')
 assert.equal(classifyV4PhysicsFailure(new Error('Universal replay synchronization failed: private-rider-1')),
  'SHADOW_PHYSICS_REPLAY_SYNC_REJECTED')
 assert.equal(classifyV4PhysicsFailure(new Error('something unpredictable private-secret')),
  'SHADOW_PHYSICS_OTHER_REJECTED')
 for(const code of V4_SAFE_PHYSICS_FAILURE_STATUSES)
  assert.doesNotMatch(code,/private|rider-name|\\b[0-9a-f]{8}-[0-9a-f]{4}/i)
})
test('replay rejection exposes only an engine-owned issue prefix',()=>{
 const message='Universal replay synchronization failed: '+
  'bridge_progress_invalid:checkpoint-123:rider-private-secret:reason=gap, '+
  'same_kilometre_physical_state_mismatch:checkpoint-123'
 assert.equal(classifyV4ReplaySynchronizationFailure(message),
  'SHADOW_PHYSICS_REPLAY_BRIDGE_PROGRESS_INVALID_REJECTED')
 assert.equal(classifyV4PhysicsFailure(new Error(message)),
  'SHADOW_PHYSICS_REPLAY_BRIDGE_PROGRESS_INVALID_REJECTED')
 assert.equal(classifyV4PhysicsFailure(new Error(
  'Universal replay synchronization failed: post_catch_group_transfer_without_physical_transition:rider-secret:K->P')),
  'SHADOW_PHYSICS_REPLAY_POST_CATCH_GROUP_TRANSFER_WITHOUT_PHYSICAL_TRANSITION_REJECTED')
 assert.equal(classifyV4PhysicsFailure(new Error(
  'Universal replay synchronization failed: unknown-private-rider-issue')),
  'SHADOW_PHYSICS_REPLAY_SYNC_REJECTED')
 assert(V4_SAFE_REPLAY_ISSUE_STATUSES.length>50)
 for(const code of V4_SAFE_REPLAY_ISSUE_STATUSES){
  assert(V4_SAFE_PHYSICS_FAILURE_STATUSES.includes(code))
  assert.doesNotMatch(code,/checkpoint-123|rider-private-secret|rider-secret/)
 }
})
test('isolated V4 physical worker compiles and rejects unverified inputs without data leakage',
 async()=>{
 const original=readFileSync(engine,'utf8')
 const patch=patchV4CalibratedPhysicalSource(original,{
  peloton:true,cooperation:true,energy:true
 })
 assert.notEqual(patch,original)
 assert.match(patch,/calculateV4Phase3PaceEnergySurcharge/)
 // Isolated-only physical bridge replay must emit a verified, ordered
 // contact checkpoint before the existing Phase-2 merge.
 assert.match(patch,/phase-2-secondary-front-contact/)
 assert.match(patch,/v4Phase2BridgeContactVerified/)
 assert.match(patch,/sortOrder: 364/)
 assert.match(patch,/checkpointIdSuffix: 'phase-2-secondary-front-merge'/)
 assert.match(patch,/authoritativeBridgeGroups\.forEach\(\(bridgeGroup, bridgeIndex\)/)
 assert.doesNotMatch(patch,/phase4\.bridgeGroups\.forEach\(\(bridgeGroup, bridgeIndex\)/)
 // Fail closed on source drift; never silently omit the physical witness.
 assert.throws(()=>patchV4PhysicalBridgeContactReplaySource('unrelated source'))

 assert.equal(readFileSync(engine,'utf8'),original)
 // A Windows git checkout can be CRLF. The V4 transform converts it to
 // LF, so physical patch validation must compare like-for-like lengths.
 const winSource=original.replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n')
 const winPatch=patchV4CalibratedPhysicalSource(winSource,{
  peloton:true,cooperation:true,energy:true
 })
 assert.equal(winPatch,patch,'CRLF and LF sources produce identical V4 physics')
 assert.equal(isValidV4PhysicalPatch(original,patch),true)
 assert.equal(isValidV4PhysicalPatch(winSource,winPatch),true,
  'CRLF checkout must not reject a valid physical patch')
 assert.equal(isValidV4PhysicalPatch(winSource,original),false,
  'unpatched source must still fail closed')

 const folder=mkdtempSync(join(tmpdir(),'ppm-v4-shadow-build-test-'))
 try{
  const output=join(folder,'shadow.mjs')
  let loads=0
  await build({entryPoints:[worker],outfile:output,bundle:true,
   platform:'node',format:'esm',target:'node20',logLevel:'silent',
   plugins:[{name:'v4-source-injection-check',setup(api){
    api.onLoad({filter:/[\\/]src[\\/]universal-race-engine[\\/]runRaceEngine\.ts$/},
     args=>{
      assert.equal(resolve(args.path),engine)
      loads++
      return {contents:patch,loader:'ts',resolveDir:resolve(root,'src/universal-race-engine')}
     })
   }}]})
  assert.equal(loads,1,'V4 source must be patched exactly once')
  assert(statSync(output).size>1000)
  // Deliberately malformed input must fail, not fall back to production solver.
  const child=spawnSync(process.execPath,[output],{
   encoding:'utf8',input:JSON.stringify({
    input:{stage:{stageId:'private-stage-123'}},options:{}
   }),cwd:root,timeout:30000,
   env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',
    TMPDIR:process.env.TMPDIR??'',TEMP:process.env.TEMP??'',
    TMP:process.env.TMP??'',SYSTEMROOT:process.env.SYSTEMROOT??''}
  })
  assert.equal(child.status,1)
  assert.equal(child.stderr,'')
  const lines=child.stdout.trim().split(/\r?\n/)
  assert.equal(lines.length,1)
  assert(lines[0].startsWith('V4_ISOLATED_SHADOW_REPORT '))
  const report=JSON.parse(lines[0].slice('V4_ISOLATED_SHADOW_REPORT '.length))
  assert.equal(report.status,'SHADOW_EXECUTION_REJECTED')
  assert.equal(report.officialWrites,0)
  assert.equal(report.productionEnabled,false)
  assert.equal(report.researchOnly,true)
  assert.doesNotMatch(JSON.stringify(report),/private-stage-123/)
  // Execute the ACTUAL calibrated physical solver on a complete public
  // synthetic locked stage, with one human team and one AI team. No database.
  const fixtureBundle=join(folder,'synthetic-envelope.mjs')
  await build({
   entryPoints:[resolve(root,'scripts/v4/syntheticLockedRaceV4.ts')],
   outfile:fixtureBundle,bundle:true,platform:'node',format:'esm',
   target:'node20',logLevel:'silent'
  })
  const fixture=spawnSync(process.execPath,[fixtureBundle],{
   cwd:root,encoding:'utf8',timeout:30000,
   env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',
    TMPDIR:process.env.TMPDIR??'',TEMP:process.env.TEMP??'',
    TMP:process.env.TMP??'',SYSTEMROOT:process.env.SYSTEMROOT??''}
  })
  assert.equal(fixture.status,0,'synthetic public fixture runtime failed: '+
   String(fixture.stderr??'').slice(0,1200))
  const envelope=JSON.parse(fixture.stdout)
  assert.equal(envelope.input.stage.stageId,'stage-1')
  assert.equal(envelope.options.teamControl.filter(x=>x.kind==='ai').length,1)
  // The real captured race previously returned only SHADOW_EXECUTION_REJECTED.
  // A deliberately mismatched synthetic lock must now report the exact
  // static rejection phase, without exposing any private identifiers.
  const badPlanEnvelope=structuredClone(envelope)
  badPlanEnvelope.options.lock.stageId='private-stage-do-not-leak'
  const badPlan=spawnSync(process.execPath,[output],{
   cwd:root,encoding:'utf8',timeout:30000,
   input:JSON.stringify(badPlanEnvelope),maxBuffer:512*1024,
   env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',
    TMPDIR:process.env.TMPDIR??'',TEMP:process.env.TEMP??'',
    TMP:process.env.TMP??'',SYSTEMROOT:process.env.SYSTEMROOT??''}
  })
  assert.equal(badPlan.status,1)
  assert.equal(badPlan.stderr,'')
  assert.doesNotMatch(badPlan.stdout,/private-stage-do-not-leak/)
  const badPlanReport=JSON.parse(badPlan.stdout.trim().slice('V4_ISOLATED_SHADOW_REPORT '.length))
  assert.equal(badPlanReport.status,'SHADOW_AI_PREPARATION_REJECTED')
  assert.equal(badPlanReport.officialWrites,0)
  assert.equal(badPlanReport.productionEnabled,false)
  // Synthetic input reaches AI planning but is deliberately rejected by
  // engine input validation. Report only the fixed input-category code.
  const invalidPhysicsEnvelope=structuredClone(envelope)
  invalidPhysicsEnvelope.input.engine.engineKey='PRIVATE-SECRET-NEVER-PRINT'
  const invalidPhysics=spawnSync(process.execPath,[output],{
   cwd:root,encoding:'utf8',timeout:30000,
   input:JSON.stringify(invalidPhysicsEnvelope),maxBuffer:512*1024,
   env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',
    TMPDIR:process.env.TMPDIR??'',TEMP:process.env.TEMP??'',
    TMP:process.env.TMP??'',SYSTEMROOT:process.env.SYSTEMROOT??''}
  })
  assert.equal(invalidPhysics.status,1)
  assert.equal(invalidPhysics.stderr,'')
  assert.doesNotMatch(invalidPhysics.stdout,/PRIVATE-SECRET-NEVER-PRINT/)
  const rejectedPhysicsReport=JSON.parse(
   invalidPhysics.stdout.trim().slice('V4_ISOLATED_SHADOW_REPORT '.length))
  assert.equal(rejectedPhysicsReport.status,'SHADOW_PHYSICS_INPUT_ENGINE_REJECTED')
  assert.equal(rejectedPhysicsReport.officialWrites,0)
  assert.equal(rejectedPhysicsReport.productionEnabled,false)
  const live=spawnSync(process.execPath,[output],{
   cwd:root,encoding:'utf8',timeout:180000,
   input:fixture.stdout,maxBuffer:512*1024,
   env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',
    TMPDIR:process.env.TMPDIR??'',TEMP:process.env.TEMP??'',
    TMP:process.env.TMP??'',SYSTEMROOT:process.env.SYSTEMROOT??''}
  })
  assert([0,1].includes(live.status))
  assert.equal(live.stderr,'')
  const liveLines=live.stdout.trim().split(/\r?\n/)
  assert.equal(liveLines.length,1)
  assert(liveLines[0].startsWith('V4_ISOLATED_SHADOW_REPORT '))
  const syntheticReport=JSON.parse(
   liveLines[0].slice('V4_ISOLATED_SHADOW_REPORT '.length))
  assert(['SHADOW_STRICT_REPLAY_PASS','SHADOW_STRICT_REPLAY_BLOCKED']
   .includes(syntheticReport.status),
   'synthetic stage must reach actual calibrated physics and strict gate')
  assert.equal(syntheticReport.officialWrites,0)
  assert.equal(syntheticReport.productionEnabled,false)
  assert.equal(syntheticReport.researchOnly,true)
  assert.equal(syntheticReport.aiTeams,1)
  assert.equal(syntheticReport.humanTeams,1)
  assert.doesNotMatch(live.stdout,/rider-1|stage-1|race-1/)
  assert.equal(live.status,syntheticReport.status==='SHADOW_STRICT_REPLAY_PASS'?0:1)
  // Exercise the public, user-callable wrapper as well: path validation,
  // isolated rebuild, sanitized report and automatic cleanup.
  const privateFile=join(folder,'synthetic-private-envelope.json')
  writeFileSync(privateFile,fixture.stdout,{encoding:'utf8',mode:0o600,flag:'wx'})
  const cli=spawnSync(process.execPath,[
   resolve(root,'scripts/v4/runIsolatedShadowV4.mjs'),privateFile
  ],{
   cwd:root,encoding:'utf8',timeout:180000,maxBuffer:512*1024,
   env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',
    TMPDIR:process.env.TMPDIR??'',TEMP:process.env.TEMP??'',
    TMP:process.env.TMP??'',SYSTEMROOT:process.env.SYSTEMROOT??''}
  })
  assert([0,1].includes(cli.status),'offline wrapper must finish')
  assert.equal(cli.stderr,'')
  const cliLines=cli.stdout.trim().split(/\r?\n/)
  assert.equal(cliLines.length,1)
  assert(cliLines[0].startsWith('V4_ISOLATED_SHADOW_SUMMARY '))
  const cliReport=JSON.parse(
   cliLines[0].slice('V4_ISOLATED_SHADOW_SUMMARY '.length))
  assert.equal(cliReport.status,syntheticReport.status)
  assert.equal(cliReport.officialWrites,0)
  assert.equal(cliReport.productionEnabled,false)
  assert.equal(cliReport.calibration,'peloton_cooperation_energy')
  assert.doesNotMatch(cli.stdout,/rider-1|stage-1|race-1/)
  assert.equal(cli.status,syntheticReport.status==='SHADOW_STRICT_REPLAY_PASS'?0:1)
  console.log('V4_SYNTHETIC_OFFLINE_EXECUTION '+JSON.stringify({
   endToEnd:true,strictStatus:cliReport.status,
   replayQuality:cliReport.replayQuality,
   officialWrites:cliReport.officialWrites,
   aiTeams:cliReport.aiTeams,humanTeams:cliReport.humanTeams
  }))
 }finally{rmSync(folder,{recursive:true,force:true})}
})
