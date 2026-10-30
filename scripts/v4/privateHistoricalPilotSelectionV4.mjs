/** Bounded, metadata-only race candidates. Never loads rider data. */
export const TERRAIN_TARGETS=Object.freeze({flat:4,hilly:4,mountain:4,cobbled:1})
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function selectV4HistoricalPilotCandidates(rows,{maxPerTerrain=18}={}){
 if(!Array.isArray(rows)||rows.length>350||!Number.isSafeInteger(maxPerTerrain)||
 maxPerTerrain<1||maxPerTerrain>24)throw Error('Invalid historical pilot selection limits')
 const groups=Object.fromEntries(Object.keys(TERRAIN_TARGETS).map(t=>[t,[]]))
 const rejected={invalid:0,unsupported:0,duplicate:0},seen=new Set()
 for(const row of rows){
  if(!row||typeof row!=='object'||!uuid.test(String(row.stage_id??''))||
   typeof row.completed_at!=='string'||!Number.isFinite(Date.parse(row.completed_at))){
   rejected.invalid++;continue
  }
  if(seen.has(row.stage_id)){rejected.duplicate++;continue}
  seen.add(row.stage_id)
  if(row.stage_format!=='road_race'||!(row.terrain in groups)){
   rejected.unsupported++;continue
  }
  if(groups[row.terrain].length<maxPerTerrain)groups[row.terrain].push(row.stage_id)
 }
 return {groups,rejected,metadataRows:rows.length,potential:Object.fromEntries(
  Object.entries(groups).map(([k,v])=>[k,v.length]))}
}
