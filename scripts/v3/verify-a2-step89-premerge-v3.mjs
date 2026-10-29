import assert from 'node:assert/strict'
import {step89PremergeCandidatesV3} from './a2Step89PremergeReservationV3.mjs'
const test=(s,r,b)=>step89PremergeCandidatesV3(s,r,b)
const states=[
 {id:'a',x:600,y:1.25,startX:600,v:9},
 {id:'b',x:600,y:.3,startX:600,v:9},
 {id:'c',x:594.8,y:1.25,startX:594.8,v:9},
 {id:'d',x:594.8,y:.3,startX:594.8,v:9}]
const requests=states.map(s=>({id:s.id,speed:9,targetY:1.25}))
const bookings=states.map(s=>({id:s.id,gateId:'one',gateX:780,targetY:1.25}))
const frozen=JSON.stringify({states,requests,bookings})
const a=test(states,requests,bookings)
assert.equal(a.plan.entries,4)
assert.equal(a.candidates.length,3)
assert(a.plan.constraints.length>0)
assert(a.plan.held[1],'outer rider must yield')
assert(a.candidates[1].requests[1].speed<9)
assert.equal(JSON.stringify({states,requests,bookings}),frozen)
const rename=s=>({...s,id:'renamed-'+s.id})
const renamed=test(states.map(rename),requests.map(rename),bookings.map(rename))
assert.deepEqual(a.candidates.map(c=>c.requests.map(r=>[r.speed,r.targetY])),
 renamed.candidates.map(c=>c.requests.map(r=>[r.speed,r.targetY])))
const flip=(s,key='y')=>({...s,[key]:4.4-s[key]})
const mirrored=test(states.map(s=>flip(s)),requests.map(r=>flip(r,'targetY')),
 bookings.map(b=>flip(b,'targetY')))
for(let m=0;m<3;m++)for(let i=0;i<states.length;i++){
 const x=a.candidates[m].requests[i],y=mirrored.candidates[m].requests[i]
 assert(Math.abs(x.speed-y.speed)<1e-5)
 assert(Math.abs(x.targetY+y.targetY-4.4)<1e-5)
}
const reversed=test([...states].reverse(),[...requests].reverse(),[...bookings].reverse())
for(let m=0;m<3;m++)for(let i=0;i<states.length;i++){
 const x=a.candidates[m].requests[i],y=reversed.candidates[m].requests[states.length-1-i]
 assert.equal(x.speed,y.speed);assert.equal(x.targetY,y.targetY)
}
const tie=[{id:'x',x:600,startX:600,y:1.25,v:9},
 {id:'y',x:600,startX:600,y:3.15,v:9}]
const tied=test(tie,tie.map(s=>({id:s.id,speed:9,targetY:2.2})),
 tie.map(s=>({id:s.id,gateId:'one',gateX:780,targetY:2.2})))
assert(tied.plan.held.every(Boolean))
assert.throws(()=>test(states,[requests[0],requests[0],...requests.slice(2)],bookings))
console.log('A89 pure reservation geometry/mirror/name/reverse/ties PASS')
