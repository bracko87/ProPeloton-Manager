/**
 * Private V4 Phase10 handoff triage. Returns only fixed diagnostic categories.
 * No rider identities, km, or physical snapshots are exported.
 */
const key=ids=>[...ids].sort().join('\u0000');
const partition=(groups,excluded=new Set())=>{
 if(!Array.isArray(groups)||!groups.length)return null;
 const seen=new Set(),keys=[],all=[];
 for(const g of groups){
  if(!Array.isArray(g?.riderIds)||g.riderIds.some(id=>
    typeof id!=='string'||!id||seen.has(id)))return null;
  g.riderIds.forEach(id=>seen.add(id));
  const active=g.riderIds.filter(id=>!excluded.has(id));
  if(active.length){keys.push(key(active));all.push(...active);}
 }
 return {keys:keys.sort(),ids:all.sort()};
};
const same=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
const matches=(a,b)=>!!a&&!!b&&same(a.keys,b.keys)&&same(a.ids,b.ids);
const phaseKeys=['INITIAL','AFTER_DETACHMENT','AFTER_AUTONOMOUS_GROUPS',
 'AFTER_CONSOLIDATION','AFTER_FINISH_COMMIT','AFTER_DISPLAY_NORMALIZATION'];
export function classifyPrivatePhase10SourceDriftV4({
 checkpoint,physicalGroupsAtKm,phase10Stages,reachedDnfRiderIds,
 autonomousRiderIds
}={}){
 if(!checkpoint||!phase10Stages||typeof physicalGroupsAtKm!=='function'||
  !Array.isArray(reachedDnfRiderIds)||!Array.isArray(autonomousRiderIds)||
  !Array.isArray(checkpoint.riderStates))return {status:'UNAVAILABLE'};
 const reached=new Set(reachedDnfRiderIds),autonomous=new Set(autonomousRiderIds);
 if(reached.size!==reachedDnfRiderIds.length||
    autonomous.size!==autonomousRiderIds.length)return {status:'UNAVAILABLE'};
 let original;
 try{original=physicalGroupsAtKm(checkpoint.raceProgress?.kmFromStart);}
 catch{return {status:'UNAVAILABLE'};}
 const physical=partition(original,reached);
 const allStates=new Map(checkpoint.riderStates.map(s=>[s.riderId,s.status]));
 if(!physical||allStates.size!==checkpoint.riderStates.length||
  [...reached].some(id=>allStates.get(id)!=='dnf'))return {status:'UNAVAILABLE'};
 const states=[];
 for(const phase of phaseKeys){
  const part=partition(phase10Stages[phase]);
  if(!part)return {status:'UNAVAILABLE'};
  states.push(part);
 }
 const published=partition(checkpoint.groups);
 if(!published)return {status:'UNAVAILABLE'};
 const aligned=states.map(s=>matches(s,physical));
 const transition=states.slice(1).map((s,i)=>matches(s,states[i]));
 const last=states.at(-1);
 const sourceStatus=matches(last,physical)?'SOURCE_ALIGNED':
  !same(last.ids,physical.ids)?'RIDER_SET_DIFFERS':'GROUP_PARTITION_DIFFERS';
 const first=aligned.findIndex((v,i)=>i>0&&!v);
 const firstDifference=!aligned[0]?'INITIAL_ALREADY_DIFFERS':
  first<0?'NO_STAGE_DRIFT':phaseKeys[first];
 const autonomousOnly=()=>{
  if(sourceStatus!=='GROUP_PARTITION_DIFFERS')return 'NOT_APPLICABLE';
  // Does removing all autonomous participants from both partitions make the
  // remaining groups physically equivalent? Diagnostic, not repair evidence.
  const expected=partition(original,new Set([...reached,...autonomous]));
  const stage=partition(phase10Stages.AFTER_DISPLAY_NORMALIZATION,autonomous);
  return matches(expected,stage)?'AUTONOMOUS_ONLY':'INCLUDES_NON_AUTONOMOUS';
 };
 return {status:'CLASSIFIED',sourceStatus,firstDifference,
  detachmentEffect:transition[0]?'UNCHANGED':'CHANGED',
  autonomousEffect:transition[1]?'UNCHANGED':'CHANGED',
  autonomousAttribution:autonomousOnly(),
  publication:matches(last,published)?'SOURCE_PUBLISHED':'POST_SOURCE_CHANGE'};
}
