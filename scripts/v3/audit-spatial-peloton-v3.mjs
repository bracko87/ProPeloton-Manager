import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {initializeExperimentalPowerV3,runExperimentalPowerV3} from '../../src/race-engine-v3/experimentalPowerRaceV3.ts'
import {planNeutralStartFormationV3} from '../../src/race-engine-v3/neutralStartFormationV3.ts'
import {parsePrivatePowerSupplementV3} from './privateEnergySupplementV3.mjs'
const meta=JSON.parse(readFileSync(new URL('./fixtures/dordrecht-2000-10-15.metadata.json',import.meta.url),'utf8'))
const raw=readFileSync(new URL('./fixtures/dordrecht-2000-10-15.csv',import.meta.url),'utf8').trim().split('\n').slice(1)
const stage=raw.map(r=>r.split(',').map(Number))
const source=process.env.V3_PRIVATE_SOURCE_SUPPLEMENT
let privateMap=null
if(source){
 privateMap=parsePrivatePowerSupplementV3(readFileSync(source,'utf8'),106)
}
const riders=stage.map(([idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue])=>{
 const a=privateMap?.get(idx)
 if(privateMap&&!a)throw Error('Original source rider missing: '+idx)
 return {riderId:'r'+String(idx).padStart(3,'0'),teamId:'t'+String(team).padStart(2,'0'),flat,climbing,endurance:stamina,resistance:a?.resistance??hills,fatigueBeforeStage:fatigue,
 startStamina:a?.startStamina??75,raceSharpness:a?.raceSharpness??50,recovery:a?.recovery??75,morale:a?.morale??75,equipmentStagePerformancePct:a?.equipmentStagePerformancePct??0,inStageEnergyCostMultiplier:a?.inStageEnergyCostMultiplier??1}
})
const coords=meta.profileKmElevationM
const segments=coords.slice(1).map(([km,ele],i)=>({lengthKm:km-coords[i][0],gradePercent:(ele-coords[i][1])/((km-coords[i][0])*10)}))
const orders=meta.preRacePhaseOverrides.split(',').map(c=>{const [idx,phase,v]=c.split(':'),n=Number(phase.at(-1));return {riderId:'r'+idx.padStart(3,'0'),startKm:(n-1)*meta.lengthKm/4,endKm:n*meta.lengthKm/4,tactic:v==='attack'?'attack':v==='chase_breakaway'?'chase':'follow'}})
const input={raceId:meta.raceId,stageId:meta.stageId,sourceFingerprint:meta.sourceInputJsonbMd5,riders,segments,orders,secondsPerTick:10,sampleSeconds:60,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:privateMap?'source_snapshot':'synthetic_research'}}
const cases=[['legacy_coincident',null],['grid_4x2', {mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2}],['grid_3x2', {mode:'synthetic_neutral_rolling',ridersAcross:3,rowSpacingMeters:2}],['spatial_4x2', {mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2}]]
const out=[]
for(const [label,grid] of cases){
 const one={...input,...(grid?{experimentalStartFormation:grid}:{}),...(label==='spatial_4x2'?{experimentalSpatialMotion:{laneCount:4,minWheelGapMeters:1.8}}:{})}
 const initial=initializeExperimentalPowerV3(one)
 const result=runExperimentalPowerV3(one)
 const gapCounts=new Map()
 for(const fin of result.finish){const key=Math.round(fin.gapSeconds*1e5)/1e5;gapCounts.set(key,(gapCounts.get(key)||0)+1)}
 const sorted=[...gapCounts.values()].sort((a,b)=>b-a)
 const data={label,source:privateMap?'PRIVATE_SOURCE_COMPLETE_ROSTER':'EXPLICIT_SYNTHETIC_SOURCE_STANDIN',riders:result.riderCount,initialSpreadMeters:Math.max(...initial.riders.map(s=>s.meters))-Math.min(...initial.riders.map(s=>s.meters)),distinctPhysicalFinishGaps:gapCounts.size,largestExactPhysicalGapCluster:sorted[0],withinOneSecond:result.finish.filter(r=>r.gapSeconds<=1).length,tailGapSeconds:result.finish.at(-1).gapSeconds,attacks:result.attackAttempts,frames:result.replay.length,...(result.spatialStats?{spatialStats:result.spatialStats}:{})}
 out.push(data)
}
console.log(JSON.stringify({status:'RESEARCH_ONLY_NOT_SPORTING_APPROVED',physicallyVerified:false,results:out},null,2))
