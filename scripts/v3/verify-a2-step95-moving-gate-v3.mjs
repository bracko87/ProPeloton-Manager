import assert from 'node:assert/strict';
import {step95AchievedMovingGateV3,chooseStep95MovingPhysicalTickV3}
 from './a2Step95MovingPhysicalGateV3.mjs';
const initial={reason:null,at:0,acceptedSteps:0,nearStops:0,
 cumulativeAdvancement:0,states:[
 {id:'a',x:600,y:1.25,v:9,targetY:1.25,desired:9},
 {id:'b',x:594.8,y:1.25,v:9,targetY:1.25,desired:9}
 ]};
const snap=JSON.stringify(initial);
let called=0;
function syntheticOriginalA64(field){
 called++;
 const next=structuredClone(field);
 next.states=next.states.map(s=>{
  const v=s.desired;return {...s,v,x:s.x+.5*v};});
 next.at+=.5;
 next.acceptedSteps++;
 next.nearStops+=next.states.filter(s=>s.v<1).length;
 next.cumulativeAdvancement+=next.states.reduce((v,s,i)=>
  v+s.x-field.states[i].x,0);
 return next;
}
const requests=(speed,policy)=>({policy,
 requests:initial.states.map(s=>({id:s.id,targetY:s.y,speed}))});
const plans=[requests(5,'crawl'),requests(9,'moving')];
const fut=f=>[{
 policy:'future_moving',
 requests:f.states.map(s=>({id:s.id,speed:9,targetY:s.y}))
}];
const chosen=chooseStep95MovingPhysicalTickV3(initial,plans,fut,
 syntheticOriginalA64,{depth:3,maxFirst:2});
assert.equal(chosen.selectedPolicy,'moving');
assert(chosen.previewLedger.blockedUpstream>0);
assert(chosen.previewLedger.blockedMoving>0);
assert.equal(chosen.previewLedger.originalPhysicalRejections,0);
assert.equal(chosen.firstPhysicalPreview.states[0].v,9);
assert.equal(chosen.status,'PHYSICAL_MOVING_FIRST_TICK');
assert.equal(JSON.stringify(initial),snap);
assert(called>2);
const noGo=chooseStep95MovingPhysicalTickV3(initial,
 [requests(5,'crawl')],fut,syntheticOriginalA64);
assert.equal(noGo.selectedPolicy,null);
assert.equal(noGo.status,'A95_NO_MOVING_PHYSICAL_REQUEST');
assert.equal(noGo.firstRejected,null);
assert.equal(noGo.firstMovingViolation.scan.upstreamSlow,2);
const field=structuredClone(initial);
assert.equal(step95AchievedMovingGateV3(field).admitted,true);
field.states[0].x=720;field.states[0].v=4.3;
let check=step95AchievedMovingGateV3(field);
assert.equal(check.downstreamSlow,1);
assert.equal(check.upstreamSlow,0);
field.states[0].x=600;field.states[0].v=.5;
check=step95AchievedMovingGateV3(field);
assert.equal(check.nearStop,1);
const reflected=structuredClone(initial);
for(const s of reflected.states){
 s.y=4.4-s.y;s.targetY=4.4-s.targetY;
}
assert.deepEqual(step95AchievedMovingGateV3(reflected),
 step95AchievedMovingGateV3(initial));
const renamed=structuredClone(initial);
for(const s of renamed.states)s.id='x'+s.id;
assert.deepEqual(step95AchievedMovingGateV3(renamed),
 step95AchievedMovingGateV3(initial));
assert.throws(()=>step95AchievedMovingGateV3({
 states:initial.states.map(s=>({...s,v:-1})),at:0
}));
console.log(JSON.stringify({study:'A95_ACHIEVED_MOVING_PHYSICAL_GATE',
 status:'PASS',blockedUpstream:chosen.previewLedger.blockedUpstream,
 acceptedOriginalA64Movement:chosen.selectedPolicy,
 noGoReason:noGo.status,mirror:true,rename:true,
 previewOnly:true,originalPhysicsUnchanged:true,officialWrites:0}));
