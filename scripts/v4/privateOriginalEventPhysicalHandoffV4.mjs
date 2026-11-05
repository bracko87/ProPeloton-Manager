/**
 * Research-only correction of an ORIGINAL passive or verified covered-attack checkpoint.
 * Use authoritative physical rider groups at its own distance, never a
 * neighbour's guessed group membership. Every source and rider-state guard
 * fails closed; original strict publication acceptance is still mandatory.
 *
 * Does not touch official physics, event narration, DNF, energy or results.
 */
import {verifyPrivateAutonomousGroupsV4} from './privateResidualDnfSurvivorPairV4.mjs'
const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const key=ids=>[...ids].sort().join('\u0000');
const partition=(rows,excluded=new Set())=>{
 if(!Array.isArray(rows)||!rows.length)return null;
 const out=[],seen=new Set();
 for(const group of rows){
  if(!Array.isArray(group?.riderIds)||!group.riderIds.length||
     group.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))
   return null;
  group.riderIds.forEach(id=>seen.add(id));
  const riderIds=group.riderIds.filter(id=>!excluded.has(id));
  if(riderIds.length)out.push({key:key(riderIds),group:{...group,riderIds}});
 }
 if(new Set(out.map(r=>r.key)).size!==out.length)return null;
 return {rows:out,ids:out.flatMap(r=>r.group.riderIds).sort(),
   keys:out.map(r=>r.key).sort()};
};
const same=(a,b)=>!!a&&!!b&&eq(a.ids,b.ids)&&eq(a.keys,b.keys);
const passive=new Set(['race_status','peloton_control','bridge_progress',
 'kom','intermediate_sprint','bonus_sprint']);
const eventClass=type=>passive.has(type)?'PASSIVE':
 type==='group_split'?'GROUP_SPLIT':
 type==='group_merge'?'GROUP_MERGE':
 type==='catch'?'CATCH':
 type==='attack'?'ATTACK':
 type==='late_chase'?'LATE_CHASE':
 type==='incident'?'INCIDENT':typeof type==='string'?'OTHER':'UNKNOWN';
export function buildPrivateOriginalEventPhysicalHandoffV4({
 timeline,checkpointId,baseTimeline,sourcePhase10Timeline,physicalGroupsAtKm,
 phase10Stages,previousPhase10Stages,detachment,previousDetachment,failedRiderId
}={}){
 const reject=(status,kind='UNKNOWN')=>({status,eventKind:kind});
 if(typeof checkpointId!=='string'||typeof failedRiderId!=='string'||
  !Array.isArray(timeline?.checkpoints)||
  !Array.isArray(baseTimeline?.checkpoints)||
  typeof physicalGroupsAtKm!=='function')
  return reject('INVALID_INPUT');
 const cps=timeline.checkpoints;
 const i=cps.findIndex(cp=>cp.checkpointId===checkpointId);
 if(i<1)return reject('CHECKPOINT_MISSING');
 const previous=cps[i-1],current=cps[i];
 const original=baseTimeline.checkpoints.find(cp=>
  cp.checkpointId===checkpointId);
 const sourceEvent=original?.commentary?.[0];
 const coveredAttack=sourceEvent?.eventType==='attack'&&
  ['Attack is covered','Reactive counterattack is covered']
   .includes(sourceEvent.title)&&
  Array.isArray(sourceEvent.riderIds)&&sourceEvent.riderIds.length===1&&
  typeof sourceEvent.riderIds[0]==='string'&&
  sourceEvent.riderIds[0].length>0;
 const kind=coveredAttack?'ATTACK_COVERED':
  sourceEvent?.eventType==='attack'?'ATTACK_OTHER':
  eventClass(sourceEvent?.eventType);
 if(!original||current.checkpointId.includes(':phase10-exact:')||
    previous.finalResultsVisible||current.finalResultsVisible||
    current.checkpointKind!=='event'||original.checkpointKind!=='event'||
    !Array.isArray(current.riderStates)||!Array.isArray(current.groups)||
    !Array.isArray(current.gaps)||!Array.isArray(current.commentary)||
    !Array.isArray(current.incidents))
  return reject('CHECKPOINT_UNSAFE',kind);
 const km0=previous.raceProgress?.kmFromStart,
       km1=current.raceProgress?.kmFromStart;
 if(!Number.isFinite(km0)||!Number.isFinite(km1)||km0<0||
  km1<km0||km1-km0>25)return reject('DISTANCE_UNSAFE',kind);
 // A physical group movement is never erased in order to make a replay pass.
 // Confirm both boundaries and multiple interior samples, including the
 // instant before the event where possible.
 let observed;
 try{
  observed=[km0,km0+(km1-km0)*0.25,km0+(km1-km0)*0.5,
   km0+(km1-km0)*0.75,Math.max(km0,km1-0.00001),km1]
   .map(km=>partition(physicalGroupsAtKm(km)));
 }catch{return reject('PHYSICAL_UNAVAILABLE',kind);}
 if(observed.some(p=>!p))return reject('PHYSICAL_UNAVAILABLE',kind);
 if(observed.some(p=>!same(p,observed[0])))
  return reject('PHYSICAL_MOVEMENT_PRESENT',kind);
 const physical=observed.at(-1);
 const before=partition(previous.groups),currentPartition=partition(current.groups);
 if(!before||!currentPartition)return reject('INVALID_PARTITION',kind);
 // The DNF-adjusted physical parity of the prior event is checked only
 // after its own reached-DNF witness has been verified.
 const originalEvent=original.commentary?.[0];
 // "Covered" means the attack occurred without establishing a lasting
 // physical group. Never erase its commentary/energy or alter its actor.
 // Successful/unclassified attacks remain prohibited.
 if(!Array.isArray(original.commentary)||original.commentary.length!==1||
    (!passive.has(originalEvent?.eventType)&&!coveredAttack))
  return reject(sourceEvent?.eventType==='attack'?
    'ATTACK_NOT_COVERED':'CAUSAL_EVENT_UNSAFE',kind);
 if(current.commentary[0]?.eventType!==originalEvent.eventType||
    current.commentary[0]?.commentaryId!==originalEvent.commentaryId||
    (coveredAttack&&(
      current.commentary[0].title!==originalEvent.title||
      current.commentary[0].description!==originalEvent.description||
      !Array.isArray(current.commentary[0].riderIds)||
      !eq([...current.commentary[0].riderIds].sort(),
       [...originalEvent.riderIds].sort())||
      originalEvent.riderIds.includes(failedRiderId)
    )))
  return reject(coveredAttack?'ATTACK_SOURCE_UNVERIFIED':
    'EVENT_SOURCE_UNVERIFIED',kind);
 // Phase10 incident comments may be appended but can never masquerade as
 // a physical group merge/split. Require an exact incident ledger match.
 const byIncident=new Map(current.incidents.map(e=>[e.incidentId,e]));
 if(byIncident.size!==current.incidents.length)return reject('EVENT_SOURCE_UNVERIFIED',kind);
 const extras=new Set();
 for(const c of current.commentary.slice(1)){
  const id=typeof c.commentaryId==='string'&&
    c.commentaryId.startsWith('commentary:')?
    c.commentaryId.slice('commentary:'.length):null;
  const record=byIncident.get(id);
  if(!id||extras.has(id)||c.eventType!=='incident'||
     !Array.isArray(c.riderIds)||!Array.isArray(record?.riderIds)||
     !eq([...c.riderIds].sort(),[...record.riderIds].sort()))
   return reject('EVENT_SOURCE_UNVERIFIED',kind);
  extras.add(id);
 }
 // Preserve reached DNFs exactly as independently witnessed at both
 // event checkpoints. Autonomous separations or new DNF events in this
 // interval are not eligible for a membership-only source correction.
 if(!Array.isArray(detachment?.dnfRiderIds)||
    !Array.isArray(detachment?.autonomousRiderIds)||
    new Set(detachment.dnfRiderIds).size!==detachment.dnfRiderIds.length||
    new Set(detachment.autonomousRiderIds).size!==detachment.autonomousRiderIds.length)
  return reject('DETACHMENT_UNAVAILABLE',kind);
 const reached=new Set(detachment.dnfRiderIds);
 const autonomous=new Set(detachment.autonomousRiderIds);
 if([...reached].some(id=>autonomous.has(id)))
  return reject('DETACHMENT_OVERLAP',kind);
 let previousReached=new Set(),previousAutonomous=new Set();
 if(reached.size||autonomous.size){
  if(!Array.isArray(previousDetachment?.dnfRiderIds)||
     !Array.isArray(previousDetachment?.autonomousRiderIds)||
     new Set(previousDetachment.dnfRiderIds).size!==
       previousDetachment.dnfRiderIds.length||
     new Set(previousDetachment.autonomousRiderIds).size!==
       previousDetachment.autonomousRiderIds.length)
   return reject('PREVIOUS_DETACHMENT_UNAVAILABLE',kind);
  previousReached=new Set(previousDetachment.dnfRiderIds);
  previousAutonomous=new Set(previousDetachment.autonomousRiderIds);
  if(previousReached.size!==reached.size||
     [...previousReached].some(id=>!reached.has(id)))
   return reject('DNF_WINDOW_CHANGED',kind);
  // A newly created or disappeared autonomous incident group is a genuine
  // causal transition; never mask it by editing an attack checkpoint.
  if(previousAutonomous.size!==autonomous.size||
     [...previousAutonomous].some(id=>!autonomous.has(id)))
   return reject('AUTONOMOUS_WINDOW_CHANGED',kind);
 }
 if([...reached,...autonomous].some(id=>!physical.ids.includes(id)))
  return reject('DETACHMENT_SOURCE_UNVERIFIED',kind);
 const stages=phase10Stages;
 const keys=['INITIAL','AFTER_DETACHMENT','AFTER_AUTONOMOUS_GROUPS',
  'AFTER_CONSOLIDATION','AFTER_FINISH_COMMIT','AFTER_DISPLAY_NORMALIZATION'];
 if(!stages||keys.some(k=>!partition(stages[k])))
  return reject('PHASE10_SOURCE_UNVERIFIED',kind);
 const initial=partition(stages.INITIAL);
 if(!same(initial,partition(original.groups))||
    !eq(initial.ids,physical.ids))
  return reject('PHASE10_SOURCE_UNVERIFIED',kind);
 const afterDetach=partition(stages.AFTER_DETACHMENT);
 const expectedDetached=partition(stages.INITIAL,new Set([...reached,...autonomous]));
 if(!same(afterDetach,expectedDetached))
  return reject('DNF_SOURCE_UNVERIFIED',kind);
 if(!same(partition(stages.AFTER_DISPLAY_NORMALIZATION),currentPartition))
  return reject('PHASE10_SOURCE_CHANGED',kind);
 const autonomy=verifyPrivateAutonomousGroupsV4({
  cp:current,physical,det:detachment,stages,absent:reached
 });
 if(!['NONE','VERIFIED'].includes(autonomy.status))
  return reject(autonomy.status,kind);
 let restorePriorFromSource=false;
 let priorAutonomy={status:'NONE',groups:[]};
 if(autonomous.size){
  if(!previousPhase10Stages||
     keys.some(k=>!partition(previousPhase10Stages[k])))
   return reject('PREVIOUS_AUTONOMOUS_WITNESS_MISSING',kind);
  priorAutonomy=verifyPrivateAutonomousGroupsV4({
   cp:previous,physical:observed[0],det:previousDetachment,
   stages:previousPhase10Stages,absent:previousReached
  });
  if(priorAutonomy.status!=='VERIFIED'){
   // An earlier private physical-source repair can legitimately make the
   // candidate's previous checkpoint RAW_PHYSICAL while its original Phase10
   // checkpoint independently witnessed a stable autonomous group. Only in
   // this narrow case restore that independently verified original autonomous
   // component alongside the physical road survivor groups. The original
   // commentary, incidents, status and energy must be byte-equivalent.
   const sourcePrior=sourcePhase10Timeline?.checkpoints?.find(cp=>
     cp.checkpointId===previous.checkpointId);
   const rawPrevious=partition(observed[0].rows.map(r=>r.group));
   const rawCandidate=partition(previous.groups);
   const equalStates=sourcePrior&&Array.isArray(sourcePrior.riderStates)&&
     sourcePrior.riderStates.length===previous.riderStates?.length&&
     sourcePrior.riderStates.every(x=>{
       const y=previous.riderStates.find(r=>r.riderId===x.riderId);
       return y&&y.status===x.status&&y.energy===x.energy&&
        y.liveEnergyPercent===x.liveEnergyPercent;
     });
   const sourceIdentityVerified=sourcePrior&&
     sourcePrior.checkpointKind===previous.checkpointKind&&
     sourcePrior.raceProgress?.kmFromStart===
      previous.raceProgress?.kmFromStart&&
     sourcePrior.finalResultsVisible===previous.finalResultsVisible&&
     JSON.stringify(sourcePrior.commentary)===JSON.stringify(previous.commentary)&&
     JSON.stringify(sourcePrior.incidents)===JSON.stringify(previous.incidents)&&
     equalStates;
   if(sourceIdentityVerified&&same(rawPrevious,rawCandidate)){
     const originalPrior=verifyPrivateAutonomousGroupsV4({
       cp:sourcePrior,physical:observed[0],det:previousDetachment,
       stages:previousPhase10Stages,absent:previousReached
     });
     if(originalPrior.status==='VERIFIED'){
       priorAutonomy=originalPrior;
       restorePriorFromSource=true;
     }
   }
  }
  if(priorAutonomy.status!=='VERIFIED'){
   // Only fixed categorical evidence is returned; rider IDs, groups,
   // checkpoint distances and stage content remain private.
   const allowedReasons=new Set(['AUTONOMOUS_IDENTITY_UNSAFE',
    'AUTONOMOUS_PHASE10_WITNESS_MISSING',
    'AUTONOMOUS_PHASE10_SET_UNSAFE','AUTONOMOUS_GROUP_AMBIGUOUS',
    'AUTONOMOUS_GROUP_MIXED','AUTONOMOUS_GROUP_NOT_STABLE',
    'AUTONOMOUS_STAGE_CODE_COLLISION','AUTONOMOUS_GAP_UNVERIFIED']);
   const priorRaw=partition(observed[0].rows.map(r=>r.group));
   const priorStage=partition(previousPhase10Stages.AFTER_DISPLAY_NORMALIZATION);
   const previousPublished=partition(previous.groups);
   const priorPresentation=same(previousPublished,priorRaw)?
    'RAW_PHYSICAL':same(previousPublished,priorStage)?
    'PHASE10_FINAL':'OTHER';
   const activeGroups=previous.groups.filter(g=>
    Array.isArray(g.riderIds)&&g.riderIds.some(id=>previousAutonomous.has(id)));
   const coveredIds=new Set(activeGroups.flatMap(g=>
    g.riderIds.filter(id=>previousAutonomous.has(id))));
   const priorAutonomousPresentation=coveredIds.size!==previousAutonomous.size?
    'MISSING_MEMBERS':activeGroups.some(g=>
     g.riderIds.some(id=>!previousAutonomous.has(id)))?
    'MIXED_WITH_ROAD':'SEPARATE_AUTONOMOUS';
   const allowedStages=new Set(['AFTER_AUTONOMOUS_GROUPS',
    'AFTER_CONSOLIDATION','AFTER_FINISH_COMMIT',
    'AFTER_DISPLAY_NORMALIZATION']);
   const allowedDetails=new Set(['DUPLICATE_MEMBERSHIP',
    'MEMBERSHIP_CHANGED','AUTONOMOUS_RIDERS_MISSING',
    'BOTH_CODES_CHANGED','GROUP_CODE_CHANGED','DISPLAY_CODE_INVALID',
    'DISPLAY_CODE_CHANGED']);
   return {status:'PREVIOUS_AUTONOMOUS_WITNESS_UNVERIFIED',
    eventKind:kind,
    previousAutonomyReason:allowedReasons.has(priorAutonomy.status)?
     priorAutonomy.status:'OTHER',
    previousAutonomyStage:allowedStages.has(priorAutonomy.stage)?
     priorAutonomy.stage:'NONE',
    previousAutonomyDetail:allowedDetails.has(priorAutonomy.detail)?
     priorAutonomy.detail:'NONE',
    previousAutonomyPresentation:priorPresentation,
    previousAutonomousGroup:priorAutonomousPresentation};
  }
  // The protected autonomous group must represent exactly the same riders
  // and group identity across the interval, not merely share a label.
  const normalized=x=>x.groups.map(({row})=>({
   key:key(row.riderIds),code:row.groupCode,
   label:row.displayCode
  })).sort((a,b)=>a.key.localeCompare(b.key));
  if(JSON.stringify(normalized(autonomy))!==
     JSON.stringify(normalized(priorAutonomy)))
   return reject('AUTONOMOUS_GROUP_CHANGED',kind);
 }else if(keys.slice(2).some(k=>!same(partition(stages[k]),afterDetach)))
  return reject('PHASE10_SOURCE_CHANGED',kind);
 const physicalSurvivors=partition(physical.rows.map(r=>r.group),
  new Set([...reached,...autonomous]));
 const physicalPrevious=partition(observed[0].rows.map(r=>r.group),
  new Set([...previousReached,...previousAutonomous]));
 if(!physicalSurvivors||!physicalPrevious||!physicalSurvivors.rows.length)
  return reject('PHYSICAL_GROUP_INVALID',kind);
 const previousRoad=partition(previous.groups,
  new Set([...previousReached,...previousAutonomous]));
 if(!same(previousRoad,physicalPrevious))
  return reject('PREVIOUS_SURVIVORS_NOT_PHYSICAL',kind);
 const expectedActive=[...physicalSurvivors.ids,...autonomous].sort();
 if(!eq(currentPartition.ids,expectedActive))
  return reject('RIDER_SET_MISMATCH',kind);
 const finalGroups=partition([...physicalSurvivors.rows.map(r=>r.group),
  ...autonomy.groups.map(r=>r.row)]);
 if(!finalGroups||!same(finalGroups,currentPartition)&&
   !eq(finalGroups.ids,currentPartition.ids))
  return reject('RIDER_SET_MISMATCH',kind);
 if(same(currentPartition,finalGroups))
  return reject('ALREADY_PHYSICAL',kind);
 // Source road groups must be stale independently of any verified incident
 // detachment; never alter a physically correct source merely for labels.
 const sourceRoad=partition(original.groups,new Set([...reached,...autonomous]));
 if(same(sourceRoad,physicalSurvivors))
  return reject('SOURCE_NOT_STALE',kind);
 if(autonomous.has(failedRiderId)||reached.has(failedRiderId))
  return reject('AFFECTED_RIDER_UNVERIFIED',kind);
 const beforeRider=previousRoad.rows.find(r=>
  r.group.riderIds.includes(failedRiderId));
 const physicalRider=physicalSurvivors.rows.find(r=>
  r.group.riderIds.includes(failedRiderId));
 const currentRider=currentPartition.rows.find(r=>
  r.group.riderIds.includes(failedRiderId));
 if(!beforeRider||!physicalRider||!currentRider||
    beforeRider.key!==physicalRider.key||
    currentRider.key===physicalRider.key)
  return reject('AFFECTED_RIDER_UNVERIFIED',kind);
 const states=new Map(current.riderStates.map(s=>[s.riderId,s]));
 if(states.size!==current.riderStates.length||
  !eq([...states.keys()].sort(),physical.ids)||
  [...reached].some(id=>states.get(id)?.status!=='dnf')||
  [...physicalSurvivors.ids,...autonomous].some(id=>states.get(id)?.status!=='racing'))
  return reject('RIDER_STATE_UNSAFE',kind);
 const groups=[],gaps=[],assigned=new Map(),codes=new Set();
 for(const {group} of physicalSurvivors.rows){
  if(typeof group.groupCode!=='string'||!group.groupCode||
     typeof group.displayCode!=='string'||!group.displayCode||
     codes.has(group.displayCode)||!Number.isFinite(group.gapSeconds)||
     group.gapSeconds<0)return reject('PHYSICAL_GROUP_INVALID',kind);
  codes.add(group.displayCode);
  const rebuilt={
   groupCode:group.groupCode,displayCode:group.displayCode,
   physicalLineageId:group.physicalLineageId??null,
   physicalPosition:group.physicalPosition,colorKey:group.colorKey,
   riderIds:[...group.riderIds]
  };
  const gap={groupCode:group.groupCode,displayCode:group.displayCode,
   gapSeconds:group.gapSeconds,officialTimeSeconds:null};
  groups.push(rebuilt);gaps.push(gap);
  for(const id of rebuilt.riderIds)assigned.set(id,{group:rebuilt,gap});
 }
 if(assigned.size!==physicalSurvivors.ids.length)
  return reject('PHYSICAL_GROUP_INVALID',kind);
 for(const protectedGroup of autonomy.groups){
  const row=protectedGroup.row,gap=protectedGroup.gap;
  if(typeof row?.displayCode!=='string'||!row.displayCode||
     typeof row?.groupCode!=='string'||!row.groupCode||
     codes.has(row.displayCode)||!Number.isFinite(gap?.gapSeconds)||
     gap.gapSeconds<0||
     gap.displayCode!==row.displayCode||
     gap.groupCode!==row.groupCode)
   return reject('AUTONOMOUS_GAP_UNVERIFIED',kind);
  codes.add(row.displayCode);
  groups.push({...row,riderIds:[...row.riderIds]});
  gaps.push({...gap});
  for(const id of row.riderIds){
   if(assigned.has(id))return reject('AUTONOMOUS_IDENTITY_UNSAFE',kind);
   assigned.set(id,{group:row,gap});
  }
 }
 if(assigned.size!==expectedActive.length)
  return reject('PHYSICAL_GROUP_INVALID',kind);
 const riderStates=current.riderStates.map(s=>{
  const entry=assigned.get(s.riderId);
  return !entry?s:{...s,groupCode:entry.group.groupCode,
   displayCode:entry.group.displayCode,gapSeconds:entry.gap.gapSeconds};
 });
 const replaced={...current,groups,gaps,riderStates};
 let restoredPrevious=previous;
 if(restorePriorFromSource){
  // Restore precisely the protected source Phase10 autonomous group, NOT
  // any source road group. Road survivors always come from independent
  // physical simulation. No DNF, event, energy or official data is changed.
  const oldStates=new Map(previous.riderStates.map(s=>[s.riderId,s]));
  const expectedPriorIds=[...physicalPrevious.ids,...previousAutonomous].sort();
  if(oldStates.size!==previous.riderStates.length||
     !eq([...oldStates.keys()].sort(),observed[0].ids)||
     [...previousReached].some(id=>oldStates.get(id)?.status!=='dnf')||
     expectedPriorIds.some(id=>oldStates.get(id)?.status!=='racing'))
   return reject('PREVIOUS_AUTONOMOUS_STATE_UNSAFE',kind);
  const priorGroups=[],priorGaps=[],priorAssignments=new Map(),priorCodes=new Set();
  for(const {group} of physicalPrevious.rows){
   if(typeof group.groupCode!=='string'||!group.groupCode||
      typeof group.displayCode!=='string'||!group.displayCode||
      priorCodes.has(group.displayCode)||!Number.isFinite(group.gapSeconds)||
      group.gapSeconds<0)
    return reject('PREVIOUS_AUTONOMOUS_GROUP_INVALID',kind);
   priorCodes.add(group.displayCode);
   const row={groupCode:group.groupCode,displayCode:group.displayCode,
     physicalLineageId:group.physicalLineageId??null,
     physicalPosition:group.physicalPosition,colorKey:group.colorKey,
     riderIds:[...group.riderIds]};
   const gap={groupCode:group.groupCode,displayCode:group.displayCode,
     gapSeconds:group.gapSeconds,officialTimeSeconds:null};
   priorGroups.push(row);priorGaps.push(gap);
   for(const id of row.riderIds)priorAssignments.set(id,{row,gap});
  }
  for(const witness of priorAutonomy.groups){
   const row=witness.row,gap=witness.gap;
   if(typeof row.groupCode!=='string'||!row.groupCode||
      typeof row.displayCode!=='string'||!row.displayCode||
      priorCodes.has(row.displayCode)||
      gap.groupCode!==row.groupCode||gap.displayCode!==row.displayCode||
      !Number.isFinite(gap.gapSeconds)||gap.gapSeconds<0)
    return reject('PREVIOUS_AUTONOMOUS_GROUP_INVALID',kind);
   priorCodes.add(row.displayCode);
   priorGroups.push({...row,riderIds:[...row.riderIds]});
   priorGaps.push({...gap});
   for(const id of row.riderIds){
    if(priorAssignments.has(id))
     return reject('PREVIOUS_AUTONOMOUS_GROUP_INVALID',kind);
    priorAssignments.set(id,{row,gap});
   }
  }
  if(priorAssignments.size!==expectedPriorIds.length)
   return reject('PREVIOUS_AUTONOMOUS_GROUP_INVALID',kind);
  const previousStates=previous.riderStates.map(s=>{
   const item=priorAssignments.get(s.riderId);
   return !item?s:{...s,groupCode:item.row.groupCode,
     displayCode:item.row.displayCode,gapSeconds:item.gap.gapSeconds};
  });
  restoredPrevious={...previous,groups:priorGroups,gaps:priorGaps,
   riderStates:previousStates};
 }
 const checkpoints=cps.map((cp,j)=>j===i?replaced:
    j===i-1?restoredPrevious:cp);
 return {status:'ORIGINAL_EVENT_PHYSICAL_HANDOFF_CREATED',
  eventKind:kind,timeline:{...timeline,checkpoints},
  restoredPreviousAutonomous:restorePriorFromSource,
  researchOnly:true,officialWrites:0};
}
