/**
 * Research-only diagnosis for the two post-catch replay checkpoints.
 * Compare raw road riders, recorded Phase10 detachment/initial/final snapshots
 * and published replay. Never return rider IDs, group data, distances or names.
 */
const groupPartition=(groups,excluded=new Set())=>{
 if(!Array.isArray(groups)||!groups.length)return null;
 const seen=new Set(),all=[],memberships=[];
 for(const group of groups){
  if(!Array.isArray(group?.riderIds))return null;
  const active=[];
  for(const id of group.riderIds){
   if(typeof id!=='string'||!id||seen.has(id))return null;
   seen.add(id);
   if(!excluded.has(id)){active.push(id);all.push(id);}
  }
  if(active.length)memberships.push(active.sort().join('\u0000'));
 }
 return {ids:all.sort(),groups:memberships.sort()};
};
const equal=(a,b)=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const identical=(a,b)=>!!a&&!!b&&equal(a.ids,b.ids)&&equal(a.groups,b.groups);
const setRelation=(a,b)=>{
 if(!a||!b)return 'UNAVAILABLE';
 const aa=new Set(a.ids),bb=new Set(b.ids);
 const extraPhysical=a.ids.some(id=>!bb.has(id));
 const extraReplay=b.ids.some(id=>!aa.has(id));
 return extraPhysical&&extraReplay?'BOTH_DIRECTIONAL_DIFFERENCE':
  extraPhysical?'PHYSICAL_EXTRA_ONLY':
  extraReplay?'REPLAY_EXTRA_ONLY':'SAME_RIDER_SET';
};
export function classifyPrivateResidualRiderSetOriginV4({
 checkpoint,physicalGroupsAtKm,phase10Stages,detachment
}={}){
 const unknown={status:'UNAVAILABLE',riderSetDirection:'UNAVAILABLE',
  recordedMissingCoverage:'UNAVAILABLE',physicalMatch:'UNAVAILABLE',
  phase10Initial:'UNAVAILABLE',phase10Final:'UNAVAILABLE',
  firstSource:'UNAVAILABLE'};
 if(!checkpoint||typeof physicalGroupsAtKm!=='function')return unknown;
 const km=checkpoint.raceProgress?.kmFromStart;
 if(!Number.isFinite(km))return unknown;
 let physical;
 try{physical=physicalGroupsAtKm(km);}catch{return unknown;}
 const raw=groupPartition(physical);
 const published=groupPartition(checkpoint.groups);
 if(!raw||!published)return unknown;
 const dnf=Array.isArray(detachment?.dnfRiderIds)?detachment.dnfRiderIds:null;
 const autonomous=Array.isArray(detachment?.autonomousRiderIds)?
  detachment.autonomousRiderIds:null;
 const validDetachment=!!dnf&&!!autonomous&&
  new Set(dnf).size===dnf.length&&
  new Set(autonomous).size===autonomous.length&&
  [...dnf,...autonomous].every(id=>typeof id==='string'&&id);
 const dnfAdjusted=validDetachment?
  groupPartition(physical,new Set(dnf)):null;
 const bothAdjusted=validDetachment?
  groupPartition(physical,new Set([...dnf,...autonomous])):null;
 const publishedKind=identical(raw,published)?'RAW_PHYSICAL_MATCH':
  identical(dnfAdjusted,published)?'DNF_ADJUSTED_MATCH':
  identical(bothAdjusted,published)?'DNF_AUTONOMOUS_ADJUSTED_MATCH':
  equal(raw.ids,published.ids)?'RIDER_SET_MATCH_PARTITION_DIFFERS':
  'RIDER_SET_DIFFERS';
 const physicalOnly=raw.ids.filter(id=>!published.ids.includes(id));
 const missingCoverage=!validDetachment?'DETACHMENT_UNKNOWN':
  !physicalOnly.length?'NO_PHYSICAL_ONLY_RIDERS':
  physicalOnly.every(id=>dnf.includes(id))?'ALL_CONFIRMED_DNF':
  physicalOnly.every(id=>dnf.includes(id)||autonomous.includes(id))?
    'ALL_CONFIRMED_DNF_OR_AUTONOMOUS':
  physicalOnly.some(id=>dnf.includes(id)||autonomous.includes(id))?
    'PARTIALLY_EXPLAINED':'UNEXPLAINED_PHYSICAL_EXTRA';
 const initial=groupPartition(phase10Stages?.INITIAL);
 const final=groupPartition(phase10Stages?.AFTER_DISPLAY_NORMALIZATION);
 const initialKind=!initial?'UNAVAILABLE':
  identical(initial,raw)?'INITIAL_RAW_PHYSICAL':
  identical(initial,dnfAdjusted)?'INITIAL_DNF_ADJUSTED':
  identical(initial,bothAdjusted)?'INITIAL_DNF_AUTONOMOUS_ADJUSTED':
  equal(initial.ids,raw.ids)?'INITIAL_SAME_RIDERS_DIFFERENT_GROUPS':
  'INITIAL_RIDER_SET_DIFFERS';
 const finalKind=!final?'UNAVAILABLE':
  identical(final,published)?'FINAL_MATCHES_PUBLISHED':
  equal(final.ids,published.ids)?'FINAL_SAME_RIDERS_DIFFERENT_GROUPS':
  'FINAL_RIDER_SET_DIFFERS';
 const origin=initialKind==='UNAVAILABLE'||finalKind==='UNAVAILABLE'?
  'STAGES_UNAVAILABLE':
  initialKind==='INITIAL_RIDER_SET_DIFFERS'||
  initialKind==='INITIAL_SAME_RIDERS_DIFFERENT_GROUPS'?
    'INITIAL_ALREADY_DRIFTED':
  finalKind!=='FINAL_MATCHES_PUBLISHED'?'POST_PHASE10_DIVERGENCE':
  publishedKind==='RAW_PHYSICAL_MATCH'||publishedKind==='DNF_ADJUSTED_MATCH'||
    publishedKind==='DNF_AUTONOMOUS_ADJUSTED_MATCH'?'SOURCE_ALIGNED':
  'PHASE10_OR_SOURCE_DRIFT';
 return {status:'CLASSIFIED',riderSetDirection:setRelation(raw,published),
  recordedMissingCoverage:missingCoverage,physicalMatch:publishedKind,
  phase10Initial:initialKind,phase10Final:finalKind,firstSource:origin};
}
