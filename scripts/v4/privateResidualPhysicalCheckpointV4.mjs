/**
 * Research-only repair of ONE stale pre-transfer checkpoint. The repaired
 * snapshot must be bracketed by authoritative, identical physical partitions
 * and the later replay checkpoint must already match physics. No narrated
 * movement, incidents, rider status, energy, results, or race physics changes.
 * All final acceptance remains with the ORIGINAL strict publication policy.
 */
const partition=groups=>{
 if(!Array.isArray(groups)||!groups.length)return null;
 const seen=new Set(),rows=[],keys=[],codes=new Set();
 for(const g of groups){
  if(!Array.isArray(g?.riderIds)||!g.riderIds.length||
     g.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
  g.riderIds.forEach(id=>seen.add(id));
  rows.push(g);keys.push([...g.riderIds].sort().join('\u0000'));
 }
 return {rows,keys:keys.sort(),ids:[...seen].sort()};
};
const eq=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const same=(a,b)=>a&&b&&eq(a.keys,b.keys)&&eq(a.ids,b.ids);
const passive=new Set(['race_status','late_chase','bridge_progress',
 'peloton_control','kom','intermediate_sprint','bonus_sprint']);
export function buildPrivateResidualPhysicalCheckpointV4({
 timeline,checkpointId,residualCheckpointId,physicalGroupsAtKm
}={}){
 if(!Array.isArray(timeline?.checkpoints)||
    typeof checkpointId!=='string'||!checkpointId||
    typeof residualCheckpointId!=='string'||!residualCheckpointId||
    typeof physicalGroupsAtKm!=='function')
  return {status:'INVALID_INPUT'};
 const checkpoints=timeline.checkpoints;
 const i=checkpoints.findIndex(cp=>cp.checkpointId===checkpointId);
 if(i<1||i+1>=checkpoints.length||
    checkpoints[i+1].checkpointId!==residualCheckpointId)
  return {status:'NOT_ADJACENT'};
 const cp=checkpoints[i],next=checkpoints[i+1];
 const km=cp.raceProgress?.kmFromStart,kmNext=next.raceProgress?.kmFromStart;
 if(!Number.isFinite(km)||km<=0||!Number.isFinite(kmNext)||kmNext<km)
  return {status:'INVALID_DISTANCE'};
 if(cp.finalResultsVisible||next.finalResultsVisible||
    !['base','event'].includes(cp.checkpointKind)||
    !Array.isArray(cp.commentary)||!cp.commentary.every(c=>passive.has(c?.eventType))||
    !Array.isArray(cp.incidents)||cp.incidents.length>0||
    !Array.isArray(cp.groups)||!Array.isArray(cp.gaps)||
    !Array.isArray(cp.riderStates)||!Array.isArray(next.groups))
  return {status:'CAUSAL_OR_INCIDENT_UNSAFE'};
 let before,at,later;
 try{
  before=partition(physicalGroupsAtKm(Math.max(0,km-0.00001)));
  at=partition(physicalGroupsAtKm(km));
  later=partition(physicalGroupsAtKm(kmNext));
 }catch{return {status:'PHYSICAL_UNAVAILABLE'};}
 const stale=partition(cp.groups),current=partition(next.groups);
 if(!before||!at||!later||!stale||!current)
  return {status:'INVALID_PARTITION'};
 if(!same(before,at)||!same(at,later))
  return {status:'PHYSICAL_MOVEMENT_PRESENT'};
 if(!same(current,later))
  return {status:'CURRENT_NOT_PHYSICAL'};
 if(!eq(stale.ids,at.ids))
  return {status:'RIDER_SET_MISMATCH'};
 if(same(stale,at))
  return {status:'ALREADY_PHYSICAL'};
 const stateIds=new Set(),byId=new Map();
 for(const row of cp.riderStates){
  if(typeof row?.riderId!=='string'||stateIds.has(row.riderId)||
     row.status!=='racing')return {status:'RIDER_STATE_UNSAFE'};
  stateIds.add(row.riderId);
 }
 if(!eq([...stateIds].sort(),at.ids))
  return {status:'RIDER_STATE_UNSAFE'};
 const physicalCodes=new Set(),groupRows=[],gapRows=[];
 for(const raw of at.rows){
  if(typeof raw.groupCode!=='string'||!raw.groupCode||
     typeof raw.displayCode!=='string'||!raw.displayCode||
     physicalCodes.has(raw.displayCode)||
     !Number.isFinite(raw.gapSeconds)||raw.gapSeconds<0)
   return {status:'PHYSICAL_GROUP_IDENTITY_UNSAFE'};
  physicalCodes.add(raw.displayCode);
  // A stable partition must also carry stable authoritative group identities.
  const matchingLater=later.rows.find(g=>eq([...g.riderIds].sort(),
    [...raw.riderIds].sort()));
  if(!matchingLater||matchingLater.displayCode!==raw.displayCode||
     matchingLater.groupCode!==raw.groupCode)
   return {status:'PHYSICAL_GROUP_IDENTITY_UNSAFE'};
  const group={groupCode:raw.groupCode,displayCode:raw.displayCode,
   physicalLineageId:raw.physicalLineageId??null,
   physicalPosition:raw.physicalPosition,colorKey:raw.colorKey,
   riderIds:[...raw.riderIds]};
  const gap={groupCode:raw.groupCode,displayCode:raw.displayCode,
   gapSeconds:raw.gapSeconds,officialTimeSeconds:null};
  groupRows.push(group);gapRows.push(gap);
  for(const id of raw.riderIds)byId.set(id,{group,gap});
 }
 const riderStates=cp.riderStates.map(row=>{
  const mapping=byId.get(row.riderId);
  return {...row,groupCode:mapping.group.groupCode,
   displayCode:mapping.group.displayCode,
   gapSeconds:mapping.gap.gapSeconds};
 });
 const repaired=checkpoints.map((row,j)=>j===i?
  {...row,groups:groupRows,gaps:gapRows,riderStates}:row);
 return {status:'RESIDUAL_PHYSICAL_CHECKPOINT_CREATED',
  timeline:{...timeline,checkpoints:repaired},
  researchOnly:true,officialWrites:0};
}
