/**
 * Private diagnostic for a physical/replay group disagreement at a checkpoint.
 * It does not change either group or disclose any rider identities.
 */
const ordered=(a)=>[...a].sort();
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export function classifyPhysicalReplayMembershipHandoffV4({riderId,physicalMembers,replayGroups}={}){
 if(typeof riderId!=='string'||!riderId||!Array.isArray(physicalMembers)||
   !Array.isArray(replayGroups)||physicalMembers.length===0||
   physicalMembers.some(id=>typeof id!=='string'||!id)||
   new Set(physicalMembers).size!==physicalMembers.length||
   !physicalMembers.includes(riderId))return 'INVALID_EVIDENCE';
 const matches=replayGroups.filter(g=>Array.isArray(g?.riderIds)&&g.riderIds.includes(riderId));
 if(matches.length===0)return 'RIDER_MISSING_FROM_REPLAY';
 if(matches.length>1)return 'RIDER_DUPLICATED_IN_REPLAY';
 const replay=matches[0].riderIds;
 if(replay.some(id=>typeof id!=='string'||!id)||
    new Set(replay).size!==replay.length)return 'INVALID_EVIDENCE';
 const a=ordered(physicalMembers),b=ordered(replay);
 if(same(a,b))return 'MATCH';
 const phys=new Set(a),shown=new Set(b);
 const missing=a.some(id=>!shown.has(id));
 const extras=b.some(id=>!phys.has(id));
 if(missing&&extras)return 'REPLAY_GROUP_EXCHANGE';
 if(missing)return 'REPLAY_MISSING_PHYSICAL_MEMBERS';
 if(extras)return 'REPLAY_CONTAINS_EXTRA_MEMBERS';
 return 'INVALID_EVIDENCE';
}
