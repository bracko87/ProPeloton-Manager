import assert from 'node:assert/strict'
import {draftCounterfactualWattsV3 as watts} from '../../src/race-engine-v3/draftCounterfactualV3.ts'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
const road={gradePercent:0,headwindMps:0,crosswindMps:0}
assert(watts(11,.25,road,0)>watts(11,.25,road,.5))
assert(watts(11,.25,road,.5)>watts(11,.25,road,1))
assert.equal(watts(11,.25,road,1,177.424235),177.424235)
for(const v of [-1,.25,3,NaN])assert.throws(()=>watts(11,.25,road,v),/Invalid/)
const base=batch26Input('dordrecht-2000-10-15')
const small={...base,riders:base.riders.slice(0,14),orders:base.orders.filter(x=>base.riders.slice(0,14).some(r=>r.riderId===x.riderId)),route:[{lengthKm:3,gradePercent:0}],experimentalPowerDurationEnergy:true}
assert.throws(()=>initializeCoupledV3({...base,experimentalShelterStrength:0}),/Draft-strength/)
assert.throws(()=>initializeCoupledV3({...small,experimentalShelterStrength:.25}),/Draft-strength/)
assert.throws(()=>initializeCoupledV3({...small,experimentalShelterStrength:0,experimentalPathDraftWork:true}),/Draft-strength/)
const a=initializeCoupledV3(small),b=initializeCoupledV3(small),c=initializeCoupledV3({...small,experimentalShelterStrength:1})
let n=0
while(!a.complete){
 advanceCoupledV3(small,a,1)
 advanceCoupledV3(small,b,1,t=>{n++;assert(t.rows.every(x=>x.wPrimeAfterJ>=0&&x.integratedShelterFraction>=0&&Number.isFinite(x.actualMechanicalWatts)))})
 advanceCoupledV3({...small,experimentalShelterStrength:1},c,1)
 assert.deepEqual(a,b,'Observer changes physics')
 assert.deepEqual(a.riders,c.riders,'Explicit full shelter not equal to baseline')
 assert(n<200)
}
assert.deepEqual(finalizeCoupledV3(small,a),finalizeCoupledV3(small,b))
console.log(JSON.stringify({test:'batch35',status:'PASS',ticks:n,officialWrites:0}))
