import assert from 'node:assert/strict'
import {readV4ChaseTelemetry} from './phase4ChaseTelemetryV4.ts'
assert.equal(readV4ChaseTelemetry({}),null)
const step=(kmStart:number,kmEnd:number,escapePaceKmh:number,effectivePelotonPaceKmh:number,
 startGapSeconds:number,endGapSeconds:number,responseMode:string)=>({
 kmStart,kmEnd,escapePaceKmh,effectivePelotonPaceKmh,startGapSeconds,endGapSeconds,
 selectedResponseMultiplier:1.03,pelotonWorkIntensityFraction:.7,
 explicitChasingTeamCount:1,responseMode
})
const report=readV4ChaseTelemetry({roadRaceResolution:{phase4Finish:{
 chaseSteps:[step(90,95,48,45,100,120,'control_gap'),
             step(95,100,44,49,120,100,'organized_chase')],
 chasingTeamStrength:[{explicitChaserRiderIds:['A','B']}],
 riderStates:[{riderId:'A',startEnergy:70,energyAtFinish:50},
              {riderId:'B',startEnergy:60,energyAtFinish:40}]
}}})
assert(report)
assert.equal(report.researchOnly,true)
assert.equal(report.steps,2)
assert.equal(report.explicitChaseKm,10)
assert.equal(report.escapeFasterKm,5)
assert.equal(report.pelotonFasterKm,5)
assert.equal(report.gapGrowingDespiteChaseKm,5)
assert.equal(report.gapSpeedDisagreementKm,0)
assert.equal(report.explicitChaserCount,2)
assert.equal(report.averageExplicitChaserFinishEnergy,45)
assert.equal(report.averageExplicitChaserEnergyUsed,20)
assert.deepEqual(report.responseModeKm,{control_gap:5,organized_chase:5})
assert.throws(()=>readV4ChaseTelemetry({roadRaceResolution:{phase4Finish:{
 chaseSteps:[step(3,2,44,46,10,5,'organized_chase')],
 chasingTeamStrength:[],riderStates:[]
}}}),/invalid physical step/)
console.log('V4_CHASE_TELEMETRY_UNIT_REPORT '+JSON.stringify({status:'PASS',cases:3,officialWrites:0}))
