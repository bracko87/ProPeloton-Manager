/**
 * Nine LARGE synthetic hilly races: preserved V2 versus isolated calibrated V4.
 * No production connections, no real archive, no official race writes.
 * Uses the same private physical triple runner as the archived comparison.
 */
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,chmodSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {runPrivateHistoricalPhysicsV4} from './privateHistoricalPhysicsV4.mjs'

const root=resolve(import.meta.dirname,'../..')
const folder=mkdtempSync(join(tmpdir(),'ppm-v4-hilly-physics-'))
try{
 const fixture=readFileSync(join(root,'src/race-engine-v4/physicalResearchProbeV4.test.ts'),'utf8')
 const from=fixture.indexOf('function makeField(')
 const to=fixture.indexOf('\nconst scenarios=',from)
 assert(from>=0&&to>from,'Original synthetic field generator must be unchanged')
 const factory=fixture.slice(from,to)
 const manifest=join(folder,'hilly-synthetic-manifest.json')
 const generator=[
  "import {PPM_UNIVERSAL_RACE_ENGINE_KEY,PPM_UNIVERSAL_RACE_ENGINE_VERSION,validateRunInput} from './src/universal-race-engine/runRaceEngine.ts'",
  "import {runSelectedRaceEngineV1} from './src/universal-race-engine/runSelectedRaceEngineV1.ts'",
  "import {writeFileSync,chmodSync} from 'node:fs'",
  factory,
  "const folder="+JSON.stringify(folder),
  "const fields=[18,19,20,21,22,18,19,20,21]",
  "const filePaths=[]",
  "const outcomes=[]",
  "for(let index=0;index<fields.length;index++){",
  " const n=fields[index],ai=Math.floor(n/2)",
  " const {input,options}=makeField(n,ai,{terrain:'hilly',neutral:false,seed:'v4-hilly-field-2026-'+index})",
  " const id='12345678-1234-4234-8234-'+String(600+index).padStart(12,'0')",
  " const raceId='12345678-1234-4234-8234-'+String(700+index).padStart(12,'0')",
  " input.race.raceId=raceId",
  " input.stage.stageId=id;input.stage.raceId=raceId",
  " input.stage.profileType='rolling'",
  " input.stage.finishType='uphill_finish'",
  " input.stage.elevationGainM=1100+index*95",
  " input.stage.terrainPercentages={flat:27,hilly:58,mountain:15,cobbled:0}",
  " input.stage.profilePoints=[{km:0,elevationM:30},{km:25,elevationM:190},",
  "  {km:50,elevationM:85},{km:75,elevationM:380},{km:90,elevationM:170},",
  "  {km:105,elevationM:390},{km:120,elevationM:510}]",
  " for(const point of input.points)point.stageId=id",
  " const errors=validateRunInput(input)",
  " if(errors.length){outcomes.push({case:index,reason:'INVALID_SYNTHETIC_FIELD'});continue}",
  " let saved",
  " try{saved=runSelectedRaceEngineV1(input)}",
  " catch(e){const m=String(e instanceof Error?e.message:'')",
  "  outcomes.push({case:index,reason:m.startsWith('Universal replay synchronization failed:')?'BASELINE_REPLAY':'BASELINE_ENGINE_ERROR'});continue}",
  " if(!saved?.validationPassed||!saved?.replaySynchronization?.synchronized){",
  "  outcomes.push({case:index,reason:'BASELINE_NOT_SYNCHRONIZED'});continue}",
  " const path=folder+'/synthetic-hilly-'+String(index)+'.json'",
  " writeFileSync(path,JSON.stringify({status:'completed',input_snapshot_json:input,",
  "  result_summary_json:{stage_start_game_at:'2000-06-01T12:00:00Z',",
  "   output_snapshot:{universalResult:saved}},team_control:options.teamControl}),",
  "  {mode:0o600,flag:'wx'});chmodSync(path,0o600)",
  " filePaths.push(path)",
  " outcomes.push({case:index,reason:'VALID_BASELINE',riders:input.riders.length})",
  "}",
  "writeFileSync(folder+'/generated.json',JSON.stringify({paths:filePaths,outcomes}),{mode:0o600,flag:'wx'})",
 ].join('\n')
 await build({absWorkingDir:root,stdin:{
  contents:generator,resolveDir:root,sourcefile:'v4-nine-hilly-large-field-factory.ts',loader:'ts'
 },platform:'node',bundle:true,format:'esm',target:'node22',
 outfile:join(folder,'make-hilly-fixtures.mjs'),logLevel:'silent'})
 const gen=spawnSync(process.execPath,[join(folder,'make-hilly-fixtures.mjs')],{
  cwd:root,encoding:'utf8',timeout:240000,maxBuffer:1024*1024})
 if(gen.status!==0)throw Error('Private synthetic field creation failed')
 const generated=JSON.parse(readFileSync(join(folder,'generated.json'),'utf8'))
 assert.equal(generated.outcomes.length,9)
 assert(generated.paths.length>0,'At least one original V2 synthetic hilly race must synchronize')
 writeFileSync(manifest,JSON.stringify({privateEnvelopePaths:generated.paths}),
  {mode:0o600,flag:'wx'})
 chmodSync(manifest,0o600)
 const report=await runPrivateHistoricalPhysicsV4(manifest)
 assert.equal(report.officialWrites,0)
 assert.equal(report.historicalV4RealismApproved,false)
 assert.equal(report.historicalSourceRevisionAttested,false)
 assert.equal(report.rawStageDataPublished,false)
 assert.equal(report.privatePathsPublished,false)
 assert.equal(report.terrain.find(x=>x.terrain==='hilly').eligible,report.all.eligible)
 assert.equal(report.rejected.savedArchiveReplaySynchronized,generated.paths.length)
 assert.equal(report.savedArchiveGapSummary.evaluableRows+
  report.rejected.baselineInvalid+report.rejected.baselineUnsupported,generated.paths.length)
 const candidate=report.terrain.find(x=>x.terrain==='hilly')
 console.log('V4_HILLY_NINE_LARGE_FIELD_PHYSICS '+JSON.stringify({
  status:'SYNTHETIC_PHYSICS_DIAGNOSTIC_ONLY',
  intendedHillyFields:9,originalV2Synchronized:generated.paths.length,
  originalV2GenerationFailures:generated.outcomes.filter(x=>x.reason!=='VALID_BASELINE')
   .reduce((counts,x)=>(counts[x.reason]=(counts[x.reason]??0)+1,counts),{}),
  generatedRiderRange:generated.outcomes.filter(x=>x.riders).reduce((range,x)=>
   [Math.min(range[0],x.riders),Math.max(range[1],x.riders)],[Infinity,0]),
  attemptedPhysicalTriples:generated.paths.length,eligibleComparisons:report.all.eligible,
  physicsRejections:report.rejected,
  outcome:{
   v2MedianPublishedGapSeconds:candidate.baselineMedianMaxBreakawaySeconds,
   v2MedianObservedPeakSeconds:candidate.baselineMedianObservedPhysicalPeakSeconds,
   v4MedianPublishedGapSeconds:candidate.combinedMedianMaxBreakawaySeconds,
   v4MedianObservedPeakSeconds:candidate.combinedMedianObservedPhysicalPeakSeconds,
   v4EnergyMedianObservedPeakSeconds:candidate.energyMedianObservedPhysicalPeakSeconds,
   changedClassifications:candidate.combinedChangedClassification,
   changedWinners:candidate.combinedChangedWinner,
   v4Phase3GapChangeSeconds:candidate.medianCombinedPhase3GapGrowthSeconds,
   v4EnergyPhase4AtFinish:candidate.medianEnergyPhase4Energy
  },
  noRealHistoricalData:true,originalProductionV2FilesModified:false,
  officialWrites:0,realismApproved:false
 }))
}finally{rmSync(folder,{recursive:true,force:true})}
