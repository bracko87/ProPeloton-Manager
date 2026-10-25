import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,runCoupledV3,finalizeCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {initializeWheelBottleneckTelemetryV3,recordWheelBottleneckTickV3,summarizeWheelBottlenecksV3} from '../../src/race-engine-v3/wheelBottleneckTelemetryV3.ts'
const mk=(id,lane,meters,desiredMps)=>({riderId:id,lane,meters,desiredMps,energy:.8})
const positions=[mk('lead',0,90,8),mk('follow',0,85,12),mk('open',1,95,9)]
const moves=[{riderId:'lead',oldMeters:90,meters:170,lane:0,commandedMps:8,speedMps:8,lateralMoves:0,wheelLimited:false,overtook:false,leadRiderId:null,slipstreamFraction:0},
{riderId:'follow',oldMeters:85,meters:168.2,lane:0,commandedMps:12,speedMps:8.32,lateralMoves:0,wheelLimited:true,overtook:false,leadRiderId:'lead',slipstreamFraction:.1},
{riderId:'open',oldMeters:95,meters:185,lane:1,commandedMps:9,speedMps:9,lateralMoves:0,wheelLimited:false,overtook:false,leadRiderId:null,slipstreamFraction:0}]
const pristine=JSON.stringify({positions,moves})
const t=initializeWheelBottleneckTelemetryV3(positions.map(p=>p.riderId))
for(let n=0;n<3;n++)recordWheelBottleneckTickV3(t,positions,moves,1000,10)
assert.equal(JSON.stringify({positions,moves}),pristine,'telemetry must never alter its source physics')
assert.equal(t.tickCount,3)
const info=summarizeWheelBottlenecksV3(t)
assert.equal(info.blockedRiderTicks,3)
assert.equal(info.inferredSameLaneLeaderBlocks,3)
assert.equal(info.longestBlockingStreakTicks,3)
assert.equal(info.quarters[0].blockedShare,.333333)
assert.equal(info.accumulatedPreventedMeters,110.4)
assert.throws(()=>recordWheelBottleneckTickV3(t,positions,moves.slice(1),1000,10),/lengths/)
assert.throws(()=>recordWheelBottleneckTickV3(t,positions,[moves[0],moves[1],moves[1]],1000,10),/Duplicate/)
assert.throws(()=>initializeWheelBottleneckTelemetryV3(['a','a']),/roster/)
function attr(i){return {riderId:'r'+i,teamId:'t',flat:74+(i%6),climbing:76,endurance:78,resistance:75,fatigueBeforeStage:28,startStamina:82,raceSharpness:77,recovery:76,morale:80,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1}}
const original={raceId:'telemetry',stageId:'synthetic',seed:'telemetry-only',riders:Array.from({length:20},(_,i)=>attr(i)),route:[{lengthKm:3,gradePercent:0},{lengthKm:2,gradePercent:2}],grid:{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2},tickSeconds:10,sampleSeconds:60,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
const standard=runCoupledV3(original)
const withTelemetry={...original,experimentalBottleneckTelemetry:true}
const audited=runCoupledV3(withTelemetry)
assert.deepEqual(audited.finish,standard.finish)
assert.deepEqual(audited.frames,standard.frames)
assert.deepEqual(audited.groups,standard.groups)
assert.deepEqual(audited.movement,standard.movement)
assert.equal(standard.bottlenecks,undefined)
assert(audited.bottlenecks)
assert.equal(audited.bottlenecks.ticks,audited.elapsedSeconds/10)
assert.equal(audited.bottlenecks.blockedRiderTicks,audited.movement.wheelLimitedTicks)
const p=audited.bottlenecks
assert.equal(p.inferredSameLaneLeaderBlocks+p.laneChangeBlocks+p.unattributedBlocks,p.blockedRiderTicks)
let saved=initializeCoupledV3(withTelemetry),batches=0
while(!saved.complete){saved=JSON.parse(JSON.stringify(advanceCoupledV3(withTelemetry,saved,[1,7,13,31][batches++%4])));assert(batches<5000)}
assert.deepEqual(finalizeCoupledV3(withTelemetry,saved),audited,'Saved diagnostic counters must resume byte-for-byte')
const corrupted=JSON.parse(JSON.stringify(saved));corrupted.bottleneckTelemetry.tickCount--
assert.throws(()=>advanceCoupledV3(withTelemetry,corrupted,1),/telemetry checkpoint/)
console.log(JSON.stringify({result:'PASS_ENGINEERING_ONLY',riders:20,checkpoints:audited.frames.length,serializedBatches:batches,blockedShare:p.blockedShare,p90BlockedShare:p.p90BlockedSharePerRider,longestBlockingStreak:p.longestBlockingStreakTicks,finishUnchanged:true,replayUnchanged:true,source:'SYNTHETIC_ONLY',sportingApproval:'NO_GO'}))
