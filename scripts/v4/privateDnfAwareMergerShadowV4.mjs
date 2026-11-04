import {buildPrivatePhysicalMergerShadowV4} from './privatePhysicalMergerShadowV4.mjs';

/** Research-only DNF-aware physical merger. Never changes official replay.
 * DNF exclusion requires an actual reached incident AND a DNF replay status.
 * The authoritative physical proposal remains unmodified.
 */
export function buildPrivateDnfAwareMergerShadowV4({
 timeline,checkpointId,riderId,proposal,reachedDnfRiderIds
}={}){
 if(!proposal||proposal.eventType!=='group_merge'||
    proposal.source!=='authoritative_physical_groups'||
    proposal.exactEventKmKnown!==false||proposal.exactEventTimeKnown!==false||
    !Array.isArray(proposal.beforeMembers)||!Array.isArray(proposal.afterMembers)||
    !Array.isArray(reachedDnfRiderIds)||
    reachedDnfRiderIds.some(id=>typeof id!=='string'||!id)||
    new Set(reachedDnfRiderIds).size!==reachedDnfRiderIds.length||
    new Set(proposal.afterMembers).size!==proposal.afterMembers.length||
    proposal.afterMembers.some(id=>typeof id!=='string'||!id)||
    !timeline||!Array.isArray(timeline.checkpoints))
   return {status:'REJECTED_EVIDENCE'};
 const checkpoint=timeline.checkpoints.find(c=>c.checkpointId===checkpointId);
 if(!checkpoint||!Array.isArray(checkpoint.groups)||!Array.isArray(checkpoint.riderStates))
   return {status:'CHECKPOINT_NOT_FOUND'};
 const groups=checkpoint.groups.filter(g=>Array.isArray(g.riderIds)&&g.riderIds.includes(riderId));
 if(groups.length!==1)return {status:'RIDER_GROUP_UNAVAILABLE'};
 const shown=groups[0].riderIds;
 if(shown.length===0||new Set(shown).size!==shown.length)return {status:'REJECTED_EVIDENCE'};
 const physical=new Set(proposal.afterMembers),published=new Set(shown);
 if(shown.some(id=>!physical.has(id)))return {status:'NON_DNF_MEMBERSHIP_MISMATCH'};
 const missing=proposal.afterMembers.filter(id=>!published.has(id));
 if(missing.length===0)return {status:'NO_DNF_ADJUSTMENT_REQUIRED'};
 const reached=new Set(reachedDnfRiderIds);
 if(missing.some(id=>!reached.has(id)))return {status:'NON_DNF_MEMBERSHIP_MISMATCH'};
 for(const id of missing){
   if(checkpoint.riderStates.filter(s=>s.riderId===id&&s.status==='dnf').length!==1||
      checkpoint.groups.some(g=>Array.isArray(g.riderIds)&&g.riderIds.includes(id)))
     return {status:'DNF_STATUS_NOT_CONFIRMED'};
 }
 // A merger must still leave at least two present riders in the joined group.
 // Reject cases where excluding DNF riders erases the merger itself.
 if(shown.length<2)return {status:'NO_SURVIVING_MERGER'};
 const adjusted={...proposal,afterMembers:[...shown]};
 const shadow=buildPrivatePhysicalMergerShadowV4({
   timeline,checkpointId,riderId,proposal:adjusted
 });
 if(shadow.status!=='SHADOW_CREATED')
   return {status:shadow.status,mismatch:shadow.mismatch};
 return {
   ...shadow,status:'DNF_AWARE_SHADOW_CREATED',
   dnfExclusions:missing.length,researchOnly:true,officialWrites:0
 };
}
