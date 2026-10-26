/** Batch 41 OFFLINE coordinated prospective multi-rider reservations.
 * This is an actual live reservation STATE for independent shadows only:
 * the same 24 baseline race simulations are NEVER modified by it.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {planAnticipatoryLanesV3} from '../../src/race-engine-v3/anticipatoryLaneResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
import {attributeWheelReservationsV3} from './wheelReservationAttributionV3.mjs'
import {newQueueTrackerV3,recordQueueTickV3,summarizeQueuesV3} from './queueReservationV3.mjs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {createCorridorCoordinatorV3,advanceCorridorCoordinatorV3,admitCorridorReservationsV3} from './coordinatedCorridorV3.mjs'
import {measurePelotonSeparationsV3} from './finishOrderSensitivityV3.mjs'
const fixture=process.env.V3_BATCH41_FIXTURE??'dordrecht-2000-10-15',mode=process.env.V3_BATCH41_MODE??'energy'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture)&&['energy','finite_pass'].includes(mode))
const source=batch26Input(fixture),outputDir=process.env.V3_BATCH41_OUT_DIR??'/tmp/v3-batch41'
mkdirSync(outputDir,{recursive:true})
const policies=[BATCH40_GEOMETRIES[1],BATCH40_GEOMETRIES[2]].flatMap(geometry=>[1,3].flatMap(capacity=>[false,true].map(forecast=>({id:geometry.id+'_cap'+capacity+'_'+(forecast?'forecast':'no_forecast'),geometry,capacity,forecast}))))
const round=x=>Math.round(x*1e6)/1e6
const cases=[]
for(const weather of ['frozen','synthetic_headwind_3_crosswind_2']){
 const races=[]
 for(const [grid,seed] of [source.seed,'batch28-research-grid-A','batch28-research-grid-B'].entries()){
  const input={...source,seed,experimentalPowerDurationEnergy:true,...(mode==='finite_pass'?{experimentalFinitePassReservation:true}:{}),...(weather==='frozen'?{}:{route:source.route.map(x=>({...x,headwindMps:3,crosswindMps:2}))})}
  const state=initializeCoupledV3(input),road={laneCount:input.grid.ridersAcross,dtSeconds:input.tickSeconds??10,minWheelGapMeters:1.8}
  const queue=newQueueTrackerV3()
  const coord=policies.map(policy=>({...policy,state:createCorridorCoordinatorV3({...policy,lanes:road.laneCount,steeringTicks:3})}))
  const checks={sourceMatchingTicks:0,sourceMoves:0,proposedAtTicks:0,allProposals:0,firstGap:null}
  const samples=[]
  for(let tick=0;tick<144&&!state.complete;tick++){
   const before=structuredClone(state.riders.filter(r=>r.finishSeconds===null))
   const pendingId=state.passingResearch?.pending?.riderId??null
   let sourceTick=null
   advanceCoupledV3(input,state,1,r=>{sourceTick=r})
   assert(sourceTick?.rows.length===before.length,'Missing source observation')
   const from=new Map(before.map(x=>[x.riderId,x]))
   const frozen=sourceTick.rows.map(x=>({riderId:x.riderId,meters:from.get(x.riderId).meters,lane:x.laneBefore,energy:from.get(x.riderId).energy,desiredMps:x.commandedMps,tactic:x.riderId===pendingId?'recover':x.tactic}))
   const moves=advanceSpatialPelotonV3(frozen,road)
   for(const m of moves){
    const x=sourceTick.rows.find(x=>x.riderId===m.riderId)
    assert(x&&Math.abs(m.meters-x.metersAfter)<2e-5&&m.wheelLimited===x.wheelLimited,'Unmatched existing physical solver')
    if(m.lane!==x.laneAfter)assert(x.riderId===pendingId&&Math.abs(m.lane-x.laneAfter)===1,'Unexpected baseline lane movement')
   }
   checks.sourceMatchingTicks++;checks.sourceMoves+=moves.length
   const attributed=attributeWheelReservationsV3(frozen,moves,road)
   recordQueueTickV3(queue,attributed.records,state.tick)
   const grouping=measurePelotonSeparationsV3(state)
   if(!checks.firstGap&&state.elapsedSeconds>=120&&grouping.separateGroups>1)checks.firstGap={second:state.elapsedSeconds,groups:grouping.separateGroups}
   const canPropose=!pendingId&&!state.passingResearch?.pending&&state.riders.every(r=>r.finishSeconds!==null||moves.some(m=>m.riderId===r.riderId&&m.lane===r.lane))
   let offered=[]
   if(canPropose){
    let plan
    try{plan=planAnticipatoryLanesV3(frozen,moves,road.laneCount,road.minWheelGapMeters)}
    catch(e){if(e.message!=='Invalid anticipatory bicycle placement')throw e}
    const attr=new Map(attributed.records.map(x=>[x.riderId,x]))
    if(plan)offered=plan.riders.filter(p=>p.promoted&&p.fromLane!==p.lane&&attr.get(p.riderId)?.blocked&&attr.get(p.riderId)?.lossMeters>1e-5)
      .map(p=>({riderId:p.riderId,fromLane:p.fromLane,toLane:p.lane}))
   }
   if(offered.length){checks.proposedAtTicks++;checks.allProposals+=offered.length}
   const lengths=Object.fromEntries([...queue.streaks].map(([id,x])=>[id,x.length]))
   const end=moves.map(x=>({riderId:x.riderId,meters:x.meters,lane:x.lane,speedMps:x.speedMps}))
   for(const arm of coord){
    arm.state=advanceCorridorCoordinatorV3(arm.state,{before:frozen,moves,trace:sourceTick.rows,geometry:arm.geometry,road})
    if(offered.length){
     const startState=JSON.parse(JSON.stringify(arm.state))
     const next=admitCorridorReservationsV3(arm.state,{proposals:offered,atEnd:end,before:frozen,moves,sourceRiders:state.riders,geometry:arm.geometry,dt:road.dtSeconds,queueLengths:lengths})
     assert.deepEqual(next,admitCorridorReservationsV3(startState,{proposals:offered,atEnd:end,before:frozen,moves,sourceRiders:state.riders,geometry:arm.geometry,dt:road.dtSeconds,queueLengths:lengths}),'Determinism across JSON checkpoint')
     arm.state=next
    }
   }
   if([0,4,8,11,23,47,95,143].includes(tick))samples.push({second:state.elapsedSeconds,sourceOffers:offered.length,groupCount:grouping.separateGroups,coordinators:coord.map(x=>({id:x.id,active:x.state.active.length,admitted:x.state.stats.admitted,completed:x.state.stats.completed,conflicts:x.state.stats.reservationConflicts}))})
  }
  const checkpoint=JSON.parse(JSON.stringify(state))
  advanceCoupledV3(input,state,100000)
  const result=finalizeCoupledV3(input,state)
  assert(result.officialWrites===0&&result.sportingApproval==='NOT_APPROVED'&&result.finish.length===source.riders.length)
  advanceCoupledV3(input,checkpoint,100000)
  assert.deepEqual(finalizeCoupledV3(input,checkpoint),result,'Unrestorable whole-stage baseline')
  if(grid===0&&weather==='frozen')assert.deepEqual(result,runCoupledV3(input),'Observer altered source engine')
  const summaries=coord.map(x=>({id:x.id,geometryId:x.geometry.id,capacity:x.capacity,forecast:x.forecast,...x.state.stats,unfinishedAtCutoff:x.state.active.length,waitingNext:x.state.waiting.length,examples:x.state.examples}))
  races.push({grid,seed,checks,queue:summarizeQueuesV3(queue),coordinators:summaries,samples,fullReferenceFinish:result.finish,tailGapSeconds:result.finish.at(-1).gapSeconds,officialWrites:0,checkpointExact:true})
  console.log(JSON.stringify({fixture,mode,weather,grid,sourceOffered:checks.allProposals,coordinators:summaries.map(x=>({id:x.id,decisions:x.decisions,admitted:x.admitted,peakConcurrent:x.maxConcurrent,multiConcurrentTicks:x.multiConcurrentTicks,reservationConflicts:x.reservationConflicts,completed:x.completed,actualCollisions:x.physicalCollisions,nextSafe:x.validNextTick,capacityRejections:x.blockedByCapacity})),officialWrites:0,sportingApproval:'NOT_APPROVED'}))
 }
 cases.push({weather,races})
}
const out={experiment:'BATCH41_MULTIRIDER_2D_RESERVATION_SHADOW',fixture,mode,roster:source.riders.length,officialWrites:0,sportingApproval:'NOT_APPROVED',baselineFullRaces:cases.reduce((n,x)=>n+x.races.length,0),policies:policies.map(x=>({id:x.id,capacity:x.capacity,geometryId:x.geometry.id,forecast:x.forecast})),cases,limitations:['Reservation arbitration is a stateful SHADOW, not integrated into coupled live physics','Forecasters use observed current velocities only and can be surprised by future moves','Each accepted motion keeps its unchanged baseline forward distance; no new rider speed or full finish result exists','Other riders do not actively yield to shadow reservations; road occupancy is not enforced on the real field','Actual reference field may itself contain overlapping 2D interpolated trajectories of discrete source lane moves','Bicycle/road width assumptions not measured stage widths','Guangxi profile misses 718m of reported ascent and World Nations route still misses 1065m']}
const file=outputDir+'/'+fixture+'-'+mode+'-coordinated.json';writeFileSync(file,JSON.stringify(out,null,2)+'\n')
console.log(JSON.stringify({fixture,mode,summary:'BATCH41_COMPLETE',controls:out.baselineFullRaces,officialWrites:0,sportingApproval:'NOT_APPROVED',file}))
