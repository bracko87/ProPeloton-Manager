/** Bounded metadata-only candidate selection. Never loads rider data. */
export const TERRAIN_TARGETS=Object.freeze({flat:4,hilly:4,mountain:4,cobbled:1})
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const terrainKeys=Object.keys(TERRAIN_TARGETS)
const newCounts=()=>({passed:0,unknown:0,unsynchronized:0,teamStructure:0,entryMapping:0})
export function selectV4HistoricalPilotCandidates(rows,{maxPerTerrain=18}={}){
 if(!Array.isArray(rows)||rows.length>350||!Number.isSafeInteger(maxPerTerrain)||
  maxPerTerrain<1||maxPerTerrain>24)throw Error('Invalid historical pilot selection limits')
 const prioritized=Object.fromEntries(terrainKeys.map(t=>[t,[]]))
 const fallback=Object.fromEntries(terrainKeys.map(t=>[t,[]]))
 const preflight=Object.fromEntries(terrainKeys.map(t=>[t,newCounts()]))
 const rejected={invalid:0,unsupported:0,duplicate:0},seen=new Set()
 for(const row of rows){
  if(!row||typeof row!=='object'||!uuid.test(String(row.stage_id??''))||
   typeof row.completed_at!=='string'||!Number.isFinite(Date.parse(row.completed_at))){
   rejected.invalid++;continue
  }
  if(seen.has(row.stage_id)){rejected.duplicate++;continue}
  seen.add(row.stage_id)
  if(row.stage_format!=='road_race'||!terrainKeys.includes(row.terrain)){
   rejected.unsupported++;continue
  }
  const counts=preflight[row.terrain]
  // False values are explicit negative evidence; missing hints are not.
  if(row.saved_replay_synchronized===false){counts.unsynchronized++;continue}
  if(row.team_count!==null&&row.team_count!==undefined&&
    (!Number.isSafeInteger(row.team_count)||row.team_count<2||row.team_count>40)){
   counts.teamStructure++;continue
  }
  // All-entry mapping is stronger than checking just the first team. When
  // unavailable in older metadata clients, retain the original preflight hint.
  const mapping=row.all_entries_mapped??row.first_entry_mappable
  if(mapping===false){counts.entryMapping++;continue}
  if(row.saved_replay_synchronized===true&&
    Number.isSafeInteger(row.team_count)&&row.team_count>=2&&row.team_count<=40&&
    mapping===true){
   counts.passed++
   prioritized[row.terrain].push(row.stage_id)
  }else{
   counts.unknown++
   fallback[row.terrain].push(row.stage_id)
  }
 }
 const groups=Object.fromEntries(terrainKeys.map(t=>
  [t,prioritized[t].concat(fallback[t]).slice(0,maxPerTerrain)]))
 return {groups,rejected,preflight,metadataRows:rows.length,
  potential:Object.fromEntries(terrainKeys.map(t=>[t,groups[t].length]))}
}
