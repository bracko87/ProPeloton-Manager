import test from 'node:test'
import assert from 'node:assert/strict'
import {buildPrivateOriginalEventPhysicalHandoffV4 as trial} from './privateOriginalEventPhysicalHandoffV4.mjs'
const physical=[
 {groupCode:'peloton',displayCode:'P',physicalPosition:'peloton',
  colorKey:'peloton_blue',riderIds:['a','b'],gapSeconds:0},
 {groupCode:'dropped_group',displayCode:'C1',physicalPosition:'behind_peloton',
  colorKey:'chasing_orange',riderIds:['c'],gapSeconds:45}
]
const stale=[
 {...physical[0],riderIds:['a']},
 {...physical[1],riderIds:['b','c']}
]
const groups=rows=>rows.map(g=>({...g,riderIds:[...g.riderIds]}))
const gaps=rows=>rows.map(g=>({
 groupCode:g.groupCode,displayCode:g.displayCode,
 gapSeconds:g.gapSeconds,officialTimeSeconds:null
}))
const states=rows=>['a','b','c'].map(riderId=>{
 const g=rows.find(r=>r.riderIds.includes(riderId))
 return {riderId,status:'racing',groupCode:g.groupCode,
  displayCode:g.displayCode,gapSeconds:g.gapSeconds,energy:71,
  liveEnergyPercent:78}
})
const source={commentaryId:'status:2',eventType:'race_status',
 title:'Race update',description:'Normal event'}
const previous={checkpointId:'stage:event:prior',checkpointKind:'event',
 raceProgress:{kmFromStart:87},finalResultsVisible:false,
 groups:groups(physical),gaps:gaps(physical),riderStates:states(physical),
 commentary:[{...source}],incidents:[]}
const current={...previous,checkpointId:'stage:event:current',
 raceProgress:{kmFromStart:88},groups:groups(stale),
 gaps:gaps(stale),riderStates:states(stale)}
const args={
 timeline:{checkpoints:[previous,current]},
 baseTimeline:{checkpoints:[previous,{...current}]},
 checkpointId:current.checkpointId,failedRiderId:'b',
 physicalGroupsAtKm:()=>groups(physical),
 detachment:{dnfRiderIds:[],autonomousRiderIds:[]},
 phase10Stages:Object.fromEntries(['INITIAL','AFTER_DETACHMENT',
  'AFTER_AUTONOMOUS_GROUPS','AFTER_CONSOLIDATION',
  'AFTER_FINISH_COMMIT','AFTER_DISPLAY_NORMALIZATION']
  .map(k=>[k,groups(stale)]))
}
test('original passive event corrects only provably stale physical rider groups',()=>{
 const result=trial(args)
 assert.equal(result.status,'ORIGINAL_EVENT_PHYSICAL_HANDOFF_CREATED')
 assert.equal(result.eventKind,'PASSIVE')
 assert.equal(result.researchOnly,true)
 assert.equal(result.officialWrites,0)
 const cp=result.timeline.checkpoints[1]
 assert.deepEqual(cp.groups,physical.map(({gapSeconds,...g})=>
  ({...g,physicalLineageId:null})))
 assert.deepEqual(cp.gaps,gaps(physical))
 assert.equal(cp.riderStates.find(s=>s.riderId==='b').displayCode,'P')
 assert.equal(cp.riderStates.find(s=>s.riderId==='b').energy,71)
 assert.deepEqual(cp.commentary,current.commentary)
 assert.deepEqual(cp.incidents,current.incidents)
 assert.deepEqual(result.timeline.checkpoints[0],previous)
 assert.deepEqual(current.groups,stale)
})
test('refuses causal event, including a plausible but unverified split',()=>{
 const original=args.baseTimeline.checkpoints[1]
 const sourceCp={...original,commentary:[{...source,eventType:'group_split'}]}
 assert.deepEqual(trial({...args,
  baseTimeline:{checkpoints:[previous,sourceCp]}}),{
   status:'CAUSAL_EVENT_UNSAFE',eventKind:'GROUP_SPLIT'
 })
})
test('refuses physical movement and unrelated or missing rider evidence',()=>{
 const moving=km=>km<87.5?groups(physical):groups(stale)
 assert.equal(trial({...args,physicalGroupsAtKm:moving}).status,
  'PHYSICAL_MOVEMENT_PRESENT')
 assert.equal(trial({...args,failedRiderId:'nonexistent-rider'}).status,
  'AFFECTED_RIDER_UNVERIFIED')
 assert.equal(trial({...args,detachment:null}).status,
  'DETACHMENT_UNAVAILABLE')
})
test('refuses Phase10 incident detachments, identity drift and altered states',()=>{
 assert.equal(trial({...args,detachment:{
  dnfRiderIds:['c'],autonomousRiderIds:[]}}).status,
  'PREVIOUS_DETACHMENT_UNAVAILABLE')
 assert.equal(trial({...args,phase10Stages:{
  ...args.phase10Stages,AFTER_AUTONOMOUS_GROUPS:groups(physical)
 }}).status,'PHASE10_SOURCE_CHANGED')
 assert.equal(trial({...args,timeline:{checkpoints:[previous,{
  ...current,riderStates:current.riderStates.map(s=>s.riderId==='b'?
   {...s,status:'dnf'}:s)
 }]}}).status,'RIDER_STATE_UNSAFE')
})
test('source must preserve the original passive event and ledger',()=>{
 assert.equal(trial({...args,timeline:{checkpoints:[previous,{
  ...current,commentary:[{...source,commentaryId:'not-original'}]
 }]}}).status,'EVENT_SOURCE_UNVERIFIED')
 assert.equal(trial({...args,timeline:{checkpoints:[previous,{
  ...current,commentary:[...current.commentary,{
   commentaryId:'commentary:incident-1',eventType:'group_split',riderIds:['b']
  }]
 }]}}).status,'EVENT_SOURCE_UNVERIFIED')
})

test('a covered attack preserves its causal event and repairs only another rider',()=>{
 const covered={...source,eventType:'attack',title:'Attack is covered',
  description:'The move is covered before a lasting gap forms.',
  riderIds:['c'],teamIds:['team-c']};
 const attacked={...current,commentary:[covered]};
 const result=trial({...args,
  baseTimeline:{checkpoints:[previous,attacked]},
  timeline:{checkpoints:[previous,attacked]}
 });
 assert.equal(result.status,'ORIGINAL_EVENT_PHYSICAL_HANDOFF_CREATED')
 assert.equal(result.eventKind,'ATTACK_COVERED')
 const fixed=result.timeline.checkpoints[1]
 assert.deepEqual(fixed.commentary,[covered])
 assert.deepEqual(fixed.incidents,[])
 assert.deepEqual(fixed.riderStates.map(s=>s.energy),[71,71,71])
 assert.equal(fixed.riderStates.find(s=>s.riderId==='b').displayCode,'P')
 assert.equal(fixed.riderStates.find(s=>s.riderId==='c').displayCode,'C1')
});
test('a successful or unknown attack is never silently reclassified',()=>{
 for(const title of ['Attack succeeds','A decisive attack is launched',
  'Unexpected attack']){
  const attack={...source,eventType:'attack',title,riderIds:['c']};
  const cp={...current,commentary:[attack]};
  const result=trial({...args,timeline:{checkpoints:[previous,cp]},
    baseTimeline:{checkpoints:[previous,cp]}});
  assert.equal(result.status,'ATTACK_NOT_COVERED')
  assert.equal(result.eventKind,'ATTACK_OTHER')
 }
});
test('covered attack actor cannot be the rider whose unexplained transfer is repaired',()=>{
 const attack={...source,eventType:'attack',title:'Attack is covered',
  riderIds:['b']};
 const cp={...current,commentary:[attack]};
 const result=trial({...args,timeline:{checkpoints:[previous,cp]},
  baseTimeline:{checkpoints:[previous,cp]}});
 assert.equal(result.status,'ATTACK_SOURCE_UNVERIFIED')
});
test('covered-attack source and displayed narration must agree exactly',()=>{
 const attack={...source,eventType:'attack',title:'Attack is covered',
  riderIds:['c']};
 const cp={...current,commentary:[{...attack,title:'Changed title'}]};
 const sourceCp={...current,commentary:[attack]};
 const result=trial({...args,timeline:{checkpoints:[previous,cp]},
  baseTimeline:{checkpoints:[previous,sourceCp]}});
 assert.equal(result.status,'ATTACK_SOURCE_UNVERIFIED')
});

test('source-witnessed reached DNF preserves failed rider while repairing covered attack survivor',()=>{
 const physicalWithDnf=[
  {...physical[0],riderIds:['a','b','d']},
  {...physical[1],riderIds:['c']}
 ];
 const staleWithDnf=[
  {...physicalWithDnf[0],riderIds:['a','d']},
  {...physicalWithDnf[1],riderIds:['b','c']}
 ];
 const staleSurvivors=[
  {...staleWithDnf[0],riderIds:['a']},
  {...staleWithDnf[1],riderIds:['b','c']}
 ];
 const previousDnf={...previous,groups:groups(physical),
  gaps:gaps(physical),riderStates:[
   ...states(physical),{riderId:'d',status:'dnf',energy:17,displayCode:'P',
    groupCode:'peloton',gapSeconds:0}
  ]};
 const covered={...source,eventType:'attack',title:'Attack is covered',
  riderIds:['c'],teamIds:['team-c']};
 const cp={...current,commentary:[covered],
  groups:groups(staleSurvivors),gaps:gaps(staleSurvivors),
  riderStates:[...states(staleSurvivors),{riderId:'d',
   status:'dnf',energy:17,displayCode:'P',groupCode:'peloton',
   gapSeconds:0}]};
 const original={...cp,groups:groups(staleWithDnf),gaps:gaps(staleWithDnf)};
 const phases=Object.fromEntries(['INITIAL','AFTER_DETACHMENT',
  'AFTER_AUTONOMOUS_GROUPS','AFTER_CONSOLIDATION',
  'AFTER_FINISH_COMMIT','AFTER_DISPLAY_NORMALIZATION'].map(k=>
   [k,groups(k==='INITIAL'?staleWithDnf:staleSurvivors)]));
 const input={...args,timeline:{checkpoints:[previousDnf,cp]},
  baseTimeline:{checkpoints:[previousDnf,original]},
  phase10Stages:phases,detachment:{dnfRiderIds:['d'],autonomousRiderIds:[]},
  previousDetachment:{dnfRiderIds:['d'],autonomousRiderIds:[]},
  physicalGroupsAtKm:()=>groups(physicalWithDnf)};
 const result=trial(input);
 assert.equal(result.status,'ORIGINAL_EVENT_PHYSICAL_HANDOFF_CREATED')
 const repaired=result.timeline.checkpoints[1];
 assert.deepEqual(repaired.groups.map(g=>g.riderIds),[['a','b'],['c']])
 assert.equal(repaired.riderStates.find(s=>s.riderId==='d').status,'dnf')
 assert.equal(repaired.riderStates.find(s=>s.riderId==='d').energy,17)
 assert.deepEqual(repaired.commentary,[covered])
 assert.deepEqual(repaired.incidents,[])
 assert.deepEqual(cp.groups,staleSurvivors)
 assert.equal(trial({...input,previousDetachment:null}).status,
  'PREVIOUS_DETACHMENT_UNAVAILABLE')
 assert.equal(trial({...input,previousDetachment:{dnfRiderIds:[],
  autonomousRiderIds:[]}}).status,'DNF_WINDOW_CHANGED')
 assert.equal(trial({...input,detachment:{dnfRiderIds:['d'],
  autonomousRiderIds:['c']}}).status,'PHASE10_AUTONOMOUS_PRESENT')
 assert.equal(trial({...input,phase10Stages:{...phases,
  AFTER_DETACHMENT:groups(staleWithDnf)}}).status,'DNF_SOURCE_UNVERIFIED')
});
