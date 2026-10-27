/** A2 real-time 2–6 rider micro corridor study; isolated, research only.
 * All accepted trajectory and power is produced by the UNCHANGED symmetric
 * synchronous micro solver. Corridor planning never bypasses collision checks.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {selectEarlyCorridorV3} from './a2EarlyCorridorV3.mjs'
import {initializeSimultaneousMicroV3 as begin,advanceSimultaneousMicroV3 as step} from './simultaneousConflictResearchV3.mjs'
import {continuousBicycleCollisionV3 as collision} from './continuousLateralResearchV3.mjs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializePersistentPassTrackerV3 as track,advancePersistentPassTrackerV3 as advanceTrack,summarizePersistentPassTrackerV3 as summarizePass} from './a2PersistentPassesV3.mjs'
const size=Number(process.env.V3_A2_CORRIDOR_SIZE??2),dir=process.env.V3_A2_CORRIDOR_DIR??'/tmp/a2-corridors'
assert([2,3,4,5,6].includes(size))
mkdirSync(dir,{recursive:true})
const road=BATCH40_GEOMETRIES[1],geom=validateRoadScenarioV3(road),dt=10,r6=x=>Math.round(x*1e6)/1e6
function ridersFor(name){
 const gap=name==='tight_headway'?9:18
 const result=[
  {riderId:'lead',meters:118,y:1,speedMps:4,cpWatts:240,wPrimeJoules:18000},
  {riderId:'rear',meters:118-gap,y:1,speedMps:4,cpWatts:310,wPrimeJoules:21000}
 ]
 for(let i=2;i<size;i++){
  const occupied=name==='occupied_right'&&i===2
  result.push({riderId:'extra'+i,meters:occupied?112:82-(i-2)*22,
   y:occupied?2:i%2===0?3:0,speedMps:4,cpWatts:225,wPrimeJoules:17500})
 }
 return result
}
function propose(state,scenario,policy,chosenLane){
 const r=state.riders.find(x=>x.riderId==='rear'),lead=state.riders.find(x=>x.riderId==='lead')
 const separation=lead.meters-r.meters
 return state.riders.map(x=>{
  let targetY=x.y,distance=45
  if(x.riderId==='rear'){
   distance=75
   if(policy==='early')targetY=chosenLane
   if(policy==='late'&&separation<=5)targetY=chosenLane
   if(policy==='coordinated')targetY=1
   if(policy==='forced_right')targetY=2
   if(policy==='adaptive')targetY=chosenLane
  }else if(x.riderId==='lead'){
   if(policy==='coordinated')targetY=0
  }else distance=42
  return {riderId:x.riderId,forwardMeters:distance,targetY}
 })
}
function swept(before,after){
 const old=new Map(before.map(r=>[r.riderId,r]))
 const paths=after.map(r=>({x0:old.get(r.riderId).meters,x1:r.meters,y0:old.get(r.riderId).y,y1:r.y}))
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)
  assert(!collision(paths[i],paths[j],{longitudinal:1.8,lateral:geom.lateralCollisionM}),'Unsafe swept bicycle paths')
}
const experiments=[
 {scenario:'clear',policy:'early'},
 {scenario:'clear',policy:'late'},
 {scenario:'clear',policy:'coordinated'},
 {scenario:'tight_headway',policy:'early'},
 {scenario:'tight_headway',policy:'late'}
]
if(size>=3)experiments.push(
 {scenario:'occupied_right',policy:'forced_right'},
 {scenario:'occupied_right',policy:'adaptive'})
const outcomes=[],failures=[]
for(const entry of experiments){
 const {scenario,policy}=entry
 const record={riders:size,scenario,policy,technical:'UNTESTED',officialWrites:0}
 try{
  const initial=ridersFor(scenario),chosen=selectEarlyCorridorV3(initial,'rear',road)
  let state=begin({riders:initial,geometry:road}),observer=track(state.riders)
  let checkpoint=null,nonRelatedStoppedTicks=0,chosenLane=chosen.selectedY
  const start=structuredClone(state)
  for(let t=1;t<=40;t++){
   const previous=state.riders,actions=propose(state,scenario,policy,chosenLane)
   state=step(state,actions)
   swept(previous,state.riders)
   observer=advanceTrack(observer,state.riders,state.elapsedSeconds)
   assert(state.riders.every(r=>r.energy.remainingWPrimeJoules>=0&&Number.isFinite(r.energy.remainingWPrimeJoules)))
   assert(state.metrics.achievedMeters<=state.metrics.requestedMeters+1e-5)
   assert(state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED')
   for(const x of state.riders){
    if(!x.riderId.startsWith('extra'))continue
    const last=previous.find(r=>r.riderId===x.riderId)
    nonRelatedStoppedTicks+=Number(x.meters-last.meters<.5)
   }
   if(t===20)checkpoint=JSON.parse(JSON.stringify({state,observer}))
  }
  let recoveryState=checkpoint.state,recoveryTrack=checkpoint.observer
  for(let t=21;t<=40;t++){
   recoveryState=step(recoveryState,propose(recoveryState,scenario,policy,chosenLane))
   recoveryTrack=advanceTrack(recoveryTrack,recoveryState.riders,recoveryState.elapsedSeconds)
  }
  assert.deepEqual(recoveryState,state,'Physics and power checkpoint mismatch')
  assert.deepEqual(recoveryTrack,observer,'Pass event recovery mismatch')
  const flipped=begin({riders:initial.slice().reverse(),geometry:road})
  assert.deepEqual(
   step(flipped,propose(flipped,scenario,policy,chosenLane)).riders.slice().sort((a,b)=>a.riderId.localeCompare(b.riderId)),
   step(start,propose(start,scenario,policy,chosenLane)).riders.slice().sort((a,b)=>a.riderId.localeCompare(b.riderId)),
   'Rider array ordering changed result'
  )
  const event=observer.events.filter(e=>e.passer==='rear'&&e.passed==='lead')
  const qualifies=event.filter(e=>(e.reversedAtSeconds??observer.elapsedSeconds)-e.atSeconds>=60)
  record.technical='PASS'
  record.pass={rearPassedLead:event.length>0,
   rearLead60SecondSustained:qualifies.length>0,
   firstRearPassSecond:event.length?event[0].atSeconds:null,
   allPasses:summarizePass(observer)}
  record.finalGapRearMinusLead=r6(state.riders.find(r=>r.riderId==='rear').meters-state.riders.find(r=>r.riderId==='lead').meters)
  record.selectedLane=chosenLane
  record.selection=chosen
  record.unrelatedStoppedRiderTicks=nonRelatedStoppedTicks
  record.achievedOverRequestedPercent=r6(100*state.metrics.achievedMeters/state.metrics.requestedMeters)
  record.totalConflicts=state.metrics.collisionPairsDetected
  record.checkpointExact=true
  record.riderPermutationExact=true
  record.passEvents=observer.events
  const {passEvents,...shown}=record
  console.log(JSON.stringify(shown))
 }catch(e){
  record.technical='FAIL';record.error=String(e?.stack??e);failures.push(record)
  console.error(JSON.stringify(record))
 }
 outcomes.push(record)
}
const by=(scenario,policy)=>outcomes.find(x=>x.scenario===scenario&&x.policy===policy)
const openEarly=by('clear','early'),openLate=by('clear','late'),coordinated=by('clear','coordinated')
const summaries={
  openEarly60s:openEarly?.pass?.rearLead60SecondSustained??false,
  openLate60s:openLate?.pass?.rearLead60SecondSustained??false,
  coordinated60s:coordinated?.pass?.rearLead60SecondSustained??false,
  occupiedForced60s:by('occupied_right','forced_right')?.pass?.rearLead60SecondSustained??null,
  occupiedAdaptive60s:by('occupied_right','adaptive')?.pass?.rearLead60SecondSustained??null
}
const verdict=summaries.openEarly60s&&summaries.coordinated60s
  ?'MICRO_SUSTAINED_PASS_DEMONSTRATED_NOT_SPORTING_APPROVAL'
  :'EARLY_CORRIDOR_MICRO_LIMITATION'
const report={study:'A2_2_TO_6_RIDER_EARLY_CORRIDOR',riders:size,quality:'synthetic_research',
 scope:'40 x 10s ticks, frozen one-step occupancy selection, identical unmodified symmetric collision solver',technicalGate:failures.length?'FAIL':'PASS',
 sportingApproval:'NOT_APPROVED',officialWrites:0,microFinding:verdict,summaries,outcomes,failures,
 limitations:['The corridor chooser reads frozen current occupancy only, not real road geometry or future tactics',
 'Sustained overtaking is strictly longitudinal order held for 60s, not validated tactical race passing',
 'Constant scripted actions are not race strategy; no 106/168-rider stages, authenticated ascent or width',
 'A deterministic collision safe path can still cause artificial halts and order sensitivity']}
writeFileSync(dir+'/corridor-'+size+'.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({riders:size,technicalGate:report.technicalGate,microFinding:verdict,summaries,unrelatedStopped:outcomes.map(x=>({scenario:x.scenario,policy:x.policy,stopped:x.unrelatedStoppedRiderTicks})),failures:failures.length,officialWrites:0}))
assert.equal(failures.length,0,'One or more micro corridor cases technically invalid')
