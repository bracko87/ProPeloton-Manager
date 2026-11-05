/**
 * Research-only repair of ONE stale pre-transfer checkpoint. The repaired
 * snapshot must be bracketed by authoritative, identical physical partitions
 * and the later replay checkpoint must already match physics. No narrated
 * movement, incidents, rider status, energy, results, or race physics changes.
 * All final acceptance remains with the ORIGINAL strict publication policy.
 */
const partition=groups=>{
 if(!Array.isArray(groups)||!groups.length)return null;
 const seen=new Set(),rows=[],keys=[];
 for(const g of groups){
  if(!Array.isArray(g?.riderIds)||!g.riderIds.length||
     g.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
  g.riderIds.forEach(id=>seen.add(id));
  rows.push(g);keys.push([...g.riderIds].sort().join('\u0000'));
 }
 return {rows,keys:keys.sort(),ids:[...seen].sort()};
};
const eq=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const same=(a,b)=>a&&b&&eq(a.keys,b.keys)&&eq(a.ids,b.ids);
const passive=new Set(['race_status','late_chase','bridge_progress',
 'peloton_control','kom','intermediate_sprint','bonus_sprint']);
export function buildPrivateResidualPhysicalCheckpointV4({
 timeline,checkpointId,residualCheckpointId,physicalGroupsAtKm
}={}){
 if(!Array.isArray(timeline?.checkpoints)||
    typeof checkpointId!=='string'||!checkpointId||
    typeof residualCheckpointId!=='string'||!residualCheckpointId||
    typeof physicalGroupsAtKm!=='function')
  return {status:'INVALID_INPUT'};
 const checkpoints=timeline.checkpoints;
 const i=checkpoints.findIndex(cp=>cp.checkpointId===checkpointId);
 if(i<1||i+1>=checkpoints.length||
    checkpoints[i+1].checkpointId!==residualCheckpointId)
  return {status:'NOT_ADJACENT'};
 const cp=checkpoints[i],next=checkpoints[i+1];
 const km=cp.raceProgress?.kmFromStart,kmNext=next.raceProgress?.kmFromStart;
 if(!Number.isFinite(km)||km<=0||!Number.isFinite(kmNext)||kmNext<km)
  return {status:'INVALID_DISTANCE'};
 // Keep every recorded event, incident, and rider attribute unchanged.
 // The incident ledger is the source of truth: Phase10 may publish only a
 // subset as commentary. Never accept commentary lacking source incident
 // evidence; any unnarrated ledger rider must still be safely racing.
 const unsafe=reason=>({status:'CAUSAL_OR_INCIDENT_UNSAFE',reason});
 if(cp.finalResultsVisible||next.finalResultsVisible)
  return unsafe('FINISH_VISIBLE');
 if(!['base','event'].includes(cp.checkpointKind))
  return unsafe('CHECKPOINT_KIND');
 if(!Array.isArray(cp.groups)||!Array.isArray(cp.gaps)||
    !Array.isArray(cp.riderStates)||!Array.isArray(next.groups)||
    !Array.isArray(cp.commentary))
  return unsafe('CHECKPOINT_DATA_INVALID');
 if(cp.commentary.some(c=>!c||(
    !passive.has(c.eventType)&&c.eventType!=='incident')))
  return unsafe('CAUSAL_EVENT');
 const incidentEvents=cp.commentary.filter(c=>c.eventType==='incident');
 if(cp.incidents!==undefined&&!Array.isArray(cp.incidents))
  return unsafe('INCIDENT_LEDGER_INVALID');
 const incidents=cp.incidents??[];
 if(incidentEvents.length>incidents.length)
  return {...unsafe('INCIDENT_PROVENANCE_MISSING'),
    detail:!incidents.length?'COMMENTARY_WITHOUT_LEDGER':
      'COMMENTARY_EXCEEDS_LEDGER'};
 if(incidents.length){
  if(new Set(incidents.map(row=>row?.incidentId)).size!==incidents.length)
   return unsafe('INCIDENT_LEDGER_INVALID');
  const seen=new Set(),matchedCommentaryIds=new Set();
  for(const incident of incidents){
   if(typeof incident?.incidentId!=='string'||!incident.incidentId||
      seen.has(incident.incidentId)||!Array.isArray(incident.riderIds)||
      incident.riderIds.length===0||
      new Set(incident.riderIds).size!==incident.riderIds.length||
      incident.riderIds.some(id=>typeof id!=='string'||!id))
    return unsafe('INCIDENT_LEDGER_INVALID');
   seen.add(incident.incidentId);
   const mentions=incidentEvents.filter(c=>
     c.commentaryId==='commentary:'+incident.incidentId);
   if(mentions.length>1)
    return {...unsafe('INCIDENT_PROVENANCE_MISSING'),
      detail:'DUPLICATE_COMMENTARY'};
   if(mentions.length===1){
    matchedCommentaryIds.add(incident.incidentId);
    if(!Array.isArray(mentions[0].riderIds)||
       !eq([...mentions[0].riderIds].sort(),[...incident.riderIds].sort()))
     return {...unsafe('INCIDENT_PROVENANCE_MISSING'),
       detail:'INCIDENT_RIDER_SET_MISMATCH'};
   }
  }
  if(matchedCommentaryIds.size!==incidentEvents.length)
   return {...unsafe('INCIDENT_PROVENANCE_MISSING'),
     detail:'INCIDENT_ID_LINK_MISSING'};
 }
 // Subsequent physical bracketing and 'racing'-only state guards ensure
 // this incident did not detach riders, induce a catch, or change membership.

 let before,at,later;
 try{
  before=partition(physicalGroupsAtKm(Math.max(0,km-0.00001)));
  at=partition(physicalGroupsAtKm(km));
  later=partition(physicalGroupsAtKm(kmNext));
 }catch{return {status:'PHYSICAL_UNAVAILABLE'};}
 const stale=partition(cp.groups),current=partition(next.groups);
 if(!before||!at||!later||!stale||!current)
  return {status:'INVALID_PARTITION'};
 if(!same(before,at)||!same(at,later))
  return {status:'PHYSICAL_MOVEMENT_PRESENT'};
 if(!same(current,later))
  return {status:'CURRENT_NOT_PHYSICAL'};
 if(!eq(stale.ids,at.ids))
  return {status:'RIDER_SET_MISMATCH'};
 if(same(stale,at))
  return {status:'ALREADY_PHYSICAL'};
 const stateIds=new Set(),byId=new Map();
 for(const row of cp.riderStates){
  if(typeof row?.riderId!=='string'||stateIds.has(row.riderId)||
     row.status!=='racing')return {status:'RIDER_STATE_UNSAFE'};
  stateIds.add(row.riderId);
 }
 if(!eq([...stateIds].sort(),at.ids))
  return {status:'RIDER_STATE_UNSAFE'};
 // Unnarrated incidents can be retained only when every recorded participant
 // is present and still racing in the independently stable physical partition.
 if(incidents.some(incident=>incident.riderIds.some(id=>!stateIds.has(id))))
  return {...unsafe('INCIDENT_LEDGER_INVALID'),detail:'INCIDENT_RIDER_NOT_ACTIVE'};
 const physicalCodes=new Set(),groupRows=[],gapRows=[];
 for(const raw of at.rows){
  if(typeof raw.groupCode!=='string'||!raw.groupCode||
     typeof raw.displayCode!=='string'||!raw.displayCode||
     physicalCodes.has(raw.displayCode)||
     !Number.isFinite(raw.gapSeconds)||raw.gapSeconds<0)
   return {status:'PHYSICAL_GROUP_IDENTITY_UNSAFE'};
  physicalCodes.add(raw.displayCode);
  // A stable partition must also carry stable authoritative group identities.
  const matchingLater=later.rows.find(g=>eq([...g.riderIds].sort(),
    [...raw.riderIds].sort()));
  if(!matchingLater||matchingLater.displayCode!==raw.displayCode||
     matchingLater.groupCode!==raw.groupCode)
   return {status:'PHYSICAL_GROUP_IDENTITY_UNSAFE'};
  const group={groupCode:raw.groupCode,displayCode:raw.displayCode,
   physicalLineageId:raw.physicalLineageId??null,
   physicalPosition:raw.physicalPosition,colorKey:raw.colorKey,
   riderIds:[...raw.riderIds]};
  const gap={groupCode:raw.groupCode,displayCode:raw.displayCode,
   gapSeconds:raw.gapSeconds,officialTimeSeconds:null};
  groupRows.push(group);gapRows.push(gap);
  for(const id of raw.riderIds)byId.set(id,{group,gap});
 }
 const riderStates=cp.riderStates.map(row=>{
  const mapping=byId.get(row.riderId);
  return {...row,groupCode:mapping.group.groupCode,
   displayCode:mapping.group.displayCode,
   gapSeconds:mapping.gap.gapSeconds};
 });
 const repaired=checkpoints.map((row,j)=>j===i?
  {...row,groups:groupRows,gaps:gapRows,riderStates}:row);
 return {status:'RESIDUAL_PHYSICAL_CHECKPOINT_CREATED',
  timeline:{...timeline,checkpoints:repaired},
  incidentProvenanceRelation:incidents.length>incidentEvents.length?
    'LEDGER_EXTRAS_VERIFIED':'EXACT',
  researchOnly:true,officialWrites:0};
}
