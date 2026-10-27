/** A2, OFFLINE ONLY: compare consenting and nonconsenting short-lived lane
 * reservations against the unchanged symmetric solver + prior micro fixture.
 * The protocol only edits submitted moves when riders explicitly acknowledge.
 * Physics safety is independently verified on every accepted swept path.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSimultaneousMicroV3 as begin,advanceSimultaneousMicroV3 as advance} from './simultaneousConflictResearchV3.mjs'
import {initializeCorridorReservationV3 as reserve,stepCorridorReservationV3 as negotiate} from './a2CorridorReservationResearchV3.mjs'
import {initializeFairCorridorV3 as fairStart,advanceFairCorridorV3 as fairStep} from './a2FairCorridorSchedulingV3.mjs'
import {initializeTimedCorridorV3 as timedStart,advanceTimedCorridorV3 as timedStep} from './a2TimedCorridorV3.mjs'
import {initializeConditionalCorridorV3 as conditionalStart,advanceConditionalCorridorV3 as conditionalStep} from './a2ConditionalCorridorV3.mjs'
import {initializeIntentAwareCorridorV3 as intentStart,advanceIntentAwareCorridorV3 as intentStep} from './a2IntentAwareCorridorV3.mjs'
import {selectEarlyCorridorV3 as choose} from './a2EarlyCorridorV3.mjs'
import {initializeSubtickEventObserverV3 as observeStart,advanceSubtickEventObserverV3 as observeStep,classifySubtickOrderV3 as classify} from './a2SubtickEventObserverV3.mjs'
import {initializePersistentPassTrackerV3 as passStart,advancePersistentPassTrackerV3 as passNext} from './a2PersistentPassesV3.mjs'
import {continuousBicycleCollisionV3 as collide} from './continuousLateralResearchV3.mjs'
const size=Number(process.env.V3_A2_SUBTICK_SIZE??2),dir=process.env.V3_A2_SUBTICK_DIR??'/tmp/a2-subtick-audit'
assert([2,3,4,5,6].includes(size))
mkdirSync(dir,{recursive:true})
const dt=10,round=n=>Math.round(n*1e6)/1e6
function roster(g,headway,scenario){
 const c=g.centerStepM,initial=[
 {riderId:'lead',meters:118,y:c,speedMps:4,cpWatts:245,wPrimeJoules:18000},
 {riderId:'rear',meters:118-headway,y:c,speedMps:4,cpWatts:325,wPrimeJoules:23000}]
 for(let i=2;i<size;i++){
  const blocker=i===2&&scenario!=='open'
  const secondClaimant=i===3&&scenario==='second_claim'
  initial.push({riderId:'extra'+i,meters:blocker?150:secondClaimant?168:76-(i-2)*24,
   y:blocker?2*c:secondClaimant?3*c-1e-6:i%2===0?3*c-1e-6:0,speedMps:4,cpWatts:230,wPrimeJoules:18000})
 }
 return initial
}
function requests(state,scenario,rearRequest,g,choice){
 const c=g.centerStepM
 return state.riders.map(r=>{
  let targetY=r.y,forwardMeters=45
  if(r.riderId==='rear'){targetY=choice;forwardMeters=rearRequest}
  else if(r.riderId.startsWith('extra')){
   forwardMeters=42
   if(scenario!=='open'&&r.riderId==='extra2'){
    const beginTick=scenario==='late_entry'?5:scenario==='immediate_entry'?0:1
    if(scenario==='reversal'){
     if(state.tick>=1&&state.tick<6&&r.y>1e-6)targetY=Math.max(0,r.y-c)
     else if(state.tick>=6&&r.y<2*c-1e-6)targetY=Math.min(2*c,r.y+c)
    }else if(state.tick>=beginTick&&r.y>1e-6)targetY=Math.max(0,r.y-c)
   }
   if(scenario==='second_claim'&&r.riderId==='extra3'&&state.tick>=2&&r.y>1e-6)
    targetY=Math.max(0,r.y-c)
  }
  targetY=r.y+Math.max(-c,Math.min(c,targetY-r.y))
  targetY=Math.max(0,Math.min(3*c-1e-6,targetY))
  return {riderId:r.riderId,forwardMeters,targetY:round(targetY)}
 })
}
function swept(before,after,g){
 const prev=new Map(before.map(r=>[r.riderId,r]))
 const paths=after.map(r=>({riderId:r.riderId,x0:prev.get(r.riderId).meters,x1:r.meters,y0:prev.get(r.riderId).y,y1:r.y}))
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)
  assert(!collide(paths[i],paths[j],{longitudinal:1.8,lateral:g.lateralCollisionM}), 'Unsafe swept bicycles')
}

const scenarios=size>=3?['open','moving_left','immediate_entry','late_entry','reversal',...(size>=4?['second_claim']:[])]:['open']
const grids=['original','rival_forward_8m','rival_back_8m']
const results=[],failures=[]
for(const geometry of BATCH40_GEOMETRIES)for(const headway of [9,18])for(const rearRequest of [55,75])
 for(const scenario of scenarios)for(const policy of ['baseline','slot_intent'])for(const grid of (policy==='baseline'?['original']:grids)){
 const g=validateRoadScenarioV3(geometry),initial=roster(g,headway,scenario)
 if(grid!=='original'){
  const displacement=grid==='rival_forward_8m'?8:-8
  for(const rider of initial)if(rider.riderId==='extra2'||rider.riderId==='extra3')rider.meters+=displacement
 }
 const selected=choose(initial,'rear',geometry).selectedY
 const eventIds=size===2?[]:scenario==='second_claim'?['extra2','extra3']:['extra2']
 const record={riders:size,road:g.id,scenario,grid,policy,headway,rearRequest,technical:'UNKNOWN',officialWrites:0}
 try{
  let physics=begin({riders:initial,geometry,dt}),passing=passStart(physics.riders),
   observer=observeStart({claimantIds:eventIds,laneStepM:g.centerStepM,dt}),
   planner=intentStart(),checkpoint=null,otherNearStop=0,rearNearStop=0
  for(let tick=1;tick<=40;tick++){
   const before=physics.riders,intents=requests(physics,scenario,rearRequest,g,selected)
   if(policy==='slot_intent'){
    const result=intentStep(planner,before,intents,geometry)
    planner=result.state
    var moves=result.intents
    assert(planner.officialWrites===0&&planner.sportingApproval==='NOT_APPROVED')
   }else var moves=intents
   const after=advance(physics,moves)
   swept(before,after.riders,g)
   observer=observeStep(observer,before,after.riders,after.elapsedSeconds)
   passing=passNext(passing,after.riders,after.elapsedSeconds)
   const previous=new Map(before.map(x=>[x.riderId,x]))
   for(const rider of after.riders){
    const distance=rider.meters-previous.get(rider.riderId).meters
    if(rider.riderId.startsWith('extra')&&distance<.5)otherNearStop++
    if(rider.riderId==='rear'&&distance<.5)rearNearStop++
    assert(Number.isFinite(rider.energy.remainingWPrimeJoules)&&rider.energy.remainingWPrimeJoules>=0)
   }
   assert(after.metrics.achievedMeters<=after.metrics.requestedMeters+1e-5)
   assert(after.officialWrites===0&&after.sportingApproval==='NOT_APPROVED')
   physics=after
   if(tick===20)checkpoint=JSON.parse(JSON.stringify({physics,passing,observer,planner}))
  }
  let rerun=checkpoint.physics,rerunPass=checkpoint.passing,rerunObserver=checkpoint.observer,rerunPlanner=checkpoint.planner
  for(let tick=21;tick<=40;tick++){
   const before=rerun.riders,requested=requests(rerun,scenario,rearRequest,g,selected)
   let intents=requested
   if(policy==='slot_intent'){
    const scheduled=intentStep(rerunPlanner,before,requested,geometry)
    rerunPlanner=scheduled.state;intents=scheduled.intents
   }
   rerun=advance(rerun,intents)
   rerunPass=passNext(rerunPass,rerun.riders,rerun.elapsedSeconds)
   rerunObserver=observeStep(rerunObserver,before,rerun.riders,rerun.elapsedSeconds)
  }
  assert.deepEqual(rerun,physics,'Exact physical energy/movement checkpoint')
  assert.deepEqual(rerunPass,passing,'Exact passing checkpoint')
  assert.deepEqual(rerunObserver,observer,'Exact fractional timing checkpoint')
  assert.deepEqual(rerunPlanner,planner,'Exact intent scheduler checkpoint')
  const passed=passing.events.filter(x=>x.passer==='rear'&&x.passed==='lead')
  record.technical='PASS'
  record.sustained60s=passed.some(e=>(e.reversedAtSeconds??passing.elapsedSeconds)-e.atSeconds>=60)
  record.firstPassTickSecond=passed[0]?.atSeconds??null
  record.preciseFirstPassSecond=observer.passEvents[0]?.seconds??null
  record.precisePassCount=observer.passEvents.length
  record.primaryOrder=eventIds.includes('extra2')?classify(observer,'extra2').order:null
  record.secondClaimantOrder=eventIds.includes('extra3')?classify(observer,'extra3').order:null
  record.primaryComplete=eventIds.includes('extra2')?!!observer.laneCompletions.extra2:null
  record.secondClaimantComplete=eventIds.includes('extra3')?!!observer.laneCompletions.extra3:null
  const finalRiders=new Map(physics.riders.map(x=>[x.riderId,x]))
  record.primaryFinalLaneCenterReached=eventIds.includes('extra2')?Math.abs(finalRiders.get('extra2').y-(scenario==='reversal'?2*g.centerStepM:0))<1e-4:null
  record.secondFinalLaneCenterReached=eventIds.includes('extra3')?Math.abs(finalRiders.get('extra3').y)<1e-4:null
  record.primaryFinalY=eventIds.includes('extra2')?round(finalRiders.get('extra2').y):null
  record.secondFinalY=eventIds.includes('extra3')?round(finalRiders.get('extra3').y):null
  record.primaryLaneCompletedAtSeconds=observer.laneCompletions.extra2?.seconds??null
  record.secondLaneCompletedAtSeconds=observer.laneCompletions.extra3?.seconds??null
  record.secondClaimantActualLateralMeters=round(observer.lateralMetres.extra3??0)
  record.primaryReversedDirection=observer.directionReversals.extra2??0
  record.otherNearStopTicks=otherNearStop;record.rearNearStopTicks=rearNearStop
  record.fastStart=policy==='slot_intent'?planner.policy==='fast':null
  record.checkpointExact=true
 }catch(e){
  record.technical='FAIL';record.error=String(e?.stack??e);failures.push(record)
 }
 results.push(record)
 if(record.technical==='FAIL')console.error(JSON.stringify(record))
}
const groups={}
for(const r of results){
 const key=r.scenario+'|'+r.policy+'|'+r.grid
 const a=groups[key]??{scenario:r.scenario,policy:r.policy,grid:r.grid,n:0,passing:0,primaryCompleted:0,secondCompleted:0,primaryFinalCenter:0,secondFinalCenter:0,secondChangedLane:0,firstBefore:0,firstAfter:0,coincident:0,unobserved:0,secondBefore:0,secondAfter:0,secondCoincident:0,secondUnobserved:0,otherNearStopTicks:0,rearNearStopTicks:0}
 a.n++;a.passing+=Number(r.sustained60s)
 a.primaryCompleted+=Number(r.primaryComplete===true);a.secondCompleted+=Number(r.secondClaimantComplete===true)
 a.primaryFinalCenter+=Number(r.primaryFinalLaneCenterReached===true);a.secondFinalCenter+=Number(r.secondFinalLaneCenterReached===true)
 a.secondChangedLane+=Number(r.secondClaimantActualLateralMeters>0)
 a.firstBefore+=Number(r.primaryOrder==='PASS_BEFORE_LANE_COMPLETION')
 a.firstAfter+=Number(r.primaryOrder==='PASS_AFTER_LANE_COMPLETION')
 a.coincident+=Number(r.primaryOrder==='SIMULTANEOUS_OR_NUMERICALLY_UNRESOLVED')
 a.unobserved+=Number(r.primaryOrder==='UNOBSERVED')
 a.secondBefore+=Number(r.secondClaimantOrder==='PASS_BEFORE_LANE_COMPLETION')
 a.secondAfter+=Number(r.secondClaimantOrder==='PASS_AFTER_LANE_COMPLETION')
 a.secondCoincident+=Number(r.secondClaimantOrder==='SIMULTANEOUS_OR_NUMERICALLY_UNRESOLVED')
 a.secondUnobserved+=Number(r.secondClaimantOrder==='UNOBSERVED')
 a.otherNearStopTicks+=r.otherNearStopTicks??0
 a.rearNearStopTicks+=r.rearNearStopTicks??0
 groups[key]=a
}
const report={study:'A2_AFFINE_SUBTICK_EVENT_AND_CLAIMANT_GRID',size,syntheticSeconds:400,
 technicalGate:failures.length?'FAIL':'PASS',sportingApproval:'NOT_APPROVED',officialWrites:0,
 caseCount:results.length,comparison:Object.values(groups),results,failures,
 limitations:['Fractional event times require linear motion across a 10s tick; cannot establish actual nonuniform rider accelerations',
  'A longitudinal center crossing is not a calibrated bicycle-clearance overtaking event',
  'Lane completion defined as crossing 0.5 lane spacing from edge, may precede full original desired lane-center arrival',
  'Three starting grids perturb rivals by +/-8m only, not arbitrary peloton grids or road curvature',
  'No real road profiles, historical realism, full-stage classifications, or live game writes']}
writeFileSync(dir+'/subtick-'+size+'.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({size,gate:report.technicalGate,caseCount:report.caseCount,comparison:report.comparison,failed:failures.length,officialWrites:0}))
assert.equal(failures.length,0,'Subtick audit failure')
