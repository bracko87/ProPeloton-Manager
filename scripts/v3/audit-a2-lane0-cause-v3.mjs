/** A2 offline diagnostic: isolate why rear lane 0 loses all 80 open-road
 * sustained passes. Compare default intent-aware selection with voluntarily
 * staying in the already unoccupied outer lane. No production physics edits.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSimultaneousMicroV3 as start,advanceSimultaneousMicroV3 as advance} from './simultaneousConflictResearchV3.mjs'
import {initializeIntentAwareCorridorV3 as startPolicy,advanceIntentAwareCorridorV3 as plan} from './a2IntentAwareCorridorV3.mjs'
import {initializePersistentPassTrackerV3 as startPassing,advancePersistentPassTrackerV3 as trackPassing} from './a2PersistentPassesV3.mjs'
import {selectEarlyCorridorV3 as choose} from './a2EarlyCorridorV3.mjs'
import {continuousBicycleCollisionV3 as collide} from './continuousLateralResearchV3.mjs'
const dir=process.env.V3_A2_LANE0_DIR??'/tmp/v3-lane0-cause'
mkdirSync(dir,{recursive:true})
const cases=[],failures=[],round=x=>Math.round(x*1e6)/1e6
function initial(g,size,headway){
 const c=g.centerStepM,r=[
  {riderId:'lead',meters:118,y:c,speedMps:4,cpWatts:245,wPrimeJoules:18000},
  {riderId:'rear',meters:118-headway,y:0,speedMps:4,cpWatts:325,wPrimeJoules:23000}]
 for(let i=2;i<size;i++)r.push({riderId:'extra'+i,meters:76-(i-2)*24,y:i%2===0?3*c-1e-6:0,
  speedMps:4,cpWatts:230,wPrimeJoules:18000})
 return r
}
function actions(state,rearRequest){
 return state.riders.map(r=>({riderId:r.riderId,forwardMeters:r.riderId==='rear'?rearRequest:r.riderId==='lead'?45:42,targetY:r.y}))
}
function swept(before,after,g){
 const prev=new Map(before.map(r=>[r.riderId,r]))
 for(let i=0;i<after.length;i++)for(let j=i+1;j<after.length;j++){
  const x=after[i],y=after[j],p=prev.get(x.riderId),q=prev.get(y.riderId)
  assert(!collide({x0:p.meters,x1:x.meters,y0:p.y,y1:x.y},{x0:q.meters,x1:y.meters,y0:q.y,y1:y.y},
   {longitudinal:1.8,lateral:g.lateralCollisionM}))
 }
}
for(let size=2;size<=6;size++)for(const geometry of BATCH40_GEOMETRIES)
 for(const headway of [9,18])for(const rearRequest of [55,75]){
 const g=validateRoadScenarioV3(geometry),roster=initial(g,size,headway)
 const candidate=choose(roster,'rear',geometry)
 assert(candidate.candidates.length===1&&candidate.selectedY===g.centerStepM,'Outer lane choice should be one adjacent track')
 assert(candidate.candidates[0].blockingRiders>=1,'The only adjacent lane is occupied by the leader')
 for(const policy of ['intent_aware','stay_lane_0']){
  const row={size,road:g.id,headway,rearRequest,policy,gate:'UNKNOWN',
   initiallySelectedAdjacentLane:candidate.selectedY,adjacentBlockers:candidate.candidates[0].blockingRiders}
  try{
   let state=start({riders:roster,geometry,dt:10}),tracking=startPassing(state.riders),slot=startPolicy()
   let saved=null,firstTicks=[],nearStopRear=0
   for(let t=1;t<=40;t++){
    const before=state.riders
    const requested=actions(state,rearRequest)
    const response=policy==='intent_aware'?plan(slot,before,requested,geometry):null
    if(response)slot=response.state
    const move=response?.intents??requested
    state=advance(state,move)
    swept(before,state.riders,g)
    tracking=trackPassing(tracking,state.riders,state.elapsedSeconds)
    assert(state.riders.every(r=>Number.isFinite(r.energy.remainingWPrimeJoules)&&r.energy.remainingWPrimeJoules>=0))
    assert(state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED')
    const r0=before.find(r=>r.riderId==='rear'),r1=state.riders.find(r=>r.riderId==='rear')
    if(r1.meters-r0.meters<.5)nearStopRear++
    if(t<=5)firstTicks.push({tick:t,requestedTarget:round(move.find(m=>m.riderId==='rear').targetY),
     achievedY:round(r1.y),rearMeters:round(r1.meters),leaderMeters:round(state.riders.find(r=>r.riderId==='lead').meters),
     slotPhase:response?.state.planner?.phase??null})
    if(t===20)saved=JSON.parse(JSON.stringify({state,tracking,slot}))
   }
   let replay=saved.state,track=saved.tracking,replaySlot=saved.slot
   for(let t=21;t<=40;t++){
    const requested=actions(replay,rearRequest),before=replay.riders
    const response=policy==='intent_aware'?plan(replaySlot,before,requested,geometry):null
    if(response)replaySlot=response.state
    replay=advance(replay,response?.intents??requested)
    track=trackPassing(track,replay.riders,replay.elapsedSeconds)
   }
   assert.deepEqual(replay,state);assert.deepEqual(track,tracking);assert.deepEqual(replaySlot,slot)
   const passed=tracking.events.filter(e=>e.passer==='rear'&&e.passed==='lead')
   row.sustained60s=passed.some(e=>(e.reversedAtSeconds??tracking.elapsedSeconds)-e.atSeconds>=60)
   row.firstPassSecond=passed[0]?.atSeconds??null
   const lastRear=state.riders.find(r=>r.riderId==='rear'),lastLead=state.riders.find(r=>r.riderId==='lead')
   row.finalLeadGapM=round(lastRear.meters-lastLead.meters)
   row.endRearY=round(lastRear.y)
   row.rearNearStopTicks=nearStopRear;row.blockedRiderTicks=state.metrics.blockedRiderTicks
   row.firstFiveTicks=firstTicks
   row.slotInitialChoice=slot.initialScreen
   row.gate='PASS'
  }catch(e){row.gate='FAIL';row.reason=String(e?.stack??e);failures.push(row)}
  cases.push(row)
 }
}
const groups={}
for(const row of cases){
 const x=groups[row.policy]??{policy:row.policy,technical:0,sustained:0,cases:0,rearNearStops:0,negativeFinalGap:0,stayedAtLane0:0}
 x.cases++;x.technical+=Number(row.gate==='PASS');x.sustained+=Number(row.sustained60s)
 x.rearNearStops+=row.rearNearStopTicks??0;x.negativeFinalGap+=Number(row.finalLeadGapM<=0)
 x.stayedAtLane0+=Number(row.endRearY===0);groups[row.policy]=x
}
const output={study:'A2_LANE_ZERO_COUNTERFACTUAL',technicalGate:failures.length?'FAIL':'PASS',
 cases:cases.length,groups:Object.values(groups),results:cases,failures,officialWrites:0,sportingApproval:'NOT_APPROVED'}
writeFileSync(dir+'/lane0-control.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({technicalGate:output.technicalGate,cases:output.cases,groups:output.groups,
 sample:cases.filter(r=>r.size===2&&r.road==='baseline_5m'&&r.headway===9&&r.rearRequest===55).map(r=>({policy:r.policy,first:r.firstFiveTicks,finalGap:r.finalLeadGapM,pass:r.sustained60s})),
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
assert.equal(failures.length,0,'Lane-0 counterfactual failed safety')
