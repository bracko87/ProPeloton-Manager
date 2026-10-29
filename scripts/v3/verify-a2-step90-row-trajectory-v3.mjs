import assert from 'node:assert/strict';
import {step90RowTrajectoryCandidatesV3 as plan} from './a2Step90RowTrajectoryV3.mjs';
const ss=[
 {id:'l',x:600,startX:600,y:1.25,v:9},
 {id:'r',x:600,startX:600,y:.3,v:9},
 {id:'l2',x:594.8,startX:594.8,y:1.25,v:9},
 {id:'r2',x:594.8,startX:594.8,y:.3,v:9}
];
const rr=ss.map(s=>({id:s.id,speed:9,targetY:1.25}));
const bb=ss.map(s=>({id:s.id,gateId:'G1',gateX:780,targetY:1.25}));
const original=JSON.stringify([ss,rr,bb]);
const v=plan(ss,rr,bb);
assert.equal(v.candidates.length,3);
assert(v.plan.edges.length>0);
assert(v.plan.held[1],'rear same-row crossing must be held');
assert(v.candidates[1].requests[1].speed<9);
assert.equal(JSON.stringify([ss,rr,bb]),original);
const rename=s=>({...s,id:'new-'+s.id});
const renamed=plan(ss.map(rename),rr.map(rename),bb.map(rename));
assert.deepEqual(v.candidates.map(c=>c.requests.map(r=>[r.speed,r.targetY])),
 renamed.candidates.map(c=>c.requests.map(r=>[r.speed,r.targetY])));
const mirror=(s,k='y')=>({...s,[k]:4.4-s[k]});
const flipped=plan(ss.map(s=>mirror(s)),rr.map(r=>mirror(r,'targetY')),
 bb.map(b=>mirror(b,'targetY')));
for(let n=0;n<3;n++)for(let i=0;i<ss.length;i++){
 assert.equal(v.candidates[n].requests[i].speed,flipped.candidates[n].requests[i].speed);
 assert(Math.abs(v.candidates[n].requests[i].targetY+
  flipped.candidates[n].requests[i].targetY-4.4)<.00001);
}
const reversed=plan([...ss].reverse(),[...rr].reverse(),[...bb].reverse());
for(let n=0;n<3;n++)for(let i=0;i<ss.length;i++){
 assert.equal(v.candidates[n].requests[i].speed,
  reversed.candidates[n].requests[ss.length-1-i].speed);
 assert.equal(v.candidates[n].requests[i].targetY,
  reversed.candidates[n].requests[ss.length-1-i].targetY);
}
const equal=[
 {id:'a',x:600,y:1.25,startX:600,v:9},
 {id:'b',x:600,y:3.15,startX:600,v:9}
];
const eq=plan(equal,equal.map(s=>({id:s.id,speed:9,targetY:2.2})),
 equal.map(s=>({id:s.id,gateId:'G',gateX:780,targetY:2.2})));
assert(eq.plan.held.every(Boolean),'symmetric tie is not an arbitrary pass');
assert.throws(()=>plan(ss,[rr[0],rr[0],...rr.slice(2)],bb));
console.log('A90 geometry mirror/rename/reversal/crossing/tie unit PASS');
