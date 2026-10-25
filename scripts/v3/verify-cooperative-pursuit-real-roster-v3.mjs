import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runPhysicalRaceV3} from '../../src/race-engine-v3/physicalRaceEngineV3.ts'
import {planCooperativePursuitV3} from '../../src/race-engine-v3/cooperativePursuitV3.ts'
const url=new URL('./fixtures/',import.meta.url)
const meta=JSON.parse(readFileSync(new URL('dordrecht-2000-10-15.metadata.json',url),'utf8'))
const csv=readFileSync(new URL('dordrecht-2000-10-15.csv',url),'utf8').trim().split('\n')
const riders=csv.slice(1).map(line=>{const [idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue]=line.split(',').map(Number);return {riderId:`r${String(idx).padStart(3,'0')}`,teamId:`t${String(team).padStart(2,'0')}`,flat,hills,climbing,cobbles,stamina,form,fatigue}})
const route=meta.profileKmElevationM.slice(1).map(([km,ele],i)=>({lengthKm:km-meta.profileKmElevationM[i][0],gradePercent:(ele-meta.profileKmElevationM[i][1])/((km-meta.profileKmElevationM[i][0])*10)}))
const orders=meta.preRacePhaseOverrides.split(',').map(x=>{const [idx,phase,source]=x.split(':');const n=Number(phase.slice(-1));return {riderId:'r'+idx.padStart(3,'0'),startKm:(n-1)*meta.distanceKm/4,endKm:n*meta.distanceKm/4,action:source==='attack'?'attack':source==='chase_breakaway'?'chase':'tempo'}})
const race=runPhysicalRaceV3({raceId:meta.raceId,stageId:meta.stageId,seed:`v3:real-roster:${meta.sourceInputJsonbMd5}`,riders,route,orders,dtSeconds:10,sampleEverySeconds:60})
let snapshots=0,groupsChasing=0,spentEnergyRate=0,peakCooperativeGain=0
for(const frame of race.replay.filter((_,i)=>i%6===0)){
 const pack=planCooperativePursuitV3(frame.riders.filter(r=>r.meters<meta.distanceKm*1000).map(r=>({riderId:r.riderId,meters:r.meters,energy:r.energy,sustainableMps:10.7,action:orders.find(o=>o.riderId===r.riderId&&r.meters/1000>=o.startKm&&r.meters/1000<o.endKm)?.action??'follow'})),10)
 snapshots++
 for(const group of pack){if(group.paceGainMps>0){groupsChasing++;peakCooperativeGain=Math.max(peakCooperativeGain,group.paceGainMps);spentEnergyRate+=Object.values(group.workPerSecond).reduce((a,b)=>a+b,0)}}
}
assert(snapshots>15)
assert(groupsChasing>0,'Saved Dordrecht pre-race chase orders should sometimes coincide with separated physical packs')
assert(peakCooperativeGain>0&&peakCooperativeGain<=.7,'Candidate contribution exceeded bounded pace')
assert(spentEnergyRate>0,'Candidate chase was free')
assert.equal(race.finish.length,106)
console.log(JSON.stringify({status:'SHADOW_ONLY',riders:106,snapshots,groupsChasing,peakCooperativeGainMps:peakCooperativeGain,aggregateWorkRate:spentEnergyRate,officialFinishRowsWritten:0,sportingApproved:false}))
