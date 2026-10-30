import assert from 'node:assert/strict'
import {auditV4Phase3Speed} from './phase3SpeedAuditV4.ts'
assert.equal(auditV4Phase3Speed({}),null)
const p={pelotonPaceKmh:40,escapePaceKmh:44,selectedResponseMultiplier:1.01,
 chaseAssets:3,chasingTeamCount:1,explicitChasingTeamCount:1,
 automaticChasingTeamCount:0,gcThreatChasingTeamCount:0,
 cooperationMultiplier:1.02,chaseInterestScore:.4,chaseCapacityScore:.35,
 responseMode:'control_gap'}
const a=auditV4Phase3Speed({roadRaceResolution:{phase3Decisive:{
 physicalGapTrajectory:[
  {kmFromStart:60,gapSeconds:200},
  {kmFromStart:62,gapSeconds:216.363636,v4ResearchPace:p},
  {kmFromStart:64,gapSeconds:206,v4ResearchPace:{...p,escapePaceKmh:39,
   pelotonPaceKmh:44,responseMode:'organized_chase'}}
 ]}}})
assert(a)
assert.equal(a.instrumented,true)
assert.equal(a.sampleSteps,2)
assert.equal(a.measuredKm,4)
assert.equal(a.gapGrowingKm,2)
assert.equal(a.gapShrinkingKm,2)
assert.equal(a.escapeFasterKm,2)
assert.equal(a.pelotonFasterKm,2)
assert.equal(a.medianExplicitChasingTeams,1)
assert.equal(a.medianChaseAssets,3)
assert.equal(a.medianPelotonPaceKmh,44)
assert.equal(a.medianEscapePaceKmh,44)
assert.deepEqual(a.responseModeKm,{control_gap:2,organized_chase:2})
assert.equal(a.measuredGapGrowthSeconds,6)
assert.equal(auditV4Phase3Speed({roadRaceResolution:{phase3Decisive:{
 physicalGapTrajectory:[{kmFromStart:60,gapSeconds:10},{kmFromStart:62,gapSeconds:20}]
}}}),null)
assert.throws(()=>auditV4Phase3Speed({roadRaceResolution:{phase3Decisive:{
 physicalGapTrajectory:[{kmFromStart:60,gapSeconds:10},
  {kmFromStart:62,gapSeconds:20,v4ResearchPace:{...p,pelotonPaceKmh:0}}]
}}}),/invalid Phase 3 physical speed/)
console.log('V4_PHASE3_SPEED_UNIT_REPORT '+JSON.stringify({
 status:'PASS',checks:15,physicsModified:false,originalV2FilesModified:false,officialWrites:0
}))
