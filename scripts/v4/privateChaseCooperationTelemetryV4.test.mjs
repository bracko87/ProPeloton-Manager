import test from 'node:test'
import assert from 'node:assert/strict'
import {compactRaceDiagnosticsV4}
 from './privateControlledFourWayDiagnosticsV4.mjs'

test('phase-2 chase and escape telemetry reports only aggregate values',()=>{
 const classification=Array.from({length:108},(_,i)=>({
  riderId:'test-rider-'+i,status:i<107?'finished':'dnf',
  rank:i<107?i+1:null,officialTimeSeconds:i<107?14914:null,
  gapSeconds:i<107?0:null
 }))
 const result={
  finishResolution:{classification},
  calibrationSummary:{maximumBreakawayGapSeconds:96,
   finalGroupCount:1,breakawayCaught:true},
  roadRaceResolution:{
   phase1Opening:{initialGapSeconds:12,endGapSeconds:96,
    breakawayRiderIds:['test-rider-0','test-rider-1'],
    physicalGapTrajectory:[{kmFromStart:40,gapSeconds:97}]},
   phase2Development:{startGapSeconds:96,endGapSeconds:10,
    pelotonResponse:{
     chasingTeamIds:['SECRET_TEAM_1','SECRET_TEAM_2'],
     controllingTeamIds:['SECRET_TEAM_3'],
     availableChaseAssets:18,
     chaseInterestScore:.63,
     selectedResponseMultiplier:1.08,
     baselinePelotonPaceKmh:39.0,
     effectivePelotonPaceKmh:42.2
    },
    breakawayCooperation:{
     projectedEscapePaceKmh:38.7,
     cooperationScore:.48,
     cooperationSpeedMultiplier:.92
    }},
   phase3Decisive:{physicalStartGapSeconds:10,physicalEndGapSeconds:80,
    physicalChasingTeamIds:['SECRET_TEAM_1'],
    physicalGapTrajectory:[
     {kmFromStart:100,gapSeconds:50,v4ResearchPace:{
      pelotonPaceKmh:43,escapePaceKmh:40}},
     {kmFromStart:110,gapSeconds:60,v4ResearchPace:{
      pelotonPaceKmh:45,escapePaceKmh:38}}
    ]},
   phase4Finish:{startGapSeconds:80,endGapSeconds:0,chaseSteps:[]}
  },
  replayTimeline:{checkpoints:[{}]}
 }
 const report=compactRaceDiagnosticsV4(result)
 assert.equal(report.phase2ChasingTeamCount,2)
 assert.equal(report.phase2ControllingTeamCount,1)
 assert.equal(report.phase2AvailableChaseAssets,18)
 assert.equal(report.phase2ChaseInterestScore,.63)
 assert.equal(report.phase2SelectedResponseMultiplier,1.08)
 assert.equal(report.phase2BaselinePelotonPaceKmh,39)
 assert.equal(report.phase2EffectivePelotonPaceKmh,42.2)
 assert.equal(report.phase2ProjectedEscapePaceKmh,38.7)
 assert.equal(report.phase2CooperationScore,.48)
 assert.equal(report.phase2CooperationSpeedMultiplier,.92)
 assert.equal(report.phase3V4PaceSampleCount,2)
 assert.equal(report.phase3V4MeanPelotonPaceKmh,44)
 assert.equal(report.phase3V4MeanEscapePaceKmh,39)
 assert.doesNotMatch(JSON.stringify(report),/SECRET_TEAM|test-rider/)
})
test('missing optional pace witnesses remain explicitly unavailable',()=>{
 const classification=Array.from({length:108},(_,i)=>({
  riderId:'synthetic-'+i,status:'finished',rank:i+1,
  gapSeconds:0,officialTimeSeconds:14914
 }))
 const result={finishResolution:{classification},
  roadRaceResolution:{phase1Opening:{breakawayRiderIds:[]}},
  calibrationSummary:{},replayTimeline:{checkpoints:[]}}
 const report=compactRaceDiagnosticsV4(result)
 assert.equal(report.phase2ChasingTeamCount,null)
 assert.equal(report.phase2ProjectedEscapePaceKmh,null)
 assert.equal(report.phase3V4PaceSampleCount,0)
 assert.equal(report.phase3V4MeanPelotonPaceKmh,null)
})
