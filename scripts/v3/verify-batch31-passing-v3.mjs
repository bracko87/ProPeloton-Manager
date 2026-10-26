/** Batch 31 isolated finite passing power/energy safety, source TS. */
import assert from 'node:assert/strict'
import {initializeFinitePassingV3,validateFinitePassingV3,capFinitePassSpeedV3,startFinitePassV3,stepFinitePassV3} from '../../src/race-engine-v3/finitePassingResearchV3.ts'
import {initializeCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
const a=[{riderId:'a',lane:0,meters:100},{riderId:'b',lane:1,meters:120}],m=[{riderId:'a',lane:0,oldMeters:100,meters:105,wheelLimited:true},{riderId:'b',lane:1,oldMeters:120,meters:125,wheelLimited:false}]
let pass=startFinitePassV3(initializeFinitePassingV3(),{riderId:'a',fromLane:0,lane:1,meters:100},[{...m[0],meters:100},m[1]],1)
validateFinitePassingV3(pass,['a','b'],4)
for(let i=0;i<3;i++){let s=stepFinitePassV3(pass,a,m,10);assert.equal(s.commitLane?.toLane,i===2?1:undefined);pass=JSON.parse(JSON.stringify(s.state))}
assert.equal(pass.completed,1);assert.equal(pass.cumulativeExtraMechanicalJoules,1050)
const aborted=stepFinitePassV3(startFinitePassV3(initializeFinitePassingV3(),{riderId:'a',fromLane:0,lane:1,meters:100},[{...m[0],meters:100},m[1]],1),a,[m[0],{...m[1],meters:105.8}],10)
assert.equal(aborted.state.rejected,1);assert.equal(aborted.state.cumulativeExtraMechanicalJoules,350)
const speed=capFinitePassSpeedV3(15,250,x=>40*x,35);assert(speed>5&&speed<5.376)
const input=batch26Input('dordrecht-2000-10-15')
assert.throws(()=>initializeCoupledV3({...input,experimentalFinitePassReservation:true}),/requires isolated W-prime/)
assert.throws(()=>initializeCoupledV3({...input,experimentalFinitePassReservation:true,experimentalPowerDurationEnergy:true,experimentalAnticipatoryLaneMoves:true}),/requires isolated W-prime/)
console.log('PASS Batch31: three-tick lane reservation, actual additional joules, aborted effort, speed bound, opt-in gate')
