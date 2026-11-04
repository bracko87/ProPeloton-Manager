/**
 * Research-only base replay source correction for a checkpoint proven stale
 * before Phase10. Group identities and gaps must come from the existing
 * authoritative physical groupsAtKm sample at the SAME checkpoint distance.
 * No invented narration, movement, incidents, DNF, or official data.
 * The original strict synchronization validator must accept the result.
 */
const partition=groups=>{
 if(!Array.isArray(groups)||groups.length===0)return null;
 const seen=new Set(),rows=[];
 for(const group of groups){
  if(!Array.isArray(group?.riderIds)||group.riderIds.length===0||
   group.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
  for(const id of group.riderIds)seen.add(id);
  rows.push(group);
 }
 return {rows,ids:[...seen].sort(),keys:rows.map(g=>
  [...g.riderIds].sort().join('\u0000')).sort()};
};
const equal=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
export function buildPrivateBasePhysicalSourceV4({
 timeline,baseTimeline,checkpointId,physicalGroupsAtKm,provenance,
 reachedDnfRiderIds
}={}){
 if(provenance?.status!=='INHERITED_BASE_DRIFT'||
  provenance.origin!=='BASE_EVENT'||typeof physicalGroupsAtKm!=='function'||
  !Array.isArray(timeline?.checkpoints)||!Array.isArray(baseTimeline?.checkpoints)||
  !Array.isArray(reachedDnfRiderIds))
  return {status:'PROVENANCE_NOT_CONFIRMED'};
 const i=timeline.checkpoints.findIndex(cp=>cp.checkpointId===checkpointId);
 const original=baseTimeline.checkpoints.find(cp=>cp.checkpointId===checkpointId);
 if(i<1||!original)return {status:'SOURCE_CHECKPOINT_MISSING'};
 const cp=timeline.checkpoints[i],km=cp.raceProgress?.kmFromStart;
 if(!Number.isFinite(km)||km<=0||cp.finalResultsVisible||
  original.finalResultsVisible||cp.checkpointKind!==original.checkpointKind||
  !Array.isArray(cp.groups)||!Array.isArray(cp.gaps)||
  !Array.isArray(cp.riderStates)||!Array.isArray(cp.commentary))
  return {status:'CHECKPOINT_UNSAFE'};
 // Existing catch/merge/finish boundary checkpoints are never rewritten.
 // An ordinary race-status checkpoint is eligible as before. For the
 // remaining P-to-C case, allow ONLY an already recorded group_split, where
 // raw physical snapshots at the event boundary independently establish the
 // split and confirm every mentioned rider actually moved from P to C.
 const neutral=cp.commentary.length===1&&
  cp.commentary[0]?.eventType==='race_status';
 const split=cp.commentary.length===1&&
  cp.commentary[0]?.eventType==='group_split'&&
  cp.checkpointKind==='event';
 if(!neutral&&!split)return {status:'NON_NEUTRAL_EVENT'};
 const dnf=new Set(reachedDnfRiderIds);
 const states=new Map(cp.riderStates.map(row=>[row.riderId,row]));
 if(dnf.size!==reachedDnfRiderIds.length||
  states.size!==cp.riderStates.length||
  [...dnf].some(id=>states.get(id)?.status!=='dnf'))
  return {status:'DNF_UNVERIFIED'};
 let physical;
 try{physical=partition(physicalGroupsAtKm(km));}
 catch{return {status:'PHYSICAL_UNAVAILABLE'};}
 if(split){
  // Never infer a split simply because two distant replay checkpoints
  // disagree. Use an immediate pre-event physical snapshot, not replay data.
  if(dnf.size!==0)return {status:'EVENT_DNF_UNSAFE'};
  const event=cp.commentary[0];
  if(!Array.isArray(event.riderIds)||event.riderIds.length===0||
    new Set(event.riderIds).size!==event.riderIds.length)
    return {status:'EVENT_RIDERS_UNVERIFIED'};
  let beforeSplit;
  try{beforeSplit=partition(physicalGroupsAtKm(Math.max(0,km-0.00001)));}
  catch{return {status:'PHYSICAL_UNAVAILABLE'};}
  if(!physical||!beforeSplit||!equal(beforeSplit.ids,physical.ids)||
     equal(beforeSplit.keys,physical.keys))
    return {status:'EVENT_PHYSICAL_TRANSITION_UNVERIFIED'};
  const byDisplay=(groups)=>{
    const result=new Map();
    for(const group of groups.rows){
      if(typeof group.displayCode!=='string')return null;
      for(const id of group.riderIds)result.set(id,group.displayCode);
    }
    return result;
  };
  const beforeCodes=byDisplay(beforeSplit),afterCodes=byDisplay(physical);
  if(!beforeCodes||!afterCodes)return {status:'EVENT_PHYSICAL_TRANSITION_UNVERIFIED'};
  const moved=[...beforeCodes.keys()].filter(id=>
    beforeCodes.get(id)!==afterCodes.get(id)).sort();
  if(!equal(moved,[...event.riderIds].sort())||
    moved.some(id=>beforeCodes.get(id)!=='P'||
      !/^C[0-9]+$/.test(afterCodes.get(id)??'')))
    return {status:'EVENT_RIDERS_UNVERIFIED'};
 }
 const prior=partition(cp.groups);
 if(!prior||!physical)return {status:'INVALID_PARTITION'};
 const expected=partition(physical.rows.map(g=>({
  riderIds:g.riderIds.filter(id=>!dnf.has(id))
 })).filter(g=>g.riderIds.length));
 if(!expected)return {status:'INVALID_PARTITION'};
 if(!equal(prior.ids,expected.ids))return {status:'RIDER_SET_MISMATCH'};
 if(equal(prior.keys,expected.keys))return {status:'ALREADY_PHYSICAL'};
 const survivors=expected.ids;
 if(survivors.some(id=>states.get(id)?.status!=='racing'))
  return {status:'RIDER_STATUS_UNSAFE'};
 const groups=[],gaps=[],assignment=new Map(),codes=new Set();
 for(const raw of physical.rows){
  const riderIds=raw.riderIds.filter(id=>!dnf.has(id));
  if(riderIds.length===0)continue;
  if(!raw.groupCode||typeof raw.displayCode!=='string'||!raw.displayCode||
    codes.has(raw.displayCode)||!Number.isFinite(raw.gapSeconds)||
    raw.gapSeconds<0)return {status:'PHYSICAL_GROUP_IDENTITY_UNSAFE'};
  codes.add(raw.displayCode);
  const group={
    groupCode:raw.groupCode,displayCode:raw.displayCode,
    physicalLineageId:raw.physicalLineageId??null,
    physicalPosition:raw.physicalPosition,
    colorKey:raw.colorKey,riderIds
  };
  const gap={groupCode:raw.groupCode,displayCode:raw.displayCode,
    gapSeconds:raw.gapSeconds,officialTimeSeconds:null};
  groups.push(group);gaps.push(gap);
  for(const id of riderIds){
   if(assignment.has(id))return {status:'INVALID_PARTITION'};
   assignment.set(id,{group,gap});
  }
 }
 if(assignment.size!==survivors.length)return {status:'INVALID_PARTITION'};
 const riderStates=cp.riderStates.map(row=>{
  const entry=assignment.get(row.riderId);
  return entry?{...row,groupCode:entry.group.groupCode,
    displayCode:entry.group.displayCode,gapSeconds:entry.gap.gapSeconds}:row;
 });
 const checkpoints=timeline.checkpoints.map((row,index)=>index===i?
  {...row,groups,gaps,riderStates}:row);
 return {status:split?'BASE_PHYSICAL_EVENT_CREATED':'BASE_PHYSICAL_SOURCE_CREATED',
  timeline:{...timeline,checkpoints},researchOnly:true,officialWrites:0};
}
