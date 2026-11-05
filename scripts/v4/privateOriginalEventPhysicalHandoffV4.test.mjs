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
 assert.equal(trial({...args,failedRiderId:'a'}).status,
  'AFFECTED_RIDER_UNVERIFIED')
 assert.equal(trial({...args,detachment:null}).status,
  'DETACHMENT_UNAVAILABLE')
})
test('refuses Phase10 incident detachments, identity drift and altered states',()=>{
 assert.equal(trial({...args,detachment:{
  dnfRiderIds:['c'],autonomousRiderIds:[]}}).status,
  'PHASE10_DETACHMENT_PRESENT')
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
