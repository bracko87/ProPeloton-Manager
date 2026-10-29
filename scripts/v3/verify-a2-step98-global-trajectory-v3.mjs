/** A98 geometry-neutral global pair graph, real A64 speed gate and search
 * test. No imaginary preview state may be committed.
 */
import assert from 'node:assert/strict'
import {step98GlobalTrajectoryCandidatesV3}
 from './a2Step98GlobalTrajectoryGraphV3.mjs'
import {chooseStep98LongHorizonPhysicalTickV3}
 from './a2Step98LongHorizonPhysicalChoiceV3.mjs'
const states=[],requests=[],bookings=[]
for(let row=0;row<3;row++)for(let lane=0;lane<5;lane++){
 const id='id'+row+'_'+lane, x=600-row*5.2,y=.3+lane*.95
 states.push({id,x,startX:x,y,v:row===0?9:10.5})
 requests.push({id,speed:row===0?9:10.5,targetY:lane===0?1.25:
  lane===4?3.15:y})
 bookings.push({id,gateId:'gate-1',gateX:780,targetY:
  lane===0?1.25:lane===4?3.15:y})
}
const original=JSON.stringify([states,requests,bookings])
const a=step98GlobalTrajectoryCandidatesV3(states,requests,bookings)
assert.equal(a.candidates.length,3)
assert.equal(a.plan.horizonSeconds,8)
assert(a.plan.conflictingPairs>0)
assert(a.plan.crossRowPairs>0)
assert(a.plan.equalXConflicts>0)
assert(a.plan.heldSteering>0)
assert.equal(a.plan.officialWrites,0)
assert.equal(JSON.stringify([states,requests,bookings]),original)
const rename=s=>({...s,id:'different'+s.id})
const r=step98GlobalTrajectoryCandidatesV3(
 states.map(rename),requests.map(rename),bookings.map(rename))
const m=step98GlobalTrajectoryCandidatesV3(
 states.map(s=>({...s,y:4.4-s.y})),
 requests.map(s=>({...s,targetY:4.4-s.targetY})),
 bookings.map(s=>({...s,targetY:4.4-s.targetY})))
const rev=step98GlobalTrajectoryCandidatesV3(
 [...states].reverse(),[...requests].reverse(),[...bookings].reverse())
for(let p=0;p<3;p++)for(let i=0;i<states.length;i++){
 const x=a.candidates[p].requests[i],
  ren=r.candidates[p].requests[i],
  mir=m.candidates[p].requests[i],
  perm=rev.candidates[p].requests[states.length-1-i]
 assert.equal(x.speed,ren.speed)
 assert.equal(x.targetY,ren.targetY)
 assert.equal(x.speed,mir.speed)
 assert(Math.abs(x.targetY+mir.targetY-4.4)<1e-5)
 assert.equal(x.speed,perm.speed)
 assert.equal(x.targetY,perm.targetY)
}
assert.throws(()=>step98GlobalTrajectoryCandidatesV3(
 states,[requests[0],requests[0],...requests.slice(2)],bookings))
const fake=(name,switched=false)=>({
 at:0,acceptedSteps:0,states:[
 {id:'a',x:600,y:.3,v:9},
 {id:'b',x:595,y:1.25,v:9}],
 nearStops:0,cumulativeAdvancement:0,reason:null,
 name,switched})
const start=fake('start')
const plan=[{policy:'conserve',requests:[
 {id:'a',speed:9,targetY:.3},{id:'b',speed:9,targetY:1.25}]},
 {policy:'close',requests:[
 {id:'a',speed:9,targetY:1.25},{id:'b',speed:9,targetY:.3}]}]
const solve=p=>{
 if(p.states[0].targetY!==.3)return {...p,reason:'SWEPT_CONTACT'}
 p.at+=.5;p.acceptedSteps++;
 p.states=p.states.map(s=>({...s,x:s.x+4.5}))
 p.cumulativeAdvancement+=9
 return p
}
const safe=chooseStep98LongHorizonPhysicalTickV3(start,plan,
 s=>[plan[0]],solve,{horizonSeconds:6,maxFirst:2,maxFuture:1})
assert.equal(safe.status,'A98_VERIFIED_MOVING_FIRST_TICK')
assert.equal(safe.selectedPolicy,'conserve')
assert.equal(safe.physicallySafeLookaheadTicks,12)
assert.equal(start.acceptedSteps,0)
assert.equal(start.at,0)
assert.equal(start.states[0].x,600)
assert.equal(safe.previewLedger.fullHorizonValidCandidates,1)
const slowSolve=p=>{
 p.at+=.5;p.acceptedSteps++;p.states=p.states.map(s=>({...s,v:5}))
 return p
}
const slow=chooseStep98LongHorizonPhysicalTickV3(start,plan,
 s=>[plan[0]],slowSolve,{horizonSeconds:6,maxFirst:2,maxFuture:1})
assert.equal(slow.status,'A98_NO_MOVING_PHYSICAL_REQUEST')
assert.equal(slow.selectedPolicy,null)
assert.equal(slow.firstRejected,null)
assert(slow.previewLedger.upstreamRejections>0)
console.log(JSON.stringify({study:'A98_WHOLE_FIELD_GRAPH_AND_PHYSICAL_HORIZON',
 status:'PASS',globalConflictingPairs:a.plan.conflictingPairs,
 crossRowPairs:a.plan.crossRowPairs,equalXConflicts:a.plan.equalXConflicts,
 guardedSteering:a.plan.heldSteering,
 requested8SecondGlobalGraph:true,actual6SecondA64Horizon:true,
 protectedOriginalA64Contacts:true,achievedSpeedVeto:true,
 globalMirror:true,globalRename:true,globalPermutation:true,
 noPredictedStatesCommitted:true,officialWrites:0}))
