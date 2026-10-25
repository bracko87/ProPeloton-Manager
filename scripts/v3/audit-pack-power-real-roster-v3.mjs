/** Never write official data. Measure power-based speed candidate in SHADOW only. */
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {runPhysicalRaceV3} from '../../src/race-engine-v3/physicalRaceEngineV3.ts'
import {calculatePackPowerV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
const root=new URL('./fixtures/',import.meta.url)
function load(which){
 const lines=readFileSync(new URL(which+'.csv',root),'utf8').trim().split('\n')
 const riders=lines.slice(1).map(line=>{const [idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue]=line.split(',').map(Number);return {riderId:'r'+String(idx).padStart(3,'0'),teamId:'t'+String(team).padStart(2,'0'),flat,hills,climbing,cobbles,stamina,form,fatigue}})
 if(which.startsWith('dordrecht')){
  const m=JSON.parse(readFileSync(new URL(which+'.metadata.json',root),'utf8'))
  const route=m.profileKmElevationM.slice(1).map(([km,ele],i)=>({lengthKm:km-m.profileKmElevationM[i][0],gradePercent:(ele-m.profileKmElevationM[i][1])/((km-m.profileKmElevationM[i][0])*10)}))
  const orders=m.preRacePhaseOverrides.split(',').map(text=>{const [id,phase,order]=text.split(':'),p=Number(phase.at(-1));return {riderId:'r'+id.padStart(3,'0'),startKm:(p-1)*m.lengthKm/4,endKm:p*m.lengthKm/4,action:order==='attack'?'attack':order==='chase_breakaway'?'chase':'tempo'}})
  return {riders,route,orders,seed:'v3:real-roster:'+m.sourceInputJsonbMd5,raceId:m.raceId,stageId:m.stageId,dtSeconds:10,sampleEverySeconds:60}
 }
 const profile=[[0,115],[18,140],[36,170],[52,130],[60,140],[72,270],[84,110],[96,130],[110,160],[124,240],[134.2,430],[142,165],[154,190],[158,220],[160.8,275],[162.6,415],[165.8,650]]
 const route=profile.slice(1).map(([km,ele],i)=>({lengthKm:km-profile[i][0],gradePercent:(ele-profile[i][1])/((km-profile[i][0])*10)}))
 return {riders,route,orders:[],seed:'v3:guangxi:babdde9fd07d315bf59974cc46dde67d',raceId:'d36147e2-0511-4d32-b26c-df231c5da0ee',stageId:'dd6681d1-e565-43f3-8449-0bb203b0eb07',dtSeconds:10,sampleEverySeconds:60}
}
function segment(route,meters){let current=0;for(const s of route){current+=s.lengthKm*1000;if(meters<current)return s}return route.at(-1)}
const output={model:'provisional_collective_power_v3',mode:'SHADOW_ONLY',writes:0,sportingApproval:false,sourceAssumptions:['Rider watt capacity is a proxy derived from existing attributes, not a measured game watt value','Combined mass assumed 83 kg for all riders','No verified wind-to-road bearing or full climbing geometry','Group speeds remain unchanged by shadow calculation'],results:[]}
for(const key of ['dordrecht-2000-10-15','guangxi-2000-10-19']){
 const input=load(key)
 const main=runPhysicalRaceV3(input)
 let samples=0,absoluteError=0,maxError=0,workingFrames=0,largestPacks=[]
 const actors=new Map(input.riders.map(r=>[r.riderId,r]))
 for(let i=4;i<main.groupFrames.length-1;i+=8){
  const frame=main.groupFrames[i]
  const group=frame.groups.filter(g=>g.riderIds.length>=5).sort((a,b)=>b.riderIds.length-a.riderIds.length)[0]
  if(!group)continue
  const segmentRoad=segment(input.route,group.frontMeters)
  const riderStates=new Map(main.replay[i].riders.map(r=>[r.riderId,r]))
  const groupPowers=group.riderIds.map(id=>{
   const rider=actors.get(id)
   const order=input.orders.find(o=>o.riderId===id&&group.frontMeters/1000>=o.startKm&&group.frontMeters/1000<o.endKm)
   return {riderId:id,sustainableWatts:Math.max(105,Math.min(500,165+1.3*rider.flat+1.0*rider.stamina+(rider.form-65)*.35)),energy:riderStates.get(id).energy,tactic:order?.action??'follow',massKg:83}
  })
  const shadow=calculatePackPowerV3(groupPowers,{gradePercent:segmentRoad.gradePercent,crosswindMps:0,headwindMps:0})
  assert(Number.isFinite(shadow.attainableSpeedMps)&&shadow.attainableSpeedMps>0&&shadow.attainableSpeedMps<28)
  assert(shadow.perRider.length===group.riderIds.length)
  assert(shadow.perRider.every(p=>p.watts>=70&&p.energyCostPerSecond>=0))
  samples++;const error=Math.abs(shadow.attainableSpeedMps-group.estimatedSpeedMps)
  absoluteError+=error;maxError=Math.max(maxError,error)
  if(shadow.totalContributorWatts>0)workingFrames++
  largestPacks.push(group.riderIds.length)
 }
 assert(samples>=10,'Need multiple nontrivial physical pack observations for real-roster comparison')
 const result={fixture:key,riders:input.riders.length,sampledFrames:samples,meanAbsoluteSpeedDifferenceMps:Number((absoluteError/samples).toFixed(3)),maxDifferenceMps:Number(maxError.toFixed(3)),workingFrames,meanSampledPackSize:Math.round(largestPacks.reduce((a,b)=>a+b,0)/samples),officialResultsWritten:0,acceptance:'DIAGNOSTIC_ONLY'}
 output.results.push(result)
}
if(process.env.V3_AUDIT_OUT)writeFileSync(process.env.V3_AUDIT_OUT,JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify(output,null,2))
