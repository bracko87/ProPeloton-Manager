/** Explicitly SYNTHETIC Guangxi missing attributes: not source-complete data. */
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {runExperimentalPowerV3,initializeExperimentalPowerV3} from '../../src/race-engine-v3/experimentalPowerRaceV3.ts'
const root=new URL('./fixtures/',import.meta.url)
const original=readFileSync(new URL('guangxi-2000-10-19.csv',root),'utf8').trim().split('\n').slice(1).map(row=>row.split(',').map(Number))
assert.equal(original.length,168)
const attrs=original.map(([idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue])=>({
 riderId:'r'+String(idx).padStart(3,'0'),teamId:'t'+String(team).padStart(2,'0'),flat,climbing,
 endurance:stamina,resistance:hills,fatigueBeforeStage:fatigue,
 // The actual source lacks the two equipment fields. Even the other missing
 // fields are only deterministic research stand-ins in this fixture.
 startStamina:Math.max(45,Math.min(100,80+(idx%9-4)*2)),raceSharpness:74+(idx%7-3),
 recovery:77+(idx%5-2),morale:75,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1
}))
const profile=[[0,115],[18,140],[36,170],[52,130],[60,140],[72,270],[84,110],[96,130],[110,160],[124,240],[134.2,430],[142,165],[154,190],[158,220],[160.8,275],[162.6,415],[165.8,650]]
const segments=profile.slice(1).map(([km,m],i)=>({lengthKm:km-profile[i][0],gradePercent:(m-profile[i][1])/((km-profile[i][0])*10)}))
const base={raceId:'SYNTHETIC_GUANGXI_RESEARCH',stageId:'SYNTHETIC_GUANGXI_RESEARCH',sourceFingerprint:'DO_NOT_CLAIM_SOURCE_COMPLETE',riders:attrs,segments,secondsPerTick:10,sampleSeconds:60}
// Explicitly demonstrate that the frozen CSV cannot pass the original-source
// gate. No attempt to pass a synthetic fixture off as original measurement.
const incomplete=attrs.map((r,i)=>i? r:{...r,equipmentStagePerformancePct:undefined,inStageEnergyCostMultiplier:undefined})
assert.throws(()=>initializeExperimentalPowerV3({...base,riders:incomplete,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'source_snapshot'}}),/Missing physical source/)
const grid=process.env.V3_EXPERIMENTAL_START_GRID==='4x2'
const input={...base,...(grid?{experimentalStartFormation:{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2}}:{}),gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
const data=runExperimentalPowerV3(input)
assert.equal(data.riderCount,168)
assert.equal(data.officialWrites,0)
assert.equal(data.sportingApproval,'NOT_APPROVED')
assert.equal(data.groupFrames.length,data.replay.length)
const summary={stage:'Guangxi: SYNTHETIC COMPLETENESS STRESS ONLY',riders:168,fullSourceInput:false,missingEquipmentFields:168,missingAscentMeters:718,mode:data.mode,sportingApproved:false,officialWrites:0,finishWinnerSec:data.finish[0].elapsedSeconds,tailGapSec:data.finish.at(-1).gapSeconds,withinOneSecond:data.finish.filter(r=>r.gapSeconds<=1).length,attackAttempts:data.attackAttempts,replayFrames:data.replay.length,caution:'All missing fields were imputed solely to stress the offline model. No real Guangxi source-complete test was performed.'}
summary.experimentalStartGrid=grid?'SYNTHETIC_4_ACROSS_2_METER_ROWS':'DISABLED'
summary.distinctPhysicalFinishGaps=new Set(data.finish.map(r=>r.gapSeconds)).size
summary.largestExactPhysicalFinishCluster=Math.max(...Object.values(data.finish.reduce((acc,r)=>(acc[r.gapSeconds]=(acc[r.gapSeconds]||0)+1,acc),{})))
if(process.env.V3_AUDIT_OUT)writeFileSync(process.env.V3_AUDIT_OUT,JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify(summary,null,2))
