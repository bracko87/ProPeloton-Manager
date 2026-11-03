/**
 * Compare the physical group containing a rider at the exact two replay
 * checkpoint distances. Research-only: never exports rider IDs or groups.
 * This does not prove an event was explicitly published.
 */
export function classifyPhysicalCheckpointBoundaryV4({riderId,previousKm,checkpointKm,physicalGroupsAtKm}){
 if(typeof riderId!=='string'||!riderId||
   !Number.isFinite(previousKm)||!Number.isFinite(checkpointKm)||
   previousKm<0||checkpointKm<=previousKm||
   typeof physicalGroupsAtKm!=='function')return 'UNAVAILABLE';
 try{
   const read=km=>{
     const groups=physicalGroupsAtKm(km);
     if(!Array.isArray(groups)||!groups.length)throw Error('BAD_GROUPS');
     const matching=groups.filter(g=>Array.isArray(g.riderIds)&&g.riderIds.includes(riderId));
     if(matching.length!==1)throw Error('RIDER_NOT_UNIQUE');
     const g=matching[0];
     if(!Number.isFinite(g.gapSeconds)||g.gapSeconds<0||
        !g.riderIds.every(id=>typeof id==='string'&&id))
       throw Error('BAD_GAP_OR_MEMBERS');
     return {members:[...g.riderIds].sort(),gap:g.gapSeconds};
   };
   const before=read(previousKm),after=read(checkpointKm);
   if(before.members.length===after.members.length&&
      before.members.every((id,i)=>id===after.members[i]))
     return 'SAME_MEMBERSHIP';
   return 'CHANGED_MEMBERSHIP';
 }catch{return 'UNAVAILABLE'}
}
