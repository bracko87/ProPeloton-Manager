import assert from 'node:assert/strict'
import {auditV4GapTrajectories} from './breakawayGapDiagnosticsV4.ts'

// The synthetic seven-second summary understates the real opening trajectory.
const historicShaped=auditV4GapTrajectories({
 calibrationSummary:{maximumBreakawayGapSeconds:7},
 roadRaceResolution:{
  phase1Opening:{initialGapSeconds:7,endGapSeconds:0,breakawayCatchKm:11.6,
   physicalGapTrajectory:[
    {kmFromStart:5.7,gapSeconds:7},
    {kmFromStart:6.2,gapSeconds:10.133157},
    {kmFromStart:11.6,gapSeconds:0}
   ]}
 }
})
assert.equal(historicShaped.reportedMaxGapSeconds,7)
assert.equal(historicShaped.phase1?.seconds,10.133157)
assert.equal(historicShaped.observedPeakPhase,'phase1')
assert.equal(historicShaped.unreportedSamplePeakSeconds,3.133157)
assert.equal(historicShaped.phase1?.catchKm,11.6)
assert.equal(historicShaped.researchOnly,true)

const phases=auditV4GapTrajectories({
 calibrationSummary:{maximumBreakawayGapSeconds:640},
 roadRaceResolution:{
  phase1Opening:{initialGapSeconds:8,endGapSeconds:200,breakawayCatchKm:null,
   physicalGapTrajectory:[{kmFromStart:30,gapSeconds:220}]},
  phase2Development:{
   startGapSeconds:200,endGapSeconds:500,breakawayCatchKm:null,
   physicalGapTrajectory:[{kmFromStart:46,gapSeconds:720},
    {kmFromStart:60,gapSeconds:500}],
   pelotonResponse:{responseMode:'uninterested_peloton',
    chasingTeamIds:[],controllingTeamIds:['control-team']}
  },
  phase4Finish:{
   startGapSeconds:520,endGapSeconds:100,breakawayCaught:false,
   breakawaySurvived:true,explicitChasingTeamIds:['chaser'],
   automaticChasingTeamIds:[],chaseSteps:[
    {kmEnd:115,startGapSeconds:520,endGapSeconds:100}
   ]
  }
 }
})
assert.equal(phases.observedPeakPhase,'phase2')
assert.equal(phases.observedSampleMaxGapSeconds,720)
assert.equal(phases.unreportedSamplePeakSeconds,80)
assert.equal(phases.phase2?.explicitChasingTeamCount,0)
assert.equal(phases.phase2?.controllingTeamCount,1)
assert.equal(phases.phase4?.explicitChasingTeamCount,1)
assert.equal(phases.phase4?.breakawaySurvived,true)
assert.deepEqual(auditV4GapTrajectories({}),{
 researchOnly:true,reportedMaxGapSeconds:null,
 observedSampleMaxGapSeconds:null,observedPeakPhase:null,
 unreportedSamplePeakSeconds:null,phase1:null,phase2:null,phase4:null
})
assert.throws(()=>auditV4GapTrajectories({
 roadRaceResolution:{phase1Opening:{
  initialGapSeconds:7,endGapSeconds:0,breakawayCatchKm:null,
  physicalGapTrajectory:[{kmFromStart:9,gapSeconds:NaN}]
 }}
}),/finite nonnegative/)
assert.throws(()=>auditV4GapTrajectories({
 roadRaceResolution:{phase1Opening:{
  initialGapSeconds:7,endGapSeconds:0,breakawayCatchKm:null,
  physicalGapTrajectory:[{kmFromStart:-1,gapSeconds:9}]
 }}
}),/finite physical kilometre/)
console.log('V4_GAP_DIAGNOSTIC_UNIT_REPORT '+JSON.stringify({
 status:'PASS',syntheticCases:5,reportedMaxGapIsNotAssumedPhysicalPeak:true,
 phasesKeptSeparate:true,officialWrites:0
}))
