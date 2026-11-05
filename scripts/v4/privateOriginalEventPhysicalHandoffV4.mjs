/**
 * Research-only correction of an ORIGINAL, source-passive event checkpoint.
 * Use authoritative physical rider groups at its own distance, never a
 * neighbour's guessed group membership. Every source and rider-state guard
 * fails closed; original strict publication acceptance is still mandatory.
 *
 * Does not touch official physics, event narration, DNF, energy or results.
 */
const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const key=ids=>[...ids].sort().join('\u0000');
const partition=rows=>{
 if(!Array.isArray(rows)||!rows.length)return null;
 const out=[],seen=new Set();
 for(const group of rows){
  if(!Array.isArray(group?.riderIds)||!group.riderIds.length||
     group.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))
   return null;
  group.riderIds.forEach(id=>seen.add(id));
  out.push({key:key(group.riderIds),group});
 }
 if(new Set(out.map(r=>r.key)).size!==out.length)return null;
 return {rows:out,ids:[...seen].sort(),
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
 timeline,checkpointId,baseTimeline,physicalGroupsAtKm,
 phase10Stages,detachment,failedRiderId
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
 if(!same(before,observed[0]))
  return reject('PREVIOUS_NOT_PHYSICAL',kind);
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
 // Don't rewrite a Phase10 separation or recorded DNF. This specialized
 // original-event correction is for a pure stale source partition only.
 if(!Array.isArray(detachment?.dnfRiderIds)||
    !Array.isArray(detachment?.autonomousRiderIds))
  return reject('DETACHMENT_UNAVAILABLE',kind);
 if(detachment.dnfRiderIds.length||detachment.autonomousRiderIds.length)
  return reject('PHASE10_DETACHMENT_PRESENT',kind);
 const stages=phase10Stages;
 const keys=['INITIAL','AFTER_DETACHMENT','AFTER_AUTONOMOUS_GROUPS',
  'AFTER_CONSOLIDATION','AFTER_FINISH_COMMIT','AFTER_DISPLAY_NORMALIZATION'];
 if(!stages||keys.some(k=>!partition(stages[k])))
  return reject('PHASE10_SOURCE_UNVERIFIED',kind);
 const initial=partition(stages.INITIAL);
 if(!same(initial,partition(original.groups)))
  return reject('PHASE10_SOURCE_UNVERIFIED',kind);
 if(keys.slice(1).some(k=>!same(partition(stages[k]),initial)))
  return reject('PHASE10_SOURCE_CHANGED',kind);
 if(!same(partition(stages.AFTER_DISPLAY_NORMALIZATION),currentPartition))
  return reject('PHASE10_SOURCE_CHANGED',kind);
 if(same(currentPartition,physical))return reject('ALREADY_PHYSICAL',kind);
 // The original source event itself must contain the stale membership.
 if(same(partition(original.groups),physical))
  return reject('SOURCE_NOT_STALE',kind);
 if(!eq(currentPartition.ids,physical.ids))
  return reject('RIDER_SET_MISMATCH',kind);
 // If the affected rider did not change group physically, do not rewrite
 // an unrelated checkpoint. All other groups are also checked above.
 const beforeRider=before.rows.find(r=>r.group.riderIds.includes(failedRiderId));
 const physicalRider=physical.rows.find(r=>r.group.riderIds.includes(failedRiderId));
 const currentRider=currentPartition.rows.find(r=>
  r.group.riderIds.includes(failedRiderId));
 if(!beforeRider||!physicalRider||!currentRider||
   beforeRider.key!==physicalRider.key||currentRider.key===physicalRider.key)
  return reject('AFFECTED_RIDER_UNVERIFIED',kind);
 const states=new Map(current.riderStates.map(s=>[s.riderId,s]));
 if(states.size!==current.riderStates.length||
  !eq([...states.keys()].sort(),physical.ids)||
  current.riderStates.some(s=>s.status!=='racing'))
  return reject('RIDER_STATE_UNSAFE',kind);
 const groups=[],gaps=[],assigned=new Map(),codes=new Set();
 for(const {group} of physical.rows){
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
 if(assigned.size!==states.size)return reject('PHYSICAL_GROUP_INVALID',kind);
 const riderStates=current.riderStates.map(s=>{
  const entry=assigned.get(s.riderId);
  return {...s,groupCode:entry.group.groupCode,
   displayCode:entry.group.displayCode,gapSeconds:entry.gap.gapSeconds};
 });
 const replaced={...current,groups,gaps,riderStates};
 const checkpoints=cps.map((cp,j)=>j===i?replaced:cp);
 return {status:'ORIGINAL_EVENT_PHYSICAL_HANDOFF_CREATED',
  eventKind:kind,timeline:{...timeline,checkpoints},
  researchOnly:true,officialWrites:0};
}
