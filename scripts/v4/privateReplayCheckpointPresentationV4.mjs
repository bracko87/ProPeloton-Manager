/**
 * Research-only classification of a failed replay transition.
 * Compares the rider's published checkpoint groups, not physical groups.
 * Returns a fixed category only; never exports identity, IDs or distances.
 */
export function classifyReplayCheckpointPresentationV4({riderId,previous,current}){
 if(typeof riderId!=='string'||!riderId||!previous||!current||
   !Number.isFinite(previous.raceProgress?.kmFromStart)||
   !Number.isFinite(current.raceProgress?.kmFromStart))return 'UNAVAILABLE';
 const read=checkpoint=>{
   const matches=(checkpoint.groups??[]).filter(g=>
     Array.isArray(g.riderIds)&&g.riderIds.includes(riderId));
   if(matches.length!==1)return null;
   const g=matches[0];
   return {members:[...g.riderIds].sort(),code:g.displayCode};
 };
 const a=read(previous),b=read(current);
 if(!a||!b||typeof a.code!=='string'||typeof b.code!=='string')
   return 'UNAVAILABLE';
 const same=a.members.length===b.members.length&&a.members.every((v,i)=>v===b.members[i]);
 const zero=previous.raceProgress.kmFromStart===current.raceProgress.kmFromStart;
 if(zero)return same?
   (a.code===b.code?'SAME_KM_UNCHANGED':'SAME_KM_RENUMBER_ONLY'):
   'SAME_KM_MEMBERSHIP_CHANGED';
 if(same)return a.code===b.code?'DISTANCE_UNCHANGED':'DISTANCE_RENUMBER_ONLY';
 return 'DISTANCE_MEMBERSHIP_CHANGED';
}
