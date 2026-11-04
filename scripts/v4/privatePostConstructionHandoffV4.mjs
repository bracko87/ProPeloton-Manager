/**
 * Private V4 diagnostic: identify the FIRST downstream replay transformation
 * whose affected rider group disagrees with authoritative physical membership.
 * Only enum-like status may leave the isolated research worker.
 */
const membership=(timeline,checkpointId,riderId)=>{
 const cp=timeline?.checkpoints?.find(c=>c.checkpointId===checkpointId);
 if(!cp||!Array.isArray(cp.groups))return null;
 const groups=cp.groups.filter(g=>Array.isArray(g.riderIds)&&g.riderIds.includes(riderId));
 if(groups.length!==1)return null;
 const ids=groups[0].riderIds;
 return ids.length>0&&ids.every(x=>typeof x==='string'&&x)&&new Set(ids).size===ids.length?
  [...ids].sort():null;
};
export function classifyPostConstructionHandoffV4({
 riderId,checkpointId,physicalMembers,baseTimeline,phase10Timeline,finalTimeline
}={}){
 if(typeof riderId!=='string'||!riderId||typeof checkpointId!=='string'||!checkpointId||
    !Array.isArray(physicalMembers)||!physicalMembers.includes(riderId)||
    physicalMembers.some(x=>typeof x!=='string'||!x)||
    new Set(physicalMembers).size!==physicalMembers.length)
   return 'UNAVAILABLE';
 const expected=[...physicalMembers].sort();
 const states=[baseTimeline,phase10Timeline,finalTimeline].map(t=>membership(t,checkpointId,riderId));
 if(states.some(x=>!x))return 'CHECKPOINT_OR_RIDER_MISSING';
 const equal=x=>x.length===expected.length&&x.every((id,i)=>id===expected[i]);
 if(!equal(states[0]))return 'BASE_REPLAY_DIVERGED';
 if(!equal(states[1]))return 'PHASE10_DIVERGED';
 if(!equal(states[2]))return 'INTERMEDIATE_RECONCILIATION_DIVERGED';
 return 'ALL_STAGES_MATCH';
}
