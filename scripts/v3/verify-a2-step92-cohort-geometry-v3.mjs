import assert from 'node:assert/strict';
import {step92CohortCandidatesV3 as run} from './a2Step92CohortSpaceTimeV3.mjs';
const ss=[
 {id:'L',x:608,startX:600,y:1.25,v:9,targetY:.9},
 {id:'R',x:600,startX:600,y:.3,v:9,targetY:.9},
 {id:'L2',x:600,startX:594.8,y:1.25,v:9,targetY:.9},
 {id:'R2',x:594.8,startX:594.8,y:.3,v:9,targetY:.9},
 {id:'T',x:589.6,startX:589.6,y:.3,v:9,targetY:.9}
];
const rr=ss.map(s=>({id:s.id,speed:9,targetY:s.targetY}));
const bb=ss.map(s=>({id:s.id,gateId:'one',gateX:780,
 targetY:s.targetY,scheduledSeconds:25}));
const untouched=JSON.stringify([ss,rr,bb]);
const a=run(ss,rr,bb);
assert(a.plan.multiRowCohorts>0,'multirow occupancy not connected');
assert(a.plan.predictedCrossings>0,'no prospective occupied cells');
assert(a.plan.heldRiders>0,'no blocked unsafe merge');
assert.equal(JSON.stringify([ss,rr,bb]),untouched);
const rename=s=>({...s,id:'x'+s.id});
const named=run(ss.map(rename),rr.map(rename),bb.map(rename));
const simple=o=>o.candidates.map(c=>c.requests.map(r=>[r.speed,r.targetY]));
assert.deepEqual(simple(a),simple(named));
const mirror=(s,key='y')=>({...s,[key]:4.4-s[key]});
const reflected=run(ss.map(s=>mirror(mirror(s,'targetY'))),
 rr.map(r=>mirror(r,'targetY')),bb.map(b=>mirror(b,'targetY')));
for(let k=0;k<3;k++)for(let i=0;i<ss.length;i++){
 const orig=a.candidates[k].requests[i],
 flipped=reflected.candidates[k].requests[i];
 assert.equal(orig.speed,flipped.speed);
 assert(Math.abs(orig.targetY+flipped.targetY-4.4)<1e-5);
}
const rev=run([...ss].reverse(),[...rr].reverse(),[...bb].reverse());
for(let k=0;k<3;k++)for(let i=0;i<ss.length;i++){
 const x=a.candidates[k].requests[i],
 y=rev.candidates[k].requests[ss.length-1-i];
 assert.equal(x.speed,y.speed);assert.equal(x.targetY,y.targetY);
}
const tie=[{id:'a',x:600,startX:600,y:1.25,v:9,targetY:2.2},
 {id:'b',x:600,startX:600,y:3.15,v:9,targetY:2.2}];
const t=run(tie,tie.map(s=>({id:s.id,speed:9,targetY:2.2})),
 tie.map(s=>({id:s.id,gateId:'one',gateX:780,targetY:2.2})));
assert(t.plan.ambiguous>0);
assert(t.plan.held.every(Boolean));
assert.throws(()=>run(ss,[rr[0],rr[0],...rr.slice(2)],bb));
console.log(JSON.stringify({study:'A92_CONNECTED_SPACE_TIME_COHORT',
 multiRowCohorts:a.plan.multiRowCohorts,
 predictedCrossings:a.plan.predictedCrossings,
 heldRiders:a.plan.heldRiders,
 mirror:true,renaming:true,permutation:true,
 tieNoIDPriority:true,officialWrites:0,status:'PASS'}));
