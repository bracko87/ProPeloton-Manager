/**
 * Synthetic-only integration proof. No real archived race or DB credentials.
 * Exercises the PRIVATE runner using an original physical solver fixture.
 */
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,chmodSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {runPrivateHistoricalPhysicsV4} from './privateHistoricalPhysicsV4.mjs'
import {patchV4CalibratedPhysicalSource} from './calibratedPhysicalTransformV4.mjs'
const root=resolve(import.meta.dirname,'../..')
const folder=mkdtempSync(join(tmpdir(),'ppm-v4-private-physics-synthetic-'))
try{
 // Exact V4 patch must work identically when git checkout converts LF to CRLF.
 const engineSource=readFileSync(join(root,'src/universal-race-engine/runRaceEngine.ts'),'utf8')
 const configs=[
  {peloton:true,cooperation:true,energy:false},
  {peloton:true,cooperation:true,energy:true}
 ]
 for(const config of configs){
  const lf=patchV4CalibratedPhysicalSource(engineSource,config)
  const crlf=patchV4CalibratedPhysicalSource(engineSource.replace(/\r\n?|\n/g,'\r\n'),config)
  assert.equal(crlf,lf,'Windows CRLF must preserve exact isolated V4 source')
 }
 const fixture=readFileSync(join(root,'src/race-engine-v4/physicalResearchProbeV4.test.ts'),'utf8')
 const first=fixture.indexOf('function makeField('),last=fixture.indexOf('\nconst scenarios=',first)
 if(first<0||last<first)throw Error('Existing synthetic fixture factory drifted')
 const makeField=fixture.slice(first,last)
 const privateStage=join(folder,'private-synthetic-stage.json')
 const manifest=join(folder,'private-synthetic-manifest.json')
 const factorySource=[
 "import {PPM_UNIVERSAL_RACE_ENGINE_KEY,PPM_UNIVERSAL_RACE_ENGINE_VERSION} from './src/universal-race-engine/runRaceEngine.ts'",
 "import {runSelectedRaceEngineV1} from './src/universal-race-engine/runSelectedRaceEngineV1.ts'",
 "import {writeFileSync,chmodSync} from 'node:fs'",
 makeField,
 "const {input,options}=makeField(4,2,{neutral:false,terrain:'flat',seed:'v4-private-history-synthetic-001'})",
 "const saved=runSelectedRaceEngineV1(input)",
 "if(!saved.validationPassed||!saved.replaySynchronization?.synchronized)throw Error('Invalid test fixture')",
 "const record={status:'completed',input_snapshot_json:input,result_summary_json:{",
 "stage_start_game_at:'2000-06-01T12:00:00Z',output_snapshot:{universalResult:saved}},",
 "team_control:options.teamControl}",
 "writeFileSync("+JSON.stringify(privateStage)+",JSON.stringify(record),{mode:0o600,flag:'wx'})",
 "chmodSync("+JSON.stringify(privateStage)+",0o600)"
 ].join('\n')
 await build({absWorkingDir:root,stdin:{
  contents:factorySource,resolveDir:root,sourcefile:'v4-private-physics-synthetic-factory.ts',
  loader:'ts'},platform:'node',bundle:true,format:'esm',target:'node22',
  outfile:join(folder,'generate-synthetic.mjs'),logLevel:'silent'})
 const run=spawnSync(process.execPath,[join(folder,'generate-synthetic.mjs')],{
  cwd:root,encoding:'utf8',timeout:120000,maxBuffer:1024*1024})
 if(run.status!==0)throw Error('Synthetic fixture creation failed: '+String(run.stderr).slice(-250))
 writeFileSync(manifest,JSON.stringify({privateEnvelopePaths:[privateStage]}),
  {mode:0o600,flag:'wx'})
 chmodSync(manifest,0o600)
 const report=await runPrivateHistoricalPhysicsV4(manifest)
 assert.equal(report.status,'PRIVATE_HISTORICAL_CALIBRATED_V4_PHYSICS_DIAGNOSTIC')
 assert.equal(report.consideredCompleteTriples,1)
 assert.equal(report.calibratedV4PhysicalReruns,2)
 assert.equal(report.historicalV2Reruns,1)
 assert.equal(report.all.eligible,1)
 assert.equal(report.officialWrites,0)
 assert.equal(report.historicalV4RealismApproved,false)
 assert.equal(report.rawStageDataPublished,false)
 assert.equal(report.privatePathsPublished,false)
 assert.equal(report.rejected.baselineHistoricMismatch,0)
 assert.equal(report.rejected.baselineReplayUnsynchronized,0)
 assert.ok(report.terrain.find(x=>x.terrain==='flat').eligible===1)
 const printable=JSON.stringify(report)
 assert.equal(printable.includes('v4-synthetic-stage-01'),false)
 assert.equal(printable.includes('rider-'),false)
 assert.equal(printable.includes(privateStage),false)
 // An intact private manifest containing an invalid historical record must
 // produce useful anonymous rejection counts rather than an opaque exception.
 const malformed=join(folder,'invalid-history.json')
 writeFileSync(malformed,JSON.stringify({
  status:'completed',input_snapshot_json:{riders:[],teams:[],stagePlans:[]},
  result_summary_json:{output_snapshot:{universalResult:{}}}}),
  {mode:0o600,flag:'wx'})
 chmodSync(malformed,0o600)
 writeFileSync(manifest,JSON.stringify({privateEnvelopePaths:[malformed]}))
 const noValid=await runPrivateHistoricalPhysicsV4(manifest)
 assert.equal(noValid.consideredCompleteTriples,0)
 assert.equal(noValid.calibratedV4PhysicalReruns,0)
 assert.equal(noValid.rejected.baselineInvalid,1)
 assert.equal(noValid.rejected.failedPhysicsByVariant.preserved_v2.INVALID_LOCKED_HISTORY,1)
 assert.equal(noValid.rejected.failedPhysicsByVariant.combined.INVALID_LOCKED_HISTORY,1)
 assert.equal(noValid.rejected.failedPhysicsByVariant.combined_energy.INVALID_LOCKED_HISTORY,1)
 assert.equal(noValid.historicalV4RealismApproved,false)
 assert.equal(JSON.stringify(noValid).includes('invalid-history.json'),false)
 writeFileSync(manifest,JSON.stringify({privateEnvelopePaths:[privateStage]}))
 // The trust boundary must reject repository-local files on every OS.
 // On Unix it additionally rejects world-readable private snapshots.
 writeFileSync(manifest,JSON.stringify({privateEnvelopePaths:[join(root,'package.json')]}))
 await assert.rejects(()=>runPrivateHistoricalPhysicsV4(manifest),/PRIVATE_PATH_REJECTED/)
 if(process.platform!=='win32'){
  writeFileSync(manifest,JSON.stringify({privateEnvelopePaths:[privateStage]}))
  chmodSync(privateStage,0o644)
  await assert.rejects(()=>runPrivateHistoricalPhysicsV4(manifest),/PRIVATE_PATH_REJECTED/)
 }
 console.log('V4_PRIVATE_PHYSICAL_HISTORY_UNIT '+JSON.stringify({
  status:'PASS',cases:25,syntheticOnly:true,
  preservedV2Runs:1,calibratedV4Runs:2,officialWrites:0}))
}finally{rmSync(folder,{recursive:true,force:true})}
