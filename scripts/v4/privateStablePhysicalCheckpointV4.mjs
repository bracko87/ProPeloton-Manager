/**
 * Private, fail-closed replay correction for a stable physical group partition.
 * Never fabricates split/merge events or changes riders, energy, incident status,
 * finish results, or actual physics. Applies only when previous checkpoint and
 * two authoritative physical snapshots have EXACT same rider partition.
 */
const canonical=g=>[...g].sort().join('\u0000');
const valid=(groups)=>{
 if(!Array.isArray(groups)||groups.length===0)return null;
 const seen=new Set(),out=[];
 for(const group of groups){
   if(!Array.isArray(group?.riderIds)||!group.riderIds.length)return null;
   if(group.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
   group.riderIds.forEach(id=>seen.add(id));
   out.push({key:canonical(group.riderIds),ids:group.riderIds,gap:group.gapSeconds,group});
 }
 if(new Set(out.map(x=>x.key)).size!==out.length)return null;
 return out;
};
const partitionMatches=(a,b)=>a.length===b.length&&a.every(g=>b.some(h=>h.key===g.key));
export function buildPrivateStablePhysicalCheckpointV4({timeline,checkpointId,physicalGroupsAtKm}={}){
 if(!Array.isArray(timeline?.checkpoints)||typeof checkpointId!=='string'||!checkpointId||
    typeof physicalGroupsAtKm!=='function')return {status:'NOT_ELIGIBLE'};
 const i=timeline.checkpoints.findIndex(cp=>cp.checkpointId===checkpointId);
 if(i<1)return {status:'NOT_ELIGIBLE'};
 const before=timeline.checkpoints[i-1],after=timeline.checkpoints[i];
 const km0=before.raceProgress?.kmFromStart,km1=after.raceProgress?.kmFromStart;
 if(!Number.isFinite(km0)||!Number.isFinite(km1)||km0<0||km1<km0)
   return {status:'INVALID_DISTANCE'};
 if(after.finalResultsVisible||before.finalResultsVisible||
    !Array.isArray(after.commentary)||!Array.isArray(after.riderStates)||
    after.commentary.some(e=>['group_merge','group_split','incident','finish','attack','late_chase'].includes(e.eventType))||
    !Array.isArray(before.groups)||!Array.isArray(before.gaps)||!Array.isArray(after.groups)||
    !Array.isArray(after.gaps))return {status:'INCIDENT_OR_FINISH_UNSAFE'};
 let p0,p1;
 try{p0=valid(physicalGroupsAtKm(km0));p1=valid(physicalGroupsAtKm(km1));}
 catch{return {status:'PHYSICAL_UNAVAILABLE'};}
 const old=valid(before.groups),current=valid(after.groups);
 if(!p0||!p1||!old||!current)return {status:'INVALID_GROUPS'};
 if(!partitionMatches(p0,p1)||!partitionMatches(p0,old))
   return {status:'PHYSICAL_NOT_STABLE'};
 const fullSet=x=>new Set(x.flatMap(g=>g.ids));
 const expected=fullSet(p1),currentRiders=fullSet(current);
 if(expected.size!==currentRiders.size||[...expected].some(id=>!currentRiders.has(id)))
   return {status:'RIDER_SET_MISMATCH'};
 const states=after.riderStates;
 if(states.length!==expected.size||new Set(states.map(s=>s.riderId)).size!==states.length||
    states.some(s=>!expected.has(s.riderId)||s.status!=='racing'))
   return {status:'INCIDENT_OR_FINISH_UNSAFE'};
 if(partitionMatches(current,p1))return {status:'ALREADY_PHYSICALLY_ALIGNED'};
 // Check every destination identity is unique and can be mapped to a physical
 // group and a prior replay identity. No arbitrary group-label creation.
 if(new Set(before.groups.map(g=>g.displayCode)).size!==old.length||
    before.gaps.length!==old.length||
    new Set(before.gaps.map(g=>g.displayCode)).size!==old.length)
   return {status:'AMBIGUOUS_GROUP_IDENTITY'};
 const repairedGroups=[],repairedGaps=[],byId=new Map();
 for(const entry of old){
   const physical=p1.find(g=>g.key===entry.key);
   const priorGap=before.gaps.find(g=>g.displayCode===entry.group.displayCode);
   if(!physical||!priorGap||!Number.isFinite(physical.gap)||physical.gap<0)
     return {status:'PHYSICAL_UNAVAILABLE'};
   if(km1===km0&&Math.abs(physical.gap-priorGap.gapSeconds)>0.000001)
     return {status:'SAME_KM_GAP_CONFLICT'};
   const gap=physical.gap;
   const group={...entry.group,riderIds:[...entry.ids]};
   repairedGroups.push(group);
   repairedGaps.push({...priorGap,gapSeconds:gap,officialTimeSeconds:null});
   for(const riderId of entry.ids)byId.set(riderId,{group,gap});
 }
 const repairedStates=states.map(s=>{
   const item=byId.get(s.riderId);
   return {...s,groupCode:item.group.groupCode,displayCode:item.group.displayCode,
     gapSeconds:item.gap};
 });
 const repaired={...after,groups:repairedGroups,gaps:repairedGaps,riderStates:repairedStates};
 const checkpoints=timeline.checkpoints.map((cp,j)=>j===i?repaired:cp);
 return {status:'STABLE_CHECKPOINT_CREATED',timeline:{...timeline,checkpoints},
   mode:km0===km1?'SAME_KM_STABLE':'DISTANCE_STABLE',researchOnly:true,officialWrites:0};
}
