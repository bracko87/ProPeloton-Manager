import assert from 'node:assert/strict'
import {projectRiderPowerV3} from '../../src/race-engine-v3/riderPowerAdapterV3.ts'
import {calculatePackPowerV3,debitPowerReserveV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
const p={riderId:'r1',flat:76,climbing:82,endurance:80,resistance:77,fatigueBeforeStage:42,startStamina:83.5,raceSharpness:75,recovery:72,morale:100,equipmentStagePerformancePct:5,inStageEnergyCostMultiplier:1}
const one=projectRiderPowerV3(p,0,'attack')
assert.equal(one.modelVersion,'v3_power_proxy_01')
assert.equal(one.inputQuality,'source_snapshot')
assert.equal(one.energy,.835)
assert(one.sustainableWatts>150&&one.sustainableWatts<400)
assert(one.transientWatts>0)
const climbing=projectRiderPowerV3({...p,climbing:95},8)
const originalClimbing=projectRiderPowerV3(p,8)
assert(climbing.sustainableWatts>originalClimbing.sustainableWatts)
assert(projectRiderPowerV3({...p,flat:88},0).sustainableWatts>projectRiderPowerV3(p,0).sustainableWatts)
assert(projectRiderPowerV3({...p,fatigueBeforeStage:80},0).sustainableWatts<one.sustainableWatts)
assert(projectRiderPowerV3({...p,raceSharpness:30},0).sustainableWatts<one.sustainableWatts)
assert(projectRiderPowerV3({...p,startStamina:45},0).energy<one.energy)
assert(projectRiderPowerV3({...p,equipmentStagePerformancePct:0},0).sustainableWatts<one.sustainableWatts)
assert.equal(p.startStamina,83.5,'No mutation of source input')
assert.throws(()=>projectRiderPowerV3({riderId:'r',flat:70,climbing:70,endurance:70,resistance:70,fatigueBeforeStage:50},0),/Missing physical source attributes/)
const proxy=projectRiderPowerV3({riderId:'r2',flat:70,climbing:70,endurance:70,resistance:70,fatigueBeforeStage:50},0,'follow',true)
assert.equal(proxy.inputQuality,'research_proxy')
assert(proxy.assumptions.some(x=>x.includes('stand-ins')))
assert.throws(()=>projectRiderPowerV3({...p,startStamina:101},0))
assert.throws(()=>projectRiderPowerV3({...p,flat:NaN},0))
assert.throws(()=>projectRiderPowerV3({...p,inStageEnergyCostMultiplier:0},0))
assert.throws(()=>projectRiderPowerV3(p,25))
// The same energy reserve must feed repeated tactical bursts; no free reset.
let state=[one]
for(let i=0;i<5;i++){
 const pack=calculatePackPowerV3(state,{gradePercent:0})
 state=debitPowerReserveV3(state,pack,200)
}
assert(state[0].energy<one.energy)
assert.equal(state[0].modelVersion,one.modelVersion)
const noScale={...one,energyCostScale:1}
const withScale={...one,energyCostScale:1.5}
const rechargePlan=calculatePackPowerV3([one],{gradePercent:0})
assert(debitPowerReserveV3([withScale],rechargePlan,100)[0].energy<debitPowerReserveV3([noScale],rechargePlan,100)[0].energy,'Preparation energy cost multiplier must affect depletion')
assert.throws(()=>debitPowerReserveV3([{...one,energyCostScale:2.1}],rechargePlan,100))
console.log('PASS source-only rider power contract; 15 deterministic mapping, validation and depletion assertions')
console.log(JSON.stringify({sourceWatts:one.sustainableWatts,sourceEnergy:one.energy,climbingWatts:climbing.sustainableWatts,proxyWatts:proxy.sustainableWatts}))
