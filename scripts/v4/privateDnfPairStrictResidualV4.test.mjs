import test from 'node:test'
import assert from 'node:assert/strict'
import {classifyPrivateDnfPairStrictResidualV4 as classify} from './privateDnfPairStrictResidualV4.mjs'
const rider='rider-a'
const mk=(id,km,groups,kind='event')=>({
 checkpointId:id,raceProgress:{kmFromStart:km},checkpointKind:kind,
 groups:groups.map(g=>({...g,riderIds:[...g.riderIds]}))
})
const base=[
 {displayCode:'P',riderIds:['x']},
 {displayCode:'C1',riderIds:[rider,'b']},
 {displayCode:'C2',riderIds:['c']}
]
const changed=[
 {displayCode:'P',riderIds:['x']},
 {displayCode:'C1',riderIds:['b']},
 {displayCode:'C2',riderIds:['c',rider]}
]
const cps=[mk('intro',0,base),mk('before',10,base,'base'),
 mk('first:phase10-exact:a',11,changed),mk('second:phase10-exact:a',12,changed),
 mk('following',13,base,'base')]
const args={timeline:{checkpoints:cps},
 firstId:cps[2].checkpointId,secondId:cps[3].checkpointId,
 baselineIssue:`post_catch_group_transfer_without_physical_transition:${rider}:C1->C2:${cps[3].checkpointId}`,
 physicalGroupsAtKm:()=>base
}
const failure=(cp,from='C1',to='C2',who=rider)=>
 `post_catch_group_transfer_without_physical_transition:${who}:${from}->${to}:${cp.checkpointId}`
test('locates the first repaired checkpoint without exporting group or rider IDs',()=>{
 const res=classify({...args,blockingIssues:[failure(cps[2])]})
 assert.equal(res.status,'CLASSIFIED')
 assert.equal(res.position,'INTO_FIRST')
 assert.equal(res.rider,'SAME_AS_BASE_RESIDUAL')
 assert.equal(res.transfer,'C_TO_C')
 assert.equal(res.physicalMembership,'UNCHANGED')
 assert.equal(res.publishedMembership,'CHANGED')
 assert.equal(res.kinds,'BASE_TO_EVENT')
 assert.deepEqual(Object.keys(res).sort(),[
  'status','position','rider','transfer','physicalMembership',
  'publishedMembership','kinds'].sort())
 assert.ok(!JSON.stringify(res).includes(rider))
 assert.ok(!JSON.stringify(res).includes(cps[2].checkpointId))
})
test('distinguishes the second checkpoint and following checkpoint',()=>{
 assert.equal(classify({...args,blockingIssues:[failure(cps[3])]})
   .position,'FIRST_TO_SECOND')
 const after=classify({...args,blockingIssues:[failure(cps[4],'C2','C1')]})
 assert.equal(after.position,'OUT_OF_SECOND')
 assert.equal(after.kinds,'EVENT_TO_BASE')
 assert.equal(after.transfer,'C_TO_C')
})
test('reports changed independent physical membership and a different rider',()=>{
 const changedPhysics=()=>changed
 const res=classify({...args,
  physicalGroupsAtKm:km=>km<11?base:changedPhysics(),
  blockingIssues:[failure(cps[2],'C1','C2','c')]})
 assert.equal(res.rider,'DIFFERENT_FROM_BASE_RESIDUAL')
 assert.equal(res.physicalMembership,'CHANGED')
})
test('rejects multiple invalid or missing checkpoint issues without guessing',()=>{
 assert.equal(classify({...args,blockingIssues:[failure(cps[2]),failure(cps[3])]})
   .status,'MULTIPLE_TRANSFERS')
 assert.equal(classify({...args,blockingIssues:[failure({checkpointId:'absent'})]})
   .status,'ISSUE_CHECKPOINT_MISSING')
 assert.equal(classify({...args,blockingIssues:[]})
   .status,'NO_POST_CATCH_TRANSFER')
 assert.equal(classify({...args,timeline:{checkpoints:[cps[0]]},blockingIssues:[]})
   .status,'UNAVAILABLE')
})
