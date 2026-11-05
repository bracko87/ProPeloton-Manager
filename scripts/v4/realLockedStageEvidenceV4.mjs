/**
 * V4 real-stage evidence preflight. RESEARCH ONLY.
 *
 * A pure, fail-closed adapter for data a trusted read-only DB exporter supplies.
 * This module does NOT connect to Supabase, execute SQL, write race state, or
 * approve a real stage. A legacy completed simulation snapshot is not a
 * substitute for a persisted immutable FULL-stage input at the three-hour lock.
 *
 * Returned reports contain only categorical/aggregate fields, never IDs,
 * rider details, input snapshots, hashes, plan tactics, or raw errors.
 */
import {createHash} from 'node:crypto'

export const V4_REAL_LOCK_PROOF_CONTRACT = 'ppm.v4.real-locked-stage-proof.v1'
const terrains = new Set(['flat','hilly','mountain','cobbled'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isObj = x => x!==null && typeof x==='object' && !Array.isArray(x)
const dateMs = x => typeof x==='string' ? Date.parse(x) : NaN
const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex')

function report(status, counts={}) {
 return {
  contract:V4_REAL_LOCK_PROOF_CONTRACT,
  status,researchOnly:true,officialWrites:0,productionEnabled:false,
  strictReplayPassed:false,realShadowExecuted:false,
  lockedPlans:Number.isSafeInteger(counts.plans)?counts.plans:0,
  humanTeams:Number.isSafeInteger(counts.humans)?counts.humans:null,
  aiTeams:Number.isSafeInteger(counts.ai)?counts.ai:null
 }
}
function checkCore(e) {
 const stage=e?.stage
 if(!isObj(stage)||!uuid.test(stage.stageId)||!uuid.test(stage.raceId)||
    stage.stageFormat!=='road_race'||!terrains.has(stage.terrainType))
  return null
 const start=dateMs(stage.stageStartGameTs)
 if(!Number.isFinite(start))return null
 const cutoff=start-3*3600*1000
 if(!Array.isArray(e.lockedPlans)||!e.lockedPlans.length||
    !Array.isArray(e.authoritativeEntries)||!e.authoritativeEntries.length)
  return null
 const planClubs=new Set()
 for(const row of e.lockedPlans) {
  if(!isObj(row)||row.status!=='locked'||row.stage_id!==stage.stageId||
     row.race_id!==stage.raceId||!row.locked_at)return null
  const v=row.engine_stage_payload_json,m=row.metadata
  if(!isObj(v)||!isObj(m)||v.immutable!==true||
     v.snapshot_schema_version!=='race_engine_stage_plan_input_snapshot_v1'||
     v.stage_id!==stage.stageId||v.race_id!==stage.raceId||
     !uuid.test(v.club_id)||planClubs.has(v.club_id)||
     typeof v.snapshot_hash!=='string'||!/^[0-9a-f]{32}$/i.test(v.snapshot_hash)||
     v.snapshot_hash!==m.engine_stage_payload_snapshot_hash||
     !isObj(v.source_hashes)||!Object.keys(v.source_hashes).length||
     dateMs(v.stage_start_game_ts)!==start||
     dateMs(v.lock_game_ts)!==cutoff||
     !(dateMs(v.built_at_game_ts)>=cutoff&&dateMs(v.built_at_game_ts)<start))
   return null
  planClubs.add(v.club_id)
 }
 const entries=new Map()
 for(const eRow of e.authoritativeEntries) {
  if(!isObj(eRow)||!uuid.test(eRow.race_team_entry_id)||
     eRow.race_id!==stage.raceId||entries.has(eRow.race_team_entry_id)||
     !uuid.test(eRow.participating_club_id))
   return null
  entries.set(eRow.race_team_entry_id,eRow)
 }
 return {stage,start,cutoff,planClubs,entries}
}
/**
 * A positive result is only ELIGIBILITY FOR OFFLINE SHADOW, not execution,
 * replay validation, sporting realism approval, or authorization to publish.
 *
 * completeLockSnapshot must originate from a separately authenticated,
 * read-only immutable full-stage input store. A caller assertion alone does
 * not establish trusted DB provenance; the exporter must verify it.
 */
export function auditV4RealLockedStageEvidence(evidence) {
 const core=checkCore(evidence)
 if(!core)return report('V4_LOCK_PROOF_REJECTED')
 const base={plans:evidence.lockedPlans.length}
 const snap=evidence.completeLockSnapshot
 if(snap===undefined||snap===null)
  return report('V4_FULL_STAGE_LOCKED_INPUT_MISSING',base)
 if(!isObj(snap)||snap.sourceKind!=='immutable_full_stage_lock'||
    snap.status!=='locked'||snap.immutable!==true||
    snap.stageId!==core.stage.stageId||snap.raceId!==core.stage.raceId||
    !uuid.test(snap.snapshotId)||dateMs(snap.stageStartGameTs)!==core.start||
    dateMs(snap.lockCutoffGameTs)!==core.cutoff||
    !(dateMs(snap.snapshotGameTs)>=core.cutoff&&
      dateMs(snap.snapshotGameTs)<core.start)||
    typeof snap.inputSha256!=='string'||!/^[0-9a-f]{64}$/i.test(snap.inputSha256))
  return report('V4_FULL_STAGE_LOCK_PROVENANCE_REJECTED',base)
 const input=snap.input
 if(!isObj(input)||!isObj(input.race)||!isObj(input.stage)||
    input.race.raceId!==core.stage.raceId||
    input.stage.stageId!==core.stage.stageId||
    input.stage.stageFormat!==core.stage.stageFormat||
    input.stage.terrainType!==core.stage.terrainType||
    !Array.isArray(input.teams)||!Array.isArray(input.stagePlans)||
    !Array.isArray(input.riders)||!input.riders.length||
    input.teams.length!==core.entries.size||
    input.stagePlans.length!==input.teams.length||
    digest(input)!==snap.inputSha256)
  return report('V4_FULL_STAGE_LOCKED_INPUT_REJECTED',base)
 const teamIds=new Set(),plans=new Set(),entryIds=new Set()
 let humans=0,ai=0
 for(const plan of input.stagePlans) {
  if(!isObj(plan)||!plan.teamId||plans.has(plan.teamId)||
     plan.status!=='locked'||plan.locked!==true||
     !Array.isArray(plan.riders))return report('V4_INPUT_TEAM_OWNERSHIP_REJECTED',base)
  plans.add(plan.teamId)
 }
 for(const team of input.teams) {
  if(!isObj(team)||!team.teamId||teamIds.has(team.teamId)||
     !plans.has(team.teamId)||!uuid.test(team.raceTeamEntryId)||
     entryIds.has(team.raceTeamEntryId))
   return report('V4_INPUT_TEAM_OWNERSHIP_REJECTED',base)
  const entry=core.entries.get(team.raceTeamEntryId)
  if(!entry||entry.participating_club_id!==team.participatingClubId)
   return report('V4_INPUT_TEAM_OWNERSHIP_REJECTED',base)
  teamIds.add(team.teamId);entryIds.add(team.raceTeamEntryId)
  const isAi=entry.is_ai_filler===true||
   ['ai','ai_fill','ai_filler'].includes(String(entry.entry_source??'').toLowerCase())
  if(isAi)ai++
  else {
   humans++
   if(!core.planClubs.has(entry.participating_club_id))
    return report('V4_INPUT_TEAM_OWNERSHIP_REJECTED',base)
  }
 }
 if(teamIds.size!==core.entries.size||humans+ai!==teamIds.size||!ai)
  return report('V4_INPUT_TEAM_OWNERSHIP_REJECTED',base)
 return report('V4_REAL_INPUT_CANDIDATE_ONLY',{...base,humans,ai})
}
/**
 * Private in-process handoff, only after audit. Never print or commit the
 * returned envelope; run with runIsolatedShadowV4.mjs on an owner-controlled
 * machine. This does not itself prove database provenance or strict replay.
 */
export function prepareV4RealLockedShadowEnvelope(evidence) {
 const gate=auditV4RealLockedStageEvidence(evidence)
 if(gate.status!=='V4_REAL_INPUT_CANDIDATE_ONLY')
  throw Error('V4_REAL_INPUT_PROOF_REJECTED')
 const snap=evidence.completeLockSnapshot
 const byEntry=new Map(evidence.authoritativeEntries.map(e=>[e.race_team_entry_id,e]))
 const teamControl=snap.input.teams.map(t=>{
  const e=byEntry.get(t.raceTeamEntryId)
  const ai=e.is_ai_filler===true||
   ['ai','ai_fill','ai_filler'].includes(String(e.entry_source??'').toLowerCase())
  return {teamId:t.teamId,kind:ai?'ai':'human'}
 })
 return {input:snap.input,options:{
  lock:{stageId:snap.stageId,snapshotId:snap.snapshotId,
   snapshotStatus:'locked',
   stageStartGameTs:snap.stageStartGameTs,
   lockCutoffGameTs:snap.lockCutoffGameTs,
   snapshotGameTs:snap.snapshotGameTs},
  teamControl,gameDate:snap.stageStartGameTs.slice(0,10)
 }}
}
