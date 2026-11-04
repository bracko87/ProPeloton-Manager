/** Research-only diagnosis: compare a rider's physical group with each
 * checkpoint construction stage. Return fixed categories, never identities. */
const groupMembers=(groups,riderId)=>{
 if(!Array.isArray(groups))return null;
 const matches=groups.filter(g=>Array.isArray(g?.riderIds)&&g.riderIds.includes(riderId));
 if(matches.length!==1)return null;
 const ids=matches[0].riderIds;
 if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)return null;
 return [...ids].sort();
};
const equals=(a,b)=>a&&b&&a.length===b.length&&a.every((id,i)=>id===b[i]);
export function classifyCheckpointGroupStagesV4({riderId,physicalMembers,raw,normalized,published,finalGroups}={}){
 if(typeof riderId!=='string'||!riderId||!Array.isArray(physicalMembers)||
   !physicalMembers.includes(riderId)||new Set(physicalMembers).size!==physicalMembers.length)
   return 'UNAVAILABLE';
 const physical=[...physicalMembers].sort();
 const vals=[raw,normalized,published,finalGroups].map(groups=>groupMembers(groups,riderId));
 if(vals.some(x=>!x))return 'RIDER_GROUP_UNAVAILABLE';
 const match=vals.map(m=>equals(m,physical));
 if(match.every(Boolean))return 'STAGES_MATCH_PHYSICAL';
 if(!match[0])return 'DEFINITION_ALREADY_DIFFERS';
 if(!match[1])return 'NORMALIZATION_DIVERGENCE';
 if(!match[2])return 'PUBLICATION_FILTER_DIVERGENCE';
 return 'POST_CONSTRUCTION_DIVERGENCE';
}
