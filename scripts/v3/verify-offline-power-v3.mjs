import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {initializeExperimentalPowerV3,advanceExperimentalPowerV3,finalizeExperimentalPowerV3,runExperimentalPowerV3} from '../../src/race-engine-v3/experimentalPowerRaceV3.ts'
const attr=i=>({riderId:'t'+i,teamId:'A',flat:66+(i%6)*5,climbing:68+(i%4)*4,endurance:69+(i%5)*4,resistance:70+(i%3)*5,fatigueBeforeStage:20+i,startStamina:84-i/2,raceSharpness:65+i,recovery:75,morale:90,equipmentStagePerformancePct:5,inStageEnergyCostMultiplier:1})
const riders=Array.from({length:18},(_,i)=>attr(i))
const basic={raceId:'isolated',stageId:'synthetic',sourceFingerprint:'only-research-fixture',riders,segments:[{lengthKm:3,gradePercent:0},{lengthKm:1,gradePercent:6},{lengthKm:3,gradePercent:0}],secondsPerTick:10,sampleSeconds:60,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'source_snapshot'}}
assert.throws(()=>initializeExperimentalPowerV3({...basic,gate:{offlineOnly:false,acknowledgedNoSportingApproval:true,sourceQuality:'source_snapshot'}}),/Offline/)
assert.throws(()=>initializeExperimentalPowerV3({...basic,gate:{offlineOnly:true,acknowledgedNoSportingApproval:false,sourceQuality:'source_snapshot'}}),/Offline/)
assert.throws(()=>initializeExperimentalPowerV3({...basic,riders:riders.map((r,i)=>i? r:{...r,inStageEnergyCostMultiplier:undefined})}),/Missing physical source/)
assert.throws(()=>initializeExperimentalPowerV3({...basic,riders:[riders[0],riders[0]]}),/duplicate/i)
const orders=[{riderId:'t0',startKm:0,endKm:3,tactic:'attack'},{riderId:'t2',startKm:0,endKm:3,tactic:'chase'},{riderId:'t5',startKm:3,endKm:7,tactic:'tempo'}]
const input={...basic,orders}
const uninterrupted=runExperimentalPowerV3(input)
assert.equal(uninterrupted.officialWrites,0)
assert.equal(uninterrupted.sportingApproval,'NOT_APPROVED')
assert.equal(uninterrupted.riderCount,18)
assert(uninterrupted.attackAttempts>=1,'An actual ordered attack must register')
assert.equal(uninterrupted.finish.length,18)
assert(uninterrupted.finish.every(r=>Number.isFinite(r.elapsedSeconds)&&r.elapsedSeconds>0&&r.gapSeconds>=0&&r.energy>=0&&r.energy<=1))
let resumed=initializeExperimentalPowerV3(input),batches=0
while(!resumed.complete){resumed=JSON.parse(JSON.stringify(advanceExperimentalPowerV3(input,resumed,[1,2,8,3,11][batches++%5])));assert(batches<30000)}
const final=finalizeExperimentalPowerV3(input,resumed)
assert.deepEqual(final,uninterrupted,'Resumed experiment changed authoritative state')
assert.equal(final.groupFrames.length,final.replay.length)
for(const [i,frame] of final.groupFrames.entries()){
 assert.equal(frame.assignments.length,18)
 assert.equal(new Set(frame.assignments.map(a=>a.riderId)).size,18)
 assert.equal(frame.elapsedSeconds,final.replay[i].elapsedSeconds)
}
assert.equal(final.groupFrames.at(-1).finishedRiderIds.length,18)
let corrupt=JSON.parse(JSON.stringify(resumed));corrupt.groupTimeline.history.pop()
assert.throws(()=>advanceExperimentalPowerV3(input,corrupt,1),/divergent group checkpoint/)
const neutral=runExperimentalPowerV3({...basic,orders:[]})
assert.equal(neutral.attackAttempts,0)
const champion=uninterrupted.finish.find(x=>x.riderId==='t0')
assert(champion&&champion.energy<neutral.finish.find(x=>x.riderId==='t0').energy,'Attacks must consume actual reserve')
console.log(JSON.stringify({suite:'offline_experimental_power_v3',status:'PASSED_ENGINEERING_ONLY',riders:18,elapsedSeconds:uninterrupted.elapsedSeconds,frames:uninterrupted.replay.length,attackAttempts:uninterrupted.attackAttempts,checkpointBatches:batches,finishTailGapSeconds:uninterrupted.finish.at(-1).gapSeconds,checksum:createHash('sha256').update(JSON.stringify(uninterrupted)).digest('hex').slice(0,20),sportingApproval:'NOT_APPROVED',officialWrites:0},null,2))
