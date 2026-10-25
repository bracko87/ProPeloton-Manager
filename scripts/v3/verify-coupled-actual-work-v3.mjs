import assert from 'node:assert/strict'
import {initializeCoupledV3,advanceCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {calculateSpatialSlipstreamV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
const road={gradePercent:0,headwindMps:0,crosswindMps:0}
const profile=id=>({riderId:id,teamId:'a',flat:75,climbing:75,endurance:75,resistance:75,fatigueBeforeStage:25,startStamina:85,raceSharpness:75,recovery:75,morale:75,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1})
const make=(tactic='follow',n=4)=>({raceId:'work',stageId:'work',seed:'work',riders:Array.from({length:n},(_,i)=>profile('r'+i)),route:[{lengthKm:4,gradePercent:0}],grid:{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2},orders:tactic==='follow'?[]:[{riderId:'r0',startKm:0,endKm:4,tactic}],gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'source_snapshot'}})
const input=make()
const state=initializeCoupledV3(input)
const old=state.riders.map(x=>({...x}))
advanceCoupledV3(input,state,1)
for(const prev of old){
 const current=state.riders.find(x=>x.riderId===prev.riderId)
 const shelter=calculateSpatialSlipstreamV3({riderId:prev.riderId,meters:prev.meters,lane:prev.lane,desiredMps:0,energy:prev.energy},old.map(r=>({riderId:r.riderId,meters:r.meters,lane:r.lane,energy:r.energy,desiredMps:0})),road).fraction
 const cdA=Math.max(.22,.36*(1-shelter))
 const mechanical=roadWattsRequiredV3(current.speedMps,83,cdA,road)*10
 assert(Math.abs(current.cumulativeActualWorkJoules-mechanical)<.0002,'Only achieved wheel speed can cost mechanical work')
 assert(current.cumulativePowerDebtJoules>=0)
 assert(current.energy<=prev.energy)
}
const exhausted=initializeCoupledV3(input)
exhausted.riders[0].energy=0
advanceCoupledV3(input,exhausted,1)
assert(exhausted.riders[0].energy>=0)
const singleFollow=make('follow',1),singleAttack=make('attack',1)
let f=initializeCoupledV3(singleFollow),a=initializeCoupledV3(singleAttack)
advanceCoupledV3(singleFollow,f,20)
advanceCoupledV3(singleAttack,a,20)
assert(a.riders[0].attackAttempts===1)
assert(a.riders[0].energy<f.riders[0].energy,'Actual attack power must reduce shared reserve')
assert(a.riders[0].cumulativeActualWorkJoules>f.riders[0].cumulativeActualWorkJoules,'Attack cannot accelerate for free')
assert(a.riders[0].meters>f.riders[0].meters,'An unblocked acceleration should affect physical road position')
// Chasing without a forward gap cannot get a phantom group boost.
const noTargetChase=make('chase',1),noTargetFollow=make('follow',1)
let c=initializeCoupledV3(noTargetChase),b=initializeCoupledV3(noTargetFollow)
advanceCoupledV3(noTargetChase,c,15);advanceCoupledV3(noTargetFollow,b,15)
assert.equal(c.riders[0].meters,b.riders[0].meters)
assert.equal(c.riders[0].energy,b.riders[0].energy)
console.log(JSON.stringify({test:'realized mechanical work and energy, physical attack and no phantom chase',status:'PASS_INTEGRITY_ONLY',raceActivation:false,sportingApproval:'NOT_APPROVED'}))
