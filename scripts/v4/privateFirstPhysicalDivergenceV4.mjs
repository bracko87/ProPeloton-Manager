/**
 * Research-only provenance of the FIRST replay/physics divergence.
 * No checkpoint IDs, rider identities, distances or group details may escape.
 */
const key=ids=>[...ids].sort().join('\u0000');
const partition=groups=>{
 if(!Array.isArray(groups)||!groups.length)return null;
 const seen=new Set(),members=[];
 for(const g of groups){
  if(!Array.isArray(g?.riderIds)||!g.riderIds.length)return null;
  if(g.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
  g.riderIds.forEach(id=>seen.add(id));
  members.push(key(g.riderIds));
 }
 return {members:members.sort(),ids:[...seen].sort()};
};
const equal=(a,b)=>a.length===b.length&&a.every((id,i)=>id===b[i]);
export function tracePrivateFirstPhysicalDivergenceV4({
 timeline,checkpointId,physicalGroupsAtKm
}={}){
 if(!Array.isArray(timeline?.checkpoints)||!checkpointId||
    typeof physicalGroupsAtKm!=='function')return {status:'UNAVAILABLE'};
 const end=timeline.checkpoints.findIndex(c=>c.checkpointId===checkpointId);
 if(end<0)return {status:'UNAVAILABLE'};
 let priorState='NONE',firstIndex=-1,kind='UNAVAILABLE',alignedBefore=0;
 for(let i=0;i<=end;i++){
  const cp=timeline.checkpoints[i];
  const km=cp.raceProgress?.kmFromStart;
  if(!Number.isFinite(km)||km<0)return {status:'UNAVAILABLE'};
  let physical;
  try{physical=partition(physicalGroupsAtKm(km));}
  catch{return {status:'UNAVAILABLE'};}
  const replay=partition(cp.groups);
  if(!physical||!replay)return {status:'UNAVAILABLE'};
  const aligned=equal(physical.members,replay.members)&&equal(physical.ids,replay.ids);
  if(aligned){
   if(firstIndex<0)alignedBefore++;
   priorState='ALIGNED';
  }else{
   if(firstIndex<0){
    firstIndex=i;
    kind=equal(physical.ids,replay.ids)?'MEMBERSHIP_DRIFT':'RIDER_SET_DRIFT';
    if(i>0&&cp.raceProgress.kmFromStart===
       timeline.checkpoints[i-1].raceProgress?.kmFromStart)
      kind='SAME_KM_'+kind;
    if(cp.commentary?.some(e=>e.eventType==='incident'))
      kind='INCIDENT_'+kind;
   }
   priorState='DIVERGED';
  }
 }
 return {status:firstIndex<0?'ALL_ALIGNED':'FIRST_DIVERGENCE_FOUND',
   firstDivergence:firstIndex<0?'NONE':kind,
   sequence:firstIndex<0?'NONE':firstIndex===0?'FROM_FIRST_CHECKPOINT':
     alignedBefore===0?'NO_PRIOR_ALIGNMENT':'AFTER_PRIOR_ALIGNMENT',
   atFailedCheckpoint:firstIndex===end,
   contiguousDrift:priorState==='DIVERGED',
   inspected:end+1};
}
