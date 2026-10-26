/** V3 Batch 40 — offline geometry/forecast controlled shadow, never player race writes.
 * Full races are untouched control references, only single-rider steering shadows
 * change and only under the locked actual original road demand.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
import {attributeWheelReservationsV3,selectSafeSinglePreparationV3,pairedOneTickLanePreparationV3} from './wheelReservationAttributionV3.mjs'
import {newQueueTrackerV3,recordQueueTickV3,summarizeQueuesV3,selectPersistentPreparationV3} from './queueReservationV3.mjs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3,predictClearCorridorV3,beginRoadCorridorV3,stepRoadCorridorV3} from './roadWidthLookaheadV3.mjs'
import {measurePelotonSeparationsV3} from './finishOrderSensitivityV3.mjs'
const fixture=process.env.V3_BATCH40_FIXTURE??'dordrecht-2000-10-15',mode=process.env.V3_BATCH40_MODE??'energy'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
assert(['energy','finite_pass'].includes(mode))
const data=batch26Input(fixture),dir=process.env.V3_BATCH40_OUT_DIR??'/tmp/batch40'
mkdirSync(dir,{recursive:true})
const round=x=>Math.round(x*1e6)/1e6,profiles=BATCH40_GEOMETRIES.map(x=>validateRoadScenarioV3(x,data.grid.ridersAcross))
const scenarios=BATCH40_GEOMETRIES.flatMap(g=>[
 {id:g.id+'_early_none',geometry:g,trigger:'early',forecast:false,steeringTicks:3},
 {id:g.id+'_early_forecast',geometry:g,trigger:'early',forecast:true,steeringTicks:3},
 {id:g.id+'_queued_none',geometry:g,trigger:'persistent',forecast:false,steeringTicks:3},
 {id:g.id+'_queued_forecast',geometry:g,trigger:'persistent',forecast:true,steeringTicks:3},
]).concat([
 {id:'baseline_5m_queued_four',geometry:BATCH40_GEOMETRIES[1],trigger:'persistent',forecast:false,steeringTicks:4},
 {id:'baseline_5m_queued_four_forecast',geometry:BATCH40_GEOMETRIES[1],trigger:'persistent',forecast:true,steeringTicks:4},
])
const cases=[]
for(const weather of ['frozen','synthetic_headwind_3_crosswind_2']){
 const runs=[]
 for(const [grid,seed] of [data.seed,'batch28-research-grid-A','batch28-research-grid-B'].entries()){
  const input={...data,seed,experimentalPowerDurationEnergy:true,...(mode==='finite_pass'?{experimentalFinitePassReservation:true}:{}),...(weather==='frozen'?{}:{route:data.route.map(x=>({...x,headwindMps:3,crosswindMps:2}))})}
  const state=initializeCoupledV3(input),queue=newQueueTrackerV3(),road={laneCount:input.grid.ridersAcross,dtSeconds:input.tickSeconds??10,minWheelGapMeters:1.8}
  const arms=scenarios.map(s=>({...s,active:null,waiting:null,decisionOpportunities:0,forecastVetoes:0,starts:0,completions:0,clearNextTick:0,rejected:{},partialExtraJ:0,completedExtraJ:0,changedMovementObservations:0,netCandidateForwardMetres:0,netFieldForwardMetres:0,firstSteeringSecond:null}))
  let firstGap=null
  const firstEvents={},traces=[]
  for(let tick=0;tick<144&&!state.complete;tick++){
   const pre=structuredClone(state.riders.filter(x=>x.finishSeconds===null)),pendingId=state.passingResearch?.pending?.riderId??null
   let observed=null;advanceCoupledV3(input,state,1,sample=>{observed=sample})
   assert(observed?.rows.length===pre.length,'Source observer incomplete')
   const initial=new Map(pre.map(x=>[x.riderId,x]))
   const frozen=observed.rows.map(x=>({riderId:x.riderId,meters:initial.get(x.riderId).meters,lane:x.laneBefore,energy:initial.get(x.riderId).energy,desiredMps:x.commandedMps,tactic:x.riderId===pendingId?'recover':x.tactic}))
   const moves=advanceSpatialPelotonV3(frozen,road)
   for(const m of moves){const x=observed.rows.find(r=>r.riderId===m.riderId);assert(x&&Math.abs(m.meters-x.metersAfter)<2e-5&&m.wheelLimited===x.wheelLimited,'Unreproducible physical source motion')}
   const details=attributeWheelReservationsV3(frozen,moves,road)
   recordQueueTickV3(queue,details.records,state.tick)
   const groups=measurePelotonSeparationsV3(state)
   if(!firstGap&&state.elapsedSeconds>=120&&groups.separateGroups>1)firstGap={second:state.elapsedSeconds,groups:groups.separateGroups}
   const canPick=!pendingId&&!state.passingResearch?.pending&&state.riders.every(r=>r.finishSeconds!==null||moves.some(m=>m.riderId===r.riderId&&m.lane===r.lane))
   const persistent=canPick?selectPersistentPreparationV3(frozen,moves,queue,{laneCount:road.laneCount,minStreak:3}):null
   const early=canPick?selectSafeSinglePreparationV3(frozen,moves,road)?.candidate:null
   for(const arm of arms){
    if(arm.waiting){
     const c=arm.waiting
     let result
     try{result=pairedOneTickLanePreparationV3(frozen,moves,{riderId:c.riderId,fromLane:c.fromLane,toLane:c.toLane},road)}
     catch(e){if(/Stale lane candidate/.test(e.message))result={safe:false,reason:'source_lane_changed'};else throw e}
     if(result.safe){arm.clearNextTick++;arm.changedMovementObservations+=result.changedMovementRiders;arm.netCandidateForwardMetres+=result.deltaCandidateForwardMeters;arm.netFieldForwardMetres+=result.deltaAggregateForwardMeters}
     else arm.rejected['next_tick_'+result.reason]=(arm.rejected['next_tick_'+result.reason]??0)+1
     arm.waiting=null
    }
    if(arm.active){
     const candidate=arm.active
     const advanced=stepRoadCorridorV3(candidate,pre,moves,observed.rows,arm.geometry,{dt:road.dtSeconds,lanes:road.laneCount})
     assert.deepEqual(advanced,stepRoadCorridorV3(JSON.parse(JSON.stringify(candidate)),pre,moves,observed.rows,arm.geometry,{dt:road.dtSeconds,lanes:road.laneCount}),'Shadow checkpoint serialization mismatch')
     if(advanced.phase==='rejected'){arm.partialExtraJ+=advanced.extraWorkJoules;arm.rejected[advanced.reason]=(arm.rejected[advanced.reason]??0)+1;arm.active=null}
     else if(advanced.phase==='complete'){arm.completions++;arm.completedExtraJ+=advanced.extraWorkJoules;arm.waiting=advanced.candidate;arm.active=null}
     else arm.active=advanced
    }
    if(!arm.active&&!arm.waiting&&canPick){
     const candidate=arm.trigger==='persistent'?persistent:early
     const record=candidate&&details.records.find(r=>r.riderId===candidate.riderId)
     if(!candidate||!record?.blocked||record.lossMeters<=0)continue
     arm.decisionOpportunities++
     if(arm.forecast){
      const prediction=predictClearCorridorV3(candidate,frozen,moves,arm.geometry,{reactionTicks:2,steeringTicks:arm.steeringTicks,dt:road.dtSeconds,lanes:road.laneCount})
      if(!prediction.predictedClear){arm.forecastVetoes++;continue}
     }
     const rider=state.riders.find(r=>r.riderId===candidate.riderId)
     if(!rider||rider.lane!==candidate.fromLane)continue
     arm.active=beginRoadCorridorV3(candidate,rider,arm.geometry,arm.trigger,{reactionTicks:2,steeringTicks:arm.steeringTicks,lanes:road.laneCount});arm.starts++
     if(arm.firstSteeringSecond===null)arm.firstSteeringSecond=state.elapsedSeconds
    }
   }
   if(tick===0||tick===5||tick===11||tick===47||tick===95||tick===143)traces.push({elapsedSeconds:state.elapsedSeconds,first30MetreGroups:groups.separateGroups,blocked:details.summary.wheelLimitedRiderTicks,queues:[...queue.streaks.values()].filter(x=>x.length>=3).length,arms:arms.map(a=>({id:a.id,starts:a.starts,completions:a.completions,vetoes:a.forecastVetoes}))})
  }
  const snapshot=JSON.parse(JSON.stringify(state))
  advanceCoupledV3(input,state,100000)
  const result=finalizeCoupledV3(input,state)
  assert(result.officialWrites===0&&result.sportingApproval==='NOT_APPROVED'&&result.finish.length===data.riders.length,'Bad research control')
  advanceCoupledV3(input,snapshot,100000)
  assert.deepEqual(finalizeCoupledV3(input,snapshot),result,'Unrestorable full stage')
  if(grid===0&&weather==='frozen')assert.deepEqual(result,runCoupledV3(input),'Source racing changed')
  const queueSummary=summarizeQueuesV3(queue)
  const summaries=arms.map(({active,waiting,geometry,...a})=>({...a,geometryId:geometry.id,completionPercent:a.starts?round(100*a.completions/a.starts):null,netCandidateForwardMetres:round(a.netCandidateForwardMetres),netFieldForwardMetres:round(a.netFieldForwardMetres),uncompletedAtCutoff:active?.phase??null,pendingNextTick:!!waiting}))
  runs.push({grid,seed,firstGap,queues:queueSummary,profiles,arms:summaries,traces,control:{winner:result.finish[0].riderId,blockedWholeRace:result.movement.wheelLimitedTicks,tailGapSeconds:result.finish.at(-1).gapSeconds},fullBaselineFinish:result.finish,checkpointExact:true})
  console.log(JSON.stringify({fixture,mode,weather,grid,queueMax:queueSummary.longestQueueTicks,baselineGroups:firstGap,arms:summaries.map(a=>({id:a.id,starts:a.starts,forecastsRejected:a.forecastVetoes,completed:a.completions,clearNext:a.clearNextTick,collisionRejected:a.rejected.continuous_collision??0,uncompleted:a.uncompletedAtCutoff})),officialWrites:0,sportingApproval:'NOT_APPROVED'}))
 }
 cases.push({weather,runs})
}
const report={experiment:'BATCH40_ROAD_GEOMETRY_AND_NONCLAIRVOYANT_LOOKAHEAD',fixture,mode,roster:data.riders.length,officialWrites:0,sportingApproval:'NOT_APPROVED',geometry:profiles,experimentalArms:scenarios.length,referenceRaces:cases.reduce((n,c)=>n+c.runs.length,0),referenceNote:'Races run unchanged V3. Only independent lateral shadows vary. No candidate finish classification.',first144TicksOnly:true,cases,limitations:['Road width and bicycle envelopes are sensitivity scenarios, not measured road segments','400 mm UCI minimum handlebar width does not specify rider effective collision envelope','Forecast extrapolates observed constant velocities, never peeks at future source ticks','A forecast can veto but cannot reserve real road space against other independent riders','Lateral shadows freeze factual longitudinal travel and energy on the original full race','No full alternative race results, no playable multi-rider 2D integration','Guangxi climbing proxy missing 718m and World Nations route missing 1065m']}
const path=dir+'/'+fixture+'-'+mode+'-geometry.json';writeFileSync(path,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({fixture,mode,summary:'BATCH40_COMPLETE',controls:report.referenceRaces,profiles:profiles.length,arms:scenarios.length,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
