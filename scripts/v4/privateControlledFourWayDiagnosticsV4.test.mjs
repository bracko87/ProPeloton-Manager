import test from 'node:test'
import assert from 'node:assert/strict'
import {
 observedBreakawayPeakV4,compactRaceDiagnosticsV4,
 pairedRaceDifferencesV4,summarizeControlledFourWayV4
} from './privateControlledFourWayDiagnosticsV4.mjs'
function fixture(){
 const classification=[],riderUpdates=[]
 for(let i=0;i<108;i++){
  const riderId='PRIVATE-RIDER-'+i
  const finished=i<107
  classification.push({riderId,status:finished?'finished':'dnf',
   rank:finished?i+1:null,
   gapSeconds:finished?(i<89?0:i*4):null,
   officialTimeSeconds:finished?14914+(i<89?0:i*4):null})
  riderUpdates.push({riderId,finishEnergy:40,energySpent:60})
 }
 return {stageId:'PRIVATE-STAGE',raceId:'PRIVATE-RACE',
  validationPassed:true,replaySynchronization:{synchronized:true},
  finishResolution:{classification},postStageUpdate:{riderUpdates},
  calibrationSummary:{
   maximumBreakawayGapSeconds:373.526188,finalGroupCount:11,breakawayCaught:true
  },
  roadRaceResolution:{
   phase1Opening:{initialGapSeconds:11,endGapSeconds:245,
    breakawayRiderIds:['PRIVATE-RIDER-0','PRIVATE-RIDER-1'],
    physicalGapTrajectory:[{kmFromStart:20,gapSeconds:140}]},
   phase2Development:{startGapSeconds:245,endGapSeconds:373.526188,
    physicalGapTrajectory:[{kmFromStart:77.5,gapSeconds:390.660087}]},
   phase3Decisive:{physicalStartGapSeconds:373.526188,
    physicalEndGapSeconds:42,physicalChasingTeamIds:[],
    physicalGapTrajectory:[{kmFromStart:100,gapSeconds:220}]},
   phase4Finish:{startGapSeconds:42,endGapSeconds:0,chaseSteps:[
    {startGapSeconds:42,endGapSeconds:8},
    {startGapSeconds:8,endGapSeconds:0}
   ]}
  },replayTimeline:{checkpoints:[{},{}]}
 }
}
test('physical peak reads intermediate samples, not the phase-boundary calibration field',()=>{
 const r=fixture()
 assert.equal(r.calibrationSummary.maximumBreakawayGapSeconds,373.526188)
 assert.equal(observedBreakawayPeakV4(r),390.66)
 const compact=compactRaceDiagnosticsV4(r)
 assert.equal(compact.observedBreakawayPeakSeconds,390.66)
 assert.equal(compact.calibrationReportedPeakSeconds,373.526188)
 assert.equal(compact.phase2EndGapSeconds,373.526188)
 assert.equal(compact.ridersAtZeroGap,89)
})
test('pairing isolates changed ranks within identical time gaps',()=>{
 const a=fixture(),b=structuredClone(a)
 const left=b.finishResolution.classification[0]
 const right=b.finishResolution.classification[1]
 left.rank=2;right.rank=1
 b.postStageUpdate.riderUpdates[0].finishEnergy=36
 const out=pairedRaceDifferencesV4(a,b)
 assert.equal(out.sameWinner,false)
 assert.equal(out.rankChangedRiders,2)
 assert.equal(out.gapChangedRiders,0)
 assert.equal(out.rankChangedWithSameGapAndStatus,2)
 assert.equal(out.meanAbsoluteRankChange,0.019)
 assert.equal(out.maximumAbsoluteFinishEnergyDelta,4)
 assert.doesNotMatch(JSON.stringify(out),/PRIVATE-RIDER/)
})
test('four-way aggregate includes only summaries and conditional effects',()=>{
 const a=fixture(),b=structuredClone(a),c=structuredClone(a),d=structuredClone(a)
 b.finishResolution.classification[0].rank=2
 b.finishResolution.classification[1].rank=1
 c.roadRaceResolution.phase2Development.physicalGapTrajectory[0].gapSeconds=92
 c.calibrationSummary.maximumBreakawayGapSeconds=92
 d.roadRaceResolution.phase2Development.physicalGapTrajectory[0].gapSeconds=95
 d.calibrationSummary.maximumBreakawayGapSeconds=95
 const ref={officialRows:a.finishResolution.classification,
  savedRaceSummary:{peakBreakawayGapSeconds:373.526188,
   observedPeakBreakawayGapSeconds:390.660087,observedPeakSampleCount:70}}
 const planned={aiTeams:18,humanTeams:0,intents:[{PRIVATE_COMMAND:'SECRET'}]}
 const compareWithOfficial=()=>({status:'V4_HISTORICAL_OUTCOMES_COMPARED',
  officialArchivedResultVerified:true,
  differences:{sameWinner:true,rankChangedRiders:0}})
 const o=summarizeControlledFourWayV4({
  reference:ref,planned,baselineOriginal:a,baselineV4Tactics:b,
  v4Original:c,v4V4Tactics:d,compareWithOfficial
 })
 assert.equal(o.status,'V4_CONTROLLED_FOUR_WAY_COMPLETE')
 assert.equal(o.archivedOfficial.observedBreakawayPeakSeconds,390.660087)
 assert.equal(o.cases.v4Original.observedBreakawayPeakSeconds,373.526)
 assert.equal(o.isolatedEffects.aiTacticsOnBaseline.rankChangedRiders,2)
 assert.equal(o.productionEnabled,false)
 assert.equal(o.officialWrites,0)
 assert.equal(o.originalProductionLockVerified,false)
 assert.doesNotMatch(JSON.stringify(o),/PRIVATE-RIDER|PRIVATE-STAGE|PRIVATE-RACE|PRIVATE_COMMAND|SECRET/)
})
test('reject corrupted rider set before emitting any private report',()=>{
 const a=fixture(),b=structuredClone(a)
 b.finishResolution.classification[3].riderId='PRIVATE-DUPLICATE'
 assert.throws(()=>pairedRaceDifferencesV4(a,b),/PAIR_RIDER_SET_MISMATCH/)
 b.finishResolution.classification[4].riderId='PRIVATE-DUPLICATE'
 assert.throws(()=>pairedRaceDifferencesV4(a,b),/PAIR_RIGHT_RIDER_SET_INVALID/)
})
