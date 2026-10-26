/** Batch 39 — OFFLINE only. 2D continuous lateral steering vs unchanged V3 races.
 * No source engine writes, no longitudinal motion changes, no game clock updates.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
import {attributeWheelReservationsV3,pairedOneTickLanePreparationV3} from './wheelReservationAttributionV3.mjs'
import {newQueueTrackerV3,recordQueueTickV3,summarizeQueuesV3,selectPersistentPreparationV3} from './queueReservationV3.mjs'
import {startContinuousPassV3,advanceContinuousPassV3,continuousPassCompletedV3} from './continuousLateralResearchV3.mjs'
import {measurePelotonSeparationsV3} from './finishOrderSensitivityV3.mjs'
const fixture=process.env.V3_BATCH39_FIXTURE??'dordrecht-2000-10-15',mode=process.env.V3_BATCH39_MODE??'energy'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture));assert(['energy','finite_pass'].includes(mode))
const source=batch26Input(fixture),dir=process.env.V3_BATCH39_OUT_DIR??'/tmp/v3-batch39';mkdirSync(dir,{recursive:true})
const round=x=>Math.round(x*1e6)/1e6
const cases=[]
for(const weather of ['frozen','synthetic_headwind_3_crosswind_2']){
 const races=[]
 for(const [grid,seed] of [source.seed,'batch28-research-grid-A','batch28-research-grid-B'].entries()){
  const input={...source,seed,experimentalPowerDurationEnergy:true,...(mode==='finite_pass'?{experimentalFinitePassReservation:true}:{}),...(weather==='frozen'?{}:{route:source.route.map(x=>({...x,headwindMps:3,crosswindMps:2}))})}
  let state=initializeCoupledV3(input)
  const queue=newQueueTrackerV3(),road={laneCount:input.grid.ridersAcross,dtSeconds:input.tickSeconds??10,minWheelGapMeters:1.8}
  const arms=[3,4].map(steeringTicks=>({steeringTicks,active:null,waiting:null,started:0,complete:0,clearNextTick:0,reasons:{},totalSurchargeJ:0,affectedRiderObservations:0,changedBlockedStatus:0,deltaForwardMetres:0,firstCompletedSecond:null,examples:[]}))
  const snapshots=[];let firstGroup=null,sourceMissing=0,selectedCandidates=0
  for(let t=0;t<144&&!state.complete;t++){
   const pre=structuredClone(state.riders.filter(x=>x.finishSeconds===null));const pending=state.passingResearch?.pending?.riderId??null
   let trace=null
   advanceCoupledV3(input,state,1,x=>{trace=x})
   assert(trace?.rows.length===pre.length,'Incomplete source solver trace')
   const sourceMap=new Map(pre.map(x=>[x.riderId,x]))
   const frozen=trace.rows.map(x=>({riderId:x.riderId,meters:sourceMap.get(x.riderId).meters,lane:x.laneBefore,energy:sourceMap.get(x.riderId).energy,desiredMps:x.commandedMps,tactic:x.riderId===pending?'recover':x.tactic}))
   const moves=advanceSpatialPelotonV3(frozen,road)
   for(const x of moves){const a=trace.rows.find(r=>r.riderId===x.riderId);assert(a&&Math.abs(x.meters-a.metersAfter)<2e-5&&x.wheelLimited===a.wheelLimited,'Actual solver baseline mismatch')}
   const attributed=attributeWheelReservationsV3(frozen,moves,road)
   recordQueueTickV3(queue,attributed.records,state.tick)
   const grouped=measurePelotonSeparationsV3(state)
   if(firstGroup===null&&state.elapsedSeconds>=120&&grouped.separateGroups>1)firstGroup={second:state.elapsedSeconds,groups:grouped.separateGroups}
   // Only shadow state mutates, never the state used by original coupled V3.
   for(const arm of arms){
    if(arm.waiting){
     const c=arm.waiting
     let compared
     try{compared=pairedOneTickLanePreparationV3(frozen,moves,{riderId:c.riderId,fromLane:c.fromLane,toLane:c.toLane},road)}
     catch(e){if(/Stale lane candidate/.test(e.message))compared={safe:false,reason:'original_lane_changed'};else throw e}
     if(compared.safe){arm.clearNextTick++;arm.affectedRiderObservations+=compared.changedMovementRiders;arm.changedBlockedStatus+=compared.changedWheelFlagRiders;arm.deltaForwardMetres+=compared.deltaAggregateForwardMeters
      if(arm.examples.length<7)arm.examples.push({tick:state.tick,finishedSteeringAtTick:c.finishedSteeringAtTick,candidateId:c.riderId,deltaCandidateMetres:compared.deltaCandidateForwardMeters,deltaFieldMetres:compared.deltaAggregateForwardMeters,changed:compared.changedMovementRiders})
     }else arm.reasons['next_tick_'+(compared.reason??'unsafe')]=(arm.reasons['next_tick_'+(compared.reason??'unsafe')]??0)+1
     arm.waiting=null
    }
    if(arm.active){
     const was=arm.active
     // Serializing every shadow checkpoint must be semantically lossless.
     const next=advanceContinuousPassV3(was,pre,moves,trace.rows,{dt:road.dtSeconds,lanes:road.laneCount})
     const checked=advanceContinuousPassV3(JSON.parse(JSON.stringify(was)),pre,moves,trace.rows,{dt:road.dtSeconds,lanes:road.laneCount})
     assert.deepEqual(next,checked,'Continuous steering JSON checkpoint mismatch')
     if(next.phase==='rejected'){
      arm.reasons[next.reason]=(arm.reasons[next.reason]??0)+1;arm.active=null
     }else if(continuousPassCompletedV3(next)){
      arm.complete++;arm.totalSurchargeJ+=next.extraWorkJoules
      if(arm.firstCompletedSecond===null)arm.firstCompletedSecond=state.elapsedSeconds
      arm.waiting={riderId:next.riderId,fromLane:next.fromLane,toLane:next.toLane,finishedSteeringAtTick:state.tick}
      arm.active=null
     }else arm.active=next
    }
   }
   const eligible=!pending&&!state.passingResearch?.pending&&state.riders.every(r=>r.finishSeconds!==null||r.lane===moves.find(m=>m.riderId===r.riderId)?.lane)
   let candidate=null
   if(eligible&&arms.some(a=>!a.active&&!a.waiting))candidate=selectPersistentPreparationV3(frozen,moves,queue,{laneCount:road.laneCount,minStreak:3})
   if(candidate){selectedCandidates++
    const rider=state.riders.find(x=>x.riderId===candidate.riderId)
    for(const arm of arms)if(!arm.active&&!arm.waiting){arm.active=startContinuousPassV3(candidate,rider,{reactionTicks:2,steeringTicks:arm.steeringTicks,extraWatts:35});arm.started++}
   }
   if(t===0||t===4||t===9||t===11||t===23||t===47||t===95||t===143)snapshots.push({second:state.elapsedSeconds,groups:grouped.separateGroups,queueNow:[...queue.streaks.values()].filter(x=>x.length>=3).length,blocked:attributed.summary.wheelLimitedRiderTicks,continuous:arms.map(a=>({duration:a.steeringTicks,phase:a.active?.phase??'none',progress:a.active?.progress??null,started:a.started,completed:a.complete}))})
  }
  const cp=JSON.parse(JSON.stringify(state))
  advanceCoupledV3(input,state,100000)
  const finished=finalizeCoupledV3(input,state)
  assert(finished.sportingApproval==='NOT_APPROVED'&&finished.officialWrites===0&&finished.finish.length===source.riders.length)
  assert(finished.finish.every((x,i)=>x.rank===i+1&&Number.isFinite(x.finishSeconds)))
  advanceCoupledV3(input,cp,100000);assert.deepEqual(finalizeCoupledV3(input,cp),finished,'Batch39 full baseline checkpoint divergence')
  if(weather==='frozen'&&grid===0)assert.deepEqual(finished,runCoupledV3(input),'Unmodified baseline run drift')
  const summary=summarizeQueuesV3(queue)
  const armReports=arms.map(({active,waiting,...a})=>({...a,unfinishedActive:active?.phase??null,waitingForNextTick:!!waiting,deltaForwardMetres:round(a.deltaForwardMetres)}))
  races.push({grid,seed,queues:summary,arms:armReports,firstGroup,snapshots,originalFinish:finished.finish,checkpointExact:true,baselineWheelLimitedTicks:finished.movement.wheelLimitedTicks})
  console.log(JSON.stringify({fixture,mode,weather,grid,roster:source.riders.length,queueMax:summary.longestQueueTicks,atLeast12:summary.uniqueRiders12,arms:armReports.map(a=>({ticks:a.steeringTicks,started:a.started,completed:a.complete,clearNextTick:a.clearNextTick,reasons:a.reasons,extraJ:a.totalSurchargeJ,affected:a.affectedRiderObservations,deltaForwardMetres:a.deltaForwardMetres})),firstGroup,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
 }
 cases.push({weather,races})
}
const report={kind:'V3_BATCH39_OFFLINE_CONTINUOUS_STEERING',fixture,mode,roster:source.riders.length,sportingApproval:'NOT_APPROVED',officialWrites:0,geometry:{laneCentersMetres:1,provisionalBikeWidthMetres:.55,additionalLateralClearanceMetres:.25,longitudinalMinimumMetres:1.8,interTickLateralSteeringMetres:1/3,steeringTicks:[3,4],reactionTicks:2,surchargeWatts:35},reference:'24 fully independent whole-race baselines across 4 matrix jobs',cases,limitations:['2D rectangle-sweep safety is an offline geometrical research model; 1m lane spacing/0.55m bicycle width are provisional','Multi-tick alternate longitudinal trajectory is frozen to baseline. No feedback on later aerodynamics, power commands or actual peloton movements','Each pass is a separately reset shadow; summed delta is not a race improvement','Interpolated competitor lateral trajectories are an approximation of existing discrete lane decisions','Source route fidelity blocked: Guangxi climbing missing 718m and World Nations legacy route missing 1065m','The energy shadow advances its own W-prime ledger, not the actual race result']}
const file=dir+'/'+fixture+'-'+mode+'-continuous.json';writeFileSync(file,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({fixture,mode,summary:'BATCH39_COMPLETE',baselineFullRaces:cases.reduce((n,x)=>n+x.races.length,0),file,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
