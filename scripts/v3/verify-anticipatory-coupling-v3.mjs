import assert from 'node:assert/strict'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
const source=(idx)=>({riderId:'r'+String(idx).padStart(3,'0'),teamId:'t'+Math.floor(idx/4),flat:76+(idx%7),climbing:72,endurance:76,resistance:72,fatigueBeforeStage:25,startStamina:81,raceSharpness:75,recovery:78,morale:80,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1})
const input={raceId:'ant-test',stageId:'ant-test',seed:'ant-test',riders:Array.from({length:28},(_,i)=>source(i)),route:[{lengthKm:2,gradePercent:0},{lengthKm:1,gradePercent:3},{lengthKm:2,gradePercent:0}],grid:{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2},tickSeconds:10,sampleSeconds:60,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
const unchanged=runCoupledV3(input)
assert.equal(unchanged.movement.anticipatoryMoves,undefined)
const opt={...input,experimentalAnticipatoryLaneMoves:true}
const yes=runCoupledV3(opt)
assert.equal(yes.sportingApproval,'NOT_APPROVED')
assert.equal(yes.officialWrites,0)
assert.equal(yes.finish.length,28)
assert(yes.movement.anticipatoryMoves>=0)
assert.equal(yes.groups.length,yes.frames.length)
let resumed=initializeCoupledV3(opt),batches=0
while(!resumed.complete){resumed=JSON.parse(JSON.stringify(advanceCoupledV3(opt,resumed,[1,7,3,2,13][batches++%5])));assert(batches<3000)}
assert.deepEqual(finalizeCoupledV3(opt,resumed),yes,'Opt-in lane plan must resume identically')
const originalAgain=runCoupledV3(input)
assert.deepEqual(unchanged,originalAgain,'No default solver mutation')
const corrup=JSON.parse(JSON.stringify(resumed));corrup.groupTimeline.history.pop()
assert.throws(()=>advanceCoupledV3(opt,corrup,1),/Divergent checkpoint/)
console.log(JSON.stringify({name:'anticipatory lateral only',riders:28,shifted:yes.movement.anticipatoryMoves,baselineLastGap:unchanged.finish.at(-1).gapSeconds,candidateLastGap:yes.finish.at(-1).gapSeconds,checkpointBatches:batches,passed:true,sportingApproval:'NOT_APPROVED'}))
