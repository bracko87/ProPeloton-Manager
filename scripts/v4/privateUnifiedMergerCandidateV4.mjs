import {buildPrivatePhysicalMergerShadowV4} from './privatePhysicalMergerShadowV4.mjs';
import {buildPrivateDnfAwareMergerShadowV4} from './privateDnfAwareMergerShadowV4.mjs';

/**
 * One evidence-gated candidate path for strict historical shadow validation.
 * The original timeline is never edited or returned as repaired.
 */
export function buildPrivateUnifiedMergerCandidateV4({
 timeline,checkpointId,riderId,proposal,detachmentClass,reachedDnfRiderIds
}={}){
 if(!proposal||proposal.eventType!=='group_merge'||
    proposal.source!=='authoritative_physical_groups')
   return {status:'NOT_ELIGIBLE'};
 const direct=buildPrivatePhysicalMergerShadowV4({timeline,checkpointId,riderId,proposal});
 if(direct.status==='SHADOW_CREATED')
   return {...direct,status:'CANDIDATE_CREATED',mode:'PHYSICAL_MERGER'};
 if(direct.status!=='REPLAY_PHYSICAL_MEMBERSHIP_MISMATCH'||
    direct.mismatch!=='CURRENT_MEMBERSHIP'||
    detachmentClass!=='DNF_DETACHMENT'||
    !Array.isArray(reachedDnfRiderIds))
   return {status:'NOT_ELIGIBLE'};
 const dnf=buildPrivateDnfAwareMergerShadowV4({
   timeline,checkpointId,riderId,proposal,reachedDnfRiderIds
 });
 if(dnf.status!=='DNF_AWARE_SHADOW_CREATED')
   return {status:'GUARD_REJECTED'};
 return {...dnf,status:'CANDIDATE_CREATED',mode:'DNF_AWARE_MERGER'};
}
