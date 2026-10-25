import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runExperimentalPowerV3,initializeExperimentalPowerV3,advanceExperimentalPowerV3,finalizeExperimentalPowerV3} from '../../src/race-engine-v3/experimentalPowerRaceV3.ts'
function load(which){
 const root=new URL('./fixtures/',import.meta.url)
 const rows=readFileSync(new URL(which+'.csv',root),'utf8').trim().split('\n').slice(1).map(x=>x.split(',').map(Number))
 const riders=rows.map(([idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue])=>({riderId:'r'+String(idx).padStart(3,'0'),teamId:'t'+String(team).padStart(2,'0'),flat,climbing,endurance:stamina,resistance:hills,fatigueBeforeStage:fatigue,startStamina:80,raceSharpness:70,recovery:75,morale:80,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1}))
 const pts=which.startsWith('dordrecht')?JSON.parse(readFileSync(new URL(which+'.metadata.json',root),'utf8')).profileKmElevationM:[[0,115],[18,140],[36,170],[52,130],[60,140],[72,270],[84,110],[96,130],[110,160],[124,240],[134.2,430],[142,165],[154,190],[158,220],[160.8,275],[162.6,415],[165.8,650]]
 const segments=pts.slice(1).map(([km,ele],i)=>({lengthKm:km-pts[i][0],gradePercent:(ele-pts[i][1])/((km-pts[i][0])*10)}))
 return {raceId:which,stageId:which,sourceFingerprint:'synthetic-research-no-private-source',riders,segments,secondsPerTick:10,sampleSeconds:60,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
}
for(const which of ['dordrecht-2000-10-15','guangxi-2000-10-19']){
 const basic=load(which)
 const input={...basic,experimentalStartFormation:{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2},experimentalSpatialMotion:{laneCount:4,minWheelGapMeters:1.8}}
 const straight=runExperimentalPowerV3(input)
 assert.equal(straight.riderCount,basic.riders.length)
 assert.equal(straight.groupFrames.length,straight.replay.length)
 assert.equal(straight.groupFrames.at(-1).finishedRiderIds.length,basic.riders.length)
 let resumed=initializeExperimentalPowerV3(input),batches=0
 while(!resumed.complete){resumed=JSON.parse(JSON.stringify(advanceExperimentalPowerV3(input,resumed,[10,83,34,27,71][batches++%5])));assert(batches<1200)}
 assert.deepEqual(finalizeExperimentalPowerV3(input,resumed),straight)
 assert(resumed.riders.every(r=>Number.isInteger(r.lane)&&r.lane>=0&&r.lane<4))
 console.log(JSON.stringify({race:which,riders:straight.riderCount,finishTailGapSeconds:straight.finish.at(-1).gapSeconds,withinOneSecond:straight.finish.filter(r=>r.gapSeconds<=1).length,frames:straight.replay.length,batches,passed:true}))
}
