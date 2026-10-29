import assert from 'node:assert/strict';
import {step93RollingStartCandidatesV3 as plan} from './a2Step93RollingStartV3.mjs';
const riders=[
 {id:'c',x:600,y:2.2,v:9,startX:600},
 {id:'l',x:600,y:1.25,v:9,startX:600},
 {id:'r',x:600,y:3.15,v:9,startX:600},
 {id:'o',x:600,y:.3,v:9,startX:600},
 {id:'o2',x:594.8,y:.3,v:9.6,startX:594.8}
];
const requests=riders.map(s=>({id:s.id,speed:5,targetY:1.45}));
const bookings=riders.map(s=>({id:s.id,gateId:'first',gateX:780,
 targetY:1.45,scheduledSeconds:30}));
const old=JSON.stringify([riders,requests,bookings]);
const a=plan(riders,requests,bookings,{atSeconds:2});
assert.equal(a.candidates.length,3);
assert(a.plan.earlyRolling>0);
assert(a.plan.held.every(Boolean));
assert(a.candidates[0].requests.every(r=>r.speed>=5));
assert.equal(JSON.stringify([riders,requests,bookings]),old);
const renamed=s=>({...s,id:'different-'+s.id});
const b=plan(riders.map(renamed),requests.map(renamed),
 bookings.map(renamed),{atSeconds:2});
const req=x=>x.candidates.map(c=>c.requests.map(r=>[r.speed,r.targetY]));
assert.deepEqual(req(a),req(b));
const flip=(s,k)=>({...s,[k]:4.4-s[k]});
const c=plan(riders.map(s=>flip(s,'y')),requests.map(r=>flip(r,'targetY')),
 bookings.map(b=>flip(b,'targetY')),{atSeconds:2});
for(let k=0;k<3;k++)for(let i=0;i<riders.length;i++){
 const x=a.candidates[k].requests[i],y=c.candidates[k].requests[i];
 assert.equal(x.speed,y.speed);
 assert(Math.abs(x.targetY+y.targetY-4.4)<1e-5);
}
const d=plan([...riders].reverse(),[...requests].reverse(),
 [...bookings].reverse(),{atSeconds:2});
for(let k=0;k<3;k++)for(let i=0;i<riders.length;i++){
 const x=a.candidates[k].requests[i],
 y=d.candidates[k].requests[riders.length-1-i];
 assert.equal(x.speed,y.speed);
 assert.equal(x.targetY,y.targetY);
}
const symmetric=[
 {id:'left',x:600,y:1.25,v:9,startX:600},
 {id:'right',x:600,y:3.15,v:9,startX:600}
];
const tie=plan(symmetric,
 symmetric.map(s=>({id:s.id,speed:9,targetY:2.2})),
 symmetric.map(s=>({id:s.id,gateId:'first',gateX:780,targetY:2.2})));
assert(tie.plan.held.every(Boolean));
assert.throws(()=>plan(riders,[requests[0],requests[0],...requests.slice(2)],
 bookings));
console.log(JSON.stringify({study:'A93_ROLLING_LAUNCH_PURE',
 earlyRolling:a.plan.earlyRolling,
 held:a.plan.held.filter(Boolean).length,
 mirror:true,rename:true,reversal:true,equalGeometryTie:true,
 immutableInputs:true,officialWrites:0,status:'PASS'}));
