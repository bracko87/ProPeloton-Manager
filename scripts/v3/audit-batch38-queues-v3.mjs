/** Batch 38 OFFLINE full race references and persistent queue multi-tick shadow.
 * Shadow lanes / reserve are NEVER committed to the coupled race. No official writes.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {measurePelotonSeparationsV3} from './finishOrderSensitivityV3.mjs'
import {attributeWheelReservationsV3} from './wheelReservationAttributionV3.mjs'
import {newQueueTrackerV3,recordQueueTickV3,summarizeQueuesV3,selectPersistentPreparationV3,beginSteeringV3,stepSteeringV3,evaluatePreparedLaneV3} from './queueReservationV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'
const fixture=process.env.V3_BATCH38_FIXTURE??'dordrecht-2000-10-15',mode=process.env.V3_BATCH38_MODE??'energy'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture)&&['energy','finite_pass'].includes(mode))
const source=batch26Input(fixture),dest=process.env.V3_BATCH38_OUT_DIR??'/tmp/v3-batch38'
mkdirSync(dest,{recursive:true})
const seeds=[source.seed,'batch28-research-grid-A','batch28-research-grid-B'],r6=x=>Math.round(x*1e6)/1e6
function arm(duration){return {duration,pending:null,ready:null,lastStart:-9999,starts:0,completed:0,unsafeSweeps:0,wprimeRejected:0,laneChanged:0,nextTickCollision:0,changedMoves:0,changedBlocked:0,spentJ:0,aggregateChangedMetres:0,candidateChangedMetres:0,examples:[]}}
const regimes=[]
for(const regime of ['frozen','synthetic_wind']){
 const races=[]
 for(let seedIndex=0;seedIndex<seeds.length;seedIndex++){
  const input={...source,seed:seeds[seedIndex],experimentalPowerDurationEnergy:true,...(mode==='finite_pass'?{experimentalFinitePassReservation:true}:{}),...(regime==='synthetic_wind'?{route:source.route.map(r=>({...r,headwindMps:3,crosswindMps:2}))}:{})}
  const state=initializeCoupledV3(input),tracker=newQueueTrackerV3(),a3=arm(3),a4=arm(4),samples=[]
  const first={obstruction:null,queue3:null,queue6:null,split30m:null},totals={blockedRiderTicks:0,actualLostMetres:0}
  for(let tick=1;tick<=144&&!state.complete;tick++){
   const before=structuredClone(state.riders.filter(r=>r.finishSeconds===null)),old=new Map(before.map(x=>[x.riderId,x]))
   const passing=state.passingResearch?.pending?.riderId??null
   let observed=null
   advanceCoupledV3(input,state,1,value=>{observed=value})
   assert(observed&&observed.rows.length===before.length,'Trace roster missing')
   const physical=observed.rows.map(x=>{const oldR=old.get(x.riderId);assert(oldR);return {riderId:x.riderId,meters:oldR.meters,lane:oldR.lane,energy:oldR.energy,desiredMps:x.commandedMps,tactic:passing===x.riderId?'recover':x.tactic}})
   const road={laneCount:input.grid.ridersAcross,dtSeconds:input.tickSeconds??10,minWheelGapMeters:1.8}
   const movement=advanceSpatialPelotonV3(physical,road),byMove=new Map(movement.map(x=>[x.riderId,x]))
   for(const x of observed.rows){const y=byMove.get(x.riderId);assert(y&&Math.abs(y.meters-x.metersAfter)<2e-5&&y.wheelLimited===x.wheelLimited,'Unchanged physics failed reproduction');if(y.lane!==x.laneAfter)assert(passing===x.riderId,'Unexplained physical lane commit')}
   const attribution=attributeWheelReservationsV3(physical,movement,road)
   const status=recordQueueTickV3(tracker,attribution.records,tick)
   totals.blockedRiderTicks+=attribution.summary.wheelLimitedRiderTicks;totals.actualLostMetres+=attribution.summary.actualLostMeters
   if(first.obstruction===null&&attribution.summary.wheelLimitedRiderTicks)first.obstruction=observed.elapsedSeconds
   if(first.queue3===null&&status.atLeast3)first.queue3=observed.elapsedSeconds
   if(first.queue6===null&&status.atLeast6)first.queue6=observed.elapsedSeconds
   const groups=measurePelotonSeparationsV3(state,30)
   if(first.split30m===null&&observed.elapsedSeconds>=120&&groups.separateGroups>1)first.split30m=observed.elapsedSeconds
   for(const arm of [a3,a4]){
    if(arm.ready){
     const ready=arm.ready;arm.ready=null
     try{
      const delta=evaluatePreparedLaneV3(ready,physical,movement,road)
      if(!delta.safe)arm.nextTickCollision++
      else{arm.completed++;arm.changedMoves+=delta.changedMovementRiders;arm.changedBlocked+=delta.changedWheelFlagRiders;arm.spentJ+=delta.extraWorkJoules;arm.aggregateChangedMetres+=delta.deltaAggregateForwardMeters;arm.candidateChangedMetres+=delta.deltaCandidateForwardMeters}
      if(arm.examples.length<20)arm.examples.push({tick,safe:delta.safe,reason:delta.reason,additionalWorkJ:delta.extraWorkJoules??0,affectedRiders:delta.changedMovementRiders??0,deltaRiderMetres:delta.deltaCandidateForwardMeters??null})
     }catch(error){if(error instanceof Error&&/Stale lane candidate|Reservation not completed/.test(error.message))arm.laneChanged++;else throw error}
    }
    if(arm.pending){
     const tested=stepSteeringV3(arm.pending,physical,movement,observed.rows,{gap:1.8,dt:road.dtSeconds})
     if(tested.rejected){if(tested.rejected==='wprime_insufficient')arm.wprimeRejected++;else if(tested.rejected==='swept_lane_conflict')arm.unsafeSweeps++;else arm.laneChanged++;arm.pending=null}
     else if(tested.completed){arm.ready=structuredClone(tested);arm.pending=null}
    }
    if(!arm.pending&&!arm.ready&&tick-arm.lastStart>=8&&tick<=120&&!state.passingResearch?.pending){
     const proposal=selectPersistentPreparationV3(physical,movement,tracker,{laneCount:road.laneCount,minGap:1.8,minStreak:3})
     if(proposal){const rider=state.riders.find(x=>x.riderId===proposal.riderId)
      if(rider&&rider.finishSeconds===null&&rider.lane===proposal.fromLane){arm.pending=beginSteeringV3(proposal,rider,{reactionTicks:2,durationTicks:arm.duration,extraWatts:35});arm.lastStart=tick;arm.starts++}
     }
    }
   }
   if([1,3,5,8,12,24,48,96,144].includes(tick))samples.push({second:observed.elapsedSeconds,blocked:attribution.summary.wheelLimitedRiderTicks,queue3:status.atLeast3,queue6:status.atLeast6,groupCount:groups.separateGroups})
  }
  const saved=JSON.parse(JSON.stringify(state))
  advanceCoupledV3(input,state,100000)
  const finish=finalizeCoupledV3(input,state)
  assert(finish.officialWrites===0&&finish.sportingApproval==='NOT_APPROVED'&&finish.finish.length===source.riders.length)
  if(seedIndex===0&&regime==='frozen')assert.deepEqual(finish,runCoupledV3(input),'Read-only queue monitor modified race')
  advanceCoupledV3(input,saved,100000);assert.deepEqual(finalizeCoupledV3(input,saved),finish,'Checkpoint did not exactly recover')
  const queue=summarizeQueuesV3(tracker)
  const arms=[a3,a4].map(a=>({durationTicks:a.duration,starts:a.starts,completedSafe:a.completed,unsafeSweeps:a.unsafeSweeps,wprimeRejected:a.wprimeRejected,laneChanged:a.laneChanged,nextTickCollision:a.nextTickCollision,changedMovementObservations:a.changedMoves,changedBlockedObservations:a.changedBlocked,additionalMechanicalWorkJ:r6(a.spentJ),sumChangedFieldForwardMetres:r6(a.aggregateChangedMetres),sumChangedCandidateForwardMetres:r6(a.candidateChangedMetres),examples:a.examples}))
  const row={seedIndex,seed:seeds[seedIndex],first,queue,totals:{blockedRiderTicks:totals.blockedRiderTicks,lostForwardMetres:r6(totals.actualLostMetres)},arms,samples,controlFinish:finish.finish,controlTailGapSeconds:finish.finish.at(-1).gapSeconds,controlBlockingWholeRace:finish.movement.wheelLimitedTicks,checkpointExact:true}
  races.push(row)
  console.log(JSON.stringify({fixture,mode,regime,seedIndex,first,blocked:totals.blockedRiderTicks,queues3:queue.uniqueRiders3,queues12:queue.uniqueRiders12,longestQueueTicks:queue.longestQueueTicks,arms:arms.map(x=>({duration:x.durationTicks,started:x.starts,completed:x.completedSafe,rejectedSweeps:x.unsafeSweeps,rejectedEnergy:x.wprimeRejected,affected:x.changedMovementObservations,workJ:x.additionalMechanicalWorkJ})),officialWrites:0,sportingApproval:'NOT_APPROVED'}))
 }
 regimes.push({regime,races})
}
const report={experiment:'BATCH38_OFFLINE_PERSISTENT_QUEUES',fixture,mode,roster:source.riders.length,officialWrites:0,sportingApproval:'NOT_APPROVED',observedTicks:144,regimes,limitations:['No continuous lateral steering integration: full destination lane clearance is tested during three/four ticks but hypothetical lane assignment occurs only at the boundary','The extra watts debit is a counterfactual W-prime ledger, never applied to an actual race','Candidate next-tick movement is computed on frozen baseline demand, independently reset after every comparison','Independent forward-movement deltas are not additive and cannot be interpreted as a race improvement','Guangxi proxy route missing 718m ascent, Dordrecht sprint commands approximated; synthetic weather and power remain provisional']}
const path=dest+'/'+fixture+'-'+mode+'-batch38-queues.json';writeFileSync(path,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({fixture,mode,status:'BATCH38_COMPLETE',referenceRaces:6,path,sportingApproval:'NOT_APPROVED',officialWrites:0}))
