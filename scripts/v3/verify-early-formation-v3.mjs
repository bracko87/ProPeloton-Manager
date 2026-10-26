import assert from 'node:assert/strict'
import {advanceEarlyFormationResearchV3} from './earlyFormationResearchV3.mjs'
const riders=[{riderId:'a',meters:106,lane:0,energy:.8,wheelLimitedTicks:0,cumulativeActualWorkJoules:200,powerDurationEnergy:{remainingWPrimeJoules:2000},finishSeconds:null},{riderId:'b',meters:103,lane:0,energy:.8,wheelLimitedTicks:1,cumulativeActualWorkJoules:100,powerDurationEnergy:{remainingWPrimeJoules:3000},finishSeconds:null},{riderId:'c',meters:113,lane:1,energy:.8,wheelLimitedTicks:0,cumulativeActualWorkJoules:300,powerDurationEnergy:{remainingWPrimeJoules:4000},finishSeconds:null}]
const before=[{riderId:'a',meters:100,lane:0,tactic:'follow',wheelLimitedTicks:0},{riderId:'b',meters:97,lane:0,tactic:'follow',wheelLimitedTicks:0},{riderId:'c',meters:107,lane:1,tactic:'follow',wheelLimitedTicks:0}]
const state={riders:structuredClone(riders),elapsedSeconds:10,tick:1,complete:false}
const input={grid:{ridersAcross:4},tickSeconds:10,sampleSeconds:120}
assert.deepEqual(advanceEarlyFormationResearchV3(input,state,before,{lastShiftTick:0,cooldownTicks:4}),{applied:false,rejected:false,choice:null})
assert.equal(advanceEarlyFormationResearchV3(input,state,before,{lastShiftTick:-9999,cooldownTicks:4}).applied,true)
assert.equal(state.riders.find(x=>x.riderId==='b').lane,1)
assert.equal(state.riders.find(x=>x.riderId==='b').meters,103)
assert.equal(state.riders.find(x=>x.riderId==='b').powerDurationEnergy.remainingWPrimeJoules,3000)
assert.throws(()=>advanceEarlyFormationResearchV3(input,state,before,{cooldownTicks:0}),/Invalid lane cooldown/)
assert.throws(()=>advanceEarlyFormationResearchV3(input,state,before,{formationMaxKm:20}),/Invalid formation range/)
const afterSample={...state,elapsedSeconds:120,tick:12,riders:structuredClone(riders)}
assert.equal(advanceEarlyFormationResearchV3(input,afterSample,before,{}).applied,false)
const outside={...state,elapsedSeconds:10,tick:1,riders:structuredClone(riders)}
assert.equal(advanceEarlyFormationResearchV3(input,outside,before.map(x=>({...x,meters:x.meters+11000})),{}).applied,false)
console.log('PASS Batch 29 isolated early formation: single lateral move only, cooldown, sampling, no watts or metres debited')
