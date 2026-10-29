import assert from 'node:assert/strict';
import {step96LocalGapCandidatesV3,step96LocalGapPlanV3}
 from './a2Step96LocalGapOpenerV3.mjs';
const states=[],requests=[],bookings=[];
for(let row=0;row<3;row++)for(let lane=0;lane<5;lane++){
 const id='row'+row+'lane'+lane,x=600-5.2*row,y=.3+.95*lane;
 states.push({id,x,startX:x,y,v:9});
 const targetY=lane===0?1.25:lane===4?3.15:y;
 requests.push({id,targetY,speed:8.7});
 bookings.push({id,gateId:'gate-1',gateX:780,targetY});
}
const original=JSON.stringify([states,requests,bookings]);
const a=step96LocalGapCandidatesV3(states,requests,bookings,{atSeconds:0});
assert.equal(a.candidates.length,3);
assert.equal(a.plan.started,3);
assert(a.plan.relativeEdges>0,'failed to detect coupled neighbor conflict');
assert(a.plan.crossRowEdges>0,'no adjacent starting-row gap attention');
assert(a.plan.boosted>0&&a.plan.clamped>0,
 'must issue BOTH forward assistance and rear gap cap');
assert(a.plan.delayed>0,'unsafe steering was not delayed');
assert.equal(JSON.stringify([states,requests,bookings]),original);
const rename=s=>({...s,id:'renamed-'+s.id});
const names=step96LocalGapCandidatesV3(states.map(rename),
 requests.map(rename),bookings.map(rename),{atSeconds:0});
const flipped=step96LocalGapCandidatesV3(
 states.map(s=>({...s,y:4.4-s.y})),
 requests.map(r=>({...r,targetY:4.4-r.targetY})),
 bookings.map(b=>({...b,targetY:4.4-b.targetY})),{atSeconds:0});
const reverse=step96LocalGapCandidatesV3([...states].reverse(),
 [...requests].reverse(),[...bookings].reverse(),{atSeconds:0});
for(let k=0;k<3;k++)for(let i=0;i<states.length;i++){
 const x=a.candidates[k].requests[i],
  n=names.candidates[k].requests[i],
  f=flipped.candidates[k].requests[i],
  z=reverse.candidates[k].requests[states.length-i-1];
 assert.equal(x.speed,n.speed);assert.equal(x.targetY,n.targetY);
 assert.equal(x.speed,f.speed);
 assert(Math.abs(x.targetY+f.targetY-4.4)<1e-5);
 assert.equal(x.speed,z.speed);assert.equal(x.targetY,z.targetY);
}
const ties=[
 {id:'left',x:600,startX:600,y:1.25,v:9},
 {id:'right',x:600,startX:600,y:3.15,v:9},
 {id:'centre',x:600,startX:600,y:2.2,v:9}
],tr=ties.map(s=>({id:s.id,speed:9,targetY:2.2})),
 tb=ties.map(s=>({id:s.id,gateId:'gate-1',gateX:780,targetY:2.2}));
const t=step96LocalGapCandidatesV3(ties,tr,tb);
assert.equal(t.plan.started,1);
assert(t.plan.hold[0]&&t.plan.hold[1],
 'symmetrical same-X merging requests must both hold');
assert.throws(()=>step96LocalGapCandidatesV3(states,
 [requests[0],requests[0],...requests.slice(2)],bookings));
console.log(JSON.stringify({study:'A96_CONNECTED_3_5_REAL_GAP_GENERATOR',
 status:'PASS',groups:a.plan.started,
 proposedCrossRowGaps:a.plan.crossRowEdges,
 boundedFrontAssists:a.plan.boosted,
 boundedRearCaps:a.plan.clamped,lateralHolds:a.plan.delayed,
 mirrored:true,renamed:true,permutation:true,
 equalXNoBiasedRightOfWay:true,immutableInputs:true,officialWrites:0}));
