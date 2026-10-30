/**
 * V4 historical PRIVATE export. Explicit read-only queries and private file.
 * Usage: PPM_V4_RESEARCH_URL=... PPM_V4_RESEARCH_READ_KEY=...
 *        node scripts/v4/privateHistoricalExportV4.mjs <stage-id-uuid>
 *
 * Use a dedicated least-privilege credential and keep the resulting JSON file
 * outside the public repository; do NOT use an API key in chat or CI logs.
 */
import {createHash} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createClient} from '@supabase/supabase-js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const projectOrigin='https://okuravitxocyevkexfgi.supabase.co'
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const hash=value=>createHash('sha256').update(String(value)).digest('hex').slice(0,16)
const isAi=row=>row.is_ai_filler===true||
 ['ai','ai_fill','ai_filler'].includes(String(row.entry_source??'').toLowerCase())

/** Strictly derives controllers from original race entry records, not tactics. */
export function preparePrivateHistoricalEnvelope(run,entries,stageId){
 if(!isObj(run)||run.status!=='completed'||run.stage_id!==stageId)
  throw Error('Not an exact completed historical run')
 const input=run.input_snapshot_json,summary=run.result_summary_json
 if(!isObj(input)||!Array.isArray(input.teams)||!Array.isArray(input.stagePlans)||
   !Array.isArray(input.riders)||input.riders.length<2||
   !isObj(summary?.output_snapshot?.universalResult)||
   input.stage?.stageFormat!=='road_race'||input.stage?.stageId!==stageId||
   input.race?.raceId!==run.race_id||!summary.stage_start_game_at)
  throw Error('Historical full immutable road race input/output is missing or archived')
 if(input.stagePlans.length!==input.teams.length||
   input.stagePlans.some(p=>p.status!=='locked'||p.locked!==true))
  throw Error('Historical stage commands are not fully locked')
 const byEntry=new Map()
 for(const row of entries){
  const id=row.race_team_entry_id
  if(!id||byEntry.has(id)||row.race_id!==run.race_id)
   throw Error('Ambiguous or foreign authoritative race entry')
  byEntry.set(id,row)
 }
 const controls=[],seenTeams=new Set(),seenEntries=new Set()
 for(const team of input.teams){
  const teamId=team.teamId,entryId=team.raceTeamEntryId
  if(!teamId||seenTeams.has(teamId)||!entryId||seenEntries.has(entryId)||
     !byEntry.has(entryId))throw Error('Incomplete authoritative ownership mapping; abort')
  seenTeams.add(teamId);seenEntries.add(entryId)
  const entry=byEntry.get(entryId)
  if(entry.participating_club_id&&team.participatingClubId&&
    entry.participating_club_id!==team.participatingClubId)
    throw Error('Historical entry club identity mismatch')
  const ai=isAi(entry)
  const marker=team.snapshot?.metadata?.scenarioAiControlled
  if(typeof marker==='boolean'&&marker!==ai)
    throw Error('Historical AI ownership marker conflicts with authoritative entry')
  controls.push({teamId,kind:ai?'ai':'human'})
 }
 const plans=new Set(input.stagePlans.map(p=>p.teamId))
 if(plans.size!==controls.length||controls.some(t=>!plans.has(t.teamId)))
  throw Error('Stage plan teams do not match authoritative participating teams')
 return {status:'completed',input_snapshot_json:input,result_summary_json:{
  stage_start_game_at:summary.stage_start_game_at,
  output_snapshot:{universalResult:summary.output_snapshot.universalResult}},
  team_control:controls}
}

/** Store a prevalidated snapshot in a private local OS temporary file. */
export function storePrivateHistoricalEnvelopeV4(run,entries,stageId){
 const envelope=preparePrivateHistoricalEnvelope(run,entries,stageId)
 const folder=mkdtempSync(join(tmpdir(),'ppm-v4-private-history-'))
 const path=join(folder,'historical-'+hash(stageId)+'.json')
 writeFileSync(path,JSON.stringify(envelope),{encoding:'utf8',flag:'wx',mode:0o600})
 return {privatePath:path,stageToken:hash(stageId),
  riders:run.input_snapshot_json.riders.length,teams:envelope.team_control.length,
  aiTeams:envelope.team_control.filter(t=>t.kind==='ai').length,
  humanTeams:envelope.team_control.filter(t=>t.kind==='human').length}
}
/** Requires an operator-provided SELECT-authorized credential; no writes. */
export async function exportPrivateHistoricalStage({stageId,url,key,clientFactory=createClient}){
 if(!UUID.test(String(stageId??'')))throw Error('Stage ID must be a valid UUID')
 if(!url||!key)throw Error('Private read-only Supabase credentials are required')
 const endpoint=new URL(url)
 if(endpoint.origin!==projectOrigin||!['','/'].includes(endpoint.pathname)||
    endpoint.search||endpoint.hash||endpoint.username||endpoint.password)
  throw Error('Export credentials may only be used against the ProPeloton Supabase origin')
 const db=clientFactory(url,key,{auth:{
  autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}})
 const {data:runs,error:runsError}=await db.from('race_stage_simulation_runs')
  .select('stage_id,race_id,status,input_snapshot_json,result_summary_json')
  .eq('stage_id',stageId).eq('status','completed').limit(2)
 if(runsError)throw Error('Completed historical read denied: '+(runsError.code??'DB_READ'))
 if(!Array.isArray(runs)||runs.length!==1)
  throw Error('Expected exactly one completed run; absent or ambiguous stage')
 const input=runs[0].input_snapshot_json
 if(!isObj(input)||!Array.isArray(input.teams)||!input.teams.length)
  throw Error('Completed input snapshot missing or compacted')
 const ids=input.teams.map(t=>t.raceTeamEntryId)
 if(ids.some(id=>!UUID.test(String(id??''))))
  throw Error('Archived stage has unmappable team entries')
 const {data:entries,error:entriesError}=await db.from('race_participant_teams_v1')
  .select('race_team_entry_id,race_id,participating_club_id,club_id,entry_source,is_ai_filler')
  .eq('race_id',runs[0].race_id).in('race_team_entry_id',ids)
 if(entriesError)throw Error('Authoritative team entry read denied: '+(entriesError.code??'DB_READ'))
 return storePrivateHistoricalEnvelopeV4(runs[0],entries??[],stageId)
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try {
  const out=await exportPrivateHistoricalStage({
   stageId:process.argv[2],
   url:process.env.PPM_V4_RESEARCH_URL,
   key:process.env.PPM_V4_RESEARCH_READ_KEY})
  console.log('PRIVATE_READ_ONLY_EXPORT '+JSON.stringify(out))
  console.log('Keep this JSON outside the repository and remove it after analysis.')
 }catch(error){
  console.error('PRIVATE_READ_ONLY_EXPORT_REJECTED '+(error?.message??String(error)))
  process.exitCode=1
 }
}
