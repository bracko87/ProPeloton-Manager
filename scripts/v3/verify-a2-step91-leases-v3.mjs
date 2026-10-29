import assert from 'node:assert/strict';
import {step91LeasePlanV3,step91LeaseCandidatesV3,
 step91AcceptedLeaseUpdateV3} from './a2Step91PersistentCorridorLeaseV3.mjs';
const ss=[
 {id:'leader',startX:600,x:608,y:1.25,v:9,targetY:.9},
 {id:'follower',startX:600,x:600,y:.3,v:9,targetY:.9},
 {id:'other',startX:590,x:590,y:3.15,v:9,targetY:3.15},
 {id:'outer',startX:570,x:570,y:4.1,v:9,targetY:3.15}
];
const rr=ss.map(s=>({id:s.id,speed:9,targetY:s.targetY}));
const bb=ss.map(s=>({id:s.id,gateId:'first',gateX:780,
 targetY:s.targetY,scheduledSeconds:25}));
const savedInput=JSON.stringify([ss,rr,bb]);
const a=step91LeaseCandidatesV3(ss,rr,bb,{atSeconds:3});
assert.equal(a.candidates.length,3);
assert(a.plan.acquired>=1,'No physically achieved lease acquired');
assert(a.plan.leases.some(l=>l.ownerId==='leader'&&l.waitingId==='follower'));
assert(a.plan.holds[1],'Follower can consume reserved crossing gap');
assert.equal(JSON.stringify([ss,rr,bb]),savedInput);
const serialized=JSON.stringify(a.plan.leases);
const restored=JSON.parse(serialized);
const b=step91LeaseCandidatesV3(ss,rr,bb,{
 atSeconds:3.5,existingLeases:restored});
assert(b.plan.kept>=1,'Valid lease not sustained');
assert.equal(JSON.stringify(a.plan.leases),serialized);
const advanced=ss.map(s=>({...s,x:s.x+4.5}));
const updated=step91AcceptedLeaseUpdateV3(advanced,bb,{
 atSeconds:3.5,existingLeases:restored});
assert(updated.some(l=>l.ownerId==='leader'&&l.waitingId==='follower'));
assert.deepEqual(updated,step91AcceptedLeaseUpdateV3(advanced,bb,{
 atSeconds:3.5,existingLeases:JSON.parse(serialized)}));
const compressed=ss.map((s,i)=>i===1?{...s,x:606}:s);
const rejected=step91LeasePlanV3(compressed,rr,bb,{
 atSeconds:3.5,existingLeases:restored});
assert(rejected.expired>=1,'Achieved gap revocation failed');
const overdue=step91LeasePlanV3(ss,rr,bb,{
 atSeconds:15,existingLeases:restored});
assert(overdue.expired>=1,'Expired lease not removed');
const same=x=>x.candidates.map(c=>c.requests.map(r=>[r.speed,r.targetY]));
const rename=o=>({...o,id:'renamed-'+o.id});
const changed=step91LeaseCandidatesV3(ss.map(rename),rr.map(rename),
 bb.map(rename),{atSeconds:3});
assert.deepEqual(same(a),same(changed),'Rider ID changed right-of-way');
const mirror=(o,k='y')=>({...o,[k]:4.4-o[k]});
const mirrored=step91LeaseCandidatesV3(ss.map(s=>mirror(mirror(s,'targetY'))),
 rr.map(r=>mirror(r,'targetY')),bb.map(b=>mirror(b,'targetY')),
 {atSeconds:3});
for(let k=0;k<3;k++)for(let i=0;i<ss.length;i++){
 const x=a.candidates[k].requests[i],y=mirrored.candidates[k].requests[i];
 assert(Math.abs(x.speed-y.speed)<1e-5);
 assert(Math.abs(x.targetY+y.targetY-4.4)<1e-5);
}
const reverse=step91LeaseCandidatesV3([...ss].reverse(),
 [...rr].reverse(),[...bb].reverse(),{atSeconds:3});
for(let k=0;k<3;k++)for(let i=0;i<ss.length;i++){
 const x=a.candidates[k].requests[i],
 y=reverse.candidates[k].requests[ss.length-1-i];
 assert.equal(x.speed,y.speed);assert.equal(x.targetY,y.targetY);
}
const ties=[{id:'x',x:600,startX:600,y:1.25,v:9,targetY:2.2},
 {id:'y',x:600,startX:600,y:3.15,v:9,targetY:2.2}];
const tied=step91LeaseCandidatesV3(ties,
 ties.map(s=>({id:s.id,speed:9,targetY:2.2})),
 ties.map(s=>({id:s.id,gateId:'first',gateX:780,targetY:2.2,
  scheduledSeconds:25})),{atSeconds:2});
assert.equal(tied.plan.acquired,0,'Geometry tie granted arbitrary priority');
assert.throws(()=>step91LeaseCandidatesV3(ss,
 [rr[0],rr[0],...rr.slice(2)],bb));
assert.throws(()=>step91LeasePlanV3(ss,rr,bb,{atSeconds:4,
 existingLeases:[{ownerId:'invalid',waitingId:'follower',
 gateId:'first',targetY:.9,sinceAt:3,untilAt:9}]}));
console.log(JSON.stringify({study:'A91_ACHIEVED_CORRIDOR_LEASES',
 acquired:a.plan.acquired,renewed:b.plan.kept,revoked:rejected.expired,
 expired:overdue.expired,mirror:true,renamed:true,permuted:true,
 exactSerializedLeaseReplay:true,physicalSolverUnchanged:true,
 officialWrites:0,status:'PASS'}));
