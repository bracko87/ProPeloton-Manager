/** Frozen roster research audit. NEVER writes official results or promotes solver. */
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {runPhysicalRaceV3} from '../../src/race-engine-v3/physicalRaceEngineV3.ts'
import {calculatePackPowerV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
import {projectRiderPowerV3} from '../../src/race-engine-v3/riderPowerAdapterV3.ts'
const root=new URL('./fixtures/',import.meta.url)
function load(name){
 const lines=readFileSync(new URL(name+'.csv',root),'utf8').trim().split('\n')
 const riders=lines.slice(1).map(line=>{
  const [idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue]=line.split(',').map(Number)
  return {riderId:'r'+String(idx).padStart(3,'0'),teamId:'t'+String(team).padStart(2,'0'),flat,hills,climbing,cobbles,stamina,form,fatigue}
 })
 if(name.startsWith('dordrecht')){
  const meta=JSON.parse(readFileSync(new URL(name+'.metadata.json',root),'utf8'))
  const pts=meta.profileKmElevationM
  const orders=meta.preRacePhaseOverrides.split(',').map(c=>{
   const [idx,phase,v]=c.split(':'),n=Number(phase.slice(-1))
   return {riderId:'r'+idx.padStart(3,'0'),startKm:(n-1)*meta.lengthKm/4,endKm:n*meta.lengthKm/4,action:v==='attack'?'attack':v==='chase_breakaway'?'chase':'tempo'}
  })
  return {riders,points:pts,orders,seed:'v3:real-roster:'+meta.sourceInputJsonbMd5,raceId:meta.raceId,stageId:meta.stageId}
 }
 return {riders,points:[[0,115],[18,140],[36,170],[52,130],[60,140],[72,270],[84,110],[96,130],[110,160],[124,240],[134.2,430],[142,165],[154,190],[158,220],[160.8,275],[162.6,415],[165.8,650]],orders:[],seed:'v3:guangxi:babdde9fd07d315bf59974cc46dde67d',raceId:'d36147e2-0511-4d32-b26c-df231c5da0ee',stageId:'dd6681d1-e565-43f3-8449-0bb203b0eb07'}
}
function gradeAt(route,meters){let sum=0;for(const s of route){sum+=s.lengthKm*1000;if(meters<sum)return s.gradePercent}return route.at(-1).gradePercent}
const output={version:'v3_power_source_coverage_01',mode:'SHADOW_ONLY',officialRaceWrites:0,activeV3SolverModified:false,measuredWattsAvailable:false,sportingApproval:'BLOCKED',rosters:[]}
for(const name of ['dordrecht-2000-10-15','guangxi-2000-10-19']){
 const fixture=load(name)
 const route=fixture.points.slice(1).map(([km,ele],i)=>({lengthKm:km-fixture.points[i][0],gradePercent:(ele-fixture.points[i][1])/((km-fixture.points[i][0])*10)}))
 const input={...fixture,route,dtSeconds:10,sampleEverySeconds:60}
 const game=runPhysicalRaceV3(input)
 const refs=new Map(fixture.riders.map(r=>[r.riderId,r]))
 let count=0,proxyCount=0,err=0,errMax=0,predictedWatts=[]
 for(let i=4;i<game.groupFrames.length-1;i+=8){
  const group=game.groupFrames[i].groups.filter(g=>g.riderIds.length>=5).sort((a,b)=>b.riderIds.length-a.riderIds.length)[0]
  if(!group)continue
  const grade=gradeAt(route,group.frontMeters),position=new Map(game.replay[i].riders.map(r=>[r.riderId,r]))
  const projected=group.riderIds.map(id=>{
   const r=refs.get(id)
   const attr={riderId:id,flat:r.flat,climbing:r.climbing,endurance:r.stamina,resistance:r.hills,fatigueBeforeStage:r.fatigue}
   // Historical CSVs omit startStamina/sharpness/recovery/source equipment.
   // Proxy mode is EXPLICIT, never silently labelled as original source data.
   const pack=projectRiderPowerV3(attr,grade,'follow',true)
   proxyCount+=(pack.inputQuality==='research_proxy'?1:0)
   return {...pack,energy:position.get(id).energy}
  })
  const pace=calculatePackPowerV3(projected,{gradePercent:grade})
  const difference=Math.abs(pace.attainableSpeedMps-group.estimatedSpeedMps)
  assert(Number.isFinite(difference));err+=difference;errMax=Math.max(errMax,difference)
  predictedWatts.push(...projected.map(r=>r.sustainableWatts));count++
 }
 assert(count>=10);assert(proxyCount>0)
 predictedWatts.sort((a,b)=>a-b)
 const quantile=p=>Number(predictedWatts[Math.floor((predictedWatts.length-1)*p)].toFixed(2))
 output.rosters.push({name,riders:fixture.riders.length,sampledPacks:count,sourceDerivedRiderSamples:0,researchProxyRiderSamples:proxyCount,projectedWattsP10:quantile(.1),projectedWattsMedian:quantile(.5),projectedWattsP90:quantile(.9),meanSpeedDifferenceVersusUnapprovedSolverMps:Number((err/count).toFixed(3)),maximumSpeedDifferenceMps:Number(errMax.toFixed(3)),sourceInputCompleteness:'INCOMPLETE',decision:'DO_NOT_PROMOTE'})
}
if(process.env.V3_AUDIT_OUT)writeFileSync(process.env.V3_AUDIT_OUT,JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify(output,null,2))
