import assert from 'node:assert/strict'
import {runPhysicalRaceV3,initializePhysicalRaceV3,advancePhysicalRaceV3,finalizePhysicalRaceV3} from '../../src/race-engine-v3/physicalRaceEngineV3.ts'

function riders(n) {return Array.from({length:n},(_,i)=>({
  riderId:`r${i+1}`,teamId:`t${Math.floor(i/8)}`,flat:50+(i*13)%43,
  hills:49+(i*17)%44,climbing:43+(i*19)%52,cobbles:48+(i*11)%47,
  stamina:50+(i*7)%44,form:55+(i*3)%30,fatigue:i%5,
}))}
function race(overrides={}){return {raceId:'a',stageId:'b',seed:'deterministic-7',route:[{lengthKm:50,gradePercent:0}],riders:riders(80),...overrides}}
function test(name,fn){const t=Date.now();fn();console.log('PASS',name, `${Date.now()-t}ms`)}
function summit(){return race({route:[{lengthKm:38,gradePercent:0},{lengthKm:22,gradePercent:1.8},{lengthKm:18,gradePercent:7.5}],riders:riders(168)})}
test('each rider finishes once with positive monotone physically derived gaps',()=>{
 const result=runPhysicalRaceV3(summit()); assert.equal(result.finish.length,168)
 assert.equal(new Set(result.finish.map(r=>r.riderId)).size,168)
 assert(result.finish.every(r=>Number.isFinite(r.physicalFinishSeconds)&&r.physicalGapSeconds>=0))
 assert(result.finish.every((r,i)=>i===0||r.physicalFinishSeconds>=result.finish[i-1].physicalFinishSeconds))
})
test('mountain summit differentiates climbing talent without an imposed target gap',()=>{
 const r=runPhysicalRaceV3(summit());const leaderTime=r.finish[0].physicalFinishSeconds
 const same=r.finish.filter(x=>x.officialGapSeconds===0).length
 assert(same<.40*r.finish.length,`unacceptable summit same-time peloton: ${same}/${r.finish.length}`)
 assert(r.finish[r.finish.length-1].physicalFinishSeconds-leaderTime>120)
})
test('checkpoint/resume is byte-equivalent to uninterrupted simulation',()=>{
 const inp=summit(),direct=runPhysicalRaceV3(inp);let state=initializePhysicalRaceV3(inp)
 for(let n=0;!state.complete;n++){
  if(n>10000)throw Error('checkpoint hung')
  state=JSON.parse(JSON.stringify(advancePhysicalRaceV3(inp,state,13)))
 }
 assert.deepEqual(finalizePhysicalRaceV3(state),direct)
})
test('a strong breakaway survives past halfway without an explicit organized chase',()=>{
 const roster=Array.from({length:120},(_,i)=>({
   riderId:`r${i+1}`,teamId:`t${Math.floor(i/8)}`,flat:63+(i%12)*2.25,
   hills:63+(i%10)*2.35,climbing:60+(i%12)*2.55,cobbles:66,stamina:70,form:65,
 }))
 const input=race({riders:roster,route:[{lengthKm:150,gradePercent:0}],orders:[
   {riderId:'r12',startKm:2,endKm:10,action:'attack'},
   ...roster.slice(1,11).map(x=>({riderId:x.riderId,startKm:4,endKm:150,action:'tempo'})),
 ]})
 const out=runPhysicalRaceV3(input)
 function midpointGapKm(){
   const frame=out.replay.find(f=>f.riders.filter(r=>r.meters>=75_000).length>=60)
   assert(frame,'replay must include halfway')
   const attackersMeters=frame.riders.find(r=>r.riderId==='r12').meters
   const medianMeters=[...frame.riders.map(r=>r.meters)].sort((a,b)=>a-b)[60]
   return (attackersMeters-medianMeters)/1000
 }
 assert(midpointGapKm()>.25,`a viable attack did not survive halfway: ${midpointGapKm()} km`)
 assert(out.finish.length===120)
})
test('an explicit chase changes physical results rather than just recorded group labels',()=>{
 const roster=Array.from({length:120},(_,i)=>({
   riderId:`r${i+1}`,teamId:`t${Math.floor(i/8)}`,flat:63+(i%12)*2.25,
   hills:63+(i%10)*2.35,climbing:60+(i%12)*2.55,cobbles:66,stamina:70,form:65,
 }))
 const primary={raceId:'a',stageId:'chase',seed:'phys',riders:roster,route:[{lengthKm:150,gradePercent:0}],orders:[{riderId:'r12',startKm:2,endKm:10,action:'attack'}]}
 const chased={...primary,orders:[...primary.orders,...roster.slice(1,11).map(r=>({riderId:r.riderId,startKm:15,endKm:120,action:'chase'}))]}
 const alone=runPhysicalRaceV3(primary),pursued=runPhysicalRaceV3(chased)
 const unaidedRank=alone.finish.find(x=>x.riderId==='r12').rank
 const pursuedRank=pursued.finish.find(x=>x.riderId==='r12').rank
 assert.equal(unaidedRank,1)
 const m = (out)=>{const f=out.replay.find(f=>f.riders.filter(r=>r.meters>=75000).length>=60); if(!f) return null; const a=f.riders.find(x=>x.riderId==='r12').meters;const sorted=f.riders.map(x=>x.meters).sort((a,b)=>a-b);return (a-sorted[60])/1000};
 assert(m(pursued)<m(alone)-.05,`organized chase did not reduce breakaway advantage: ${m(pursued)} vs ${m(alone)}`)
})
test('published rider gaps are physically conserved and not rounded by a broad finish-group cap',()=>{
 const out=runPhysicalRaceV3(summit())
 for(let i=1;i<out.finish.length;i++){
  const f=out.finish[i],p=out.finish[i-1]
  if(f.physicalFinishSeconds-p.physicalFinishSeconds>1){
   assert(Math.abs(f.officialFinishSeconds-f.physicalFinishSeconds)<1e-5)
  }
 }
})
test('seed and roster determine results, not rider input array order',()=>{
 const inp=summit(),rev={...inp,riders:[...inp.riders].reverse()}
 const a=runPhysicalRaceV3(inp),b=runPhysicalRaceV3(rev)
 const aFinish=a.finish.map(x=>[x.riderId,x.physicalFinishSeconds])
 const bFinish=b.finish.map(x=>[x.riderId,x.physicalFinishSeconds])
 assert.deepEqual(aFinish,bFinish)
})
test('replay derives from continuous positions: no impossible teleportation',()=>{
 const out=runPhysicalRaceV3(summit()),dt=60
 for(let i=1;i<out.replay.length;i++){
   const prev=new Map(out.replay[i-1].riders.map(r=>[r.riderId,r.meters]))
   for(const now of out.replay[i].riders){
     const delta=now.meters-prev.get(now.riderId)
     assert(delta>=-0.0001,`rider moved backwards: ${now.riderId}`)
     assert(delta<=26*dt+0.0001,`teleported: ${now.riderId} moved ${delta}m`)
   }
 }
})
test('reject invalid profiles, stale checkpoints and premature publication',()=>{
 const a=race(),checkpoint=initializePhysicalRaceV3(a)
 assert.throws(()=>advancePhysicalRaceV3({...a,seed:'wrong'},checkpoint,1))

 assert.throws(()=>runPhysicalRaceV3(race({route:[{lengthKm:-1,gradePercent:1}]})))
 assert.throws(()=>finalizePhysicalRaceV3(initializePhysicalRaceV3(race())))
})

test('repeated attacks consume persistent energy and cannot be reset between sectors',()=>{
 const base=race({riders:riders(75),route:[{lengthKm:80,gradePercent:0}]})
 const attacks=[5,20,35,50].map(km=>({riderId:'r12',startKm:km,endKm:km+3,action:'attack'}))
 const one=initializePhysicalRaceV3({...base,orders:attacks.slice(0,1)})
 const repeated=initializePhysicalRaceV3({...base,orders:attacks})
 const afterOne=advancePhysicalRaceV3({...base,orders:attacks.slice(0,1)},one,100000)
 const afterRepeated=advancePhysicalRaceV3({...base,orders:attacks},repeated,100000)
 const single=afterOne.states.find(s=>s.riderId==='r12')
 const multiple=afterRepeated.states.find(s=>s.riderId==='r12')
 assert.equal(multiple.attackAttempts,4)
 assert.equal(single.attackAttempts,1)
 assert(multiple.energy<single.energy-.10,`attack energy barely changes: ${multiple.energy} vs ${single.energy}`)
 assert(multiple.energy>=0 && multiple.energy<=1)
 assert(multiple.finishSeconds!==null)
})
test('headwind and rain have testable physical effects, not preset time gaps',()=>{
 const roster=riders(60)
 const dry=race({riders:roster,route:[{lengthKm:30,gradePercent:-1.5,headwindKph:0,wetness:0}]})
 const windy={...dry,route:[{lengthKm:30,gradePercent:-1.5,headwindKph:25,wetness:1}]}
 const a=runPhysicalRaceV3(dry),b=runPhysicalRaceV3(windy)
 assert(b.finish[0].physicalFinishSeconds>a.finish[0].physicalFinishSeconds,
    'wet headwind must impose a measurable speed cost')
 assert.notDeepEqual(a.finish.map(f=>f.physicalFinishSeconds),b.finish.map(f=>f.physicalFinishSeconds))
})
test('ordinary chase order does not launch a phantom attack without a front group',()=>{
 const a=race({route:[{lengthKm:40,gradePercent:0}],riders:riders(80)})
 const b={...a,orders:[{riderId:'r10',startKm:0,endKm:40,action:'chase'}]}
 const resultA=runPhysicalRaceV3(a),resultB=runPhysicalRaceV3(b)
 const finA=resultA.finish.find(r=>r.riderId==='r10')
 const finB=resultB.finish.find(r=>r.riderId==='r10')
 assert(Math.abs(finA.physicalFinishSeconds-finB.physicalFinishSeconds)<1,
   'phantom chase changed rider finish without a real breakaway')
})