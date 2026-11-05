/**
 * Private, evidence-gated recovery of two adjacent post-catch checkpoints.
 * Phase10 DNF removals are authoritative; only surviving group presentation
 * may be aligned to independently stable physical groups. Never changes
 * events, incidents, rider status/energy, results or official race data.
 * The complete original strict publication validator remains mandatory.
 */
const key=ids=>[...ids].sort().join('\u0000');
const equal=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const partition=(groups,excluded=new Set())=>{
 if(!Array.isArray(groups)||!groups.length)return null;
 const seen=new Set(),rows=[],keys=[],ids=[];
 for(const group of groups){
  if(!Array.isArray(group?.riderIds)||!group.riderIds.length)return null;
  const active=[];
  for(const id of group.riderIds){
   if(typeof id!=='string'||!id||seen.has(id))return null;
   seen.add(id);
   if(!excluded.has(id)){ids.push(id);active.push(id);}
  }
  if(active.length){keys.push(key(active));rows.push({...group,riderIds:active});}
 }
 return {ids:ids.sort(),keys:keys.sort(),rows,sourceIds:[...seen].sort()};
};
const same=(a,b)=>!!a&&!!b&&equal(a.ids,b.ids)&&equal(a.keys,b.keys);
const passive=new Set(['race_status','late_chase','bridge_progress',
 'peloton_control','kom','intermediate_sprint','bonus_sprint']);
function safeEvents(cp,allIds){
 if(!Array.isArray(cp.commentary)||!Array.isArray(cp.incidents))
  return false;
 if(cp.commentary.some(item=>!item||(!passive.has(item.eventType)&&
    item.eventType!=='incident')))return false;
 const seen=new Set(),byId=new Map();
 for(const event of cp.incidents){
  if(typeof event?.incidentId!=='string'||!event.incidentId||
     seen.has(event.incidentId)||!Array.isArray(event.riderIds)||
     !event.riderIds.length||new Set(event.riderIds).size!==event.riderIds.length||
     event.riderIds.some(id=>!allIds.has(id)))return false;
  seen.add(event.incidentId);
  byId.set(event.incidentId,event);
 }
 const narrated=new Set();
 for(const item of cp.commentary.filter(c=>c.eventType==='incident')){
  if(typeof item.commentaryId!=='string'||!item.commentaryId.startsWith('commentary:')||
     narrated.has(item.commentaryId))return false;
  narrated.add(item.commentaryId);
  const original=byId.get(item.commentaryId.slice('commentary:'.length));
  if(!original||!Array.isArray(item.riderIds)||
     !equal([...item.riderIds].sort(),[...original.riderIds].sort()))
   return false;
 }
 return true;
}

// Autonomous groups are constructed in Phase10, outside the sampled road
// partitions. Keep only groups with independent before/after Phase10 witnesses
// and matching final published membership/identity. Never synthesize a group.
function protectedAutonomousGroups({
  cp,physical,det,stages,absent
}){
 const active=new Set(det.autonomousRiderIds);
 if(!active.size)return {status:'NONE',groups:[],gaps:[]};
 if([...active].some(id=>absent.has(id)||!physical.ids.includes(id)))
  return {status:'AUTONOMOUS_IDENTITY_UNSAFE'};
 const detached=partition(stages?.AFTER_DETACHMENT);
 const added=partition(stages?.AFTER_AUTONOMOUS_GROUPS);
 const consolidated=partition(stages?.AFTER_CONSOLIDATION);
 const finished=partition(stages?.AFTER_FINISH_COMMIT);
 const normalized=partition(stages?.AFTER_DISPLAY_NORMALIZATION);
 const original=partition(cp.groups);
 if(!detached||!added||!consolidated||!finished||!normalized||!original)
  return {status:'AUTONOMOUS_PHASE10_WITNESS_MISSING'};
 const detachedExpected=physical.ids.filter(id=>!active.has(id)&&!absent.has(id));
 const rejoinedExpected=physical.ids.filter(id=>!absent.has(id));
 if(!equal(detached.ids,detachedExpected)||
    !equal(added.ids,rejoinedExpected)||
    !equal(consolidated.ids,rejoinedExpected)||
    !equal(finished.ids,rejoinedExpected)||
    !equal(normalized.ids,rejoinedExpected)||
    !same(normalized,original))
  return {status:'AUTONOMOUS_PHASE10_SET_UNSAFE'};
 const collected=[];
 const groupOf=(groups,id)=>groups.filter(g=>
  Array.isArray(g?.riderIds)&&g.riderIds.includes(id));
 const witnessed=new Set();
 for(const id of active){
  if(witnessed.has(id))continue;
  const target=groupOf(cp.groups,id);
  if(target.length!==1)return {status:'AUTONOMOUS_GROUP_AMBIGUOUS'};
  const row=target[0];
  if(row.riderIds.some(x=>!active.has(x))||
     row.riderIds.some(x=>witnessed.has(x))||
     typeof row.groupCode!=='string'||!row.groupCode||
     typeof row.displayCode!=='string'||!row.displayCode)
   return {status:'AUTONOMOUS_GROUP_MIXED'};
  // Each recorded stage must independently agree that the autonomous group
  // exists with the same members. Group names may be normalized, but the
  // published group identity must be traceable to the source stage.
  for(const [stageKey,stage] of [
   ['AFTER_AUTONOMOUS_GROUPS',stages.AFTER_AUTONOMOUS_GROUPS],
   ['AFTER_CONSOLIDATION',stages.AFTER_CONSOLIDATION],
   ['AFTER_FINISH_COMMIT',stages.AFTER_FINISH_COMMIT],
   ['AFTER_DISPLAY_NORMALIZATION',stages.AFTER_DISPLAY_NORMALIZATION]
  ]){
   const matching=stage.filter(g=>Array.isArray(g?.riderIds)&&
    equal([...g.riderIds].sort(),[...row.riderIds].sort()));
   if(matching.length!==1){
    const members=new Set(row.riderIds);
    const partial=stage.some(g=>Array.isArray(g?.riderIds)&&
      g.riderIds.some(id=>members.has(id)));
    return {status:'AUTONOMOUS_GROUP_NOT_STABLE',stage:stageKey,
      detail:matching.length>1?'DUPLICATE_MEMBERSHIP':
        partial?'MEMBERSHIP_CHANGED':'AUTONOMOUS_RIDERS_MISSING'};
   }
   // Physical lineage is determined by groupCode and exact members.
   // Phase10 may assign a temporary displayCode at creation and renumber
   // it later. This is a label change, NOT a physical group transition.
   // Preserve the final published code; never import an intermediate code.
   if(matching[0].groupCode!==row.groupCode)
    return {status:'AUTONOMOUS_GROUP_NOT_STABLE',stage:stageKey,
      detail:matching[0].displayCode!==row.displayCode?
        'BOTH_CODES_CHANGED':'GROUP_CODE_CHANGED'};
   if(typeof matching[0].displayCode!=='string'||!matching[0].displayCode)
    return {status:'AUTONOMOUS_GROUP_NOT_STABLE',stage:stageKey,
      detail:'DISPLAY_CODE_INVALID'};
   // Renumbering is only demonstrable if each intermediate label denotes
   // exactly one group. Reject ambiguous duplicate group/label assignments.
   // groupCode describes a class, not a unique identity: multiple
   // independent autonomous groups legitimately use 'dropped_group'.
   // The transient stage identity is its unique displayCode plus witnessed
   // rider membership. Never infer a collision from repeated groupCode.
   const codes=new Set();
   for(const stagedGroup of stage){
    if(typeof stagedGroup?.displayCode!=='string'||!stagedGroup.displayCode||
       typeof stagedGroup?.groupCode!=='string'||!stagedGroup.groupCode||
       codes.has(stagedGroup.displayCode))
     return {status:'AUTONOMOUS_STAGE_CODE_COLLISION',stage:stageKey};
    codes.add(stagedGroup.displayCode);
   }
   if(stageKey==='AFTER_DISPLAY_NORMALIZATION'&&
      matching[0].displayCode!==row.displayCode)
    return {status:'AUTONOMOUS_GROUP_NOT_STABLE',stage:stageKey,
      detail:'DISPLAY_CODE_CHANGED'};
  }
  const matchingGaps=cp.gaps.filter(g=>g.groupCode===row.groupCode&&
    g.displayCode===row.displayCode&&Number.isFinite(g.gapSeconds)&&
    g.gapSeconds>=0);
  if(matchingGaps.length!==1)
   return {status:'AUTONOMOUS_GAP_UNVERIFIED'};
  row.riderIds.forEach(x=>witnessed.add(x));
  collected.push({row,gap:matchingGaps[0]});
 }
 if(witnessed.size!==active.size)return {status:'AUTONOMOUS_GROUP_AMBIGUOUS'};
 return {status:'VERIFIED',groups:collected};
}
export function buildPrivateResidualDnfSurvivorPairV4({
 timeline,checkpointId,residualCheckpointId,physicalGroupsAtKm,
 firstDetachment,secondDetachment,firstPhase10Stages,secondPhase10Stages
}={}){
 if(!Array.isArray(timeline?.checkpoints)||typeof physicalGroupsAtKm!=='function'||
    typeof checkpointId!=='string'||typeof residualCheckpointId!=='string')
  return {status:'INVALID_INPUT'};
 const cps=timeline.checkpoints;
 const i=cps.findIndex(c=>c.checkpointId===checkpointId);
 if(i<1||i+1>=cps.length||cps[i+1].checkpointId!==residualCheckpointId)
  return {status:'NOT_ADJACENT'};
 const pair=[cps[i],cps[i+1]];
 const distances=pair.map(cp=>cp.raceProgress?.kmFromStart);
 if(!distances.every(Number.isFinite)||distances[0]<=0||
    distances[1]<distances[0]||distances[1]-distances[0]>5)
  return {status:'DISTANCE_UNSAFE'};
 let samples;
 try{samples=[
  Math.max(0,distances[0]-0.00001),
  distances[0],...([0.25,0.5,0.75].map(f=>distances[0]+
   (distances[1]-distances[0])*f)),distances[1]
 ].map(km=>partition(physicalGroupsAtKm(km)));}
 catch{return {status:'PHYSICAL_UNAVAILABLE'};}
 if(samples.some(x=>!x))return {status:'PHYSICAL_UNAVAILABLE'};
 if(samples.some(s=>!same(s,samples[1])))
  return {status:'PHYSICAL_MOVEMENT_PRESENT'};
 const raw=[samples[1],samples.at(-1)];
 const dets=[firstDetachment,secondDetachment];
 const stages=[firstPhase10Stages,secondPhase10Stages];
 const rebuilt=[...cps],changed=[];
 const statuses=[];
 for(let j=0;j<2;j++){
  const cp=pair[j],det=dets[j],physical=raw[j];
  if(cp.finalResultsVisible||!['base','event'].includes(cp.checkpointKind)||
     !Array.isArray(cp.groups)||!Array.isArray(cp.gaps)||
     !Array.isArray(cp.riderStates))return {status:'CHECKPOINT_UNSAFE'};
  if(!Array.isArray(det?.dnfRiderIds)||!det.dnfRiderIds.length||
     !Array.isArray(det.autonomousRiderIds)||
     new Set(det.dnfRiderIds).size!==det.dnfRiderIds.length||
     new Set(det.autonomousRiderIds).size!==det.autonomousRiderIds.length)
   return {status:'DETACHMENT_UNVERIFIED'};
  const absent=new Set(det.dnfRiderIds);
  if([...absent].some(id=>!physical.ids.includes(id)))
   return {status:'DNF_RIDER_UNWITNESSED'};
  const protectedGroups=protectedAutonomousGroups({
    cp,physical,det,stages:stages[j],absent
  });
  if(!['NONE','VERIFIED'].includes(protectedGroups.status))
   return {status:protectedGroups.status,
     stage:protectedGroups.stage??'UNKNOWN',
     detail:protectedGroups.detail??'NONE'};
  const autonomous=new Set(det.autonomousRiderIds);
  const original=partition(cp.groups);
  const expected=partition(physical.rows,new Set([...absent,...autonomous]));
  if(!original||!expected||!expected.rows.length||
     !equal(original.ids,[...expected.ids,...autonomous].sort()))
   return {status:'SURVIVOR_SET_MISMATCH'};
  const states=new Map(cp.riderStates.map(row=>[row.riderId,row]));
  if(states.size!==cp.riderStates.length||
     !equal([...states.keys()].sort(),physical.ids)||
     [...absent].some(id=>states.get(id)?.status!=='dnf')||
     [...expected.ids,...autonomous].some(id=>states.get(id)?.status!=='racing'))
   return {status:'RIDER_STATE_UNSAFE'};
  if(!safeEvents(cp,states))return {status:'INCIDENT_OR_EVENT_UNSAFE'};
  const initial=partition(stages[j]?.INITIAL);
  if(!initial||!equal(initial.ids,physical.ids))
   return {status:'PHASE10_INPUT_UNVERIFIED'};
  // Only one known source state: the earlier checkpoint entered Phase10
  // with stale membership; the later one entered from raw road physics.
  if(j===0&&same(initial,physical))
   return {status:'FIRST_SOURCE_NOT_STALE'};
  if(j===1&&!same(initial,physical))
   return {status:'SECOND_SOURCE_NOT_PHYSICAL'};
  const expectedCombined=partition([
    ...expected.rows,...protectedGroups.groups.map(row=>row.row)
  ]);
  if(!expectedCombined)return {status:'PHYSICAL_GROUP_INVALID'};
  if(same(original,expectedCombined)){
   statuses.push('ALREADY_ALIGNED');continue;
  }
  const codes=new Set(),groups=[],gaps=[],byId=new Map();
  for(const group of expected.rows){
   // Compare physical groups after BOTH recorded DNF and independently
   // witnessed autonomous detachment; preserve the autonomous groups below.
   const source=physical.rows.find(g=>equal(g.riderIds.filter(id=>
     !absent.has(id)&&!autonomous.has(id)).sort(),
     [...group.riderIds].sort()));
   if(!source||typeof source.displayCode!=='string'||!source.displayCode||
      typeof source.groupCode!=='string'||!source.groupCode||
      codes.has(source.displayCode)||!Number.isFinite(source.gapSeconds)||
      source.gapSeconds<0)return {status:'PHYSICAL_GROUP_INVALID'};
   codes.add(source.displayCode);
   const row={groupCode:source.groupCode,displayCode:source.displayCode,
     physicalLineageId:source.physicalLineageId??null,
     physicalPosition:source.physicalPosition,colorKey:source.colorKey,
     riderIds:[...group.riderIds]};
   const gap={groupCode:source.groupCode,displayCode:source.displayCode,
     gapSeconds:source.gapSeconds,officialTimeSeconds:null};
   groups.push(row);gaps.push(gap);
   for(const id of row.riderIds)byId.set(id,{row,gap});
  }
  for(const witness of protectedGroups.groups){
    const {row,gap}=witness;
    if(codes.has(row.displayCode))return {status:'AUTONOMOUS_CODE_COLLISION'};
    codes.add(row.displayCode);
    groups.push({...row,riderIds:[...row.riderIds]});
    gaps.push({...gap});
    for(const id of row.riderIds){
      if(byId.has(id))return {status:'AUTONOMOUS_IDENTITY_UNSAFE'};
      byId.set(id,{row,gap});
    }
  }
  if(byId.size!==original.ids.length)return {status:'SURVIVOR_SET_MISMATCH'};
  const updated=cp.riderStates.map(state=>{
   const mapping=byId.get(state.riderId);
   return mapping?{...state,groupCode:mapping.row.groupCode,
     displayCode:mapping.row.displayCode,gapSeconds:mapping.gap.gapSeconds}:state;
  });
  rebuilt[i+j]={...cp,groups,gaps,riderStates:updated};
  changed.push(j);
  statuses.push('SURVIVOR_RECONSTRUCTED');
 }
 if(!changed.length)return {status:'ALREADY_ALIGNED'};
 if(rebuilt.length!==cps.length||
    rebuilt.some((cp,j)=>cp.checkpointId!==cps[j].checkpointId))
  return {status:'REPLAY_SHAPE_CHANGED'};
 return {status:'DNF_SURVIVOR_PAIR_CREATED',
  timeline:{...timeline,checkpoints:rebuilt},
  first:statuses[0],second:statuses[1],
  researchOnly:true,officialWrites:0};
}
