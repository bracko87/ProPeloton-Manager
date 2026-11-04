import {auditPrivateReachedDnfCheckpointV4} from './privateReachedDnfCheckpointV4.mjs';
/**
 * A reached DNF can leave a surviving group's display code stale even when
 * physical membership is already correct. Repair ONLY the display identity,
 * never a rider membership, injury, official result, gap value, or event.
 */
export function buildPrivateDnfSurvivorIdentityV4({
 timeline,checkpointId,riderId,physicalGroupsAtKm,phase10Stages,reachedDnfRiderIds
}={}){
 if(auditPrivateReachedDnfCheckpointV4({
   timeline,checkpointId,physicalGroupsAtKm,phase10Stages,reachedDnfRiderIds
 }).status!=='DNF_HANDOFF_CONFIRMED')return {status:'EVIDENCE_NOT_CONFIRMED'};
 const i=timeline.checkpoints.findIndex(cp=>cp.checkpointId===checkpointId);
 if(i<1||!riderId)return {status:'NOT_ELIGIBLE'};
 const a=timeline.checkpoints[i-1],b=timeline.checkpoints[i];
 if(a.finalResultsVisible||b.finalResultsVisible||
  !Array.isArray(a.groups)||!Array.isArray(b.groups)||
  !Array.isArray(b.gaps)||!Array.isArray(b.riderStates)||!Array.isArray(b.commentary))
  return {status:'FINISH_OR_DATA_UNSAFE'};
 const previous=a.groups.filter(g=>g.riderIds?.includes(riderId));
 const current=b.groups.filter(g=>g.riderIds?.includes(riderId));
 if(previous.length!==1||current.length!==1)return {status:'RIDER_GROUP_UNAVAILABLE'};
 const old=previous[0],now=current[0],dnf=new Set(reachedDnfRiderIds);
 const prevSurvivors=[...old.riderIds].filter(id=>!dnf.has(id)).sort();
 const currSurvivors=[...now.riderIds].sort();
 // Any other group transfer is physically meaningful and cannot be relabelled.
 if(prevSurvivors.length!==currSurvivors.length||
  prevSurvivors.some((id,j)=>id!==currSurvivors[j]))
  return {status:'MEMBERSHIP_CHANGED'};
 if(old.displayCode===now.displayCode)return {status:'ALREADY_IDENTICAL'};
 if(typeof old.displayCode!=='string'||typeof now.displayCode!=='string'||
  b.groups.some(g=>g!==now&&g.displayCode===old.displayCode)||
  b.gaps.some(g=>g.displayCode===old.displayCode))
  return {status:'CODE_COLLISION'};
 const nowGaps=b.gaps.filter(g=>g.displayCode===now.displayCode);
 if(nowGaps.length!==1||nowGaps[0].groupCode!==now.groupCode)
  return {status:'GAP_IDENTITY_MISMATCH'};
 const states=b.riderStates.filter(s=>now.riderIds.includes(s.riderId));
 if(states.length!==now.riderIds.length||
   new Set(states.map(s=>s.riderId)).size!==states.length||
   states.some(s=>s.status!=='racing'||s.displayCode!==now.displayCode||
     s.groupCode!==now.groupCode))
  return {status:'SURVIVOR_STATE_MISMATCH'};
 if(b.commentary.some(e=>['group_merge','group_split'].includes(e.eventType)))
  return {status:'EXISTING_TRANSITION'};
 // Preserve gap values, incident commentary, group physical position and
 // rider status. The old groupCode may not describe the current physical
 // position: keep the current groupCode and change display identity only.
 const correctedGroups=b.groups.map(g=>g===now?{...g,displayCode:old.displayCode}:g);
 const correctedGaps=b.gaps.map(g=>g===nowGaps[0]?{...g,displayCode:old.displayCode}:g);
 const correctedStates=b.riderStates.map(s=>now.riderIds.includes(s.riderId)?
   {...s,displayCode:old.displayCode}:s);
 const checkpoints=timeline.checkpoints.map((cp,j)=>j===i?
  {...cp,groups:correctedGroups,gaps:correctedGaps,riderStates:correctedStates}:cp);
 return {status:'DNF_SURVIVOR_IDENTITY_CREATED',
  timeline:{...timeline,checkpoints},researchOnly:true,officialWrites:0};
}
