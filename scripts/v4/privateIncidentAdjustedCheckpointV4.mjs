/**
 * Research-only incident-adjusted replay checkpoint reconstruction.
 *
 * Groups come from Phase 10's recorded last construction stage, never a
 * display-label guess. The stage must exactly match independent physical
 * groups, after removing only reached, status-confirmed DNFs.
 * The checkpoint must already contain the same active rider set, and
 * every group must have one unambiguous existing gap and identity.
 * No official results, rider statuses, incidents or physical model are edited.
 */
const key=ids=>[...ids].sort().join('\u0000');
function partition(groups){
 if(!Array.isArray(groups)||!groups.length)return null;
 const seen=new Set(),records=[];
 for(const group of groups){
  if(!Array.isArray(group?.riderIds)||!group.riderIds.length||
    group.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
  group.riderIds.forEach(id=>seen.add(id));
  records.push({key:key(group.riderIds),riderIds:[...group.riderIds],group});
 }
 return {records,ids:[...seen].sort(),keys:records.map(g=>g.key).sort()};
}
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export function buildPrivateIncidentAdjustedCheckpointV4({
 timeline,checkpointId,physicalGroupsAtKm,phase10Stages,reachedDnfRiderIds
}={}){
 if(!Array.isArray(timeline?.checkpoints)||!checkpointId||
 typeof physicalGroupsAtKm!=='function'||!phase10Stages||
 !Array.isArray(reachedDnfRiderIds)||new Set(reachedDnfRiderIds).size!==reachedDnfRiderIds.length)
 return {status:'NOT_ELIGIBLE'};
 const i=timeline.checkpoints.findIndex(cp=>cp.checkpointId===checkpointId);
 if(i<1)return {status:'CHECKPOINT_NOT_FOUND'};
 const current=timeline.checkpoints[i];
 if(current.finalResultsVisible||!Array.isArray(current.groups)||
 !Array.isArray(current.riderStates)||!Array.isArray(current.gaps)||
 !Array.isArray(current.commentary))return {status:'FINISH_OR_DATA_UNSAFE'};
 const source=partition(phase10Stages.AFTER_DISPLAY_NORMALIZATION);
 const displayed=partition(current.groups);
 let original;
 try{original=partition(physicalGroupsAtKm(current.raceProgress?.kmFromStart));}
 catch{return {status:'PHYSICAL_UNAVAILABLE'};}
 if(!source||!displayed||!original)return {status:'INVALID_PARTITION'};
 const removed=new Set(reachedDnfRiderIds);
 const riderStates=new Map(current.riderStates.map(s=>[s.riderId,s]));
 if(riderStates.size!==current.riderStates.length||
  [...removed].some(id=>riderStates.get(id)?.status!=='dnf'))
 return {status:'DNF_UNVERIFIED'};
 const expected=partition(original.records.map(x=>({
  riderIds:x.riderIds.filter(id=>!removed.has(id))
 })).filter(g=>g.riderIds.length));
 if(!expected)return {status:'INVALID_PARTITION'};
 if(!equal(expected.ids,source.ids)||!equal(expected.keys,source.keys))
 return {status:'SOURCE_NOT_PHYSICAL'};
 if(!equal(expected.ids,displayed.ids))
 return {status:'ACTIVE_RIDER_SET_MISMATCH'};
 if(equal(expected.keys,displayed.keys))
 return {status:'ALREADY_MATCHES_PHYSICAL'};
 const displayByCode=new Map(current.groups.map(g=>[g.displayCode,g]));
 const gapByCode=new Map(current.gaps.map(g=>[g.displayCode,g]));
 if(displayByCode.size!==current.groups.length||
  gapByCode.size!==current.gaps.length||
  current.groups.length!==current.gaps.length)
 return {status:'AMBIGUOUS_DISPLAY'};
 // Stage identities must correspond to existing checkpoint group codes.
 // Without a valid mapping we cannot infer group-level gaps from physics.
 const used=new Set(),groups=[],gaps=[],mapped=new Map();
 for(const entry of source.records){
  const g=entry.group,code=g.displayCode;
  if(typeof code!=='string'||used.has(code))return {status:'AMBIGUOUS_DISPLAY'};
  used.add(code);
  const corresponding=displayByCode.get(code),gap=gapByCode.get(code);
  if(!corresponding||!gap||corresponding.groupCode!==g.groupCode||
   gap.groupCode!==g.groupCode||
   !Number.isFinite(gap.gapSeconds)||gap.gapSeconds<0)
   return {status:'GAP_OR_GROUP_IDENTITY_MISSING'};
  groups.push({...g,riderIds:[...entry.riderIds]});
  gaps.push({...gap});
  for(const id of entry.riderIds){
   if(mapped.has(id))return {status:'INVALID_PARTITION'};
   mapped.set(id,{group:g,gap});
  }
 }
 // Existing replay states cannot be missing or duplicated; never alter DNF
 // states. Status/energy/time/official classification are all retained.
 if(mapped.size!==expected.ids.length||
  [...mapped.keys()].some(id=>riderStates.get(id)?.status!=='racing'))
 return {status:'STATE_UNSAFE'};
 const states=current.riderStates.map(s=>{
  const assignment=mapped.get(s.riderId);
  return !assignment?s:{...s,
   groupCode:assignment.group.groupCode,
   displayCode:assignment.group.displayCode,
   gapSeconds:assignment.gap.gapSeconds};
 });
 const checkpoints=timeline.checkpoints.map((cp,index)=>index===i?
  {...cp,groups,gaps,riderStates:states}:cp);
 return {status:'INCIDENT_CHECKPOINT_RECONSTRUCTED',
  timeline:{...timeline,checkpoints},researchOnly:true,officialWrites:0};
}
