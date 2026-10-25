import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {initializePhysicalRaceV3,advancePhysicalRaceV3,finalizePhysicalRaceV3,runPhysicalRaceV3} from '../../src/race-engine-v3/physicalRaceEngineV3.ts'
// Exact de-identified roster from production's frozen Guangxi input; original personal/team identifiers omitted.
const csv=readFileSync(new URL('./fixtures/guangxi-2000-10-19.csv',import.meta.url),'utf8').trim().split('\n')
const riders=csv.slice(1).map(line=>{
 const [idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue]=line.split(',').map(Number)
 return {riderId:`r${String(idx).padStart(3,'0')}`,teamId:`t${String(team).padStart(2,'0')}`,flat,hills,climbing,cobbles,stamina,form,fatigue}
})
assert.equal(riders.length,168)
assert.equal(new Set(riders.map(r=>r.teamId)).size,22)
const points=[[0,115],[18,140],[36,170],[52,130],[60,140],[72,270],[84,110],[96,130],[110,160],[124,240],[134.2,430],[142,165],[154,190],[158,220],[160.8,275],[162.6,415],[165.8,650]]
const route=points.slice(1).map(([km,h],i)=>({lengthKm:km-points[i][0],gradePercent:(h-points[i][1])/((km-points[i][0])*10),headwindKph:0,crosswindKph:3.6,wetness:0}))
const input={raceId:'d36147e2-0511-4d32-b26c-df231c5da0ee',stageId:'dd6681d1-e565-43f3-8449-0bb203b0eb07',seed:'v3:guangxi:babdde9fd07d315bf59974cc46dde67d',riders,route,orders:[],sampleEverySeconds:60,dtSeconds:10}
const state=initializePhysicalRaceV3(input)
let checkpoints=0
while(!state.complete){advancePhysicalRaceV3(input,state,100);if(++checkpoints>10000)throw Error('Guangxi checkpoint run exceeded budget')}
const result=finalizePhysicalRaceV3(state)
const direct=runPhysicalRaceV3(input)
assert.deepEqual(result,direct,'Guangxi checkpoint resume changed race')
assert.equal(result.finish.length,168)
assert.equal(new Set(result.finish.map(f=>f.riderId)).size,168)
assert(result.finish.every(f=>Number.isFinite(f.physicalFinishSeconds)&&f.physicalGapSeconds>=0))
const same=result.finish.filter(f=>f.officialGapSeconds===0).length
const tail=result.finish.at(-1).officialGapSeconds
const climbs=[...riders].sort((a,b)=>b.climbing-a.climbing).slice(0,25)
const climbIds=new Set(climbs.map(x=>x.riderId))
const top25ClimbersInTop25=result.finish.slice(0,25).filter(f=>climbIds.has(f.riderId)).length
const summary={stage:'Tour of Guangxi — Yizhou–Nongla',sourceRunId:'bb6aaf57-a291-426d-a252-b9981b4bc578',inputMd5:'babdde9fd07d315bf59974cc46dde67d',riders:riders.length,teams:22,routeKm:165.8,climbingElevationGainM:1718,checkpointBatches:checkpoints,simulationTicks:result.tickCount,winningFinishSeconds:result.finish[0].physicalFinishSeconds,sameTimeWinner:same,distinctTimes:new Set(result.finish.map(f=>f.officialGapSeconds)).size,tailGapSeconds:tail,top25ClimbersInTop25,firstTen:result.finish.slice(0,10),limitations:['No pre-race team orders mapped for this mountain fixture yet','9 km/h forecast wind has no route bearing; this scenario assumes 3.6 km/h crosswind, no headwind','30C temperature and 38% precipitation risk are not yet represented as temperature or wet-road observations','A mountain field with 168 riders and individual finishing gaps is necessary but not sufficient for realistic selection'],engineeringIntegrity:'PASSED',sportingAcceptance:'REQUIRES_INDEPENDENT_REVIEW'}
if(process.env.V3_AUDIT_OUT)writeFileSync(process.env.V3_AUDIT_OUT,JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify(summary,null,2))