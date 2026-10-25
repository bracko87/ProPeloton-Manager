import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {initializePhysicalRaceV3,advancePhysicalRaceV3,finalizePhysicalRaceV3,runPhysicalRaceV3} from '../../src/race-engine-v3/physicalRaceEngineV3.ts'
const root=new URL('./fixtures/',import.meta.url)
function inputFor(which){
 const rows=readFileSync(new URL(which+'.csv',root),'utf8').trim().split('\n')
 const riders=rows.slice(1).map(row=>{
  const [idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue]=row.split(',').map(Number)
  return {riderId:'r'+String(idx).padStart(3,'0'),teamId:'t'+String(team).padStart(2,'0'),flat,hills,climbing,cobbles,stamina,form,fatigue}
 })
 let points,raceId,stageId,seed,orders=[]
 if(which.startsWith('dordrecht')){
  const meta=JSON.parse(readFileSync(new URL(which+'.metadata.json',root),'utf8'))
  points=meta.profileKmElevationM
  raceId=meta.raceId;stageId=meta.stageId;seed='v3:real-roster:'+meta.sourceInputJsonbMd5
  orders=meta.preRacePhaseOverrides.split(',').map(t=>{
   const [idx,phase,order]=t.split(':'),p=Number(phase.at(-1))
   return {riderId:'r'+idx.padStart(3,'0'),startKm:(p-1)*meta.distanceKm/4,endKm:p*meta.distanceKm/4,action:order==='attack'?'attack':order==='chase_breakaway'?'chase':'tempo'}
  })
 }else{
  points=[[0,115],[18,140],[36,170],[52,130],[60,140],[72,270],[84,110],[96,130],[110,160],[124,240],[134.2,430],[142,165],[154,190],[158,220],[160.8,275],[162.6,415],[165.8,650]]
  raceId='d36147e2-0511-4d32-b26c-df231c5da0ee'
  stageId='dd6681d1-e565-43f3-8449-0bb203b0eb07'
  seed='v3:guangxi:babdde9fd07d315bf59974cc46dde67d'
 }
 const route=points.slice(1).map(([km,m],i)=>({lengthKm:km-points[i][0],gradePercent:(m-points[i][1])/((km-points[i][0])*10)}))
 return {raceId,stageId,seed,route,riders,orders,dtSeconds:10,sampleEverySeconds:60}
}
for(const name of ['dordrecht-2000-10-15','guangxi-2000-10-19']){
 const input=inputFor(name)
 const straight=runPhysicalRaceV3(input)
 let checkpoint=initializePhysicalRaceV3(input),batches=0
 while(!checkpoint.complete){
  checkpoint=JSON.parse(JSON.stringify(advancePhysicalRaceV3(input,checkpoint,[1,7,31,3,61,16][batches%6])))
  if(++batches>15000)throw Error('Simulation checkpoint budget exceeded')
 }
 const resumed=finalizePhysicalRaceV3(checkpoint)
 assert.deepEqual(resumed,straight,'Group lineage diverged after checkpoint serialization')
 assert.equal(resumed.groupFrames.length,resumed.replay.length)
 for(let i=0;i<resumed.groupFrames.length;i++){
  const frame=resumed.groupFrames[i],sample=resumed.replay[i]
  assert.equal(frame.elapsedSeconds,sample.elapsedSeconds)
  assert.equal(frame.assignments.length,input.riders.length)
  assert.equal(new Set(frame.assignments.map(a=>a.riderId)).size,input.riders.length)
  const physical=new Map(sample.riders.map(r=>[r.riderId,r.meters]))
  assert.equal(frame.groups.reduce((n,g)=>n+g.riderIds.length,0)+frame.finishedRiderIds.length,input.riders.length)
  for(const group of frame.groups){
   assert(group.positiveGapSeconds>=0&&Number.isFinite(group.positiveGapSeconds))
   assert(group.riderIds.every(rid=>physical.get(rid)<checkpoint.totalMeters))
  }
  assert(frame.finishedRiderIds.every(rid=>physical.get(rid)>=checkpoint.totalMeters-.000001))
 }
 const last=resumed.groupFrames.at(-1)
 assert.equal(last.finishedRiderIds.length,input.riders.length)
 assert.deepEqual(last.groups,[])
 const corrupted=JSON.parse(JSON.stringify(checkpoint))
 corrupted.groupTimeline.history.pop()
 assert.throws(()=>advancePhysicalRaceV3(input,corrupted,1),/divergent durable group checkpoint/)
 console.log('PASS '+name+' '+input.riders.length+' riders; '+resumed.groupFrames.length+' replay/group checkpoints; '+batches+' resumable batches; digest '+createHash('sha256').update(JSON.stringify(resumed)).digest('hex').slice(0,16))
}
