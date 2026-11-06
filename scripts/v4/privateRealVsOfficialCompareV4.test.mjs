import test from 'node:test'
import assert from 'node:assert/strict'
import {comparePrivateV4WithOfficial} from './privateRealVsOfficialCompareV4.mjs'

function make(){
 const officialRows=[],savedClassification=[],savedEnergyRows=[],v4Classification=[],v4Energy=[]
 for(let i=0;i<108;i++){
  const riderId='private-rider-'+i
  const status=i===107?'dnf':'finished'
  const rank=i===107?null:i+1
  const gap=i===107?null:i*3
  const time=i===107?null:14914+gap
  officialRows.push({riderId,status,rank,gapSeconds:gap,elapsedSeconds:time})
  savedClassification.push({riderId,status,rank,gapSeconds:gap,officialTimeSeconds:time})
  v4Classification.push({riderId,status,rank,gapSeconds:gap,officialTimeSeconds:time})
  savedEnergyRows.push({riderId,finishEnergy:60,energySpent:40})
  v4Energy.push({riderId,finishEnergy:60,energySpent:40})
 }
 const summary={
  acceptedOpeningAttacks:3,openingBreakawaySize:3,
  peakBreakawayGapSeconds:150,breakawayCaught:true,
  breakawaySurvived:false,finalGroupCount:6,replayCheckpoints:77,
  phase4BridgeGroups:0
 }
 return {
  ref:{stageId:'private-stage',raceId:'private-race',
   status:'completed',engineVersion:'race_engine_ts_v1',
   officialRows,savedClassification,savedEnergyRows,savedRaceSummary:summary},
  v4:{stageId:'private-stage',raceId:'private-race',
   validationPassed:true,replaySynchronization:{synchronized:true},
   finishResolution:{classification:v4Classification},
   postStageUpdate:{riderUpdates:v4Energy},
   calibrationSummary:{openingBreakawaySize:3,maximumBreakawayGapSeconds:150,
    breakawayCaught:true,breakawaySurvived:false,finalGroupCount:6},
   roadRaceResolution:{phase1Opening:{attackAttempts:[
    {acceptedEscapeLaunch:true},{acceptedEscapeLaunch:true},
    {acceptedEscapeLaunch:true}
   ]},phase4Finish:{bridgeGroups:[]}},
   replayTimeline:{checkpoints:Array.from({length:77},()=>({}))}
  }
 }
}
test('108-rider official comparison emits no rider identity when results agree',()=>{
 const {ref,v4}=make()
 const out=comparePrivateV4WithOfficial(ref,v4)
 assert.equal(out.status,'V4_HISTORICAL_OUTCOMES_COMPARED')
 assert.equal(out.ridersCompared,108)
 assert.equal(out.differences.sameWinner,true)
 assert.equal(out.differences.rankChangedRiders,0)
 assert.equal(out.differences.gapChangedRiders,0)
 assert.equal(out.differences.statusChangedRiders,0)
 assert.equal(out.differences.meanAbsoluteFinishEnergyDelta,0)
 assert.equal(out.official.finishers,107)
 assert.equal(out.official.dnf,1)
 assert.equal(out.officialWrites,0)
 assert.equal(out.productionParityVerified,false)
 assert.doesNotMatch(JSON.stringify(out),/private-stage|private-race|private-rider/)
})
test('108-rider comparison measures differences without returning private IDs',()=>{
 const {ref,v4}=make()
 v4.finishResolution.classification[0].rank=2
 v4.finishResolution.classification[1].rank=1
 v4.finishResolution.classification[1].officialTimeSeconds=14904
 v4.finishResolution.classification[0].gapSeconds=5
 v4.postStageUpdate.riderUpdates[0].finishEnergy=55
 v4.postStageUpdate.riderUpdates[0].energySpent=45
 const out=comparePrivateV4WithOfficial(ref,v4)
 assert.equal(out.differences.sameWinner,false)
 assert.equal(out.differences.rankChangedRiders,2)
 assert.equal(out.differences.gapChangedRiders,1)
 assert.equal(out.differences.winningTimeDeltaSeconds,-10)
 assert.equal(out.differences.maximumAbsoluteFinishEnergyDelta,5)
 assert(out.differences.meanAbsoluteGapChangeSeconds>0)
 assert.doesNotMatch(JSON.stringify(out),/private-rider/)
})
test('stage mismatch and altered official archive fail closed',()=>{
 const {ref,v4}=make()
 ref.savedClassification[0].rank=3
 assert.throws(()=>comparePrivateV4WithOfficial(ref,v4),/OFFICIAL_SAVED_OUTPUT_DRIFT_REJECTED/)
 ref.savedClassification[0].rank=1
 ref.officialRows[0].riderId='other'
 assert.throws(()=>comparePrivateV4WithOfficial(ref,v4),/RIDER_SET_REJECTED/)
 ref.officialRows[0].riderId='private-rider-0'
 ref.raceId='different-race'
 assert.throws(()=>comparePrivateV4WithOfficial(ref,v4),/STAGE_OR_REPLAY_REJECTED/)
})
