import assert from 'node:assert/strict'
import {swapEqualRowLanesV3,frozenDemandAtShelterV3,auditFrozenTickV3} from './frozenFactorialV3.mjs'
import {initializeCoupledV3,advanceCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
const fixture=batch26Input('dordrecht-2000-10-15'),input={...fixture,riders:fixture.riders.slice(0,24),orders:fixture.orders.filter(x=>fixture.riders.slice(0,24).some(r=>r.riderId===x.riderId)),route:[{lengthKm:4,gradePercent:0}],experimentalPowerDurationEnergy:true}
const state=initializeCoupledV3(input),before=structuredClone(state.riders);let trace
advanceCoupledV3(input,state,1,t=>{trace=t})
const baseline=auditFrozenTickV3(before,trace.rows)
assert.equal(baseline.factorial[2].factor,1)
assert.equal(baseline.factorial[2].changedAchieved,0)
assert.equal(baseline.factorial[2].changedDemand,0)
assert.equal(baseline.factorial[2].changedWheelFlag,0)
assert.equal(baseline.energyWork.riderTicks,24)
assert(baseline.laneOnly&&baseline.laneOnly.riderIds.length===2)
const again=auditFrozenTickV3(before.slice().reverse(),trace.rows.slice().reverse())
for(const k of Object.keys(baseline.energyWork))assert(Math.abs(baseline.energyWork[k]-again.energyWork[k])<1e-8,'Permutation changed frozen shadow '+k)
for(const row of trace.rows){const from=before.find(x=>x.riderId===row.riderId);assert(Math.abs(frozenDemandAtShelterV3(from,row,1,10)-row.commandedMps)<=.000003)}
assert.throws(()=>auditFrozenTickV3(before,trace.rows.slice(1)),/Invalid matched/)
assert.throws(()=>auditFrozenTickV3(before,trace.rows.map(x=>({...x,metersAfter:x.metersAfter+1}))),/Frozen replay/)
assert.throws(()=>frozenDemandAtShelterV3(before[0],trace.rows[0],.75,10),/Invalid factor/)
assert.throws(()=>swapEqualRowLanesV3([{riderId:'a',lane:0,meters:0},{riderId:'a',lane:1,meters:0}]),/Invalid/)
assert.deepEqual(before.map(r=>r.lane),initializeCoupledV3(input).riders.map(r=>r.lane))
console.log(JSON.stringify({suite:'Batch36 frozen factorial',status:'PASS',riders:before.length,energy:baseline.energyWork,baseline:baseline.factorial[2],lane:baseline.laneOnly}))
