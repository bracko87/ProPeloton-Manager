import {auditPrivateReachedDnfCheckpointV4} from './privateReachedDnfCheckpointV4.mjs';

/**
 * Private-only commentary candidate for a CONFIRMED, already applied DNF.
 * The race physics, actual group membership, statuses and official classification
 * are never changed. The original replay strict gate must validate the candidate.
 */
export function buildPrivateDnfTransitionCommentaryV4({
 timeline,checkpointId,physicalGroupsAtKm,phase10Stages,reachedDnfRiderIds
}={}){
 const audit=auditPrivateReachedDnfCheckpointV4({
   timeline,checkpointId,physicalGroupsAtKm,phase10Stages,reachedDnfRiderIds
 });
 if(audit.status!=='DNF_HANDOFF_CONFIRMED')
   return {status:'EVIDENCE_NOT_CONFIRMED'};
 const idx=timeline.checkpoints.findIndex(cp=>cp.checkpointId===checkpointId);
 if(idx<1)return {status:'CHECKPOINT_NOT_FOUND'};
 const previous=timeline.checkpoints[idx-1],current=timeline.checkpoints[idx];
 if(!Array.isArray(previous.groups)||!Array.isArray(current.groups)||
    !Array.isArray(current.commentary)||!Array.isArray(current.riderStates))
   return {status:'INVALID_CHECKPOINT'};
 if(previous.finalResultsVisible||current.finalResultsVisible)
   return {status:'FINISH_PROTECTED'};
 if(current.commentary.some(e=>['group_split','group_merge','incident'].includes(e.eventType)))
   return {status:'EXISTING_TRANSITION'};
 const removed=new Set(reachedDnfRiderIds.filter(id=>
   previous.groups.some(g=>g.riderIds?.includes(id))&&
   !current.groups.some(g=>g.riderIds?.includes(id))));
 if(!removed.size)return {status:'NOT_NEWLY_DETACHED'};
 // The physically observed transition is an actual rider removal, not an
 // arbitrary P-to-C display-name change. Require every removed rider to be
 // newly DNF at this checkpoint and every survivor to retain group membership.
 const status=new Map(current.riderStates.map(s=>[s.riderId,s.status]));
 if([...removed].some(id=>status.get(id)!=='dnf'))return {status:'DNF_STATUS_CONFLICT'};
 const impacted=previous.groups.filter(g=>g.riderIds.some(id=>removed.has(id)));
 if(impacted.some(g=>{
   const survivors=g.riderIds.filter(id=>!removed.has(id)).sort();
   if(!survivors.length)return false;
   return !current.groups.some(c=>{
     const sorted=[...c.riderIds].sort();
     return sorted.length===survivors.length&&sorted.every((id,i)=>id===survivors[i]);
   });
 }))return {status:'SURVIVOR_EXCHANGE'};
 const commentaryId='commentary:private-v4-dnf-detachment:'+checkpointId;
 if(timeline.checkpoints.some(cp=>cp.commentary?.some(e=>e.commentaryId===commentaryId)))
   return {status:'DUPLICATE_COMMENTARY'};
 const event={
   commentaryId,eventType:'group_split',
   title:'Confirmed incident retirement',
   description:'Previously recorded incident DNF removes riders from active groups by this checkpoint; no new movement is inferred.',
   riderIds:[...removed].sort(),teamIds:[]
 };
 const checkpoints=timeline.checkpoints.map((cp,i)=>i===idx?
   {...cp,commentary:[...cp.commentary,event]}:cp);
 return {status:'DNF_TRANSITION_CREATED',timeline:{...timeline,checkpoints},
   researchOnly:true,officialWrites:0};
}
