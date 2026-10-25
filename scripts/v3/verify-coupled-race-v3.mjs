import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {runCoupledV3,initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
const root=new URL('./fixtures/',import.meta.url)
function source(name,short=false){
 const rows=readFileSync(new URL(name+'.csv',root),'utf8').trim().split('\n').slice(1).map(r=>r.split(',').map(Number))
 const riders=rows.map(([idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue])=>({riderId:'r'+String(idx).padStart(3,'0'),teamId:'t'+team,flat,climbing,endurance:stamina,resistance:hills,fatigueBeforeStage:fatigue,
  startStamina:Math.min(100,Math.max(50,80-fatigue*.15)),raceSharpness:form,recovery:stamina,morale:75,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1}))
 let points,orders=[]
 if(name.startsWith('dordrecht')){
  const meta=JSON.parse(readFileSync(new URL(name+'.metadata.json',root),'utf8'))
  points=meta.profileKmElevationM
  orders=meta.preRacePhaseOverrides.split(',').map(text=>{const [idx,phase,command]=text.split(':'),n=Number(phase.at(-1));return {riderId:'r'+idx.padStart(3,'0'),startKm:(n-1)*meta.lengthKm/4,endKm:n*meta.lengthKm/4,tactic:command==='attack'?'attack':command==='chase_breakaway'?'chase':'tempo'}})
 }else points=[[0,115],[18,140],[36,170],[52,130],[60,140],[72,270],[84,110],[96,130],[110,160],[124,240],[134.2,430],[142,165],[154,190],[158,220],[160.8,275],[162.6,415],[165.8,650]]
 if(short)points=[[0,20],[1,20],[2,22],[3,20]]
 const route=points.slice(1).map(([km,elev],i)=>({lengthKm:km-points[i][0],gradePercent:(elev-points[i][1])/((km-points[i][0])*10)}))
 return {raceId:name,stageId:name,seed:'isolated-coupled-batch18',riders,route,orders:short?orders.filter(o=>o.startKm<3):orders,grid:{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2},tickSeconds:10,sampleSeconds:120,
 gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
}
assert.throws(()=>initializeCoupledV3({...source('dordrecht-2000-10-15',true),gate:{offlineOnly:false,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}),/offline-only/)
assert.throws(()=>initializeCoupledV3({...source('dordrecht-2000-10-15',true),gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'source_snapshot'},riders:source('dordrecht-2000-10-15',true).riders.map((r,i)=>i===0?{...r,raceSharpness:undefined}:r)}),/Missing physical source/)
for(const name of ['dordrecht-2000-10-15','guangxi-2000-10-19']){
 const input=source(name,true)
 const direct=runCoupledV3(input)
 let resumed=initializeCoupledV3(input),n=0
 while(!resumed.complete){resumed=JSON.parse(JSON.stringify(advanceCoupledV3(input,resumed,[7,3,1,11,5][n++%5])));assert(n<1500)}
 assert.deepEqual(finalizeCoupledV3(input,resumed),direct,'Checkpoint continuity broken')
 assert.equal(direct.officialWrites,0);assert.equal(direct.sportingApproval,'NOT_APPROVED')
 assert.equal(direct.finish.length,input.riders.length)
 assert.equal(direct.frames.length,direct.groups.length)
 assert(direct.frames.every((f,i)=>direct.groups[i].assignments.length===input.riders.length))
 assert(direct.finish.every(f=>f.gapSeconds>=0&&f.energy>=0&&f.energy<=1))
 assert.equal(direct.groups.at(-1).finishedRiderIds.length,input.riders.length)
 const corrupt=JSON.parse(JSON.stringify(resumed));corrupt.groupTimeline.history.pop()
 assert.throws(()=>advanceCoupledV3(input,corrupt,1),/Divergent checkpoint/)
 console.log(JSON.stringify({name,riders:direct.finish.length,km:3,ticks:resumed.tick,frames:direct.frames.length,passes:direct.movement.passes,blocked:direct.movement.wheelLimitedTicks,attacks:direct.movement.attackAttempts,tailSeconds:direct.finish.at(-1).gapSeconds,batches:n,workJoules:direct.movement.totalWorkJoules,source:'SYNTHETIC_ONLY',sportingApproval:'NOT_APPROVED'}))
}
if(process.env.V3_FULL_ROSTERS==='1'){
 for(const name of ['dordrecht-2000-10-15','guangxi-2000-10-19']){
  const input=source(name,false)
  const direct=runCoupledV3(input)
  const distinct=new Set(direct.finish.map(r=>r.gapSeconds)).size
  console.log(JSON.stringify({name,fullKm:input.route.reduce((s,x)=>s+x.lengthKm,0),riders:direct.finish.length,ticks:direct.elapsedSeconds/10,frames:direct.frames.length,passes:direct.movement.passes,blocked:direct.movement.wheelLimitedTicks,attacks:direct.movement.attackAttempts,first10Gaps:direct.finish.slice(0,10).map(x=>x.gapSeconds),lastGap:direct.finish.at(-1).gapSeconds,withinOneSecond:direct.finish.filter(x=>x.gapSeconds<=1).length,distinctPhysicalGaps:distinct,sportingApproval:'NOT_APPROVED'}))
 }
}
