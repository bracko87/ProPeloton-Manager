import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizeControlledPartialFourWayV4}
 from './privateControlledFourWayDiagnosticsV4.mjs'
function make(){
 const rows=[],updates=[]
 for(let i=0;i<108;i++){
  const riderId='synthetic-'+i
  rows.push({riderId,status:i===107?'dnf':'finished',
   rank:i===107?null:i+1,
   gapSeconds:i===107?null:0,
   officialTimeSeconds:i===107?null:14914})
  updates.push({riderId,finishEnergy:50,energySpent:50})
 }
 return {stageId:'synthetic-stage',raceId:'synthetic-race',
  validationPassed:true,replaySynchronization:{synchronized:true},
  finishResolution:{classification:rows},
  postStageUpdate:{riderUpdates:updates},
  calibrationSummary:{finalGroupCount:1,maximumBreakawayGapSeconds:120,
   breakawayCaught:true},
  roadRaceResolution:{phase1Opening:{
   breakawayRiderIds:['synthetic-0','synthetic-6'],
   physicalGapTrajectory:[{kmFromStart:20,gapSeconds:180}],
   endGapSeconds:80},phase2Development:{
   physicalGapTrajectory:[{kmFromStart:70,gapSeconds:240}],
   endGapSeconds:120}},
  replayTimeline:{checkpoints:[]}}
}
const comparer=()=>({status:'V4_HISTORICAL_OUTCOMES_COMPARED',
 officialArchivedResultVerified:true,differences:{sameWinner:true}})
test('partial report contains only available controlled effects',()=>{
 const base=make(),v4=structuredClone(base),v4ai=structuredClone(base)
 v4ai.finishResolution.classification[0].rank=2
 v4ai.finishResolution.classification[1].rank=1
 const result=summarizeControlledPartialFourWayV4({
  reference:{officialRows:base.finishResolution.classification,
   savedRaceSummary:{observedPeakBreakawayGapSeconds:240,
    observedPeakSampleCount:100,peakBreakawayGapSeconds:120}},
  planned:{aiTeams:18,humanTeams:0,intents:[{}]},
  caseResults:{baselineOriginal:base,v4Original:v4,v4V4Tactics:v4ai},
  failures:{baselineV4Tactics:'SHADOW_PHYSICS_PHASE5_REJECTED'},
  prefixProbes:[1,2,3,4].map(throughPhase=>({
   throughPhase,status:throughPhase<3?'PASS':'EXECUTION_REJECTED',
   reason:throughPhase<3?null:'SHADOW_PHYSICS_PHASE5_REJECTED'
  })),
  compareWithOfficial:comparer
 })
 assert.equal(result.status,'V4_CONTROLLED_PARTIAL_DIAGNOSTIC')
 assert.equal(result.completedArms,3)
 assert.equal(result.cases.baselineV4Tactics,null)
 assert.equal(result.isolatedEffects.aiTacticsOnBaseline,null)
 assert.equal(result.isolatedEffects.v4PhysicsWithAiTactics,null)
 assert.equal(result.isolatedEffects.aiTacticsOnV4Physics.rankChangedRiders,2)
 assert.equal(result.isolatedEffects.v4PhysicsWithOriginalTactics.rankChangedRiders,0)
 assert.equal(result.officialWrites,0)
 assert.equal(result.productionEnabled,false)
 assert.doesNotMatch(JSON.stringify(result),/synthetic-race|synthetic-0/)
})
