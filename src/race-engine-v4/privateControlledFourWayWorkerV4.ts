/**
 * Single isolated child for the four-factor historical race experiment.
 * Both engine variants share exactly one reconstructed source and seed;
 * only AI commands and V4 physical source transforms differ.
 * The child never exports IDs, raw inputs, stage tactics or replay timelines.
 */
import {readFileSync} from 'node:fs'
import {prepareV4ShadowRace} from './templateFirstPlannerV4.ts'
import {runRaceEngine as runBaseline,
 classifyUniversalReplaySynchronizationForPublication}
 from '../universal-race-engine/runRaceEngine.ts'
// Resolved ONLY by the offline runner's esbuild plugin. Never in production.
import {runRaceEngine as runCalibratedV4}
 from 'ppm-v4-calibrated-physical'
import {classifyV4IsolatedShadow}
 from '../../scripts/v4/isolatedShadowGateV4.mjs'
import {comparePrivateV4WithOfficial}
 from '../../scripts/v4/privateRealVsOfficialCompareV4.mjs'
import {summarizeControlledFourWayV4,summarizeControlledPartialFourWayV4}
 from '../../scripts/v4/privateControlledFourWayDiagnosticsV4.mjs'
import {classifyV4PhysicsFailure}
 from '../../scripts/v4/isolatedShadowExecutionFailureV4.mjs'
import {isV4FourWaySafePhase}
 from '../../scripts/v4/privateControlledFourWaySafeFailuresV4.mjs'

function main(){
 let phase='INPUT'
 try{
  const bytes=readFileSync(0)
  if(bytes.length<30||bytes.length>18*1024*1024)throw Error('BAD_SIZE')
  const envelope=JSON.parse(bytes.toString('utf8'))
  const {input,options,reference}=envelope
  if(!input?.stage?.stageId||!input?.engine?.deterministicSeed||
     input.stage.stageId!==reference?.stageId||
     input.race?.raceId!==reference?.raceId||
     options?.lock?.stageId!==input.stage.stageId||
     !Array.isArray(options.teamControl)||
     !Array.isArray(reference.officialRows)||reference.officialRows.length!==108)
   throw Error('BAD_ENVELOPE')
  phase='PLAN'
  const planned=prepareV4ShadowRace(input,options)
  if(planned.status!=='ai_prepared'||planned.aiTeams!==18||
     planned.humanTeams!==0||planned.combinedInput.riders.length!==108||
     planned.combinedInput.engine?.deterministicSeed!==input.engine.deterministicSeed)
   throw Error('BAD_PLAN')
  const validate=(result,variantInput)=>{
   const gate=classifyUniversalReplaySynchronizationForPublication(
    result.replaySynchronization)
   const shadow=classifyV4IsolatedShadow({
    plan:{...planned,combinedInput:variantInput},result,gate
   })
   if(shadow.status!=='SHADOW_STRICT_REPLAY_PASS'||shadow.replayQuality!=='full')
    throw Error('STRICT_REPLAY_FAILED')
   return result
  }
  const original=input,alternative=planned.combinedInput
  const arms=[
   {name:'baselineOriginal',solver:runBaseline,source:original,stage:'BASELINE_ORIGINAL'},
   {name:'baselineV4Tactics',solver:runBaseline,source:alternative,stage:'BASELINE_V4_TACTICS'},
   {name:'v4Original',solver:runCalibratedV4,source:original,stage:'V4_ORIGINAL'},
   {name:'v4V4Tactics',solver:runCalibratedV4,source:alternative,stage:'V4_V4_TACTICS'}
  ] as const
  const results:Record<string,ReturnType<typeof runBaseline>>={}
  const failures:Record<string,string>={}
  const failureKinds:Record<string,'EXECUTION_REJECTED'|'REPLAY_REJECTED'>={}
  for(const arm of arms){
   let raw:ReturnType<typeof runBaseline>
   phase=arm.stage+'_EXECUTION'
   try {raw=arm.solver(structuredClone(arm.source))}
   catch(error){
    failures[arm.name]=classifyV4PhysicsFailure(error)
    failureKinds[arm.name]='EXECUTION_REJECTED'
    continue
   }
   phase=arm.stage+'_REPLAY'
   try {results[arm.name]=validate(raw,arm.source)}
   catch(error){
    failures[arm.name]=error instanceof Error&&error.message==='STRICT_REPLAY_FAILED'?
     'SHADOW_PHYSICS_REPLAY_SYNC_REJECTED':classifyV4PhysicsFailure(error)
    failureKinds[arm.name]='REPLAY_REJECTED'
   }
  }
  phase='AGGREGATION'
  if(Object.keys(failures).length===0){
   const report=summarizeControlledFourWayV4({
    reference,planned,baselineOriginal:results.baselineOriginal,
    baselineV4Tactics:results.baselineV4Tactics,
    v4Original:results.v4Original,v4V4Tactics:results.v4V4Tactics,
    compareWithOfficial:comparePrivateV4WithOfficial
   })
   process.stdout.write('V4_FOUR_WAY_REPORT '+JSON.stringify(report)+'\n')
   return
  }
  if(!results.baselineOriginal)throw Error('BASELINE_ORIGINAL_REQUIRED')
  // The rejected V1-with-V4-tactics arm is still useful evidence. A cumulative
  // phase prefix probe reveals the earliest command boundary that becomes
  // non-executable, without logging a rider ID, command or raw replay issue.
  const prefixProbes:Array<{throughPhase:number,status:string,reason:string|null}>=[]
  if(failures.baselineV4Tactics){
   const byTeam=new Map(alternative.stagePlans.map(p=>[p.teamId,p]))
   const sourceForPrefix=(n:number):typeof original=>({
    ...original,
    stagePlans:original.stagePlans.map(plan=>{
     const next=byTeam.get(plan.teamId)
     const byRider=new Map(next?.riders.map(r=>[r.riderId,r])??[])
     return {...plan,riders:plan.riders.map(row=>{
      const other=byRider.get(row.riderId)
      const commands={...row.commands}
      for(let p=1;p<=n;p++){
       const key=('phase'+p) as keyof typeof commands
       if(other?.commands?.[key]!==undefined)
        commands[key]=other.commands[key]
      }
      return {...row,commands}
     })}
    })
   })
   for(let n=1;n<=4;n++){
    if(n===4){
     prefixProbes.push({throughPhase:n,status:failureKinds.baselineV4Tactics,
      reason:failures.baselineV4Tactics})
     continue
    }
    const subset=sourceForPrefix(n)
    let stageError:unknown=null
    let raw:ReturnType<typeof runBaseline>|null=null
    try{raw=runBaseline(structuredClone(subset))}
    catch(error){stageError=error}
    if(stageError){
     prefixProbes.push({throughPhase:n,status:'EXECUTION_REJECTED',
      reason:classifyV4PhysicsFailure(stageError)})
     continue
    }
    try{validate(raw!,subset);prefixProbes.push({throughPhase:n,status:'PASS',reason:null})}
    catch(error){
     prefixProbes.push({throughPhase:n,status:'REPLAY_REJECTED',
      reason:error instanceof Error&&error.message==='STRICT_REPLAY_FAILED'?
       'SHADOW_PHYSICS_REPLAY_SYNC_REJECTED':classifyV4PhysicsFailure(error)})
    }
   }
  }else{
   for(let n=1;n<=4;n++)prefixProbes.push({
    throughPhase:n,status:'NOT_RUN',reason:null
   })
  }
  const report=summarizeControlledPartialFourWayV4({
   reference,planned,caseResults:results,failures,prefixProbes,
   compareWithOfficial:comparePrivateV4WithOfficial
  })
  process.stdout.write('V4_FOUR_WAY_REPORT '+JSON.stringify(report)+'\n')
 }catch{
  // No private exception message may reach stdout/stderr.
  process.stdout.write('V4_FOUR_WAY_REJECTED '+
   (isV4FourWaySafePhase(phase)?phase:'INPUT')+'\n')
  process.exitCode=1
 }
}
main()
