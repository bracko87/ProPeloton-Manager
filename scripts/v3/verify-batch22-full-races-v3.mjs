/** Offline-only Batch 22 real V3 full-race A/B. Never writes official results. */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runCoupledV3,initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
const fixtures=new URL('./fixtures/',import.meta.url)
function inputFor(name){
 const rows=readFileSync(new URL(name+'.csv',fixtures),'utf8').trim().split('\n').slice(1).map(line=>line.split(',').map(Number))
 const riders=rows.map(([idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue])=>({riderId:'r'+String(idx).padStart(3,'0'),teamId:'t'+team,flat,climbing,endurance:stamina,resistance:hills,fatigueBeforeStage:fatigue,startStamina:Math.min(100,Math.max(50,80-fatigue*.15)),raceSharpness:form,recovery:stamina,morale:75,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1}))
 let points,orders=[]
 if(name.startsWith('dordrecht')){
  const meta=JSON.parse(readFileSync(new URL(name+'.metadata.json',fixtures),'utf8'))
  points=meta.profileKmElevationM
  assert(Number.isFinite(meta.distanceKm)&&Math.abs(points.at(-1)[0]-meta.distanceKm)<1e-6,'Invalid Dordrecht fixture distance')
  orders=meta.preRacePhaseOverrides.split(',').map(item=>{const [idx,phase,command]=item.split(':'),n=Number(phase.at(-1));assert(/^phase[1-4]$/.test(phase)&&['attack','chase_breakaway','fight_sprint_points'].includes(command),'Invalid fixture order');return {riderId:'r'+idx.padStart(3,'0'),startKm:(n-1)*meta.distanceKm/4,endKm:n*meta.distanceKm/4,tactic:command==='attack'?'attack':command==='chase_breakaway'?'chase':'tempo'}})
 }else points=[[0,115],[18,140],[36,170],[52,130],[60,140],[72,270],[84,110],[96,130],[110,160],[124,240],[134.2,430],[142,165],[154,190],[158,220],[160.8,275],[162.6,415],[165.8,650]]
 const route=points.slice(1).map(([km,el],i)=>({lengthKm:km-points[i][0],gradePercent:(el-points[i][1])/((km-points[i][0])*10)}))
 return {raceId:name,stageId:name,seed:'isolated-coupled-batch22',riders,route,orders,grid:{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2},tickSeconds:10,sampleSeconds:120,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
}
const combined=process.env.V3_BATCH22_COMBINED==='1'
for(const name of ['dordrecht-2000-10-15','guangxi-2000-10-19']){
 const prepared=inputFor(name)
 const control={...prepared,...(combined?{experimentalAnticipatoryLaneMoves:true,experimentalPathDraftWork:true,experimentalBottleneckTelemetry:true}:{})}
 const research={...control,experimentalPowerDurationEnergy:true}
 const baseline=runCoupledV3(control),candidate=runCoupledV3(research)
 for(const result of [baseline,candidate]){assert.equal(result.mode,'OFFLINE_RESEARCH_ONLY');assert.equal(result.officialWrites,0);assert.equal(result.sportingApproval,'NOT_APPROVED');assert.equal(result.finish.length,prepared.riders.length);assert(result.finish.every(x=>Number.isFinite(x.finishSeconds)&&Number.isFinite(x.energy)&&x.energy>=0&&x.energy<=1))}
 assert.equal(baseline.powerDuration,undefined);assert.equal(candidate.powerDuration?.modeledRiders,prepared.riders.length)
 let cp=initializeCoupledV3(research),i=0
 while(!cp.complete){cp=JSON.parse(JSON.stringify(advanceCoupledV3(research,cp,[49,13,7,89][i++%4])));assert(i<500,'Exceeded restart budget')}
 assert.deepEqual(finalizeCoupledV3(research,cp),candidate,'Serialized checkpoint mismatch')
 console.log(JSON.stringify({fixture:name,combined,roster:prepared.riders.length,distanceKm:prepared.route.reduce((n,r)=>n+r.lengthKm,0),sourceQuality:'SYNTHETIC_RESEARCH',sportingApproval:'NOT_APPROVED',officialWrites:0,checkpointIdentical:true,checkpointBatches:i,baseline:{lastGapSeconds:baseline.finish.at(-1).gapSeconds,blockedTicks:baseline.movement.wheelLimitedTicks,attacks:baseline.movement.attackAttempts},candidate:{lastGapSeconds:candidate.finish.at(-1).gapSeconds,blockedTicks:candidate.movement.wheelLimitedTicks,attacks:candidate.movement.attackAttempts,powerDuration:candidate.powerDuration},tailDeltaSeconds:candidate.finish.at(-1).gapSeconds-baseline.finish.at(-1).gapSeconds}))
}
