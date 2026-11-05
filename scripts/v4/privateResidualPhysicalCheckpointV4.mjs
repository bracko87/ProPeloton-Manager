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

/**
 * Private-only two-checkpoint recovery. BOTH existing adjacent checkpoints
 * must be stale and both independently checked against stable physical road
 * states. A temporary physical anchor is used solely to run the already
 * proven single-checkpoint safeguards, then discarded BEFORE strict replay.
 * No anchor, commentary, or incident is added to the returned timeline.
 */
export function buildPrivateResidualPhysicalPairV4({
 timeline,checkpointId,residualCheckpointId,physicalGroupsAtKm
}={}){
 if(!Array.isArray(timeline?.checkpoints)||
    typeof checkpointId!=='string'||!checkpointId||
    typeof residualCheckpointId!=='string'||!residualCheckpointId||
    typeof physicalGroupsAtKm!=='function')
  return {status:'PAIR_INVALID_INPUT'};
 const checkpoints=timeline.checkpoints;
 const start=checkpoints.findIndex(cp=>cp.checkpointId===checkpointId);
 if(start<1||start+1>=checkpoints.length||
    checkpoints[start+1].checkpointId!==residualCheckpointId)
  return {status:'PAIR_NOT_ADJACENT'};
 const cp0=checkpoints[start],cp1=checkpoints[start+1];
 const k0=cp0.raceProgress?.kmFromStart,k1=cp1.raceProgress?.kmFromStart;
 if(!Number.isFinite(k0)||!Number.isFinite(k1)||k0<=0||
    k1<k0||k1-k0>5)
  return {status:'PAIR_DISTANCE_UNSAFE'};
 let p0,p1;
 try{
  p0=partition(physicalGroupsAtKm(k0));
  p1=partition(physicalGroupsAtKm(k1));
  const samples=[0.25,0.5,0.75].map(f=>
    partition(physicalGroupsAtKm(k0+(k1-k0)*f)));
  if(!p0||!p1||samples.some(x=>!x))
   return {status:'PAIR_PHYSICAL_UNAVAILABLE'};
  if(!same(p0,p1)||samples.some(x=>!same(x,p0)))
   return {status:'PAIR_PHYSICAL_MOVEMENT'};
 }catch{return {status:'PAIR_PHYSICAL_UNAVAILABLE'};}
 const r0=partition(cp0.groups),r1=partition(cp1.groups);
 if(!r0||!r1)return {status:'PAIR_REPLAY_INVALID'};
 if(!same(p0,r0)&&!same(p1,r1)&&
    eq(p0.ids,r0.ids)&&eq(p1.ids,r1.ids)){
  // Both snapshots are stale yet contain the SAME active rider population.
  // We do not infer any between-checkpoint transfer event.
 }else return {status:'PAIR_NOT_TWO_STALE_MEMBERSHIPS'};
 let resultTimeline=timeline;
 const provenance=[];
 for(let j=start;j<=start+1;j++){
  const item=resultTimeline.checkpoints[j];
  const km=item.raceProgress?.kmFromStart;
  let physical;
  try{physical=partition(physicalGroupsAtKm(km));}
  catch{return {status:'PAIR_PHYSICAL_UNAVAILABLE'};}
  if(!physical)return {status:'PAIR_PHYSICAL_UNAVAILABLE'};
  const virtualId=item.checkpointId+':v4_private_discarded_physical_anchor';
  if(resultTimeline.checkpoints.some(cp=>cp.checkpointId===virtualId))
   return {status:'PAIR_VIRTUAL_ID_COLLISION'};
  const virtualAnchor={
   checkpointId:virtualId,raceProgress:{kmFromStart:km},
   finalResultsVisible:false,
   groups:physical.rows.map(g=>({...g,riderIds:[...g.riderIds]}))
  };
  const temporaryCheckpoints=[
    ...resultTimeline.checkpoints.slice(0,j+1),virtualAnchor,
    ...resultTimeline.checkpoints.slice(j+1)
  ];
  const candidate=buildPrivateResidualPhysicalCheckpointV4({
   timeline:{...resultTimeline,checkpoints:temporaryCheckpoints},
   checkpointId:item.checkpointId,residualCheckpointId:virtualId,
   physicalGroupsAtKm
  });
  if(candidate.status!=='RESIDUAL_PHYSICAL_CHECKPOINT_CREATED')
   return {status:j===start?'PAIR_FIRST_REJECTED':'PAIR_SECOND_REJECTED',
     reason:candidate.status,detail:candidate.detail??candidate.reason??'NONE'};
  // Copy only the corrected EXISTING checkpoint, not the virtual anchor.
  const corrected=candidate.timeline.checkpoints[j];
  const restored=resultTimeline.checkpoints.map((row,i)=>i===j?corrected:row);
  resultTimeline={...resultTimeline,checkpoints:restored};
  provenance.push(candidate.incidentProvenanceRelation);
 }
 if(resultTimeline.checkpoints.length!==checkpoints.length||
    resultTimeline.checkpoints.some((cp,i)=>cp.checkpointId!==checkpoints[i].checkpointId))
  return {status:'PAIR_REPLAY_INVALID'};
 return {status:'RESIDUAL_PHYSICAL_PAIR_CREATED',timeline:resultTimeline,
  incidentProvenanceRelation:provenance.includes('LEDGER_EXTRAS_VERIFIED')?
   'LEDGER_EXTRAS_VERIFIED':'EXACT',
  researchOnly:true,officialWrites:0};
}
