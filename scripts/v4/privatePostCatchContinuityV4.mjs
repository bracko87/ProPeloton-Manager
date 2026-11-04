/**
 * Private post-catch checkpoint continuity audit. A physically correct
 * final group can still have an unexplained change from an earlier replay
 * checkpoint. This code never changes commentary or rider membership.
 */
const partition=groups=>{
 if(!Array.isArray(groups)||!groups.length)return null;
 const seen=new Set(),pairs=[],all=[];
 for(const g of groups){
  if(!Array.isArray(g?.riderIds)||!g.riderIds.length||
   g.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
  g.riderIds.forEach(id=>{seen.add(id);all.push(id)});
  pairs.push([...g.riderIds].sort().join('\u0000'));
 }
 return {pairs:pairs.sort(),all:all.sort()};
};
const eq=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
const same=(a,b)=>!!a&&!!b&&eq(a.pairs,b.pairs)&&eq(a.all,b.all);
export function classifyPrivatePostCatchContinuityV4({
 timeline,checkpointId,physicalGroupsAtKm
}={}){
 if(!Array.isArray(timeline?.checkpoints)||!checkpointId||
  typeof physicalGroupsAtKm!=='function')return {status:'UNAVAILABLE'};
 const i=timeline.checkpoints.findIndex(c=>c.checkpointId===checkpointId);
 if(i<1)return {status:'UNAVAILABLE'};
 const before=timeline.checkpoints[i-1],after=timeline.checkpoints[i];
 const km0=before.raceProgress?.kmFromStart,km1=after.raceProgress?.kmFromStart;
 if(!Number.isFinite(km0)||!Number.isFinite(km1)||km1<km0)
  return {status:'UNAVAILABLE'};
 let p0,p1;
 try{p0=partition(physicalGroupsAtKm(km0));p1=partition(physicalGroupsAtKm(km1));}
 catch{return {status:'UNAVAILABLE'};}
 const r0=partition(before.groups),r1=partition(after.groups);
 if(!p0||!p1||!r0||!r1)return {status:'UNAVAILABLE'};
 const phys=same(p0,p1)?'PHYSICALLY_STABLE':
  km0===km1?'SAME_KM_AMBIGUOUS':'PHYSICAL_CHANGE';
 const source=!same(p0,r0)?'PREVIOUS_MISMATCH':
  !same(p1,r1)?'CURRENT_MISMATCH':'BOTH_ALIGNED';
 const movement=!same(r0,r1)?'PRESENTATION_MEMBERSHIP_CHANGE':'NO_MEMBERSHIP_CHANGE';
 const previousEvents=Array.isArray(before.commentary)?before.commentary:[];
 const currentEvents=Array.isArray(after.commentary)?after.commentary:[];
 const eventTypes=new Set(currentEvents.map(c=>c.eventType));
 const commentary=eventTypes.has('group_merge')||eventTypes.has('group_split')?
  'EXPLICIT_GROUP_TRANSITION':eventTypes.has('incident')?
  'INCIDENT_ONLY':'NO_PHYSICAL_TRANSITION_COMMENTARY';
 const priorIncident=previousEvents.some(e=>e.eventType==='incident')?
  'PRIOR_INCIDENT':'NO_PRIOR_INCIDENT';
 return {status:'CLASSIFIED',phys,source,movement,commentary,priorIncident};
}
