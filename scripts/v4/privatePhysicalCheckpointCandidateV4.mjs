/**
 * Private candidate evidence from TWO authoritative physical checkpoint frames.
 * Does not edit replay checkpoints or claim an event occurred at an exact km.
 * Never call with published replay groups as the source.
 */
import {buildReplayFromPhysicalGroupsV4} from './physicalGroupReplayAdapterV4.mjs';

const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const members=(frame,id)=>{
 const matches=frame.groups.filter(g=>g.riderIds.includes(id));
 if(matches.length!==1)throw Error('TARGET_RIDER_NOT_UNIQUE');
 return [...matches[0].riderIds].sort();
};

export function reconstructPhysicalCheckpointCandidateV4({
 riderId,previousKm,checkpointKm,physicalGroupsAtKm,groupToleranceSeconds
}={}){
 if(typeof riderId!=='string'||!riderId||!Number.isFinite(previousKm)||
    !Number.isFinite(checkpointKm)||previousKm<0||checkpointKm<=previousKm||
    typeof physicalGroupsAtKm!=='function')return {classification:'NOT_ELIGIBLE'};
 try{
   const snapshots=[previousKm,checkpointKm].map(km=>({
     km,groups:physicalGroupsAtKm(km)
   }));
   // The bridge validates gaps, unique rider identities and rider-set parity.
   const replay=buildReplayFromPhysicalGroupsV4(snapshots,{groupToleranceSeconds});
   const first=members(replay.frames[0],riderId);
   const last=members(replay.frames[1],riderId);
   if(same(first,last))
     return {classification:'NO_PHYSICAL_MEMBERSHIP_CHANGE'};
   const observed=replay.observations.some(event=>
     event.riderIds.includes(riderId)||
     event.previousGroupMembers.some(group=>group.includes(riderId)));
   return {classification:observed?'PHYSICAL_TRANSITION_CANDIDATE':'UNSUPPORTED_TRANSITION'};
 }catch{
   return {classification:'INVALID_PHYSICAL_EVIDENCE'};
 }
}
