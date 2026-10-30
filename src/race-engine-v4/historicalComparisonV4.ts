/**
 * V4 historical comparator — offline, in-memory, read-only.
 *
 * A historical stage's saved input AND saved output are supplied from a PRIVATE
 * local JSON export. No SQL/Supabase/network calls, no race publisher, no DB.
 * No historical user data is bundled or checked into the repository.
 *
 * The historical command-lock *time* is often unavailable. We explicitly
 * reconstruct the three-hour boundary solely for this retrospective RESEARCH
 * adapter; this is NOT evidence the original cutoff was enforced on time.
 */
import {createHash} from 'node:crypto'
import {runSelectedRaceEngineV1,selectCompleteRaceEngineLaneV1}
 from '../universal-race-engine/runSelectedRaceEngineV1.ts'
import type {UniversalRaceEngineInput,UniversalRaceEngineResult}
 from '../universal-race-engine/runRaceEngine.ts'
import {prepareV4ShadowRace,type V4Options}
 from './templateFirstPlannerV4.ts'

type HistoricRecord={
 readonly status:'completed'
 readonly input_snapshot_json:UniversalRaceEngineInput
 readonly result_summary_json:{
  readonly stage_start_game_at:string
  readonly output_snapshot:{
   readonly universalResult:UniversalRaceEngineResult
  }
 }
 readonly team_control:V4Options['teamControl']
 readonly history?:V4Options['history']
}
export type V4HistoricalComparison={
 readonly researchOnly:true
 readonly officialWrites:0
 readonly historicLockCutoffActuallyVerified:false
 readonly riskWarning:'historical_lock_time_reconstructed_not_proven'
 readonly stageHash:string
 readonly terrain:string
 readonly riderCount:number
 readonly humanTeams:number
 readonly aiTeams:number
 readonly preSimulationTemplate:string|null
 readonly engineLane:string
 readonly savedResultReproducedByCurrentV2:boolean
 readonly savedResultRankStatusGapAgreement:number
 readonly v4ChangedRankCountComparedToCurrentV2:number
 readonly v4ChangedGapCountComparedToCurrentV2:number
 readonly maximumGapSeconds:{
  readonly savedV2:number|null
  readonly currentV2:number|null
  readonly v4Research:number|null
 }
 readonly escapeLaunches:{
  readonly savedV2:number
  readonly currentV2:number
  readonly v4Research:number
 }
 readonly replay:{
  readonly historicalSynchronized:boolean
  readonly currentV2Synchronized:boolean
  readonly v4ResearchSynchronized:boolean
  readonly historicalCheckpoints:number
  readonly v4ResearchCheckpoints:number
 }
 readonly hashes:{
  readonly sourceInputSha256:string
  readonly savedClassificationSha256:string
  readonly currentV2ClassificationSha256:string
  readonly v4ClassificationSha256:string
  readonly v4ReplaySha256:string
 }
}
const sha=(value:unknown)=>createHash('sha256')
 .update(JSON.stringify(value)).digest('hex')
function isRecord(value:unknown):value is Record<string,unknown>{
 return !!value&&typeof value==='object'&&!Array.isArray(value)
}
function ensureTimestamp(raw:string):string{
 if(typeof raw!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(raw))
  throw Error('Historical stage start timestamp missing')
 return /(?:Z|[+-]\d\d:\d\d)$/.test(raw)?raw:raw+'Z'
}
function normalizeClassification(result:UniversalRaceEngineResult){
 const rows=result.finishResolution?.classification
 if(!Array.isArray(rows)||!rows.length)throw Error('Missing historical finish classification')
 return rows.map(row=>({
  riderId:String(row.riderId),rank:Number(row.rank),
  gap:Number(row.gapSeconds??0),status:String(row.status),
  seconds:Number(row.officialTimeSeconds??0),
 })).sort((a,b)=>a.riderId.localeCompare(b.riderId))
}
function maximumGap(result:UniversalRaceEngineResult):number|null{
 const n=result.calibrationSummary?.maximumBreakawayGapSeconds
 return typeof n==='number'&&Number.isFinite(n)?n:null
}
function escapeCount(result:UniversalRaceEngineResult):number {
 return result.roadRaceResolution?.phase1Opening?.attackAttempts
  ?.filter(a=>a.acceptedEscapeLaunch).length??0
}
function rankAgreement(base:ReturnType<typeof normalizeClassification>,
 alt:ReturnType<typeof normalizeClassification>){
 if(base.length!==alt.length)throw Error('Historical result rider count changed')
 const other=new Map(alt.map(r=>[r.riderId,r]))
 let same=0,rankChanges=0,gapChanges=0
 for(const row of base){
  const b=other.get(row.riderId)
  if(!b)throw Error('Historical rider identity mismatch')
  if(row.rank!==b.rank)rankChanges++
  if(Math.abs(row.gap-b.gap)>.01)gapChanges++
  if(row.rank===b.rank&&row.status===b.status&&
   Math.abs(row.gap-b.gap)<=.01&&Math.abs(row.seconds-b.seconds)<=.01)same++
 }
 return {ratio:same/base.length,rankChanges,gapChanges}
}
export function compareHistoricalStageV4(raw:HistoricRecord):V4HistoricalComparison{
 if(!isRecord(raw)||raw.status!=='completed')throw Error('Requires completed historical stage')
 const input=raw.input_snapshot_json
 const saved=raw.result_summary_json?.output_snapshot?.universalResult
 if(!input||!saved||!Array.isArray(input.riders)||!Array.isArray(input.teams)||
    !Array.isArray(input.stagePlans)||!input.stage?.stageId)
   throw Error('Historical full input/output snapshot missing or archived')
 if(input.stage.stageFormat!=='road_race')throw Error('Only historical road races supported')
 if(input.stagePlans.length!==input.teams.length||
    input.stagePlans.some(p=>p.locked!==true||p.status!=='locked'))
   throw Error('Historical commands are not an immutable locked team snapshot')
 if(saved.stageId!==input.stage.stageId||saved.raceId!==input.race.raceId)
   throw Error('Historical stored result does not match input stage')
 if(!Array.isArray(raw.team_control)||raw.team_control.length!==input.teams.length)
   throw Error('Authoritative historical team controller evidence required')
 const map=new Map(raw.team_control.map(x=>[x.teamId,x.kind]))
 if(map.size!==input.teams.length ||
   input.teams.some(t=>!map.has(t.teamId)))
   throw Error('Historical AI/human ownership coverage incomplete')
 // A saved true AI marker contradicting a human entry must fail closed.
 for(const team of input.teams){
  const meta=team.snapshot?.metadata as Record<string,unknown>|undefined
  if(meta?.scenarioAiControlled===true&&map.get(team.teamId)!=='ai')
   throw Error('Saved AI ownership conflicts with historical team entry record')
 }
 const start=ensureTimestamp(raw.result_summary_json.stage_start_game_at)
 const startMs=Date.parse(start)
 if(!Number.isFinite(startMs))throw Error('Invalid historical game start timestamp')
 const cutoff=new Date(startMs-3*60*60*1000).toISOString()
 const lock:V4Options['lock']={
  stageId:input.stage.stageId,snapshotId:'retrospective-'+sha(input).slice(0,24),
  snapshotStatus:'locked',stageStartGameTs:new Date(startMs).toISOString(),
  lockCutoffGameTs:cutoff,snapshotGameTs:cutoff,
 }
 // RECONSTRUCTED CUTOFF = RESEARCH CONVENIENCE, NOT HISTORIC TIMING PROOF.
 const options:V4Options={
  lock,teamControl:raw.team_control,
  gameDate:new Date(startMs).toISOString().slice(0,10),
  history:raw.history??[],
  // Weather features are intentionally omitted unless a future adapter
  // extracts their canonical values with validated semantics.
 }
 const sourceHash=sha(input)
 const planned=prepareV4ShadowRace(input,options)
 const currentV2=runSelectedRaceEngineV1(input)
 const v4=runSelectedRaceEngineV1(planned.combinedInput)
 if(!currentV2.validationPassed||!v4.validationPassed)
  throw Error('Current V2 or research V4 calculation did not validate')
 if(sha(input)!==sourceHash)throw Error('Historical input was mutated')
 const historicalRows=normalizeClassification(saved)
 const v2Rows=normalizeClassification(currentV2)
 const v4Rows=normalizeClassification(v4)
 const historicalBaseline=rankAgreement(historicalRows,v2Rows)
 const changed=rankAgreement(v2Rows,v4Rows)
 return {
  researchOnly:true,officialWrites:0,
  historicLockCutoffActuallyVerified:false,
  riskWarning:'historical_lock_time_reconstructed_not_proven',
  stageHash:sha(input.stage.stageId).slice(0,16),
  terrain:String(input.stage.terrainType),riderCount:input.riders.length,
  humanTeams:planned.humanTeams,aiTeams:planned.aiTeams,
  preSimulationTemplate:planned.selectedTemplate?.id??null,
  engineLane:selectCompleteRaceEngineLaneV1(input.stage),
  savedResultReproducedByCurrentV2:historicalBaseline.ratio===1,
  savedResultRankStatusGapAgreement:Number(historicalBaseline.ratio.toFixed(4)),
  v4ChangedRankCountComparedToCurrentV2:changed.rankChanges,
  v4ChangedGapCountComparedToCurrentV2:changed.gapChanges,
  maximumGapSeconds:{savedV2:maximumGap(saved),
   currentV2:maximumGap(currentV2),v4Research:maximumGap(v4)},
  escapeLaunches:{savedV2:escapeCount(saved),
   currentV2:escapeCount(currentV2),v4Research:escapeCount(v4)},
  replay:{
   historicalSynchronized:saved.replaySynchronization.synchronized,
   currentV2Synchronized:currentV2.replaySynchronization.synchronized,
   v4ResearchSynchronized:v4.replaySynchronization.synchronized,
   historicalCheckpoints:saved.replayTimeline.checkpoints.length,
   v4ResearchCheckpoints:v4.replayTimeline.checkpoints.length,
  },
  hashes:{sourceInputSha256:sourceHash,
   savedClassificationSha256:sha(historicalRows),
   currentV2ClassificationSha256:sha(v2Rows),
   v4ClassificationSha256:sha(v4Rows),
   v4ReplaySha256:sha(v4.replayTimeline.checkpoints)},
 }
}
