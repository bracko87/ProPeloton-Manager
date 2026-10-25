import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {
  initializePhysicalRaceV3,advancePhysicalRaceV3,finalizePhysicalRaceV3,runPhysicalRaceV3,
} from '../../src/race-engine-v3/physicalRaceEngineV3.ts'
import {derivePhysicalGroupsV3} from '../../src/race-engine-v3/physicalGroupsV3.ts'
const root = new URL('./fixtures/',import.meta.url)
const meta=JSON.parse(readFileSync(new URL('dordrecht-2000-10-15.metadata.json',root),'utf8'))
const csv=readFileSync(new URL('dordrecht-2000-10-15.csv',root),'utf8').trim().split('\n')
const riders=csv.slice(1).map(line=>{
 const [idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue]=line.split(',').map(Number)
 return {riderId:`r${String(idx).padStart(3,'0')}`,teamId:`t${String(team).padStart(2,'0')}`,flat,hills,climbing,cobbles,stamina,form,fatigue}
})
assert.equal(riders.length,106)
assert.equal(new Set(riders.map(x=>x.teamId)).size,18)
const scenario=process.env.V3_WEATHER_SCENARIO??'forecast_unknown_bearing'
// Road bearings are absent from this frozen fixture. Never invent a 40%
// crosswind from a forecast wind direction. Only the explicitly synthetic
// worst-case weather scenario may assume 100% crosswind exposure.
const windExposure=scenario==='worst_crosswind'?1:0
// A rain probability is NOT an observation that roads are wet.
const wetness=scenario==='worst_crosswind'?meta.weather.rainProbabilityPct/100:0
const route=meta.profileKmElevationM.slice(1).map(([km,elevation],idx)=>{
 const [start,fromElevation]=meta.profileKmElevationM[idx]
 return {lengthKm:km-start,gradePercent:(elevation-fromElevation)/((km-start)*10),headwindKph:0,crosswindKph:meta.weather.windKmh*windExposure,wetness}
})
// Preset commands use the original 4 pre-race phases. This conversion is
// intentionally test-only; live V3 orders will use the 12 tactical sectors.
const orders=meta.preRacePhaseOverrides.split(',').map(s=>{
 const [idx,phase,sourceAction]=s.split(':')
 const n=Number(phase.slice(-1))
 const action=sourceAction==='attack'?'attack':sourceAction==='chase_breakaway'?'chase':'tempo'
 return {riderId:`r${idx.padStart(3,'0')}`,startKm:(n-1)*meta.lengthKm/4,endKm:n*meta.lengthKm/4,action}
})
const input={raceId:meta.raceId,stageId:meta.stageId,seed:`v3:real-roster:${meta.sourceInputJsonbMd5}`,route,riders,orders,sampleEverySeconds:60,dtSeconds:10}
function atPercent(frame,pct){return frame.riders.filter(x=>x.meters>=pct*meta.lengthKm*1000).length}
function groupReport(frame){
 const vals=[...frame.riders].sort((a,b)=>b.meters-a.meters)
 let groups=[]
 for(const rider of vals){
  const last=groups.at(-1)
  if(!last || last.lastMeters-rider.meters>Math.max(35,(last.speedHint??11)*5))groups.push({members:[rider],firstMeters:rider.meters,lastMeters:rider.meters})
  else {last.members.push(rider);last.lastMeters=rider.meters}
 }
 return groups.map((g,i)=>({rank:i+1,riders:g.members.length,leadKm:Number((g.firstMeters/1000).toFixed(2)),gapMeters:Number((groups[0].firstMeters-g.firstMeters).toFixed(1))})).slice(0,8)
}
const started=performance.now()
const state=initializePhysicalRaceV3(input)
let segments=0
while(!state.complete){
 advancePhysicalRaceV3(input,state,100)
 segments++
 if(segments>5000) throw Error('Exceeded checkpoint budget')
}
const result=finalizePhysicalRaceV3(state)
const durationMs=Math.round(performance.now()-started)
const instant=runPhysicalRaceV3(input)
assert.deepEqual(result,instant,'resuming checkpoint batches changed official calculation')
assert.equal(result.finish.length,riders.length)
assert.equal(new Set(result.finish.map(r=>r.riderId)).size,riders.length)
assert(result.finish.every(r=>Number.isFinite(r.physicalFinishSeconds)&&r.physicalGapSeconds>=0))
assert(result.replay.every((f,i)=>i===0||f.elapsedSeconds>result.replay[i-1].elapsedSeconds))
for(const frame of result.replay){
 assert.equal(frame.riders.length,riders.length)
 assert.equal(new Set(frame.riders.map(r=>r.riderId)).size,riders.length)
 assert(frame.riders.every(r=>r.energy>=0 && r.energy<=1))
}
let samples=[]
for(const p of [0.05,0.20,0.50,0.75,0.95]){
 const frame=result.replay.find(f=>atPercent(f,p)>=53) ?? result.replay.at(-1)
 const g=groupReport(frame)
 samples.push({pelotonPassingPct:Math.round(p*100),elapsedSeconds:frame.elapsedSeconds,groups:g})
}
const physicalGroupAudits=result.replay.slice(1).map((frame,i)=>derivePhysicalGroupsV3(frame,result.replay[i],meta.lengthKm*1000))
assert(physicalGroupAudits.every(g=>g.assignments.length===riders.length&&new Set(g.assignments.map(a=>a.riderId)).size===riders.length))
const framesWithB1=physicalGroupAudits.filter(g=>g.groups.some(x=>x.code==='B1')).length
const sameTime=result.finish.filter(f=>f.officialGapSeconds===0).length
const suspiciousPackConcentration = sameTime/result.finish.length>.85
const extremeTailGap = result.finish.at(-1).officialGapSeconds>900
const summary={
 stageName:meta.stageName,stageId:meta.stageId,sourceInputMd5:meta.sourceInputJsonbMd5,weatherScenario:scenario,windAssumedCrosswindKph:meta.weather.windKmh*windExposure,wetnessAssumed:wetness,roadBearingVerified:false,windScenarioSynthetic:scenario==='worst_crosswind',
 status:'SIMULATION_ONLY_NOT_PRODUCTION_VALIDATED', sportingAcceptance:'NOT_APPROVED_NEEDS_MULTIPLE_REAL_ROSTER_AND_WIND_BENCHMARKS',riders:riders.length,teams:new Set(riders.map(x=>x.teamId)).size,
 orders:orders.length, routeKm:meta.lengthKm, checkpointBatches:segments,runMilliseconds:durationMs,physicalGroupAudit:{frames:physicalGroupAudits.length,framesWithB1,uniqueAssignmentsAtEveryFrame:true,groupIdentityTrackingNotYetImplemented:true},
 winner:result.finish[0],sameTimeWinner:sameTime,distinctOfficialGaps:new Set(result.finish.map(x=>x.officialGapSeconds)).size,
 lastGapSeconds:result.finish.at(-1).officialGapSeconds,
 firstTen:result.finish.slice(0,10),progress:samples,sportingQualityFlags:{suspiciousPackConcentration,extremeTailGap},
 validation:{deterministicCheckpointResume:true,allRidersAssigned:true,energyBounded:true,replaySamplesConsistent:true},
 limitations:meta.projectionNotes,
}
if(process.env.V3_AUDIT_OUT){writeFileSync(process.env.V3_AUDIT_OUT,JSON.stringify(summary,null,2)+'\n')}
console.log(JSON.stringify(summary,null,2))