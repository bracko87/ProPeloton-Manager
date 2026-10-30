import assert from 'node:assert/strict'
import {summarizeV4PrivateHistoricalCohort} from './historicalCohortAggregationV4.mjs'
const comparison=(h,terrain,v2,v4,parity=true)=>({
 researchOnly:true,officialWrites:0,historicLockCutoffActuallyVerified:false,
 riskWarning:'historical_lock_time_reconstructed_not_proven',
 comparisonKind:'V4_AI_PLANNING_ON_PRESERVED_V2_PHYSICS',
 calibratedV4PhysicsApplied:false,physicalRealismApproval:'NOT_EVALUATED',
 stageHash:h.repeat(16),terrain,riderCount:96,humanTeams:0,aiTeams:16,
 savedResultReproducedByCurrentV2:parity,
 v4ChangedRankCountComparedToCurrentV2:4,v4ChangedGapCountComparedToCurrentV2:6,
 maximumGapSeconds:{savedV2:7,currentV2:v2,v4Research:v4},
 escapeLaunches:{savedV2:1,currentV2:1,v4Research:2},
 replay:{historicalSynchronized:false,currentV2Synchronized:true,v4ResearchSynchronized:true},
})
const rows=[comparison('a','mountain',7,180),comparison('b','flat',7,150,false),comparison('c','hilly',200,90)]
const report=summarizeV4PrivateHistoricalCohort(rows,2)
assert.equal(report.attempted,5)
assert.equal(report.rejected,2)
assert.equal(report.all.stages,3)
assert.equal(report.all.currentV2SavedResultReproduced,2)
assert.equal(report.strictPairedPlanningSubset.stages,2)
assert.equal(report.all.medianV4AiPlannedOnV2PhysicsMaxGapSeconds,150)
assert.equal(report.terrain.find(x=>x.terrain==='mountain').stages,1)
assert.equal(report.calibratedV4PhysicalReruns,0)
assert.equal(report.realHistoricalV4PhysicalRealismApproved,false)
assert.equal(JSON.stringify(report).includes('riderId'),false)
assert.equal(report.all.sevenSecondSavedV2,3)
assert.throws(()=>summarizeV4PrivateHistoricalCohort([...rows,rows[0]]),/duplicate|Invalid/)
assert.throws(()=>summarizeV4PrivateHistoricalCohort([{...rows[0],calibratedV4PhysicsApplied:true}]))
assert.throws(()=>summarizeV4PrivateHistoricalCohort([{...rows[0],officialWrites:1}]))
assert.throws(()=>summarizeV4PrivateHistoricalCohort([{...rows[0],physicalRealismApproval:'APPROVED'}]))
assert.throws(()=>summarizeV4PrivateHistoricalCohort([{...rows[0],historicLockCutoffActuallyVerified:true}]))
assert.throws(()=>summarizeV4PrivateHistoricalCohort([{...rows[0],maximumGapSeconds:{savedV2:-1,currentV2:7,v4Research:8}}]))
assert.throws(()=>summarizeV4PrivateHistoricalCohort([], -1))
console.log('V4_PRIVATE_HISTORICAL_COHORT_UNIT '+JSON.stringify({status:'PASS',cases:17,realSnapshots:false,officialWrites:0,physicalRealismApproval:false}))
