import assert from 'node:assert/strict'
import {calculateV4Phase2ChasePriorityMultiplier as pace} from './phase2ChasePriorityV4.ts'
const race={terrainType:'mountain',currentGapSeconds:200,
 eligibleChaseWorkers:7,explicitlyChasingWorkers:3,meanWorkerEnergyFraction:0.65}
const one=pace({...race,explicitlyChasingWorkers:3})
const three=pace({...race,explicitlyChasingWorkers:5})
assert.equal(one,1+0.012*(3/7)*0.65)
assert.equal(three,1+0.012*(5/7)*0.65)
assert(three>one)
assert(three<=1.012)
assert.equal(pace({...race,explicitlyChasingWorkers:0}),1)
assert.equal(pace({...race,currentGapSeconds:0}),1)
assert.equal(pace({...race,terrainType:'hilly'}),1)
assert.equal(pace({...race,terrainType:'flat'}),1)
assert.equal(pace({...race,eligibleChaseWorkers:0,explicitlyChasingWorkers:0}),1)
assert.equal(pace({...race,meanWorkerEnergyFraction:0}),1)
assert.equal(pace({...race,gain:0}),1)
assert.equal(pace({...race,explicitlyChasingWorkers:7,gain:0.018,meanWorkerEnergyFraction:1}),1.018)
for(const invalid of [
 {...race,gain:-0.01},{...race,gain:0.019},{...race,gain:Infinity},
 {...race,currentGapSeconds:NaN},{...race,currentGapSeconds:-1},
 {...race,eligibleChaseWorkers:0},{...race,explicitlyChasingWorkers:8},
 {...race,explicitlyChasingWorkers:0.5},{...race,meanWorkerEnergyFraction:1.1},
 {...race,meanWorkerEnergyFraction:-0.1},{...race,meanWorkerEnergyFraction:NaN},
 {...race,terrainType:''}
])assert.throws(()=>pace(invalid),/invalid bounded research inputs/)
console.log('V4_PHASE2_CHASE_PRIORITY_MODULE '+JSON.stringify({status:'PASS',researchOnly:true,cases:24,productionWrites:0}))
