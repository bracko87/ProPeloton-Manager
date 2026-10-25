/** Operator-only local research fixture reader. Never publish rider-level source. */
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {runExperimentalPowerV3,initializeExperimentalPowerV3,advanceExperimentalPowerV3,finalizeExperimentalPowerV3} from '../../src/race-engine-v3/experimentalPowerRaceV3.ts'
const root=new URL('./fixtures/',import.meta.url)
const base=readFileSync(new URL('dordrecht-2000-10-15.csv',root),'utf8').trim().split('\n').slice(1).map(x=>x.split(',').map(Number))
const meta=JSON.parse(readFileSync(new URL('dordrecht-2000-10-15.metadata.json',root),'utf8'))
const supplementPath=process.env.V3_PRIVATE_SOURCE_SUPPLEMENT
if(!supplementPath)throw Error('Missing V3_PRIVATE_SOURCE_SUPPLEMENT: do not guess original energy data')
const lines=readFileSync(supplementPath,'utf8').trim().split(/\r?\n/)
const fieldNames=lines[0].split(',')
const supplement=new Map(lines.slice(1).map(line=>{const values=line.split(',');return [Number(values[0]),Object.fromEntries(fieldNames.map((k,i)=>[k,Number(values[i])]))]}))
assert.equal(supplement.size,106)
const riders=base.map(([idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue])=>{
 const o=supplement.get(idx);assert(o,'Missing source energy for rider '+idx)
 return {riderId:'r'+String(idx).padStart(3,'0'),teamId:'t'+String(team).padStart(2,'0'),flat,climbing,endurance:stamina,resistance:o.resistance,fatigueBeforeStage:fatigue,startStamina:o.startStamina,raceSharpness:o.raceSharpness,recovery:o.recovery,morale:o.morale,equipmentStagePerformancePct:o.equipmentStagePerformancePct,inStageEnergyCostMultiplier:o.inStageEnergyCostMultiplier}
})
const pts=meta.profileKmElevationM
const segments=pts.slice(1).map(([km,m],i)=>({lengthKm:km-pts[i][0],gradePercent:(m-pts[i][1])/((km-pts[i][0])*10)}))
const orders=meta.preRacePhaseOverrides.split(',').map(x=>{
 const [idx,phase,cmd]=x.split(':'),n=Number(phase.at(-1))
 return {riderId:'r'+String(idx).padStart(3,'0'),startKm:(n-1)*meta.lengthKm/4,endKm:n*meta.lengthKm/4,tactic:cmd==='attack'?'attack':cmd==='chase_breakaway'?'chase':'follow'}
})
const input={raceId:meta.raceId,stageId:meta.stageId,sourceFingerprint:meta.sourceInputJsonbMd5,riders,segments,orders,secondsPerTick:10,sampleSeconds:60,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'source_snapshot'}}
const first=runExperimentalPowerV3(input)
let state=initializeExperimentalPowerV3(input),batch=0
while(!state.complete){state=JSON.parse(JSON.stringify(advanceExperimentalPowerV3(input,state,[1,37,113,7,23][batch++%5])));assert(batch<20000)}
assert.deepEqual(finalizeExperimentalPowerV3(input,state),first)
assert(first.attackAttempts>=1)
const finish=first.finish
const leading=finish[0].elapsedSeconds
const grouped=finish.filter(r=>r.gapSeconds<=1).length
const extra={
  stage:'Dordrecht Alblasserwaard Circuit',riders:riders.length,sourceEnergyRiders:supplement.size,
  quality:'deidentified_source_snapshot_fields_rounded_to_2_decimal_places',
  mode:first.mode,approved:false,officialWrites:first.officialWrites,
  totalKm:meta.lengthKm, winnerSeconds:leading,lastGapSeconds:finish.at(-1).gapSeconds,
  onWinnerTime:grouped,positiveGapRiders:finish.filter(r=>r.gapSeconds>1).length,
  attackAttempts:first.attackAttempts,checkpointBatches:batch,replayFrames:first.replay.length,
  energyMin:Math.min(...finish.map(r=>r.energy)),energyMax:Math.max(...finish.map(r=>r.energy)),
  checksum:createHash('sha256').update(JSON.stringify(first)).digest('hex'),
  limitations:['Provisional power and drag coefficients','Historical stage has no verified road bearings','Climbing geometry is coarse','No source original identifiers or source supplement published']
}
if(process.env.V3_AUDIT_OUT)writeFileSync(process.env.V3_AUDIT_OUT,JSON.stringify(extra,null,2)+'\n')
console.log(JSON.stringify(extra,null,2))
