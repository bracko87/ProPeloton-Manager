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

// Exact numerical parity with the pre-refactor isolated V4 expression.
// This is a deterministic research contract, not validation of cycling realism.
let parityCases=0
for(const terrainType of ['flat','hilly','mountain'])
 for(const eligibleChaseWorkers of [0,1,3,7,12,20])
  for(const explicitlyChasingWorkers of [0,1,3,5,7,12,20].filter(n=>n<=eligibleChaseWorkers))
   for(const meanWorkerEnergyFraction of [0,0.3,0.65,1])
    for(const currentGapSeconds of [0,1,200])
     for(const gain of [0,0.0044,0.012,0.018]){
      const input={terrainType,eligibleChaseWorkers,explicitlyChasingWorkers,
       meanWorkerEnergyFraction,currentGapSeconds,gain}
      const oldExplicitFraction=eligibleChaseWorkers>0
       ?explicitlyChasingWorkers/eligibleChaseWorkers:0
      const expected=terrainType==='mountain'&&currentGapSeconds>0
       ?1+gain*oldExplicitFraction*meanWorkerEnergyFraction:1
      assert.equal(pace(input),expected,
       'Typed V4 research module must be exactly equivalent to prior formula')
      parityCases++
     }
assert(parityCases>=1000,'Require broad exact parity coverage')
console.log('V4_PHASE2_CHASE_PRIORITY_MODULE '+JSON.stringify({status:'PASS',researchOnly:true,baseCases:24,parityCases,productionWrites:0}))
