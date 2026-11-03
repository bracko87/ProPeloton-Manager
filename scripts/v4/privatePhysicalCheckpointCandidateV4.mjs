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
   if(!observed)return {classification:'UNSUPPORTED_TRANSITION'};
   const targetPrevious=replay.frames[0].groups.find(g=>g.riderIds.includes(riderId));
   const targetNext=replay.frames[1].groups.find(g=>g.riderIds.includes(riderId));
   const previousMembers=new Set(targetPrevious.riderIds);
   const nextMembers=new Set(targetNext.riderIds);
   const departures=[...previousMembers].filter(id=>!nextMembers.has(id));
   const arrivals=[...nextMembers].filter(id=>!previousMembers.has(id));
   const eventType=departures.length&&arrivals.length?'group_reorganization':
     departures.length?'group_split':arrivals.length?'group_merge':'group_reorganization';
   // This is an interval-bounded event proposal, NOT a checkpoint commentary
   // or publication authorization. Exact event km/time remain unknown.
   return {
     classification:'PHYSICAL_TRANSITION_CANDIDATE',
     proposal:{
       eventType,
       observedBetweenKm:[previousKm,checkpointKm],
       exactEventKmKnown:false,
       exactEventTimeKnown:false,
       source:'authoritative_physical_groups',
       riderIds:[...new Set([...targetPrevious.riderIds,...targetNext.riderIds])].sort(),
       beforeMembers:[...targetPrevious.riderIds],
       afterMembers:[...targetNext.riderIds],
     }
   };
 }catch{
   return {classification:'INVALID_PHYSICAL_EVIDENCE'};
 }
}
