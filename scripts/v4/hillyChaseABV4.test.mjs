/**
 * Hilly V2 / V4 behavioral A/B: same nine synthetic stage profiles, same riders,
 * weather and AI templates. Only one HUMAN team's phase 2+4 chase orders vary.
 * No real archived data, credential access, network calls or production writes.
 */
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,chmodSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {runPrivateHistoricalPhysicsV4} from './privateHistoricalPhysicsV4.mjs'
const root=resolve(import.meta.dirname,'../..')
const folder=mkdtempSync(join(tmpdir(),'ppm-v4-hilly-chase-ab-'))
try{
 const original=readFileSync(join(root,'src/race-engine-v4/physicalResearchProbeV4.test.ts'),'utf8')
 const start=original.indexOf('function makeField('),end=original.indexOf('\nconst scenarios=',start)
 assert(start>=0&&end>start)
 const factory=original.slice(start,end)
 const code=[
  "import {validateRunInput,PPM_UNIVERSAL_RACE_ENGINE_KEY,PPM_UNIVERSAL_RACE_ENGINE_VERSION} from './src/universal-race-engine/runRaceEngine.ts'",
  "import {runSelectedRaceEngineV1} from './src/universal-race-engine/runSelectedRaceEngineV1.ts'",
  "import {prepareV4ShadowRace} from './src/race-engine-v4/templateFirstPlannerV4.ts'",
  "import {writeFileSync,chmodSync} from 'node:fs'",
  factory,
  "const folder="+JSON.stringify(folder),
  "const fields=[18,19,20,21,22,18,19,20,21]",
  "const paths={no_chase:{},organized_chase:{}}",
  "const rejected={no_chase:{},organized_chase:{}}",
  "const signature=new Map()",
  "const fail=(mode,reason)=>{rejected[mode][reason]=(rejected[mode][reason]??0)+1}",
  "for(let index=0;index<fields.length;index++){",
  " const n=fields[index],ai=Math.floor(n/2)",
  " for(const mode of ['no_chase','organized_chase']){",
  "  let {input,options}=makeField(n,ai,{terrain:'hilly',neutral:false,",
  "   seed:'v4-hilly-field-2026-'+index,humanPursuitTeam:true,",
  "   humanChase:mode==='organized_chase'})",
  "  const id='12345678-1234-4234-8234-'+String(600+index).padStart(12,'0')",
  "  const raceId='12345678-1234-4234-8234-'+String(700+index).padStart(12,'0')",
  "  input.race.raceId=raceId;input.stage.stageId=id;input.stage.raceId=raceId",
  "  input.stage.profileType='rolling';input.stage.finishType='flat_finish'",
  "  const km=[145,153,162,169,177,187,199,205,213][index]",
  "  input.stage.distanceKm=km;input.stage.elevationGainM=1120+index*170",
  "  input.stage.terrainPercentages={flat:27,hilly:58,mountain:15,cobbled:0}",
  "  input.stage.profilePoints=[{km:0,elevationM:30},",
  "   {km:km*.16,elevationM:245},{km:km*.36,elevationM:65},",
  "   {km:km*.57,elevationM:410},{km:km*.76,elevationM:135},",
  "   {km:km*.9,elevationM:330},{km,elevationM:155}]",
  "  for(const point of input.points){point.stageId=id;",
  "   if(point.pointType==='FINISH')point.kmFromStart=km}",
  "  options.lock.stageId=id",
  "  const prepared=prepareV4ShadowRace(input,options)",
  "  if(prepared.status!=='ai_prepared'||!prepared.intents.length){",
  "   fail(mode,'NO_AI_TACTICS');continue}",
  "  input=prepared.combinedInput",
  "  const sig=JSON.stringify({engine:input.engine,race:input.race,stage:input.stage,",
  "   riders:input.riders,teams:input.teams,weather:input.weather,",
  "   aiPlans:input.stagePlans.filter(p=>options.teamControl.find(t=>",
  "   t.teamId===p.teamId)?.kind==='ai')})",
  "  if(mode==='no_chase')signature.set(index,sig)",
  "  else if(sig!==signature.get(index))throw Error('CHASE_AB_INPUT_NOT_MATCHED')",
  "  const errors=validateRunInput(input)",
  "  if(errors.length){fail(mode,'INVALID_FIELD');continue}",
  "  let saved=null",
  "  try{saved=runSelectedRaceEngineV1(input)}catch(e){",
  "   const message=e instanceof Error?e.message:''",
  "   fail(mode,message.startsWith('Universal replay synchronization failed:')",
  "    ?'V2_REPLAY_UNSYNCHRONIZED':'V2_ENGINE_EXCEPTION');continue}",
  "  if(!saved?.validationPassed||!saved?.replaySynchronization?.synchronized){",
  "   fail(mode,'V2_INVALID_OR_UNSYNCHRONIZED');continue}",
  "  const path=folder+'/hilly-'+mode+'-'+index+'.json'",
  "  writeFileSync(path,JSON.stringify({status:'completed',input_snapshot_json:input,",
  "   result_summary_json:{stage_start_game_at:'2000-06-01T12:00:00Z',",
  "   output_snapshot:{universalResult:saved}},team_control:options.teamControl}),",
  "   {mode:0o600,flag:'wx'});chmodSync(path,0o600)",
  "  paths[mode][index]=path",
  " }",
  "}",
  "writeFileSync(folder+'/generated.json',JSON.stringify({paths,rejected}),",
  " {mode:0o600,flag:'wx'})"
 ].join('\n')
 await build({absWorkingDir:root,stdin:{contents:code,
  resolveDir:root,sourcefile:'v4-hilly-organized-chase-synthetic.ts',loader:'ts'},
  platform:'node',bundle:true,format:'esm',target:'node22',
  outfile:join(folder,'generate-hilly-chase.mjs'),logLevel:'silent'})
 const gen=spawnSync(process.execPath,[join(folder,'generate-hilly-chase.mjs')],{
  cwd:root,encoding:'utf8',timeout:240000,maxBuffer:1024*1024})
 if(gen.status!==0){
  // Synthetic-only factory; report a bounded stack excerpt for a failing CI test.
  const details=String(gen.stderr??'').slice(-1000)
  throw Error('HILLY_AB_SYNTHETIC_INPUT_GENERATION_FAILED '+details)
 }
 const generated=JSON.parse(readFileSync(join(folder,'generated.json'),'utf8'))
 const paired=[0,1,2,3,4,5,6,7,8].filter(i=>
  generated.paths.no_chase[i]&&generated.paths.organized_chase[i])
 assert(paired.length>=3,'Need at least three exact A/B race pairs')
 const reports={}
 for(const mode of ['no_chase','organized_chase']){
  const manifest=join(folder,mode+'-manifest.json')
  writeFileSync(manifest,JSON.stringify({privateEnvelopePaths:
   paired.map(i=>generated.paths[mode][i])}),{mode:0o600,flag:'wx'})
  chmodSync(manifest,0o600)
  const report=await runPrivateHistoricalPhysicsV4(manifest)
  assert.equal(report.officialWrites,0)
  assert.equal(report.historicalV4RealismApproved,false)
  assert.equal(report.rawStageDataPublished,false)
  assert.equal(report.privatePathsPublished,false)
  assert.equal(report.rejected.baselineHistoricMismatch,0)
  assert.equal(report.rejected.baselineReplayUnsynchronized,0)
  reports[mode]=report
 }
 const a=reports.no_chase.terrain.find(x=>x.terrain==='hilly')
 const b=reports.organized_chase.terrain.find(x=>x.terrain==='hilly')
 assert(a.matchedOpeningBreakawayCases>0&&b.matchedOpeningBreakawayCases>0,
  'An A/B chase experiment requires actual accepted opening escapes')
 const summary=x=>({
  completedTriples:x.eligible,
  matchedOpeningBreakaways:x.matchedOpeningBreakawayCases,
  medianObservedPeakAllRacesSeconds:x.combinedMedianObservedPhysicalPeakSeconds,
  medianObservedPeakWithBreakawaySeconds:x.combinedMedianObservedPeakAmongBreakawaysSeconds,
  breakawayCaught:x.combinedBreakawayCaughtAmongBreakaways,
  breakawaySurvived:x.combinedBreakawaySurvivedAmongBreakaways,
  phase3GapGrowthWithBreakawaySeconds:x.medianCombinedPhase3GrowthAmongBreakawaysSeconds,
  meanPhase4EnergyAtFinishWithBreakaway:x.medianCombinedEnergyAtFinishAmongBreakaways,
  changedClassifications:x.combinedChangedClassification,
  changedWinners:x.combinedChangedWinner
 })
 console.log('V4_HILLY_ORGANIZED_CHASE_AB '+JSON.stringify({
  status:'SYNTHETIC_PHYSICAL_BEHAVIOR_ONLY',pairedInputCases:paired.length,
  intendedSeedCases:9,baselineFixtureFailures:generated.rejected,
  matchedAIPreparationVerified:true,onlyHumanP2P4ChaseOrdersDiffer:true,
  noChase:summary(a),organizedHumanChase:summary(b),
  originalV2SolverModified:false,productionWrites:0,
  strictReplay:true,realismApproved:false,source:'synthetic_only'
 }))
}finally{rmSync(folder,{recursive:true,force:true})}
