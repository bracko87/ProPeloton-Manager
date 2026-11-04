/**
 * Build a research-only shadow timeline for trial validation, never production.
 * An interval-bounded physical merge may be reported at an existing checkpoint
 * as "observed by checkpoint"; this does not assert an exact merge location.
 * Fail closed unless published group memberships agree with physical evidence.
 */
const sorted=ids=>[...ids].sort();
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const members=(checkpoint,id)=>{
 const matches=checkpoint.groups.filter(g=>Array.isArray(g.riderIds)&&g.riderIds.includes(id));
 return matches.length===1?sorted(matches[0].riderIds):null;
};
export function buildPrivatePhysicalMergerShadowV4({timeline,checkpointId,riderId,proposal}={}){
 if(!timeline||!Array.isArray(timeline.checkpoints)||typeof checkpointId!=='string'||
    !checkpointId||typeof riderId!=='string'||!riderId||!proposal||
    proposal.eventType!=='group_merge'||proposal.source!=='authoritative_physical_groups'||
    proposal.exactEventKmKnown!==false||proposal.exactEventTimeKnown!==false||
    !Array.isArray(proposal.observedBetweenKm)||proposal.observedBetweenKm.length!==2||
    !proposal.observedBetweenKm.every(Number.isFinite)||
    proposal.observedBetweenKm[0]>=proposal.observedBetweenKm[1]||
    !Array.isArray(proposal.beforeMembers)||!Array.isArray(proposal.afterMembers))
    return {status:'REJECTED_EVIDENCE'};
 const index=timeline.checkpoints.findIndex(c=>c.checkpointId===checkpointId);
 if(index<=0)return {status:'CHECKPOINT_NOT_FOUND'};
 const before=timeline.checkpoints[index-1],after=timeline.checkpoints[index];
 const first=members(before,riderId),last=members(after,riderId);
 // Only fixed diagnostic categories may leave the private worker.
 if(!first||!last)return {status:'REPLAY_PHYSICAL_MEMBERSHIP_MISMATCH',mismatch:'RIDER_GROUP_UNAVAILABLE'};
 if(before.raceProgress?.kmFromStart!==proposal.observedBetweenKm[0]||
    after.raceProgress?.kmFromStart!==proposal.observedBetweenKm[1])
   return {status:'REPLAY_PHYSICAL_MEMBERSHIP_MISMATCH',mismatch:'DISTANCE_MISMATCH'};
 const beforeMatches=equal(first,sorted(proposal.beforeMembers));
 const afterMatches=equal(last,sorted(proposal.afterMembers));
 if(!beforeMatches||!afterMatches)
   return {status:'REPLAY_PHYSICAL_MEMBERSHIP_MISMATCH',mismatch:
     !beforeMatches&&!afterMatches?'BOTH_MEMBERSHIPS':
     !beforeMatches?'PREVIOUS_MEMBERSHIP':'CURRENT_MEMBERSHIP'};
 if(!Array.isArray(after.commentary))
   return {status:'REPLAY_PHYSICAL_MEMBERSHIP_MISMATCH',mismatch:'INVALID_COMMENTARY'};
 if(after.commentary.some(c=>['group_merge','group_split','incident'].includes(c.eventType)))
   return {status:'ALREADY_HAS_TRANSITION'};
 const commentaryId='commentary:private-v4-physical-merge:'+checkpointId;
 if(timeline.checkpoints.some(c=>c.commentary?.some(x=>x.commentaryId===commentaryId)))
   return {status:'DUPLICATE_COMMENTARY_ID'};
 const commentary={
   commentaryId,eventType:'group_merge',title:'Physical groups converge',
   description:'Physical group convergence observed by this checkpoint; exact merger point undetermined.',
   riderIds:sorted(new Set([...proposal.beforeMembers,...proposal.afterMembers])),
   teamIds:[]
 };
 const checkpoints=timeline.checkpoints.map((c,i)=>i===index?
   {...c,commentary:[...c.commentary,commentary]}:c);
 return {status:'SHADOW_CREATED',timeline:{...timeline,checkpoints},researchOnly:true,officialWrites:0};
}
