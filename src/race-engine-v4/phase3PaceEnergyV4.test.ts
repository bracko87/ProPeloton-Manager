import assert from 'node:assert/strict'
import {calculateV4Phase3PaceEnergySurcharge as energy} from './phase3PaceEnergyV4.ts'
const samples=[
 {kmFromStart:60,escapePaceKmh:null,pelotonPaceKmh:null,referencePaceKmh:41},
 {kmFromStart:62,escapePaceKmh:46,pelotonPaceKmh:43,referencePaceKmh:41},
 {kmFromStart:64,escapePaceKmh:44,pelotonPaceKmh:42,referencePaceKmh:41}
]
const base={riderId:'A',escapeRiderIds:['A'],chasingRiderIds:['B'],baseEnergyCost:10,phaseStartKm:60,samples}
const escape=energy(base)
const chase=energy({...base,riderId:'B'})
assert(escape>chase,'more exposed, faster escape must have greater surcharge')
assert(chase>0)
assert(escape<=1.5 && chase<=1.5,'surcharge must remain bounded')
assert.equal(energy({...base,riderId:'C'}),0,'passive riders must not be charged')
assert.equal(energy({...base,baseEnergyCost:0}),0)
assert.equal(energy({...base,samples:samples.map(x=>({...x,escapePaceKmh:40,pelotonPaceKmh:40}))}),0)
assert.equal(energy({...base,samples:[]}),0)
assert.equal(energy({...base,baseEnergyCost:10_000})<=1500,true)
assert.equal(energy(base),escape,'determinism')
assert.throws(()=>energy({...base,baseEnergyCost:-1}),/nonnegative/)
assert.throws(()=>energy({...base,samples:[{...samples[0],kmFromStart:59}]}),/ordered/)
assert.throws(()=>energy({...base,samples:[{...samples[0],escapePaceKmh:-1}]}),/positive/)
console.log('V4_PHASE3_PACE_ENERGY_UNIT_REPORT '+JSON.stringify({
 status:'PASS',cases:12,escapeSurcharge:escape,chaseSurcharge:chase,
 phase3Feedback:false,originalV2Modified:false,officialWrites:0}))
