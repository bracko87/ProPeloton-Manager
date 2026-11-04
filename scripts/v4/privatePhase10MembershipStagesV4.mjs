/** Isolated Phase 10 replay handoff audit. No rider identities serialized. */
const members=(groups,id)=>{
 if(!Array.isArray(groups))return null;
 const hits=groups.filter(g=>Array.isArray(g?.riderIds)&&g.riderIds.includes(id));
 if(hits.length!==1)return null;
 const ids=hits[0].riderIds;
 if(ids.some(v=>typeof v!=='string'||!v)||new Set(ids).size!==ids.length)return null;
 return [...ids].sort();
};
const boundaries=['INITIAL','AFTER_DETACHMENT','AFTER_AUTONOMOUS_GROUPS','AFTER_CONSOLIDATION','AFTER_FINISH_COMMIT','AFTER_DISPLAY_NORMALIZATION'];
export function classifyPhase10MembershipStageV4({riderId,physicalMembers,stages}={}){
 if(typeof riderId!=='string'||!riderId||!Array.isArray(physicalMembers)||
    !physicalMembers.includes(riderId)||new Set(physicalMembers).size!==physicalMembers.length||
    physicalMembers.some(id=>typeof id!=='string'||!id)||!stages||typeof stages!=='object')
    return 'UNAVAILABLE';
 const expected=[...physicalMembers].sort();
 let previouslyMatched=false;
 for(const key of boundaries){
   if(!Object.prototype.hasOwnProperty.call(stages,key))return 'STAGE_MISSING';
   const actual=members(stages[key],riderId);
   if(!actual)return 'RIDER_UNAVAILABLE_'+key;
   const same=actual.length===expected.length&&actual.every((id,i)=>id===expected[i]);
   if(key==='INITIAL'&&!same)return 'INITIAL_ALREADY_DIFFERS';
   if(!same&&previouslyMatched)return 'DIVERGED_'+key;
   previouslyMatched=same;
 }
 return 'ALL_STAGES_MATCH';
}
