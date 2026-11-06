/**
 * PUBLIC synthetic reference generator to prove the private historical four-way
 * runner can aggregate complete official-shaped 108-rider reference data.
 * Accepts only an offline PUBLIC synthetic input. No DB, no production writes.
 */
import {readFileSync} from 'node:fs'
import {runRaceEngine} from '../../src/universal-race-engine/runRaceEngine.ts'
import {observedBreakawayPeakV4} from './privateControlledFourWayDiagnosticsV4.mjs'

const source=JSON.parse(readFileSync(0,'utf8'))
const {input,options}=source
if(input?.riders?.length!==108||options?.teamControl?.length!==18||
  input?.stage?.stageId!=='v4-synthetic-stage-01'||
  input?.race?.raceId!=='v4-synthetic-race-01')
 throw Error('PUBLIC_SYNTHETIC_REFERENCE_ONLY')
const result=runRaceEngine(input)
if(result.validationPassed!==true||result.replaySynchronization?.synchronized!==true)
 throw Error('PUBLIC_SYNTHETIC_SIMULATION_FAILED')
const r=result.roadRaceResolution??{}
const resultRows=result.finishResolution.classification
const reference={
 stageId:input.stage.stageId,raceId:input.race.raceId,
 status:'completed',engineVersion:'race_engine_ts_v1',
 officialRows:resultRows.map(x=>({
  riderId:x.riderId,status:x.status,rank:x.rank,
  gapSeconds:x.gapSeconds,elapsedSeconds:x.officialTimeSeconds
 })),
 savedClassification:resultRows,
 savedEnergyRows:result.postStageUpdate.riderUpdates.map(x=>({
  riderId:x.riderId,finishEnergy:x.finishEnergy,energySpent:x.energySpent
 })),
 savedRaceSummary:{
  acceptedOpeningAttacks:(r.phase1Opening?.attackAttempts??[]).filter(x=>x.acceptedEscapeLaunch===true).length,
  openingBreakawaySize:result.calibrationSummary.openingBreakawaySize,
  peakBreakawayGapSeconds:result.calibrationSummary.maximumBreakawayGapSeconds,
  observedPeakBreakawayGapSeconds:observedBreakawayPeakV4(result),
  observedPeakSampleCount:100,
  breakawayCaught:result.calibrationSummary.breakawayCaught,
  breakawaySurvived:result.calibrationSummary.breakawaySurvived,
  finalGroupCount:result.calibrationSummary.finalGroupCount,
  replayCheckpoints:result.replayTimeline.checkpoints.length,
  phase4BridgeGroups:r.phase4Finish?.bridgeGroups?.length??0
 }
}
process.stdout.write(JSON.stringify({input,options,reference}))
