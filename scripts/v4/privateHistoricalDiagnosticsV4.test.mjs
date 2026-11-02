import assert from 'node:assert/strict'
import {explainHistoricalClassificationParity as compare,safeHistoricalErrorType as errorType,
 safeHistoricalFailureReason as failureReason, safeHistoricalFailureLocation as failureLocation, safeHistoricalFinishEvidence as finishEvidence,
 safeHistoricalReplayIssueCategory as issueCategory,HISTORICAL_REPLAY_ISSUE_CATEGORIES,
 safeHistoricalReplayIssueCode as issueCode,HISTORICAL_REPLAY_KNOWN_ISSUE_CODES,
 HISTORICAL_FINISH_EVIDENCE,
 HISTORICAL_FAILURE_CHECKPOINTS,HISTORICAL_FAILURE_TRANSFERS,HISTORICAL_FAILURE_REASONS,
 safeHistoricalTerrain as terrain,historicalPhysicalGapAudit as physicalGap,
 historicalOpeningBreakawayJourney as openingJourney,
 HISTORICAL_PARITY_REASONS,HISTORICAL_ERROR_TYPES}
 from '../../src/race-engine-v4/privateHistoricalDiagnosticsV4.mjs'
assert.equal(HISTORICAL_REPLAY_ISSUE_CATEGORIES.length,10)
assert(HISTORICAL_REPLAY_KNOWN_ISSUE_CODES.length>=45)
assert.equal(issueCode(new Error('Universal replay synchronization failed: same_kilometre_physical_state_mismatch:SECRET_ID')),'same_kilometre_physical_state_mismatch')
assert.equal(issueCode(new Error('Universal replay synchronization failed: hidden_person_id:SECRET_ID')),'UNKNOWN_ISSUE_CODE')
assert.equal(issueCode(new Error('other error')),'NOT_REPLAY')
const badError=new Error('Universal replay synchronization failed: same_kilometre_physical_state_mismatch:secret-rider|replay|winner-finish')
assert.equal(issueCategory(badError),'SAME_KILOMETRE_PHYSICAL_STATE')
assert.equal(issueCategory(new Error('Universal replay synchronization failed: gap_change_not_distance_bounded:private')),'GAP_DISTANCE_BOUND')
assert.equal(issueCategory(new Error('Universal replay synchronization failed: post_catch_group_transfer_without_physical_transition:private')),'POST_CATCH_TRANSITION')
assert.equal(issueCategory(new Error('Universal replay synchronization failed: unrecognized_private_identity')),'REPLAY_OTHER')
assert.equal(issueCategory(new Error('public data')),'NOT_REPLAY')
assert.equal(JSON.stringify(issueCategory(badError)).includes('secret-rider'),false)
const row={id:'PRIVATE_RIDER_SHOULD_NEVER_BE_PRINTED',rank:1,status:'finished',gap:0,time:300}
const run=(change)=>compare([row],[{...row,...change}])
assert.deepEqual(run({}),{equal:true,reasons:[]})
assert.equal(run({gap:0.009,time:300.005}).equal,true)
assert.deepEqual(run({rank:2,officialTime:1}).reasons,['RANK'])
assert.deepEqual(run({id:'another',rank:4,status:'dnf',gap:3,time:310}).reasons,
 ['RIDER_IDENTITY','RANK','STATUS','GAP','OFFICIAL_TIME'])
assert.deepEqual(compare([row],[]).reasons,['RIDER_COUNT'])
assert.deepEqual(compare([row],[row]).reasons,[])
assert.deepEqual(HISTORICAL_PARITY_REASONS,
 ['RIDER_COUNT','RIDER_IDENTITY','RANK','STATUS','GAP','OFFICIAL_TIME'])
assert.deepEqual(HISTORICAL_ERROR_TYPES,
 ['TYPE_ERROR','RANGE_ERROR','SYNTAX_ERROR','OTHER_ERROR','NON_ERROR_THROW'])
assert.equal(errorType(new TypeError('private details')),'TYPE_ERROR')
assert.equal(errorType(new RangeError('private details')),'RANGE_ERROR')
assert.equal(errorType(new SyntaxError('private details')),'SYNTAX_ERROR')
assert.equal(errorType(new Error('private details')),'OTHER_ERROR')
assert.equal(errorType('private details'),'NON_ERROR_THROW')
assert.deepEqual(HISTORICAL_FAILURE_REASONS,
 ['REPLAY_FRONT_GROUP_TRANSFER','REPLAY_OTHER','OTHER_RUNTIME_ERROR','NON_ERROR_THROW'])
assert.equal(failureReason(new Error('Universal replay synchronization failed: front_group_transfer_without_physical_transition:rider-secret')),'REPLAY_FRONT_GROUP_TRANSFER')
assert.equal(failureReason(new Error('Universal replay synchronization failed: private data')),'REPLAY_OTHER')
assert.equal(failureReason(new Error('private details')),'OTHER_RUNTIME_ERROR')
assert.equal(failureReason('private details'),'NON_ERROR_THROW')
assert.deepEqual(HISTORICAL_FAILURE_CHECKPOINTS,['LATE_CHASE_STEP','RACE_STATUS','WINNER_FINISH','FINISH_GROUP_TRANSITION','BRIDGE_CATCH','OTHER_CHECKPOINT'])
assert.deepEqual(HISTORICAL_FAILURE_TRANSFERS,['F1_TO_P','F2_TO_P','B_TO_P','B_TO_F','F_TO_B','F_TO_F','F_TO_C','P_TO_F','OTHER_TRANSFER'])
assert.equal(failureLocation(new Error('Universal replay synchronization failed: front_group_transfer_without_physical_transition:rider-sensitive:B1->P:stage-secret|replay|finish-group-transition')).transfer,'B_TO_P')
assert.deepEqual(failureLocation(new Error('Universal replay synchronization failed: front_group_transfer_without_physical_transition:rider-sensitive:F2->P:stage-secret|replay|late-chase-step-8')), {checkpoint:'LATE_CHASE_STEP',transfer:'F2_TO_P'})
assert.deepEqual(failureLocation(new Error('secret')), {checkpoint:'OTHER_CHECKPOINT',transfer:'OTHER_TRANSFER'})
assert.equal(JSON.stringify(failureLocation(new Error('secret-stage|replay|winner-finish'))).includes('secret'),false)
assert.equal(HISTORICAL_FINISH_EVIDENCE.length,7)
assert.equal(finishEvidence(new Error('rider-private:v4_finish_caught=NO:v4_finish_gap=WITHIN_OFFICIAL_GROUP')),'NOT_CAUGHT_WITHIN_OFFICIAL_GROUP')
assert.equal(finishEvidence(new Error('rider-private:v4_finish_caught=YES:v4_finish_gap=WITHIN_CATCH')),'CAUGHT_WITHIN_PHYSICAL_TOLERANCE')
assert.equal(finishEvidence(new Error('private identity')),'UNKNOWN')
assert.equal(JSON.stringify({evidence:finishEvidence(new Error('private name'))}).includes('private'),false)
assert.equal(terrain({input_snapshot_json:{stage:{terrainType:'mountain',stageId:'secret'}}}),'mountain')
assert.equal(terrain({input_snapshot_json:{stage:{terrainType:'UNKNOWN'}}}),'unknown')
assert.equal(terrain(null),'unknown')
assert.equal(JSON.stringify({type:errorType(new Error('private details')),kinds:run({rank:99}).reasons})
 .includes('private'),false)
// A 10.25-second interior physical peak must not disappear in the research
// comparison, even when the immutable official V2 summary reported less.
const sample={calibrationSummary:{maximumBreakawayGapSeconds:7},
 roadRaceResolution:{active:true,phase1Opening:{
  initialGapSeconds:7,physicalGapTrajectory:[
   {gapSeconds:6},{gapSeconds:17.25},{gapSeconds:5}]},
  phase2Development:{startGapSeconds:5,endGapSeconds:4,
   physicalGapTrajectory:[{gapSeconds:10}]},
  phase3Decisive:{physicalStartGapSeconds:4,physicalEndGapSeconds:2,
   physicalGapTrajectory:[{gapSeconds:11}]},
  phase4Finish:{startGapSeconds:2,endGapSeconds:0,
   chaseSteps:[{startGapSeconds:2,endGapSeconds:0}]}}}
assert.deepEqual(physicalGap(sample),{
 publishedMaximum:7,observedPeak:17.25,omittedPeakSeconds:10.25})
assert.deepEqual(physicalGap({...sample,calibrationSummary:{maximumBreakawayGapSeconds:20}}),{
 publishedMaximum:20,observedPeak:17.25,omittedPeakSeconds:0})
assert.deepEqual(physicalGap({calibrationSummary:{maximumBreakawayGapSeconds:7},
 roadRaceResolution:{active:false}}),{
 publishedMaximum:7,observedPeak:null,omittedPeakSeconds:null})
assert.deepEqual(physicalGap({calibrationSummary:{maximumBreakawayGapSeconds:7},
 roadRaceResolution:{active:true,phase3Decisive:{
 physicalStartGapSeconds:1,physicalEndGapSeconds:2,physicalGapTrajectory:[{gapSeconds:9}]}}}),{
 publishedMaximum:7,observedPeak:9,omittedPeakSeconds:2})
// Track original opening-B lineage and reject false attribution to a later F.
const start={attackAttempts:[{attemptKm:12,acceptedEscapeLaunch:true}],
 breakawayRiderIds:['b1'],physicalGapTrajectory:[
 {kmFromStart:12,gapSeconds:7},{kmFromStart:14,gapSeconds:75},
 {kmFromStart:16,gapSeconds:80}]}
const phase2={breakawayRiderIdsAtStart:['b1'],breakawayRiderIdsAtEnd:['b1'],
 physicalGapTrajectory:[{kmFromStart:18,gapSeconds:85},
 {kmFromStart:20,gapSeconds:130},{kmFromStart:22,gapSeconds:110}]}
const phase3={physicalEscapeRiderIdsAtStart:['b1'],
 physicalEscapeRiderIdsAtEnd:['b1'],
 physicalGapTrajectory:[{kmFromStart:24,gapSeconds:90}]}
const phase4={escapeRiderIdsAtStart:['b1'],breakawayCaught:true,
 breakawaySurvived:false,chaseSteps:[
 {kmStart:26,kmEnd:28,startGapSeconds:60,endGapSeconds:35},
 {kmStart:28,kmEnd:30,startGapSeconds:35,endGapSeconds:0}]}
const journeyResult={stage:{distanceKm:40},roadRaceResolution:{
 phase1Opening:start,phase2Development:phase2,phase3Decisive:phase3,
 phase4Finish:phase4}}
const journey=openingJourney(journeyResult)
assert.equal(journey.openingAccepted,true)
assert.equal(journey.catchLocation,'phase4_step_estimate')
assert.equal(journey.phase4Estimated,true)
assert.equal(journey.launchKm,12)
assert.ok(journey.catchKm>29&&journey.catchKm<30)
assert.ok(journey.kmAhead>17&&journey.kmAhead<18)
assert.equal(journey.peakSeconds,130)
assert.equal(journey.sampledAbove60Km,12)
assert.equal(journey.sampledAbove120Km,0)
assert.equal(openingJourney({roadRaceResolution:{phase1Opening:{
 attackAttempts:[],breakawayRiderIds:[]}}}).openingAccepted,false)
const p2Caught=openingJourney({stage:{distanceKm:40},
 roadRaceResolution:{phase1Opening:start,phase2Development:{
 ...phase2,breakawayCatchKm:19}}})
assert.equal(p2Caught.catchLocation,'phase2_exact')
assert.equal(p2Caught.kmAhead,7)
assert.equal(p2Caught.phase4Estimated,false)
const noLineage=openingJourney({stage:{distanceKm:40},
 roadRaceResolution:{phase1Opening:start,phase2Development:{
 ...phase2,breakawayRiderIdsAtStart:['unrelated'],
 breakawayCatchKm:null},phase3Decisive:phase3,phase4Finish:phase4}})
assert.equal(noLineage.kmAhead,null)
assert.equal(noLineage.catchLocation,'lineage_untraceable_after_phase1')
assert.equal(noLineage.phase4Estimated,false)
assert.equal(noLineage.sampledAbove60Km,2)
// Real V2/V4 result objects do not embed stage.distanceKm. The trusted
// locked input supplies that distance separately to the diagnostic.
const survival=openingJourney({roadRaceResolution:{
 phase1Opening:start,phase2Development:phase2,phase3Decisive:phase3,
 phase4Finish:{...phase4,breakawayCaught:false,
  breakawaySurvived:true,endGapSeconds:90}}},40)
assert.equal(survival.catchLocation,'survived_to_finish')
assert.equal(survival.catchKm,null)
assert.equal(survival.kmAhead,28)
assert.equal(survival.phase4Estimated,false)
console.log('V4_PRIVATE_HISTORY_DIAGNOSTICS_UNIT '+JSON.stringify({status:'PASS',syntheticOnly:true,
 cases:33,rawHistoryPublished:false,officialWrites:0}))
