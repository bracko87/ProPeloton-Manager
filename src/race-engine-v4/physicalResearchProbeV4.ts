/**
 * Race Engine V4 — isolated replay evidence runner.
 * NO official worker, DB, Supabase, scheduler or production dispatcher imports.
 * The preserved V2 physical solver is invoked purely in memory.
 */
import {createHash} from 'node:crypto'
import {auditV4GapTrajectories,type V4GapTrajectoryAudit} from './breakawayGapDiagnosticsV4.ts'
import type {UniversalRaceEngineInput} from '../universal-race-engine/runRaceEngine.ts'
import {runRaceEngine} from '../universal-race-engine/runRaceEngine.ts'
import {prepareV4ShadowRace,type V4Options} from './templateFirstPlannerV4.ts'

const digest=(value:unknown)=>createHash('sha256')
 .update(JSON.stringify(value)).digest('hex')
export interface V4PhysicalEvidence {
 readonly version:'v4_readonly_physical_probe_01'
 readonly mode:'in_memory_research_only'
 readonly teamCounts:{readonly ai:number;readonly human:number}
 readonly selectedTemplateId:string|null
 readonly aiIntents:number
 readonly humanPhase1BreakawayCommands:number
 readonly aiPhase1BreakawayCommands:number
 readonly stageId:string
 readonly validated:boolean
 readonly calculatedPhysicalRace:true
 readonly firstWaveAttempts:number
 readonly acceptedBreakLaunches:number
 readonly acceptedHumanBreakLaunches:number
 readonly acceptedAiBreakLaunches:number
 readonly firstWaveAcceptedWithBoth:boolean
 readonly openingBreakawayRiderIds:readonly string[]
 readonly observedHumanAiSameReplayGroup:boolean
 readonly observedSharedGroupCheckpoints:number
 readonly observedMixedAcceptedBreakawayGroup:boolean
 readonly observedMixedAcceptedBreakawayCheckpoints:number
 readonly observedMixedReplayGroupSample:null|{
   readonly checkpointId:string; readonly groupDisplayCode:string;
   readonly humanRiderIds:readonly string[];readonly aiRiderIds:readonly string[]
 }
 readonly maximumBreakawayGapSeconds:number|null
 readonly gapAudit:V4GapTrajectoryAudit
 readonly replayCheckpoints:number
 readonly replaySynchronized:boolean
 readonly replayIssues:readonly string[]
 readonly officialFinishClassificationCount:number
 readonly officialResultHash:string
 readonly replayTimelineHash:string
 readonly sourceSnapshotHash:string
 readonly outcomePublished:false
 readonly officialWrites:0
 readonly productionDispatcherInvoked:false
}
function safeNumber(n:unknown):number|null{
 return Number.isFinite(n)?Number(n):null
}
/** Validate that the preserved V2 solver ran on exactly the V4 merged input.
 * This is a read-only calculation; there is no database connection.
 * The result is measured, not manufactured from template target gaps. */
export function probeV4PhysicalRace(
 input:UniversalRaceEngineInput,options:V4Options
):V4PhysicalEvidence{
 const before=digest(input)
 const prepared=prepareV4ShadowRace(input,options)
 const output=runRaceEngine(prepared.combinedInput)
 if(!output.validationPassed)throw Error('V4 shadow physical result did not validate')
 if(digest(input)!==before)throw Error('V4 modified original locked snapshot')
 const ai=new Set(options.teamControl.filter(t=>t.kind==='ai').map(t=>t.teamId))
 const owner=new Map(prepared.combinedInput.riders.map(r=>[r.riderId,r.teamId]))
 const plans=prepared.combinedInput.stagePlans
 const humanBreak=plans.filter(p=>!ai.has(p.teamId))
  .flatMap(p=>p.riders).filter(r=>
   ['attack','join_breakaway'].includes(String(r.commands.phase1))).length
 const aiBreak=plans.filter(p=>ai.has(p.teamId))
  .flatMap(p=>p.riders).filter(r=>
   ['attack','join_breakaway'].includes(String(r.commands.phase1))).length
 const opening=output.roadRaceResolution?.phase1Opening
 const attempts=opening?.attackAttempts??[]
 const accepted=attempts.filter(x=>x.acceptedEscapeLaunch)
 const acceptedAI=accepted.filter(x=>ai.has(owner.get(x.riderId)??''))
 const acceptedHuman=accepted.filter(x=>!ai.has(owner.get(x.riderId)??''))
 const checkpoints=output.replayTimeline.checkpoints
 let groupSample:V4PhysicalEvidence['observedMixedReplayGroupSample']=null
 let mixedCount=0
 let mixedAcceptedBreakawayCount=0
 const humanAcceptedIds=new Set(acceptedHuman.map(x=>x.riderId))
 const aiAcceptedIds=new Set(acceptedAI.map(x=>x.riderId))
 for(const cp of checkpoints){
  for(const g of cp.groups){
   const human=g.riderIds.filter(id=>owner.has(id)&&!ai.has(owner.get(id)!))
   const aic=g.riderIds.filter(id=>ai.has(owner.get(id)??''))
   if(g.displayCode.startsWith('B')&&
      human.some(id=>humanAcceptedIds.has(id))&&
      aic.some(id=>aiAcceptedIds.has(id))){
      mixedAcceptedBreakawayCount++
   }
   if(human.length&&aic.length){
    mixedCount++
    if(!groupSample)groupSample={
     checkpointId:cp.checkpointId,
     groupDisplayCode:g.displayCode,
     humanRiderIds:human.slice(0,5),aiRiderIds:aic.slice(0,5)
    }
   }
  }
 }
 const finish=output.finishResolution.classification
 const replayIssues=output.replaySynchronization.issues??[]
 return {
  version:'v4_readonly_physical_probe_01',
  mode:'in_memory_research_only',
  teamCounts:{ai:prepared.aiTeams,human:prepared.humanTeams},
  selectedTemplateId:prepared.selectedTemplate?.id??null,
  aiIntents:prepared.intents.length,
  humanPhase1BreakawayCommands:humanBreak,
  aiPhase1BreakawayCommands:aiBreak,
  stageId:input.stage.stageId,
  validated:output.validationPassed,
  calculatedPhysicalRace:true,
  firstWaveAttempts:attempts.length,
  acceptedBreakLaunches:accepted.length,
  acceptedHumanBreakLaunches:acceptedHuman.length,
  acceptedAiBreakLaunches:acceptedAI.length,
  firstWaveAcceptedWithBoth:acceptedHuman.length>0&&acceptedAI.length>0,
  openingBreakawayRiderIds:[...(opening?.breakawayRiderIds??[])],
  observedHumanAiSameReplayGroup:mixedCount>0,
  observedSharedGroupCheckpoints:mixedCount,
  observedMixedAcceptedBreakawayGroup:mixedAcceptedBreakawayCount>0,
  observedMixedAcceptedBreakawayCheckpoints:mixedAcceptedBreakawayCount,
  observedMixedReplayGroupSample:groupSample,
  maximumBreakawayGapSeconds:safeNumber(
    output.calibrationSummary?.maximumBreakawayGapSeconds),
  gapAudit:auditV4GapTrajectories(output),
  replayCheckpoints:checkpoints.length,
  replaySynchronized:output.replaySynchronization.synchronized,
  replayIssues:replayIssues.slice(0,20),
  officialFinishClassificationCount:finish.length,
  officialResultHash:digest(finish),
  replayTimelineHash:digest(checkpoints),
  sourceSnapshotHash:before,
  outcomePublished:false,
  officialWrites:0,
  productionDispatcherInvoked:false,
 }
}
