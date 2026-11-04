/**
 * Private trial: reconcile stale rider display labels only when BOTH
 * checkpoint group memberships are independently identical to physical
 * groups. Never create, delete, or merge physical groups.
 */
const members=(groups,id)=>{
 if(!Array.isArray(groups))return null;
 const matching=groups.filter(g=>Array.isArray(g?.riderIds)&&g.riderIds.includes(id));
 if(matching.length!==1)return null;
 const m=matching[0].riderIds;
 if(new Set(m).size!==m.length||m.some(x=>typeof x!=='string'||!x))return null;
 return {ids:[...m].sort(),code:matching[0].displayCode};
};
const equal=(a,b)=>a?.length===b?.length&&a?.every((x,i)=>x===b[i]);
export function buildPrivatePhysicalLabelHandoffV4({
 timeline,checkpointId,riderId,physicalGroupsAtKm
}={}){
 if(!timeline||!Array.isArray(timeline.checkpoints)||!checkpointId||
    typeof riderId!=='string'||!riderId||typeof physicalGroupsAtKm!=='function')
   return {status:'NOT_ELIGIBLE'};
 const i=timeline.checkpoints.findIndex(cp=>cp.checkpointId===checkpointId);
 if(i<1)return {status:'NOT_ELIGIBLE'};
 const a=timeline.checkpoints[i-1],b=timeline.checkpoints[i];
 const km0=a.raceProgress?.kmFromStart,km1=b.raceProgress?.kmFromStart;
 if(!Number.isFinite(km0)||!Number.isFinite(km1)||km1<km0)
   return {status:'NOT_ELIGIBLE'};
 let firstPhysical,secondPhysical;
 try{
   firstPhysical=members(physicalGroupsAtKm(km0),riderId);
   secondPhysical=members(physicalGroupsAtKm(km1),riderId);
 }catch{return {status:'INVALID_PHYSICAL_EVIDENCE'};}
 const first=members(a.groups,riderId),second=members(b.groups,riderId);
 if(!first||!second||!firstPhysical||!secondPhysical)
   return {status:'INVALID_PHYSICAL_EVIDENCE'};
 if(!equal(first.ids,firstPhysical.ids)||!equal(second.ids,secondPhysical.ids))
   return {status:'MEMBERSHIP_MISMATCH'};
 if(!equal(first.ids,second.ids))return {status:'ACTUAL_PHYSICAL_CHANGE'};
 if(!Array.isArray(b.riderStates))return {status:'NOT_ELIGIBLE'};
 // No transition, no contradictory public events.
 if(b.commentary?.some(e=>['group_split','group_merge','incident'].includes(e.eventType)))
   return {status:'EXISTING_TRANSITION'};
 const g=b.groups.find(g=>g.riderIds.includes(riderId));
 if(!g||typeof g.displayCode!=='string')return {status:'NOT_ELIGIBLE'};
 const incorrect=b.riderStates.filter(s=>g.riderIds.includes(s.riderId)&&s.status!=='dnf'&&
   s.displayCode!==g.displayCode);
 if(incorrect.length===0)return {status:'NO_LABEL_MISMATCH'};
 // Reconcile only the group's riders to its already authoritative published code.
 const states=b.riderStates.map(s=>incorrect.includes(s)?{...s,displayCode:g.displayCode}:s);
 const checkpoints=timeline.checkpoints.map((cp,j)=>i===j?{...cp,riderStates:states}:cp);
 return {status:'LABEL_HANDOFF_CREATED',timeline:{...timeline,checkpoints},researchOnly:true,officialWrites:0};
}
