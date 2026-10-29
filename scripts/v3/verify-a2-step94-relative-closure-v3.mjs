import assert from 'node:assert/strict';
import {step94ClosureCandidatesV3 as run} from './a2Step94RelativeClosureV3.mjs';
const ss=[
 {id:'front_inner',x:606,y:1.25,v:8.2,startX:606},
 {id:'rear_center',x:600,y:2.2,v:10,startX:600},
 {id:'front_center',x:606,y:2.2,v:8.2,startX:606},
 {id:'rear_inner',x:600,y:1.25,v:9.5,startX:600},
 {id:'outer',x:600,y:.3,v:9.5,startX:600}
];
const rr=ss.map(s=>({id:s.id,
 speed:s.id==='rear_center'?11:8.7,targetY:2.2}));
const bb=ss.map(s=>({id:s.id,gateId:'gate-1',gateX:780,targetY:2.2}));
const orig=JSON.stringify([ss,rr,bb]);
const a=run(ss,rr,bb,{atSeconds:3});
assert(a.plan.threatenedPairs>0,'missed real closing');
assert(a.plan.predictedClosingPairs>0,'did not use requested acceleration');
assert(a.plan.crossRowPairs>0,'missed multi-row closure');
assert(a.candidates[1].requests[1].speed<rr[1].speed,
 'fast following row was not speed constrained');
assert.equal(JSON.stringify([ss,rr,bb]),orig,'mutated external field');
const normalized=o=>o.candidates.map(c=>c.requests.map(r=>[r.speed,r.targetY]));
const named=o=>({...o,id:'other_'+o.id});
assert.deepEqual(normalized(a),normalized(run(ss.map(named),
 rr.map(named),bb.map(named),{atSeconds:3})));
const flip=(o,k)=>({...o,[k]:4.4-o[k]});
const m=run(ss.map(s=>flip(s,'y')),
 rr.map(r=>flip(r,'targetY')),
 bb.map(b=>flip(b,'targetY')),{atSeconds:3});
for(let k=0;k<3;k++)for(let i=0;i<ss.length;i++){
 const x=a.candidates[k].requests[i],y=m.candidates[k].requests[i];
 assert.equal(x.speed,y.speed);
 assert(Math.abs(x.targetY+y.targetY-4.4)<1e-5);
}
const rev=run([...ss].reverse(),[...rr].reverse(),
 [...bb].reverse(),{atSeconds:3});
for(let k=0;k<3;k++)for(let i=0;i<ss.length;i++){
 const x=a.candidates[k].requests[i],
 y=rev.candidates[k].requests[ss.length-i-1];
 assert.equal(x.speed,y.speed);assert.equal(x.targetY,y.targetY);
}
const tied=[{id:'left',x:600,y:1.25,v:9,startX:600},
 {id:'right',x:600,y:3.15,v:9,startX:600}];
const tie=run(tied,
 tied.map(s=>({id:s.id,speed:9,targetY:2.2})),
 tied.map(s=>({id:s.id,gateId:'gate-1',gateX:780,targetY:2.2})));
assert(tie.plan.ties>0,'symmetrical tie was assigned arbitrary right of way');
assert(tie.plan.holds.every(Boolean));
assert.throws(()=>run(ss,[rr[0],rr[0],...rr.slice(2)],bb));
console.log(JSON.stringify({study:'A94_REQUESTED_CLOSING_RATE_PHYSICAL_PLANNER',
 threatened:a.plan.threatenedPairs,
 forecastClosing:a.plan.predictedClosingPairs,
 crossRow:a.plan.crossRowPairs,held:a.plan.holds.filter(Boolean).length,
 mirror:true,rename:true,reorder:true,equalXSymmetry:true,
 immutable:true,officialWrites:0,status:'PASS'}));
