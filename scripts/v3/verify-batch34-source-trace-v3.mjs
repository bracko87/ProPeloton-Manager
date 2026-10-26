import assert from 'node:assert/strict'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
import {summarizePairedConstraintsV3} from './pairedConstraintAttributionV3.mjs'
const raw=batch26Input('dordrecht-2000-10-15')
const input={...raw,riders:raw.riders.slice(0,12),orders:raw.orders.filter(x=>raw.riders.slice(0,12).some(r=>r.riderId===x.riderId)),route:[{lengthKm:3,gradePercent:0}],experimentalPowerDurationEnergy:true}
const withTrace=initializeCoupledV3(input),withoutTrace=initializeCoupledV3(input);let counted=0
while(!withTrace.complete){
 advanceCoupledV3(input,withTrace,1,trace=>{assert.equal(trace.rows.length,trace.rows.filter(r=>Number.isFinite(r.availableWatts)).length);assert(trace.rows.every(r=>r.preventedMeters>=0&&r.achievedMps>=0&&r.wPrimeAfterJ>=0&&r.wPrimeBeforeJ>=0));counted++})
 advanceCoupledV3(input,withoutTrace,1)
 assert.deepEqual(withTrace,withoutTrace,'Observer mutated baseline checkpoint')
 assert(counted<200)
}
assert.deepEqual(finalizeCoupledV3(input,withTrace),runCoupledV3(input))
const sample=(props={})=>({riderId:'a',laneBefore:0,laneAfter:0,metersBefore:0,metersAfter:10,gradePercent:0,headwindMps:0,crosswindMps:0,draftLeaderId:'b',shelterFraction:.1,sameLaneLeaderId:'b',sustainedWatts:240,availableWatts:235,tactic:'follow',preEnergyRequestedMps:10,postEnergyRequestedMps:10,postPassRequestedMps:10,commandedMps:10,achievedMps:10,wheelLimited:false,preventedMeters:0,actualMechanicalWatts:230,passCostWatts:0,wPrimeBeforeJ:18000,wPrimeAfterJ:18010,...props})
const out=summarizePairedConstraintsV3([sample()],[sample({shelterFraction:.2,availableWatts:240,preEnergyRequestedMps:11,postEnergyRequestedMps:11,postPassRequestedMps:11,commandedMps:11,achievedMps:11,metersAfter:11})])
assert.equal(out.changedAchieved,1);assert.equal(out.changedShelter,1);assert.equal(out.changedRequested,1);assert.equal(out.changedWheel,0)
assert.throws(()=>summarizePairedConstraintsV3([sample()],[sample({riderId:'b'})]),/roster/)
console.log('PASS Batch 34 observer immutability, source watt trace, exact uninterrupted checkpoint and paired metrics',counted)
