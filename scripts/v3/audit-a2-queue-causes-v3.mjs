import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,summarizeCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'
const fixture=process.env.V3_A2_QUEUE_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const data=batch26Input(fixture),dir=process.env.V3_A2_QUEUE_DIR??'/tmp/v3-a2-queue'
mkdirSync(dir,{recursive:true})
const cp=r=>Math.max(160,Math.min(420,155+r.flat*1.15+(r.raceSharpness-50)*.2))
const wp=r=>Math.max(12000,Math.min(25000,10000+r.endurance*80))
const riders=data.riders.map((r,i)=>({riderId:r.riderId,meters:500-Math.floor(i/4)*2,lane:i%4,speedMps:0,cpWatts:cp(r),wPrimeJoules:wp(r),tactic:i%6===0?'attack':'tempo'}))
const base={riders,route:data.route,geometry:BATCH40_GEOMETRIES[1],allowSteering:true,capacity:3,dt:10,quality:'synthetic_research'}
const results=[]
for(const [label,diagnosePassing] of [['control',false],['diagnostic',true]]){
 let state=initializeCoupled2DResearchV3({...base,diagnosePassing}),checkpoint=null
 const limit=Math.ceil(state.input.finishDistanceMeters/25)+1200
 while(!state.complete){
  state=advanceCoupled2DResearchV3(state,24)
  if(diagnosePassing&&!checkpoint&&state.finish.length===0&&state.riders.some(x=>x.meters>state.input.finishDistanceMeters*.4))checkpoint=JSON.parse(JSON.stringify(state))
  assert(state.tick<limit,'Full stage exceeded tick budget')
 }
 const summary=summarizeCoupled2DResearchV3(state)
 assert(summary.stageFinished&&summary.finish.length===riders.length&&summary.finish.every((r,i)=>r.rank===i+1&&Number.isFinite(r.finishSeconds)&&r.energyRemainingJ>=0))
 assert(state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED')
 if(diagnosePassing){
  assert(checkpoint)
  let restored=checkpoint,steps=0
  while(!restored.complete){restored=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(restored,[11,7,29,5][steps%4])));assert(++steps<limit)}
  assert.deepEqual(restored,state,'Full-stage diagnostic checkpoint mismatch')
 }
 results.push({label,state,summary})
 console.log(JSON.stringify({fixture,label,winner:summary.finish[0].riderId,tailGap:summary.finish.at(-1).gapSeconds,officialWrites:0}))
}
const control=results[0],diagnostic=results[1]
assert.deepEqual(diagnostic.state.riders,control.state.riders,'Rider physics mutated')
assert.deepEqual(diagnostic.state.finish,control.state.finish,'Classification changed')
assert.deepEqual(diagnostic.state.samples,control.state.samples,'Race timeline changed')
let d=diagnostic.state.metrics.passingAudit,clean=structuredClone(diagnostic.state.metrics)
assert(d);delete clean.passingAudit
assert.deepEqual(clean,control.state.metrics,'Historic race metrics changed')
const known={'dordrecht-2000-10-15':1193.300376,'guangxi-2000-10-19':1231.182305}[fixture]
assert.equal(diagnostic.summary.finish[0].riderId,'r003')
assert(Math.abs(diagnostic.summary.finish.at(-1).gapSeconds-known)<1e-5)
assert.equal(d.eligible,d.admitted+d.capacityDenied+d.physicalLaneDenied+d.reservedLaneDenied)
assert.equal(d.admitted,diagnostic.summary.metrics.reservationsStarted)
assert.equal(d.collisionAborted+d.finishAborted,diagnostic.summary.metrics.abortedPasses)
assert.equal(Object.values(d.passingByRider).reduce((a,b)=>a+b,0),d.forwardPairPasses)
const report={study:'A2_EXACT_OVERTAKING_QUEUE_CAUSES',fixture,riders:riders.length,officialWrites:0,sportingApproval:'NOT_APPROVED',fullStageComplete:true,baselineParity:true,checkpointRecoveryExact:true,policy:'global_3',geometry:'synthetic_5m',durationTickSeconds:10,firstRider:diagnostic.summary.finish[0].riderId,lastRiderGapSeconds:diagnostic.summary.finish.at(-1).gapSeconds,diagnostic:d,limitations:['Counts represent eligible rider-decision ticks, not distinct riders','Physical-lane vs reservation-lane categories are ordered, not counterfactual causes','Longitudinal pair crossing means actual tick-end forward order reversal, not tactical attack','Crossings involving finishers or exact ties excluded','Synthetic geometry, route ascent and rider power remain uncalibrated']}
writeFileSync(dir+'/'+fixture+'-queue-causes.json',JSON.stringify(report,null,2)+'\n')
const {passingByRider,queueByRider,...headline}=d
console.log(JSON.stringify({fixture,headline,baselineParity:true,checkpointExact:true,sportingApproval:'NOT_APPROVED'}))
