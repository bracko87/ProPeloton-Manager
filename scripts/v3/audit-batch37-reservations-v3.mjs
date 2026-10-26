/** OFFLINE Batch37: exact wheel-reservation attribution and next-tick safe lane replay.
 * Full race only baseline control; all experimental arms are independent one-tick tests.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {attributeWheelReservationsV3,selectSafeSinglePreparationV3,pairedOneTickLanePreparationV3} from './wheelReservationAttributionV3.mjs'
import {measurePelotonSeparationsV3} from './finishOrderSensitivityV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'
const fixture=process.env.V3_BATCH37_FIXTURE??'dordrecht-2000-10-15',mode=process.env.V3_BATCH37_MODE??'energy'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture)&&['energy','finite_pass'].includes(mode))
const source=batch26Input(fixture),outputDir=process.env.V3_BATCH37_OUT_DIR??'/tmp/v3-batch37'
mkdirSync(outputDir,{recursive:true})
const seeds=[source.seed,'batch28-research-grid-A','batch28-research-grid-B'],round=x=>Math.round(x*1e6)/1e6
const jobs=[]
for(const weather of ['frozen','headwind_3_crosswind_2']){
 const runs=[]
 for(let grid=0;grid<seeds.length;grid++){
  const input={...source,seed:seeds[grid],experimentalPowerDurationEnergy:true,...(mode==='finite_pass'?{experimentalFinitePassReservation:true}:{}),...(weather==='frozen'?{}:{route:source.route.map(r=>({...r,headwindMps:3,crosswindMps:2}))})}
  const state=initializeCoupledV3(input),counts={ticks:0,blockedRiderTicks:0,actualLostMeters:0,sameLaneLimitedRiderTicks:0,immediateAdjacentOptionRiderTicks:0,lateralMoves:0,proposalChecks:0,offeredSafeLanePreparations:0,rejectedUnsafePlanner:0,rejectedDependentProposals:0,pairedSafe:0,pairedUnsafe:0,pairedChangedMotion:0,pairedChangedWheelFlags:0,pairedAggregateForwardMetres:0,pairedCandidateForwardMetres:0}
  const firstEvents={},topLost=new Map(),topConstrained=new Map(),sample=[],pairedRows=[],byGrade={}
  let waiting=null,firstGroup=null
  const putFirst=(name,tick,data={})=>{if(firstEvents[name]===undefined)firstEvents[name]={tick,second:tick*(input.tickSeconds??10),...data}}
  for(let tick=0;tick<144&&!state.complete;tick++){
   const before=structuredClone(state.riders.filter(r=>r.finishSeconds===null))
   const pendingRider=state.passingResearch?.pending?.riderId??null
   let trace=null
   advanceCoupledV3(input,state,1,x=>{trace=x})
   assert(trace&&trace.rows.length===before.length,'Missing complete source tick')
   const old=new Map(before.map(r=>[r.riderId,r]))
   const spatial=trace.rows.map(r=>{
    const prior=old.get(r.riderId)
    assert(prior&&r.commandedMps>=0,'Missing rider state in shadow')
    return {riderId:r.riderId,meters:prior.meters,lane:prior.lane,energy:prior.energy,desiredMps:r.commandedMps,tactic:r.riderId===pendingRider?'recover':r.tactic}
   })
   const road={laneCount:input.grid.ridersAcross,dtSeconds:input.tickSeconds??10,minWheelGapMeters:1.8}
   const moves=advanceSpatialPelotonV3(spatial,road)
   const results=new Map(trace.rows.map(r=>[r.riderId,r]))
   for(const m of moves){
    const observed=results.get(m.riderId)
    assert(observed&&Math.abs(m.meters-observed.metersAfter)<2e-5&&Math.abs(m.speedMps-observed.achievedMps)<2e-5&&m.wheelLimited===observed.wheelLimited,'Spatial replay drift')
    if(m.lane!==observed.laneAfter)assert(pendingRider===m.riderId&&Math.abs(m.lane-observed.laneAfter)===1,'Unexplained lane state mutation')
   }
   const audit=attributeWheelReservationsV3(spatial,moves,road),sum=audit.summary
   counts.ticks++;counts.blockedRiderTicks+=sum.wheelLimitedRiderTicks;counts.actualLostMeters+=sum.actualLostMeters;counts.sameLaneLimitedRiderTicks+=sum.sameLaneLimitedRiderTicks;counts.immediateAdjacentOptionRiderTicks+=sum.anyImmediateAdjacentOptionRiderTicks;counts.lateralMoves+=sum.lateralMoves
   if(sum.wheelLimitedRiderTicks)putFirst('wheelLimited',state.tick,{count:sum.wheelLimitedRiderTicks})
   if(sum.sameLaneLimitedRiderTicks)putFirst('sameLaneReservation',state.tick,{count:sum.sameLaneLimitedRiderTicks})
   for(const row of audit.records)if(row.lossMeters>1e-6){
    topLost.set(row.riderId,(topLost.get(row.riderId)??0)+row.lossMeters)
    if(row.sameLaneReservationId)topConstrained.set(row.sameLaneReservationId,(topConstrained.get(row.sameLaneReservationId)??0)+1)
   }
   const avgGrade=Math.round((trace.rows.reduce((a,r)=>a+r.gradePercent,0)/trace.rows.length)*10)/10
   const bucket=avgGrade>=3?'climbing_3plus':avgGrade<=-2?'descending_minus2':'flat_or_rolling'
   const g=byGrade[bucket]??{ticks:0,riderTicks:0,blocked:0,lostMeters:0}
   g.ticks++;g.riderTicks+=audit.records.length;g.blocked+=sum.wheelLimitedRiderTicks;g.lostMeters+=sum.actualLostMeters;byGrade[bucket]=g
   if(waiting){
    const experiment=pairedOneTickLanePreparationV3(spatial,moves,waiting.candidate,road)
    if(experiment.safe){counts.pairedSafe++;counts.pairedChangedMotion+=experiment.changedMovementRiders;counts.pairedChangedWheelFlags+=experiment.changedWheelFlagRiders;counts.pairedAggregateForwardMetres+=experiment.deltaAggregateForwardMeters;counts.pairedCandidateForwardMetres+=experiment.deltaCandidateForwardMeters
      if(experiment.changedMovementRiders)putFirst('nextTickLaneEffect',state.tick,{ridersChanged:experiment.changedMovementRiders})
    }else counts.pairedUnsafe++
    if(pairedRows.length<30)pairedRows.push({fromTick:waiting.tick,testedTick:state.tick,obstructionMetres:waiting.lostMeters,obstructingLeader:waiting.sameLaneReservationId,...experiment})
    waiting=null
   }
   if(!state.complete&&!state.passingResearch?.pending&&state.riders.every(r=>r.lane===moves.find(m=>m.riderId===r.riderId)?.lane||r.finishSeconds!==null)){
    counts.proposalChecks++
    const opt=selectSafeSinglePreparationV3(spatial,moves,road)
    if(opt.candidate){
     const sourceLoss=audit.records.find(r=>r.riderId===opt.candidate.riderId)
     if(sourceLoss?.blocked&&sourceLoss.lossMeters>1e-6){
      counts.offeredSafeLanePreparations++;waiting={candidate:opt.candidate,tick:state.tick,lostMeters:sourceLoss.lossMeters,sameLaneReservationId:sourceLoss.sameLaneReservationId}
      putFirst('safePreparedLane',state.tick,{riderId:opt.candidate.riderId,priorLostMetres:sourceLoss.lossMeters})
     }
    }else if(opt.rejectedUnsafePlanner)counts.rejectedDependentProposals++
   }else if(state.passingResearch?.pending)counts.rejectedUnsafePlanner++
   const grouping=measurePelotonSeparationsV3(state)
   if(firstGroup===null&&grouping.separateGroups>1&&state.elapsedSeconds>=120)firstGroup={second:state.elapsedSeconds,groups:grouping.separateGroups}
   if(tick<5||tick===11||tick===23||tick===47||tick===95||tick===143)sample.push({second:state.elapsedSeconds,gradeBucket:bucket,summary:sum,groupCount:grouping.separateGroups,details:audit.records.filter(r=>r.lossMeters>0).sort((a,b)=>b.lossMeters-a.lossMeters).slice(0,3)})
  }
  const snapshot=JSON.parse(JSON.stringify(state))
  advanceCoupledV3(input,state,100000)
  const outcome=finalizeCoupledV3(input,state)
  assert(outcome.officialWrites===0&&outcome.sportingApproval==='NOT_APPROVED'&&outcome.finish.length===source.riders.length)
  assert(outcome.finish.every((r,i)=>r.rank===i+1&&Number.isFinite(r.finishSeconds)))
  if(grid===0&&weather==='frozen')assert.deepEqual(outcome,runCoupledV3(input),'Observer changed unmodified race')
  advanceCoupledV3(input,snapshot,100000)
  assert.deepEqual(finalizeCoupledV3(input,snapshot),outcome,'Exact restart mismatch')
  counts.actualLostMeters=round(counts.actualLostMeters);counts.pairedAggregateForwardMetres=round(counts.pairedAggregateForwardMetres);counts.pairedCandidateForwardMetres=round(counts.pairedCandidateForwardMetres)
  for(const stat of Object.values(byGrade))stat.lostMeters=round(stat.lostMeters)
  const leaders=[...topConstrained].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([riderId,blockedFollowers])=>({riderId,blockedFollowers}))
  const worst=[...topLost].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([riderId,loss])=>({riderId,lostMeters:round(loss)}))
  runs.push({grid,seed:seeds[grid],counts,firstEvents,byGrade,leaders,worst,firstGroup,samples:sample,pairedRows,baseline:{winner:outcome.finish[0].riderId,tailGapSeconds:outcome.finish.at(-1).gapSeconds,blockedWholeRace:outcome.movement.wheelLimitedTicks},completeFinish:outcome.finish,checkpointExact:true})
  console.log(JSON.stringify({fixture,mode,weather,grid,counts,firstEvents,leaders:leaders.slice(0,2),firstGroup,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
 }
 jobs.push({weather,grids:runs})
}
const file=outputDir+'/'+fixture+'-'+mode+'-wheel-reservations.json'
writeFileSync(file,JSON.stringify({experiment:'BATCH37_OFFLINE_WHEEL_RESERVATION',fixture,mode,roster:source.riders.length,sportingApproval:'NOT_APPROVED',officialWrites:0,analysisTicks:144,regimes:jobs,limitations:['Next-tick intervention uses frozen actual control power/speed demand; does not preserve real interactive aerodynamic feedback','A collision-safe one-tick lane promotion is not a continuous lateral steering model','First gap >=30 metres is geometric only; not an official breakaway group','A few individual lane opportunities cannot isolate system-wide effects','Guangxi climb proxy omits 718m; Dordrecht sprint tactic approximation persists']},null,2)+'\n')
console.log(JSON.stringify({fixture,mode,summary:'BATCH37_COMPLETE',raceRuns:jobs.reduce((n,x)=>n+x.grids.length,0),artifact:file,sportingApproval:'NOT_APPROVED',officialWrites:0}))
