/**
 * PRIVATE historical V2-versus-calibrated-V4 physics worker.
 * Compiled three times (preserved_v2 / combined / combined_energy) with
 * different source transformations. Uses IDENTICAL original locked input.
 * No network, SQL, publication, rider names or raw snapshots in stdout.
 */
import {readFileSync,realpathSync,statSync} from 'node:fs'
import {relative,isAbsolute,sep} from 'node:path'
import {createHash} from 'node:crypto'
import {runSelectedRaceEngineV1,selectCompleteRaceEngineLaneV1}
 from '../universal-race-engine/runSelectedRaceEngineV1.ts'
import type {UniversalRaceEngineResult} from '../universal-race-engine/runRaceEngine.ts'

declare const __V4_PRIVATE_PHYSICS_VARIANT__: 'preserved_v2'|'combined'|'combined_energy'
const variant=__V4_PRIVATE_PHYSICS_VARIANT__
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const privatePath=(raw:unknown,repository:string,limit:number):string=>{
 if(typeof raw!=='string'||!isAbsolute(raw))throw Error('INVALID_PRIVATE_INPUT')
 const path=realpathSync(raw),sub=relative(repository,path),meta=statSync(path)
 if(sub===''||(sub!=='..'&&!sub.startsWith('..'+sep)&&!isAbsolute(sub))||
    !meta.isFile()||meta.size<=0||meta.size>limit||
    (process.platform!=='win32'&&(meta.mode&0o077)!==0))
  throw Error('INVALID_PRIVATE_INPUT')
 return path
}
const normalized=(result:UniversalRaceEngineResult)=>{
 const arr=result.finishResolution?.classification
 if(!Array.isArray(arr)||arr.length<2)throw Error('NO_FINISH_CLASSIFICATION')
 return arr.map(r=>({
  id:String(r.riderId),rank:r.rank==null?null:Number(r.rank),
  status:String(r.status),
  gap:r.gapSeconds==null?null:Number(r.gapSeconds),
  time:r.officialTimeSeconds==null?null:Number(r.officialTimeSeconds),
 })).sort((a,b)=>a.id.localeCompare(b.id))
}
const same=(a:number|null,b:number|null)=>a===null||b===null?a===b:
 Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=0.01
const equalHistory=(saved:ReturnType<typeof normalized>,current:ReturnType<typeof normalized>)=>
 saved.length===current.length&&saved.every((a,i)=>{
  const b=current[i]
  return a.id===b.id&&a.rank===b.rank&&a.status===b.status&&
   same(a.gap,b.gap)&&same(a.time,b.time)
 })
const finite=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null
function evaluate(raw:unknown){
 if(!record(raw)||raw.status!=='completed'||!record(raw.input_snapshot_json)||
   !record(raw.result_summary_json)||!record(raw.result_summary_json.output_snapshot))
  throw Error('INCOMPLETE_HISTORY')
 const input=raw.input_snapshot_json
 const saved=raw.result_summary_json.output_snapshot.universalResult as UniversalRaceEngineResult
 if(!record(saved)||!record(input.stage)||!record(input.race)||
   input.stage.stageFormat!=='road_race'||!input.stage.stageId||
   !['flat','hilly','mountain','cobbled'].includes(input.stage.terrainType)||
   !Array.isArray(input.riders)||input.riders.length<2||
   !Array.isArray(input.teams)||input.teams.length<1||
   !Array.isArray(input.stagePlans)||input.stagePlans.length!==input.teams.length||
   input.stagePlans.some((p:any)=>p.locked!==true||p.status!=='locked')||
   saved.stageId!==input.stage.stageId||saved.raceId!==input.race.raceId)
  throw Error('INVALID_LOCKED_HISTORY')
 if(selectCompleteRaceEngineLaneV1(input.stage)!=='baseline_universal')
  throw Error('UNSUPPORTED_V2_SOLVER_LANE')
 const ctrl=raw.team_control
 if(!Array.isArray(ctrl)||ctrl.length!==input.teams.length)
  throw Error('UNVERIFIED_TEAM_CONTROL')
 const ownership=new Map(ctrl.map((x:any)=>[x.teamId,x.kind]))
 if(ownership.size!==ctrl.length||input.teams.some((t:any)=>
   !['ai','human'].includes(ownership.get(t.teamId)) ||
   (t.snapshot?.metadata?.scenarioAiControlled===true&&ownership.get(t.teamId)!=='ai'))||
   new Set(input.teams.map((t:any)=>t.teamId)).size!==input.teams.length||
   new Set(input.stagePlans.map((p:any)=>p.teamId)).size!==input.teams.length||
   input.stagePlans.some((p:any)=>!ownership.has(p.teamId)))
  throw Error('UNVERIFIED_TEAM_CONTROL')
 if(!Array.isArray(saved.finishResolution?.classification)||
   !raw.result_summary_json.stage_start_game_at)
  throw Error('MISSING_SAVED_RESULT')
 const srcHash=sha(input),stageHash=sha(input.stage.stageId).slice(0,16)
 const result=runSelectedRaceEngineV1(input)
 if(!result.validationPassed||sha(input)!==srcHash)
  throw Error('PHYSICAL_RESULT_INVALID')
 const rows=normalized(result),historic=normalized(saved)
 const finishers=rows.filter(x=>x.status==='finished')
 const gaps=finishers.map(x=>x.gap).filter((g):g is number=>g!==null&&Number.isFinite(g))
 const rankings=finishers.filter(x=>x.rank!==null).sort((a,b)=>(a.rank??0)-(b.rank??0))
 const p3=result.roadRaceResolution?.phase3Decisive
 const p4=result.roadRaceResolution?.phase4Finish
 const phase3Growth=(p3&&Number.isFinite(p3.physicalStartGapSeconds)&&
   Number.isFinite(p3.physicalEndGapSeconds))?
    p3.physicalEndGapSeconds-p3.physicalStartGapSeconds:null
 const replaySynchronized=result.replaySynchronization?.synchronized===true
 return {
  stageHash,sourceHash:srcHash,terrain:input.stage.terrainType,
  riderCount:input.riders.length,teams:input.teams.length,
  savedV2ClassificationParity:equalHistory(historic,rows),
  historicalReplaySynchronized:saved.replaySynchronization?.synchronized===true,
  replaySynchronized,classificationHash:sha(rows),
  winnerHash:rankings.length?sha(rankings[0].id).slice(0,16):null,
  completedRiders:finishers.length,
  publishedFinishGroups:result.groupAndTimeResolution?.finalGroups?.length??null,
  maximumFinishGapSeconds:gaps.length?Math.max(...gaps):null,
  topFiveGapSeconds:rankings.slice(0,5).map(x=>x.gap),
  maximumBreakawayGapSeconds:finite(result.calibrationSummary?.maximumBreakawayGapSeconds),
  acceptedOpeningAttacks:result.roadRaceResolution?.phase1Opening?.attackAttempts
    ?.filter((a:any)=>a.acceptedEscapeLaunch).length??0,
  phase3GapGrowthSeconds:phase3Growth,
  phase4EndGapSeconds:finite(p4?.endGapSeconds),
  meanPhase4EnergyAtFinish:p4?.riderStates?.length?
   Number((p4.riderStates.reduce((sum:number,r:any)=>sum+r.energyAtFinish,0)/p4.riderStates.length).toFixed(6)):null,
 }
}
function main(){
 const repo=realpathSync(process.cwd())
 const manifest=privatePath(process.argv[2],repo,128*1024)
 const doc=JSON.parse(readFileSync(manifest,'utf8'))
 if(!record(doc)||!Array.isArray(doc.privateEnvelopePaths)||
   doc.privateEnvelopePaths.length===0||doc.privateEnvelopePaths.length>100||
   Object.keys(doc).some(k=>k!=='privateEnvelopePaths'))
  throw Error('BAD_MANIFEST')
 const paths=doc.privateEnvelopePaths.map((raw:unknown)=>privatePath(raw,repo,64*1024*1024))
 if(new Set(paths).size!==paths.length)throw Error('DUPLICATE_PRIVATE_PATH')
 const rows=[],rejected={invalid:0,unsupported:0,unsynchronized:0}
 const safeCodes=['INCOMPLETE_HISTORY','INVALID_LOCKED_HISTORY',
  'UNVERIFIED_TEAM_CONTROL','UNSUPPORTED_V2_SOLVER_LANE',
  'MISSING_SAVED_RESULT','PHYSICAL_RESULT_INVALID','NO_FINISH_CLASSIFICATION']
 const failureClasses=Object.fromEntries(safeCodes.map(k=>[k,0]))
 failureClasses.other=0
 for(const path of paths){
  try{
   const data=JSON.parse(readFileSync(path,'utf8'))
   rows.push(evaluate(data))
  }catch(e){
   const code=e instanceof Error?e.message:'UNKNOWN'
   if(code==='UNSUPPORTED_V2_SOLVER_LANE')rejected.unsupported++
   else rejected.invalid++
   // Fixed constant keys only. Never print raw error messages or identity data.
   if(safeCodes.includes(code))failureClasses[code]++
   else failureClasses.other++
  }
 }
 // Never emit the original stage/rider/team identity or error details.
 process.stdout.write('V4_PRIVATE_PHYSICAL_VARIANT '+JSON.stringify({
  variant,researchOnly:true,officialWrites:0,networkCalls:0,
  inputPathsReported:false,attempted:paths.length,rejected,failureClasses,rows,
 })+'\n')
 // Zero usable stages is a valid diagnostic result, not a child-process crash.
 // The outer operator CLI still returns failure when no comparable triple exists.
}
try{if(process.argv.length!==3)throw Error('ARGUMENTS');main()}
catch{
 console.error('V4_PRIVATE_PHYSICAL_REJECTED: private manifest inaccessible or invalid')
 process.exitCode=1
}
