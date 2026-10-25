import assert from 'node:assert/strict'
import {planNeutralStartFormationV3} from '../../src/race-engine-v3/neutralStartFormationV3.ts'
import {initializeExperimentalPowerV3,advanceExperimentalPowerV3,finalizeExperimentalPowerV3,runExperimentalPowerV3} from '../../src/race-engine-v3/experimentalPowerRaceV3.ts'
const seed='RESEARCH_ONLY_NOT_VERIFIED_START_LINE'
const ids=Array.from({length:106},(_,i)=>'r'+String(i+1).padStart(3,'0'))
const formation={mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2}
const rows=planNeutralStartFormationV3(ids,seed,formation)
assert.deepEqual(planNeutralStartFormationV3([...ids].reverse(),seed,formation),rows,'Input rider ordering must not alter physical grid')
assert.deepEqual(planNeutralStartFormationV3(ids,seed,formation),rows,'Formation must be deterministic')
assert.notDeepEqual(planNeutralStartFormationV3(ids,'different-test-seed',formation),rows,'Formation must depend on explicit deterministic seed')
assert.equal(rows.length,106)
assert.equal(new Set(rows.map(x=>x.riderId)).size,106)
assert.equal(Math.max(...rows.map(x=>x.meters)),52)
assert.equal(Math.min(...rows.map(x=>x.meters)),0)
const perRow=Map.groupBy(rows,r=>r.gridRow)
assert.equal(perRow.size,27)
assert([...perRow.values()].every(r=>r.length<=4))
assert(rows.every(p=>p.gridLane>=0&&p.gridLane<4&&p.meters>=0))
assert.throws(()=>planNeutralStartFormationV3([...ids,ids[0]],seed,formation),/duplicate/)
assert.throws(()=>planNeutralStartFormationV3(ids,seed,{...formation,ridersAcross:0}),/Invalid research-only/)
assert.throws(()=>planNeutralStartFormationV3(ids,seed,{...formation,rowSpacingMeters:0}),/Invalid research-only/)
const riders=Array.from({length:24},(_,i)=>({riderId:'r'+String(i+1).padStart(3,'0'),teamId:'t'+Math.floor(i/4),flat:72+(i%7),climbing:68+(i%5),endurance:75,resistance:74,fatigueBeforeStage:30,startStamina:85,raceSharpness:80,recovery:77,morale:90,equipmentStagePerformancePct:5,inStageEnergyCostMultiplier:1}))
const input={raceId:'SYNTHETIC_ONLY',stageId:'SYNTHETIC_START_GRID',sourceFingerprint:seed,riders,segments:[{lengthKm:8,gradePercent:0},{lengthKm:2,gradePercent:4}],secondsPerTick:10,sampleSeconds:60,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
const defaultStart=initializeExperimentalPowerV3(input)
assert(defaultStart.riders.every(r=>r.meters===0),'Default motion MUST be untouched')
const staged={...input,experimentalStartFormation:formation}
const start=initializeExperimentalPowerV3(staged)
assert.equal(Math.max(...start.riders.map(r=>r.meters)),10)
assert.equal(Math.min(...start.riders.map(r=>r.meters)),0)
assert.equal(new Set(start.riders.map(r=>r.riderId)).size,24)
const control=runExperimentalPowerV3(input)
const normalControl=runExperimentalPowerV3(input)
assert.deepEqual(normalControl,control,'Default path should remain fully deterministic')
const direct=runExperimentalPowerV3(staged)
assert.equal(direct.riderCount,24)
assert.equal(direct.sportingApproval,'NOT_APPROVED')
assert.equal(direct.officialWrites,0)
assert.equal(direct.groupFrames.length,direct.replay.length)
assert.equal(direct.groupFrames.at(-1).finishedRiderIds.length,24)
let resumed=initializeExperimentalPowerV3(staged),batches=0
while(!resumed.complete){resumed=JSON.parse(JSON.stringify(advanceExperimentalPowerV3(staged,resumed,[1,3,7,11][batches++%4])));assert(batches<10000)}
assert.deepEqual(finalizeExperimentalPowerV3(staged,resumed),direct,'Positions and group lineage must resume bit-identically')
const permuted={...staged,riders:[...riders].reverse()}
const permutedResult=runExperimentalPowerV3(permuted)
assert.deepEqual(permutedResult.finish,direct.finish,'Rider list order must not change simulation results')
assert.throws(()=>initializeExperimentalPowerV3({...staged,experimentalStartFormation:{...formation,ridersAcross:100}}),/Invalid research-only/)
assert.deepEqual(riders[0],input.riders[0],'Source rider input cannot be mutated')
console.log(JSON.stringify({test:'research-only rolling-grid physical positions',result:'PASS_ENGINEERING_NOT_SPORTING',riders:24,checkpointBatches:batches,gridSpreadM:10,defaultUntouched:true,officialWrites:0}))
