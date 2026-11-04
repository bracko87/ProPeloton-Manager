/**
 * Research-only DNF checkpoint handoff audit. This verifies whether the
 * authoritative physical groups differ from published replay groups solely
 * because reached Phase10 DNF riders were removed. It NEVER restores a DNF
 * rider, changes incidents, changes a finish or invents a group transition.
 */
const members=groups=>{
 if(!Array.isArray(groups)||!groups.length)return null;
 const seen=new Set(),out=[];
 for(const g of groups){
  if(!Array.isArray(g?.riderIds)||!g.riderIds.length||
     g.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
  g.riderIds.forEach(id=>seen.add(id));
  out.push([...g.riderIds].sort());
 }
 return {all:[...seen].sort(),groups:out};
};
const equal=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const matching=(a,b)=>a.groups.length===b.groups.length&&
 a.groups.every(g=>b.groups.some(h=>equal(g,h)));
export function auditPrivateReachedDnfCheckpointV4({
 timeline,checkpointId,physicalGroupsAtKm,phase10Stages,reachedDnfRiderIds
}={}){
 if(!Array.isArray(timeline?.checkpoints)||!checkpointId||
 typeof physicalGroupsAtKm!=='function'||!Array.isArray(reachedDnfRiderIds)||
 new Set(reachedDnfRiderIds).size!==reachedDnfRiderIds.length||
 reachedDnfRiderIds.some(id=>typeof id!=='string'||!id))
 return {status:'UNAVAILABLE'};
 const current=timeline.checkpoints.find(cp=>cp.checkpointId===checkpointId);
 if(!current||!Number.isFinite(current.raceProgress?.kmFromStart))
 return {status:'UNAVAILABLE'};
 let physical;
 try{physical=members(physicalGroupsAtKm(current.raceProgress.kmFromStart));}
 catch{return {status:'UNAVAILABLE'};}
 const replay=members(current.groups),initial=members(phase10Stages?.INITIAL),
 detached=members(phase10Stages?.AFTER_DETACHMENT);
 if(!physical||!replay||!initial||!detached)return {status:'UNAVAILABLE'};
 if(!matching(physical,initial))return {status:'INITIAL_NOT_PHYSICAL'};
 const removed=physical.all.filter(id=>!replay.all.includes(id));
 const extra=replay.all.filter(id=>!physical.all.includes(id));
 if(extra.length)return {status:'NON_PHYSICAL_REPLAY_RIDERS'};
 if(!removed.length)return {status:'NO_RIDERS_REMOVED'};
 const dnfSet=new Set(reachedDnfRiderIds);
 if(removed.some(id=>!dnfSet.has(id)))return {status:'UNEXPLAINED_REMOVAL'};
 if(!Array.isArray(current.riderStates))return {status:'DNF_STATE_UNVERIFIED'};
 for(const id of removed){
  if(current.riderStates.filter(s=>s.riderId===id&&s.status==='dnf').length!==1)
   return {status:'DNF_STATE_UNVERIFIED'};
 }
 if(!equal(replay.all,detached.all))return {status:'PHASE10_STAGE_MISMATCH'};
 // Ensure each non-DNF physical group has the same survivors after detachment
 // and replay. This is evidence only; not an executable repair.
 const survivors=physical.groups.map(g=>g.filter(id=>!dnfSet.has(id))).filter(g=>g.length);
 const sameSurvivors=target=>target.groups.length===survivors.length&&
  survivors.every(g=>target.groups.some(h=>equal(g,h)));
 if(!sameSurvivors(replay)||!sameSurvivors(detached))
  return {status:'SURVIVOR_GROUP_MISMATCH'};
 return {status:'DNF_HANDOFF_CONFIRMED'};
}
