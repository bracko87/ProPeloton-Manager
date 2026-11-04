/**
 * Private, fixed-enum forensics for a failed late post-catch checkpoint.
 * Rider identities and physical snapshots remain inside the isolated worker.
 * This classifies evidence; it never constructs or publishes a transition.
 */
const sorted=ids=>[...ids].sort();
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const physical=groups=>{
 if(!Array.isArray(groups)||!groups.length)return null;
 const seen=new Set(),result=[];
 for(const g of groups){
  if(!Array.isArray(g?.riderIds)||!g.riderIds.length||
     g.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
  for(const id of g.riderIds)seen.add(id);
  result.push(sorted(g.riderIds));
 }
 return {groups:result,all:sorted(seen)};
};
const group=(partition,riderId)=>partition?.groups.filter(g=>g.includes(riderId))??[];
const identical=(a,b)=>a?.groups.length===b?.groups.length&&
 a.groups.every(g=>b.groups.some(h=>same(g,h)));
export function classifyPrivateLatePhysicalMismatchV4({
 timeline,checkpointId,riderId,physicalGroupsAtKm,phase10Stages,
 reachedDnfRiderIds
}={}){
 const unavailable={status:'UNAVAILABLE',transition:'UNAVAILABLE',
  alignment:'UNAVAILABLE',incident:'UNAVAILABLE'};
 if(!Array.isArray(timeline?.checkpoints)||typeof checkpointId!=='string'||
    typeof riderId!=='string'||!riderId||typeof physicalGroupsAtKm!=='function')
    return unavailable;
 const i=timeline.checkpoints.findIndex(cp=>cp.checkpointId===checkpointId);
 if(i<1)return unavailable;
 const before=timeline.checkpoints[i-1],after=timeline.checkpoints[i];
 const k0=before.raceProgress?.kmFromStart,k1=after.raceProgress?.kmFromStart;
 if(!Number.isFinite(k0)||!Number.isFinite(k1)||k0<0||k1<k0)
   return unavailable;
 let p0,p1;
 try{p0=physical(physicalGroupsAtKm(k0));p1=physical(physicalGroupsAtKm(k1));}
 catch{return unavailable;}
 const r0=physical(before.groups),r1=physical(after.groups);
 if(!p0||!p1||!r0||!r1||
    [p0,p1,r0,r1].some(p=>group(p,riderId).length!==1))
   return unavailable;
 const zero=k0===k1;
 const transition=zero?'SAME_DISTANCE_UNOBSERVABLE':
   identical(p0,p1)?'STABLE_PARTITION':
   same(p0.all,p1.all)?'REAL_PARTITION_CHANGE':'RIDER_SET_CHANGED';
 const alignment= !same(p1.all,r1.all)?'RIDER_SET_MISMATCH':
   identical(r0,p0)&&identical(r1,p1)?'BOTH_MATCH':
   identical(r0,p0)?'PREVIOUS_ONLY_MATCH':
   identical(r1,p1)?'CURRENT_ONLY_MATCH':'NEITHER_MATCH';
 const events=(after.commentary??[]).map(c=>c?.eventType);
 const hasIncident=events.includes('incident');
 const hasFinish=events.includes('finish')||after.finalResultsVisible===true;
 const hasTransition=events.some(e=>e==='group_merge'||e==='group_split');
 const nonRacing=(after.riderStates??[]).some(s=>s.status!=='racing');
 let incident='NO_INCIDENT_EVIDENCE';
 if(hasFinish)incident='FINISH_GUARD';
 else if(hasIncident||nonRacing){
   const stage=phase10Stages;
   const initial=physical(stage?.INITIAL);
   const detached=physical(stage?.AFTER_DETACHMENT);
   const dnf=Array.isArray(reachedDnfRiderIds)?new Set(reachedDnfRiderIds):null;
   const beforeMember=group(initial,riderId)[0];
   const afterMember=group(detached,riderId)[0];
   if(!initial||!detached||!beforeMember||!afterMember||!dnf)
     incident='PHASE10_EVIDENCE_MISSING';
   else{
     const missing=beforeMember.filter(id=>!afterMember.includes(id));
     const extra=afterMember.filter(id=>!beforeMember.includes(id));
     incident=extra.length?'PHASE10_GROUP_ADDITION':
       missing.length&&missing.every(id=>dnf.has(id))?'CONFIRMED_DNF_REMOVAL':
       missing.length?'PHASE10_OTHER_REMOVAL':'INCIDENT_WITHOUT_MEMBERSHIP_REMOVAL';
   }
 }else if(hasTransition)incident='EXISTING_TRANSITION';
 return {status:'CLASSIFIED',transition,alignment,incident};
}
