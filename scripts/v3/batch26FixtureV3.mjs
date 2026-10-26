/** Frozen, de-identified research rosters. No DB or production connection. */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const folder=new URL('./fixtures/',import.meta.url)
export function batch26Input(name){
 const data=readFileSync(new URL(name+'.csv',folder),'utf8').trim().split('\n').slice(1).map(line=>line.split(',').map(Number))
 const riders=data.map(([idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue])=>({riderId:'r'+String(idx).padStart(3,'0'),teamId:'t'+team,flat,climbing,endurance:stamina,resistance:hills,fatigueBeforeStage:fatigue,startStamina:Math.min(100,Math.max(50,80-fatigue*.15)),raceSharpness:form,recovery:stamina,morale:75,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1}))
 let profile,orders=[]
 if(name.startsWith('dordrecht')){
  const m=JSON.parse(readFileSync(new URL(name+'.metadata.json',folder),'utf8'))
  assert.equal(m.distanceKm,118.5);profile=m.profileKmElevationM
  orders=m.preRacePhaseOverrides.split(',').map(item=>{const [id,phase,cmd]=item.split(':'),n=Number(phase.at(-1));assert(/^phase[1-4]$/.test(phase));return {riderId:'r'+id.padStart(3,'0'),startKm:(n-1)*m.distanceKm/4,endKm:n*m.distanceKm/4,tactic:cmd==='attack'?'attack':cmd==='chase_breakaway'?'chase':'tempo'}})
 }else profile=[[0,115],[18,140],[36,170],[52,130],[60,140],[72,270],[84,110],[96,130],[110,160],[124,240],[134.2,430],[142,165],[154,190],[158,220],[160.8,275],[162.6,415],[165.8,650]]
 const route=profile.slice(1).map(([km,e],i)=>({lengthKm:km-profile[i][0],gradePercent:(e-profile[i][1])/((km-profile[i][0])*10)}))
 return {raceId:name,stageId:name,seed:'isolated-coupled-batch22',riders,route,orders,grid:{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2},tickSeconds:10,sampleSeconds:120,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
}
