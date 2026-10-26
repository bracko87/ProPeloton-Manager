/** Batch 42 scale gate: 8/24 micro pelotons plus 106/168 field-size pilot.
 * No stage classifications claimed for the newly coupled solver. OFFLINE.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,summarizeCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
import {initializeCoupledV3,advanceCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'
const fixture=process.env.V3_BATCH42_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const frozen=batch26Input(fixture),outdir=process.env.V3_BATCH42_OUT_DIR??'/tmp/batch42';mkdirSync(outdir,{recursive:true})
const clip=(x,a,b)=>Math.max(a,Math.min(b,x)),round=x=>Math.round(x*1e6)/1e6
const ranks=rows=>rows.map((r,i)=>({...r,cpWatts:clip(155+r.flat*1.15+(r.raceSharpness-50)*.2,160,420),wPrimeJoules:clip(10000+r.endurance*80,12000,25000),meters:500-Math.floor(i/4)*2,lane:i%4,speedMps:0,tactic:i%6===0?'attack':'tempo'}))
const flatRiders=ranks(frozen.riders)
const profiles=[BATCH40_GEOMETRIES[1],BATCH40_GEOMETRIES[2]]
const samples=[]
for(const n of [8,24,flatRiders.length]){
 const nTicks=n<flatRiders.length?84:144
 for(const geometry of profiles){
  const result={}
  for(const enabled of [false,true]){
   const input={riders:flatRiders.slice(0,n),route:frozen.route,geometry,allowSteering:enabled,capacity:2,dt:10,quality:'synthetic_research'}
   const initial=initializeCoupled2DResearchV3(input)
   // Match full uninterrupted advance to irregular JSON-serialized continuation
   const all=advanceCoupled2DResearchV3(initial,nTicks)
   let restarted=structuredClone(initial),count=0
   while(restarted.tick<nTicks){
    restarted=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(restarted,Math.min([1,3,9,5][count%4],nTicks-restarted.tick))))
    assert(++count<500,'Unbounded pilot recovery batches')
   }
   assert.deepEqual(restarted,all,'2D full field pilot did not restart exactly')
   const summary=summarizeCoupled2DResearchV3(all)
   assert.equal(summary.officialWrites,0);assert.equal(summary.sportingApproval,'NOT_APPROVED');assert.equal(summary.positions.length,n)
   assert(summary.positions.every(r=>r.remainingWPrimeJ>=0&&Number.isFinite(r.meters)))
   result[enabled?'steering':'noSteering']={...summary,verifiedCheckpointBatches:count}
  }
  const withSteering=result.steering,without=result.noSteering
  const changedIds=withSteering.positions.filter(x=>Math.abs(x.meters-without.positions.find(y=>y.riderId===x.riderId).meters)>1e-5).length
  const differences={changedLongitudinalRiders:changedIds,deltaAggregateForwardMeters:round(withSteering.metrics.achievedMeters-without.metrics.achievedMeters),deltaBlockedRiderTicks:withSteering.metrics.blockedRiderTicks-without.metrics.blockedRiderTicks,deltaFrontToTailMeters:round(withSteering.frontToTailMeters-without.frontToTailMeters),different30mGroupOnset:withSteering.first30mGapSecond!==without.first30mGapSecond}
  samples.push({fieldCount:n,geometry:geometry.id,simulationSeconds:nTicks*10,differences,results:result})
  console.log(JSON.stringify({fixture,fieldCount:n,geometry:geometry.id,simulationSeconds:nTicks*10,control:{blocked:without.metrics.blockedRiderTicks,firstGroup:without.first30mGapSecond},coupled:{blocked:withSteering.metrics.blockedRiderTicks,firstGroup:withSteering.first30mGapSecond,starts:withSteering.metrics.reservationsStarted,completed:withSteering.metrics.completedPasses,aborted:withSteering.metrics.abortedPasses,peak:withSteering.metrics.concurrentPeak},differences,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
 }
}
const baselineInput={...frozen,experimentalPowerDurationEnergy:true}
const control=initializeCoupledV3(baselineInput)
advanceCoupledV3(baselineInput,control,144)
const controlSnapshot=JSON.parse(JSON.stringify(control))
assert.equal(controlSnapshot.officialWrites,undefined,'Official writes appeared in source checkpoint')
const baseline={seconds:control.elapsedSeconds,wheelLimitedRiderTicks:control.movement.wheelLimitedTicks,reader:'V3 baseline physical model - distinct solver and energy assumptions'}
const output={experiment:'BATCH42_REAL_2D_LONGITUDINAL_AND_LATERAL_COUPLED_PILOT',fixture,roster:flatRiders.length,officialWrites:0,sportingApproval:'NOT_APPROVED',new2DPilotStageFinished:false,pilotSamples:samples,unchangedExistingV3Control:baseline,limitations:['New 2D model is a partial-stage prototype, not a 106/168-rider completed stage or sporting result','Two-dimensional safe speed backoff and continuous y use provisional bicycle collision rectangles and road envelopes','Power and W-prime are provisional and not matched to the current V3 model','Priority in forward planning is deterministic by current metres and rider ID, which may bias fair passing','Rider tactics reduced to synthetic attack/tempo; no official scheduling, historical rider fatigue or pursuit','No gameplay activation or new winner from experimental 2D physics','Guangxi profile misses 718m of reported ascent and World Nations profile 1065m']}
const file=outdir+'/'+fixture+'-2d-pilot.json';writeFileSync(file,JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({fixture,summary:'BATCH42_PILOT_FINISHED',microSizes:[8,24],largeFieldRiders:flatRiders.length,stagesFinishedInNewEngine:0,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
