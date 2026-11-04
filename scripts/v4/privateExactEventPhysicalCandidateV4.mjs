/**
 * Private-only synthetic Phase10 exact-event repair. Never invent groups,
 * rider movement, incident narration or gaps. A later independently
 * physical-aligned replay checkpoint supplies group identities ONLY if it
 * describes the same partition already reached at the exact event.
 * All group gaps must independently match the physical event sample.
 * The ordinary strict synchronization validator decides acceptance.
 */
const partition=groups=>{
 if(!Array.isArray(groups)||!groups.length)return null;
 const seen=new Set(),records=[];
 for(const group of groups){
  if(!Array.isArray(group?.riderIds)||!group.riderIds.length||
   group.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
  group.riderIds.forEach(id=>seen.add(id));
  records.push({key:[...group.riderIds].sort().join('\u0000'),group});
 }
 return {records,ids:[...seen].sort(),keys:records.map(r=>r.key).sort()};
};
const equal=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const same=(a,b)=>a&&b&&equal(a.ids,b.ids)&&equal(a.keys,b.keys);
export function buildPrivateExactEventPhysicalCandidateV4({
 timeline,checkpointId,physicalGroupsAtKm,baseTimeline,provenance,
 reachedDnfRiderIds
}={}){
 if(provenance?.status!=='EXACT_INHERITED_STALE_BASE_MEMBERSHIP'||
  provenance.interval!=='CHANGED_BEFORE_EVENT'||
  typeof physicalGroupsAtKm!=='function'||
  !Array.isArray(timeline?.checkpoints)||!Array.isArray(baseTimeline?.checkpoints)||
  !Array.isArray(reachedDnfRiderIds))
  return {status:'PROVENANCE_NOT_CONFIRMED'};
 const i=timeline.checkpoints.findIndex(cp=>cp.checkpointId===checkpointId);
 if(i<1||i+1>=timeline.checkpoints.length)return {status:'CHECKPOINT_UNAVAILABLE'};
 const cp=timeline.checkpoints[i],future=timeline.checkpoints[i+1];
 if(!cp.checkpointId.includes(':phase10-exact:')||cp.finalResultsVisible||
  future.finalResultsVisible||!Number.isFinite(cp.raceProgress?.kmFromStart)||
  !Number.isFinite(future.raceProgress?.kmFromStart)||
  future.raceProgress.kmFromStart<=cp.raceProgress.kmFromStart||
  !Array.isArray(cp.commentary)||!Array.isArray(cp.gaps)||
  !Array.isArray(cp.riderStates)||!Array.isArray(future.gaps)||
  !Array.isArray(future.groups))return {status:'CHECKPOINT_UNSAFE'};
 // A real incident at the exact checkpoint must remain represented by its
 // existing state and may not be synthesized by a membership-only repair.
 if(cp.commentary.some(e=>e.eventType==='group_merge'||e.eventType==='group_split'))
  return {status:'EXISTING_TRANSITION'};
 const reached=new Set(reachedDnfRiderIds);
 if(reached.size!==reachedDnfRiderIds.length)return {status:'DNF_UNVERIFIED'};
 const states=new Map(cp.riderStates.map(s=>[s.riderId,s]));
 if(states.size!==cp.riderStates.length||
  [...reached].some(id=>states.get(id)?.status!=='dnf'))
  return {status:'DNF_UNVERIFIED'};
 let physical,physicalFuture;
 try{
  physical=partition(physicalGroupsAtKm(cp.raceProgress.kmFromStart));
  physicalFuture=partition(physicalGroupsAtKm(future.raceProgress.kmFromStart));
 }catch{return {status:'PHYSICAL_UNAVAILABLE'};}
 const target=partition(future.groups),old=partition(cp.groups);
 if(!physical||!physicalFuture||!target||!old)return {status:'INVALID_GROUPS'};
 const survivors=partition(physical.records.map(r=>({
  riderIds:r.group.riderIds.filter(id=>!reached.has(id))
 })).filter(g=>g.riderIds.length));
 const futureSurvivors=partition(physicalFuture.records.map(r=>({
  riderIds:r.group.riderIds.filter(id=>!reached.has(id))
 })).filter(g=>g.riderIds.length));
 if(!survivors||!futureSurvivors||!same(survivors,target)||
  !same(survivors,futureSurvivors))
  return {status:'FUTURE_GROUPS_NOT_PHYSICAL'};
 if(!equal(old.ids,survivors.ids))return {status:'RIDER_SET_CHANGED'};
 if(same(old,survivors))return {status:'ALREADY_PHYSICAL'};
 const gapMap=new Map(future.gaps.map(g=>[g.displayCode,g]));
 if(gapMap.size!==future.gaps.length||gapMap.size!==target.records.length)
  return {status:'AMBIGUOUS_GAPS'};
 const mapped=new Map(),groups=[],gaps=[];
 for(const {group} of target.records){
  const gap=gapMap.get(group.displayCode);
  const match=physical.records.find(r=>group.riderIds.every(id=>r.group.riderIds.includes(id))&&
    r.group.riderIds.filter(id=>!reached.has(id)).length===group.riderIds.length);
  // Reusing a gap from a different kilometre is unsafe unless independently
  // verified against the physical gap at this exact event.
  if(!match||!gap||gap.groupCode!==group.groupCode||
    !Number.isFinite(match.group.gapSeconds)||
    !Number.isFinite(gap.gapSeconds)||
    Math.abs(match.group.gapSeconds-gap.gapSeconds)>0.000001)
    return {status:'PHYSICAL_GAP_MISMATCH'};
  groups.push({...group,riderIds:[...group.riderIds]});
  gaps.push({...gap,officialTimeSeconds:null});
  for(const id of group.riderIds){
   if(mapped.has(id))return {status:'INVALID_GROUPS'};
   mapped.set(id,{group,gap});
  }
 }
 if(mapped.size!==survivors.ids.length||
  [...mapped.keys()].some(id=>states.get(id)?.status!=='racing'))
  return {status:'RIDER_STATUS_UNSAFE'};
 const riderStates=cp.riderStates.map(s=>{
  const membership=mapped.get(s.riderId);
  return membership?{...s,groupCode:membership.group.groupCode,
   displayCode:membership.group.displayCode,gapSeconds:membership.gap.gapSeconds}:s;
 });
 const checkpoints=timeline.checkpoints.map((row,index)=>index===i?
  {...row,groups,gaps,riderStates}:row);
 return {status:'EXACT_EVENT_CANDIDATE_CREATED',
  timeline:{...timeline,checkpoints},officialWrites:0,researchOnly:true};
}
