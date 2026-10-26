/** Offline-only Batch 24: separate W-prime from aerobic CP, measured per-rider/sector. */
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {fatiguePowerEnvelopeV3} from '../../src/race-engine-v3/fatiguePowerEnvelopeV3.ts'
const combined=process.env.V3_BATCH24_COMBINED==='1',root=new URL('./fixtures/',import.meta.url),r6=x=>Math.round(x*1e6)/1e6
const div=(a,b)=>b?a/b:0
function inputFor(name){
 const rows=readFileSync(new URL(name+'.csv',root),'utf8').trim().split('\n').slice(1).map(r=>r.split(',').map(Number))
 const riders=rows.map(([id,team,flat,hills,climbing,cobbles,stamina,form,fatigue])=>({riderId:'r'+String(id).padStart(3,'0'),teamId:'t'+team,flat,climbing,endurance:stamina,resistance:hills,fatigueBeforeStage:fatigue,startStamina:Math.min(100,Math.max(50,80-fatigue*.15)),raceSharpness:form,recovery:stamina,morale:75,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1}))
 let points,orders=[]
 if(name.startsWith('dordrecht')){
  const m=JSON.parse(readFileSync(new URL(name+'.metadata.json',root),'utf8'))
  assert.equal(m.distanceKm,118.5);points=m.profileKmElevationM
  orders=m.preRacePhaseOverrides.split(',').map(s=>{const [id,phase,t]=s.split(':'),n=Number(phase.at(-1));assert(/^phase[1-4]$/.test(phase));return {riderId:'r'+id.padStart(3,'0'),startKm:(n-1)*m.distanceKm/4,endKm:n*m.distanceKm/4,tactic:t==='attack'?'attack':t==='chase_breakaway'?'chase':'tempo'}})
 }else points=[[0,115],[18,140],[36,170],[52,130],[60,140],[72,270],[84,110],[96,130],[110,160],[124,240],[134.2,430],[142,165],[154,190],[158,220],[160.8,275],[162.6,415],[165.8,650]]
 const route=points.slice(1).map(([km,e],i)=>({lengthKm:km-points[i][0],gradePercent:(e-points[i][1])/((km-points[i][0])*10)}))
 return {raceId:name,stageId:name,seed:'isolated-coupled-batch22',riders,route,orders,grid:{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2},tickSeconds:10,sampleSeconds:120,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
}
function bucket(key,from,to,grade=null){return {key,fromKm:from,toKm:to,gradePercent:grade,riderSeconds:0,meters:0,blocked:0,low10Seconds:0,low20Seconds:0,aerobicDerateSeconds:0,aerobicDerateWattSeconds:0,spentJ:0,recoveredJ:0,mechanicalJ:0,count:0}}
function summarize(b){return {key:b.key,fromKm:r6(b.fromKm),toKm:r6(b.toKm),gradePercent:b.gradePercent,meanSpeedMps:r6(div(b.meters,b.riderSeconds)),blocked:b.blocked,low10Share:r6(div(b.low10Seconds,b.riderSeconds)),low20Share:r6(div(b.low20Seconds,b.riderSeconds)),aerobicDerateShare:r6(div(b.aerobicDerateSeconds,b.riderSeconds)),aerobicDerateMeanWatts:r6(div(b.aerobicDerateWattSeconds,b.riderSeconds)),spentKJ:r6(b.spentJ/1000),recoveredKJ:r6(b.recoveredJ/1000),mechanicalMJ:r6(b.mechanicalJ/1e6),riderHours:r6(b.riderSeconds/3600)}}
function trace(input){
 let state=initializeCoupledV3(input);const total=state.totalMeters/1000
 const q=Array.from({length:4},(_,i)=>bucket('Q'+(i+1),total*i/4,total*(i+1)/4))
 let from=0;const sections=input.route.map((seg,i)=>{const b=bucket('S'+(i+1),from,from+seg.lengthKm,seg.gradePercent);from+=seg.lengthKm;return b})
 const riders=new Map(input.riders.map(r=>[r.riderId,{riderId:r.riderId,totalSeconds:0,blocked:0,low10Seconds:0,low20Seconds:0,aerobicDerateSeconds:0,aerobicDerateWattSeconds:0,spentJ:0,recoveredJ:0,mechanicalJ:0}]))
 let batches=0
 while(!state.complete){
  const start=state.elapsedSeconds,before=new Map(state.riders.map(r=>[r.riderId,{...r}]))
  advanceCoupledV3(input,state,12)
  if(input.experimentalSeparatedAerobicPower)state=JSON.parse(JSON.stringify(state))
  const dt=state.elapsedSeconds-start;assert(dt>0&&dt<=120)
  for(const after of state.riders){
   const prev=before.get(after.riderId);if(prev.finishSeconds!==null)continue
   const duration=Math.min(dt,Math.max(0,(after.finishSeconds??state.elapsedSeconds)-start))
   if(duration<=0)continue
   const meters=after.meters-prev.meters,blocked=after.wheelLimitedTicks-prev.wheelLimitedTicks
   assert(meters>=-1e-5&&meters<=duration*30+.1&&Number.isInteger(blocked)&&blocked>=0&&blocked<=12)
   const a=prev.powerDurationEnergy,b=after.powerDurationEnergy
   assert(Boolean(a)===Boolean(b))
   const fraction=a?div(a.remainingWPrimeJoules,a.wPrimeJoules):null
   const derate=a&&!input.experimentalSeparatedAerobicPower?Math.max(0,a.criticalWatts-fatiguePowerEnvelopeV3(fraction,a.criticalWatts).peakDeliverableWatts):0
   const values={riderSeconds:duration,meters,blocked,low10Seconds:fraction!==null&&fraction<.1?duration:0,low20Seconds:fraction!==null&&fraction<.2?duration:0,aerobicDerateSeconds:derate>0?duration:0,aerobicDerateWattSeconds:derate*duration,spentJ:a?b.cumulativeSupraCriticalJoules-a.cumulativeSupraCriticalJoules:0,recoveredJ:a?b.cumulativeRecoveredWPrimeJoules-a.cumulativeRecoveredWPrimeJoules:0,mechanicalJ:a?b.cumulativeMechanicalJoules-a.cumulativeMechanicalJoules:after.cumulativeActualWorkJoules-prev.cumulativeActualWorkJoules}
   const mid=(prev.meters+after.meters)/2000
   for(const group of [q,sections]){
    const target=group.find(x=>mid<x.toKm)??group.at(-1)
    for(const [k,v] of Object.entries(values))target[k]+=v
    target.count++
   }
   const row=riders.get(after.riderId)
   row.totalSeconds+=duration
   for(const [k,v] of Object.entries(values))if(k!=='riderSeconds'&&k!=='meters')row[k]+=v
  }
  assert(++batches<1000,'Unbounded diagnostic run')
 }
 const result=finalizeCoupledV3(input,state)
 if(input.experimentalSeparatedAerobicPower)assert.deepEqual(result,runCoupledV3(input),'Batch 24 serialized checkpoints diverged from uninterrupted full race')
 assert.equal(result.officialWrites,0);assert.equal(result.sportingApproval,'NOT_APPROVED')
 assert.equal(q.reduce((n,b)=>n+b.blocked,0),result.movement.wheelLimitedTicks)
 if(input.experimentalPowerDurationEnergy){
  const recorded=q.reduce((n,b)=>n+b.mechanicalJ,0)
  const actual=state.riders.reduce((n,r)=>n+r.powerDurationEnergy.cumulativeMechanicalJoules,0)
  assert(Math.abs(recorded-actual)<.01,'Incomplete mechanical work trace')
 }
 const detail=result.finish.map(r=>({...r,...riders.get(r.riderId)}))
 return {result,detail,quarters:q.map(summarize),sections:sections.map(summarize),batches}
}
const out=process.env.V3_BATCH24_OUT_DIR??'/tmp/v3-batch24';mkdirSync(out,{recursive:true})
for(const fixture of ['dordrecht-2000-10-15','guangxi-2000-10-19']){
 const prepared=inputFor(fixture),extras=combined?{experimentalAnticipatoryLaneMoves:true,experimentalPathDraftWork:true,experimentalBottleneckTelemetry:true}:{}
 const base=trace({...prepared,...extras,experimentalPowerDurationEnergy:true}),candidate=trace({...prepared,...extras,experimentalPowerDurationEnergy:true,experimentalSeparatedAerobicPower:true})
 const control=new Map(base.detail.map(x=>[x.riderId,x]))
 const paired=candidate.detail.map(x=>({...x,baselineGapSeconds:control.get(x.riderId).gapSeconds,deltaGapSeconds:r6(x.gapSeconds-control.get(x.riderId).gapSeconds),deltaBlockedTicks:x.blocked-control.get(x.riderId).blocked,low10Share:r6(div(x.low10Seconds,x.totalSeconds))}))
 const total=x=>paired.reduce((n,r)=>n+r[x],0)
 const sectors=candidate.quarters.map((x,i)=>({...x,controlSpeedMps:base.quarters[i].meanSpeedMps,deltaSpeedMps:r6(x.meanSpeedMps-base.quarters[i].meanSpeedMps),deltaBlocked:x.blocked-base.quarters[i].blocked}))
 const routeSections=candidate.sections.map((x,i)=>({...x,controlSpeedMps:base.sections[i].meanSpeedMps,deltaSpeedMps:r6(x.meanSpeedMps-base.sections[i].meanSpeedMps),deltaBlocked:x.blocked-base.sections[i].blocked}))
 const expected=fixture.startsWith('dordrecht')?(combined?2961.729571:2813.642783):(combined?2083.132603:1895.292841)
 assert(Math.abs(base.result.finish.at(-1).gapSeconds-expected)<.0001,'Batch 22 W-prime baseline drift')
 assert(Number.isFinite(candidate.result.finish.at(-1).gapSeconds)&&candidate.result.finish.at(-1).gapSeconds>=0,'Nonfinite candidate spread')
 const report={fixture,combined,experiment:'SEPARATE_AEROBIC_CP_FROM_W_PRIME',mode:'OFFLINE_RESEARCH_ONLY',sportingApproval:'NOT_APPROVED',officialWrites:0,roster:paired.length,distanceKm:r6(prepared.route.reduce((n,x)=>n+x.lengthKm,0)),sampling:'120-second midpoint-sector approximation',limitations:['Guangxi 718m of missing gain','Dordrecht 8 sprint-point commands treated as tempo','Observed gap changes also reflect altered wheel blocking and rider interaction; not sporting approval'],baselineTailGapSeconds:base.result.finish.at(-1).gapSeconds,candidateTailGapSeconds:candidate.result.finish.at(-1).gapSeconds,deltaTailGapSeconds:r6(candidate.result.finish.at(-1).gapSeconds-base.result.finish.at(-1).gapSeconds),totals:{low10RiderHours:r6(total('low10Seconds')/3600),low20RiderHours:r6(total('low20Seconds')/3600),aerobicDerateRiderHours:r6(total('aerobicDerateSeconds')/3600),aerobicDerateMeanWatts:r6(div(total('aerobicDerateWattSeconds'),total('totalSeconds'))),supraCriticalMJ:r6(total('spentJ')/1e6),recoveryMJ:r6(total('recoveredJ')/1e6)},quarters:sectors,sections:routeSections,mostHarmed:[...paired].sort((a,b)=>b.deltaGapSeconds-a.deltaGapSeconds).slice(0,12).map(x=>({id:x.riderId,rank:x.rank,deltaGapSeconds:x.deltaGapSeconds,low10Share:x.low10Share,deltaBlockedTicks:x.deltaBlockedTicks})),riders:paired}
 const file=out+'/'+(fixture.startsWith('dordrecht')?'dordrecht':'guangxi')+(combined?'-combined':'-energy')+'-separated.json'
 writeFileSync(file,JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({fixture,combined,experiment:report.experiment,roster:report.roster,deltaTailGapSeconds:report.deltaTailGapSeconds,totals:report.totals,quarters:sectors.map(x=>({key:x.key,deltaSpeedMps:x.deltaSpeedMps,low10Share:x.low10Share,aerobicDerateShare:x.aerobicDerateShare,deltaBlocked:x.deltaBlocked})),mostHarmed:report.mostHarmed.slice(0,5),file,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
}