import assert from 'node:assert/strict'
import {writeFileSync,mkdirSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {evaluateObservedPiecewisePairV3 as compare,auditObservedTrackSetV3 as audit} from './a2NonlinearSweepAuditV3.mjs'
const dt=10
const A=[{t:0,x:100,y:0},{t:.5,x:125,y:0},{t:1,x:150,y:0}]
// False NEGATIVE: same 1m longitudinal gap throughout; a real within-tick
// lateral excursion crosses through the other bicycle then returns.
const Bhidden=[{t:0,x:101,y:1.4},{t:.5,x:126,y:0},{t:1,x:151,y:1.4}]
// False POSITIVE: linear endpoint chords intersect but observed intermediate
// trajectory separates laterally before crossing longitudinal order.
const Bsafe=[{t:0,x:108,y:0},{t:.15,x:115.5,y:1.5},
 {t:.3,x:123,y:2},{t:.7,x:127,y:2},{t:.85,x:134.5,y:1.5},{t:1,x:142,y:0}]
const sizes=[8,12,24,32],summaries=[],adversarial=[]
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 const x=compare(A,Bhidden,{longitudinal:1.8,lateral:g.lateralCollisionM})
 const y=compare(A,Bsafe,{longitudinal:1.8,lateral:g.lateralCollisionM})
 assert.equal(x.linearEndpointCollision,false)
 assert.equal(x.piecewiseObservedCollision,true)
 assert.equal(x.missedByEndpointChord,true)
 assert.equal(y.linearEndpointCollision,true)
 assert.equal(y.piecewiseObservedCollision,false)
 assert.equal(y.falseAlarmFromEndpointChord,true)
 adversarial.push({road:g.id,missedByChord:x.missedByEndpointChord,falseAlarm:y.falseAlarmFromEndpointChord,
  missedInterval:x.firstCollisionInterval})
 // Existing exact analytic checker and independent piecewise implementation
 // must agree when both input trajectories contain exactly two time knots.
 for(let k=0;k<64;k++){
  const kA=[{t:0,x:100,y:(k%3)*.3},{t:1,x:143+(k%5)*2,y:(k%3)*.3+(k%2?g.centerStepM:0)}]
  const kB=[{t:0,x:96+(k%7)*2,y:g.centerStepM},{t:1,x:143+(k%7)*2,y:g.centerStepM+(k%4===0?-g.centerStepM:0)}]
  const a=compare(kA,kB,{longitudinal:1.8,lateral:g.lateralCollisionM})
  assert.equal(a.piecewiseObservedCollision,a.linearEndpointCollision,'Two-knot analytic equivalence failed')
  assert.equal(a.intervalsChecked,1)
 }
 for(const n of sizes){
  for(let phase=0;phase<6;phase++){
   const tracks=Array.from({length:n},(_,i)=>{
    const x=100+i*3.2+phase*2
    const y=(i%4)*g.centerStepM
    const dx=45+(i%5)*2
    const change=i%7===0?Math.min(.8*g.centerStepM,3*g.centerStepM-y):
      i%7===3?-Math.min(.75*g.centerStepM,y):0
    const knots=[0,.25,.5,.75,1].map(t=>{
     const wiggle=Math.sin(Math.PI*t)
     return {t,x:x+dx*t+1.1*Math.sin(Math.PI*t)*((i%3)-1),
      y:y+change*wiggle}
    })
    return {riderId:'r'+String(i).padStart(3,'0'),knots}
   })
   const one=audit(tracks,geometry)
   const same=audit(tracks.slice().reverse(),geometry)
   assert.deepEqual(one,same,'Order-dependent nonlinear screen')
   assert.deepEqual(JSON.parse(JSON.stringify(one)),one,'Nonlinear screen checkpoint not serializable')
   assert.equal(one.officialWrites,0)
   assert.equal(one.sportingApproval,'NOT_APPROVED')
   assert.equal(one.metrics.pairs,n*(n-1)/2)
   assert.equal(one.metrics.observedSegmentsChecked,one.metrics.pairs*4)
   summaries.push({geometry:g.id,n,phase,...one.metrics})
  }
 }
}
assert.throws(()=>compare([{t:0,x:1,y:0},{t:.5,x:2,y:0},{t:.4,x:3,y:0},{t:1,x:4,y:0}],A),/Invalid time/)
assert.throws(()=>compare([{t:0,x:10,y:0},{t:1,x:9,y:0}],A),/Invalid time/)
const total=summaries.reduce((a,r)=>{
 a.snapshots++;a.pairs+=r.pairs;a.chordCollisions+=r.chordCollisions;a.piecewiseCollisions+=r.piecewiseCollisions;
 a.missedByChord+=r.missedByChord;a.falseAlarmsByChord+=r.falseAlarmsByChord;
 a.segments+=r.observedSegmentsChecked;return a
},{snapshots:0,pairs:0,chordCollisions:0,piecewiseCollisions:0,missedByChord:0,falseAlarmsByChord:0,segments:0})
const report={study:'A2_STEP33_OBSERVED_KNOT_VS_CHORD',status:'PASS',scope:'synthetic within-tick research, no production evidence',
 geometries:BATCH40_GEOMETRIES.length,fieldSizes:sizes,tickSeconds:dt,
 adversarial,linearEquivalencePerGeometry:64,aggregated:total,summary:summaries,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP33_DIR??'/tmp/a2-step33-nonlinear'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step33-nonlinear.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,status:report.status,geometries:report.geometries,fieldSizes:sizes,
 adverseMisses:adversarial.length,adverseFalseAlarms:adversarial.length,linearEquivalence:256,
 aggregated:total,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
