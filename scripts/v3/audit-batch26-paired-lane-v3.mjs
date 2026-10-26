/** Batch 26: one safe post-tick lane move, then paired full-race continuation. OFFLINE. */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {planAnticipatoryLanesV3} from '../../src/race-engine-v3/anticipatoryLaneResearchV3.ts'
import {chooseSingleLaneV3,forkSingleLaneV3} from './singleLaneBranchV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'
const r6=x=>Math.round(x*1e6)/1e6,combined=process.env.V3_BATCH26_COMBINED==='1'
const dest=process.env.V3_BATCH26_OUT_DIR??'/tmp/v3-batch26';mkdirSync(dest,{recursive:true})
function percentile(values){const s=values.slice().sort((a,b)=>a-b);return r6((s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2)}
function candidateSnapshots(input){
 const state=initializeCoupledV3(input),available=new Map();let tick=0,firstBlocked=null,opportunities=0,rejectedUnsafePlanners=0
 while(!state.complete){
  const before=state.riders.filter(r=>r.finishSeconds===null).map(r=>({riderId:r.riderId,meters:r.meters,lane:r.lane,energy:r.energy,wheelLimitedTicks:r.wheelLimitedTicks,desiredMps:0,tactic:(input.orders??[]).filter(o=>o.riderId===r.riderId&&r.meters/1000>=o.startKm&&r.meters/1000<o.endKm).at(-1)?.tactic??'follow'}))
  advanceCoupledV3(input,state,1);tick++
  const lookup=new Map(state.riders.map(r=>[r.riderId,r]))
  const moves=before.map(b=>{const now=lookup.get(b.riderId),speed=(now.meters-b.meters)/(input.tickSeconds??10);return {riderId:b.riderId,oldMeters:b.meters,meters:now.meters,lane:now.lane,commandedMps:speed,speedMps:speed,leadRiderId:null,slipstreamFraction:0,lateralMoves:Number(b.lane!==now.lane),overtook:false,wheelLimited:now.wheelLimitedTicks>b.wheelLimitedTicks}})
  if(firstBlocked===null&&moves.some(m=>m.wheelLimited))firstBlocked=tick
  const early=!available.has('first')
  const climb=nameIsGuangxi(input)&&!available.has('late_climb')&&before.some(r=>r.meters>=160800&&r.meters<=162600)
  if((early||climb)&&before.length>1&&state.elapsedSeconds%(input.sampleSeconds??120)!==0){
   // Unsafe multi-rider proposals must not stop a safe single-rider research branch.
   // Reject the entire proposal without modifying positions; never waive geometry.
   let planned
   try{planned=planAnticipatoryLanesV3(before,moves,input.grid.ridersAcross,1.8)}
   catch(error){
    if(error instanceof Error&&error.message==='Invalid anticipatory bicycle placement'){rejectedUnsafePlanners++;continue}
    throw error
   }
   opportunities+=planned.shifted
   const chosen=chooseSingleLaneV3(before,moves,planned)
   if(chosen&&early)available.set('first',{checkpoint:structuredClone(state),choice:chosen,tick})
   if(climb){
    const targeted={...planned,riders:planned.riders.map(p=>({...p,promoted:p.promoted&&p.meters>=160800&&p.meters<=162600}))}
    const selected=chooseSingleLaneV3(before,moves,targeted)
    if(selected)available.set('late_climb',{checkpoint:structuredClone(state),choice:selected,tick})
   }
  }
  assert(tick<6000,'Race checkpoint scan exceeded bound')
 }
 const result=finalizeCoupledV3(input,state);assert.equal(result.officialWrites,0);assert.equal(result.sportingApproval,'NOT_APPROVED')
 return {full:result,available,firstBlocked,opportunities,rejectedUnsafePlanners,scannedTicks:tick}
}
const nameIsGuangxi=input=>input.raceId.startsWith('guangxi')
function continuePair(input,record,reference){
 const unchanged=structuredClone(record.checkpoint),modified=forkSingleLaneV3(record.checkpoint,record.choice)
 const reversed=structuredClone(modified)
 reversed.riders.find(r=>r.riderId===record.choice.riderId).lane=record.choice.fromLane
 assert.deepEqual(reversed,unchanged,'Single lane must be the only original checkpoint difference')
 const snapshots=[];let chunks=0
 while(!unchanged.complete||!modified.complete){
  if(!unchanged.complete)advanceCoupledV3(input,unchanged,12)
  if(!modified.complete)advanceCoupledV3(input,modified,12)
  chunks++
  if([1,3,10,30].includes(chunks)){
   const a=new Map(unchanged.riders.map(r=>[r.riderId,r])),b=new Map(modified.riders.map(r=>[r.riderId,r]))
   snapshots.push({chunks,elapsedSeconds:Math.min(unchanged.elapsedSeconds,modified.elapsedSeconds),riderIds:[record.choice.riderId,'r058','r117'].filter(id=>a.has(id)).map(id=>({id,deltaMeters:r6(b.get(id).meters-a.get(id).meters),deltaEnergy:r6(b.get(id).energy-a.get(id).energy)}))})
  }
  assert(chunks<600,'Paired continuation exceeded tick budget')
 }
 const baseline=finalizeCoupledV3(input,unchanged),candidate=finalizeCoupledV3(input,modified)
 assert.deepEqual(baseline,reference,'Baseline branch fails exact uninterrupted replay equality')
 assert.equal(candidate.officialWrites,0);assert.equal(candidate.sportingApproval,'NOT_APPROVED')
 assert.equal(candidate.finish.length,reference.finish.length)
 const target=new Map(candidate.finish.map(x=>[x.riderId,x]))
 const perRider=baseline.finish.map(x=>{const y=target.get(x.riderId);return {id:x.riderId,controlRank:x.rank,branchRank:y.rank,deltaRank:y.rank-x.rank,deltaFinishSeconds:r6(y.finishSeconds-x.finishSeconds),deltaGapSeconds:r6(y.gapSeconds-x.gapSeconds),deltaEnergy:r6(y.energy-x.energy)}})
 const gaps=perRider.map(x=>x.deltaGapSeconds)
 const mechanicalA=unchanged.riders.reduce((n,r)=>n+(r.powerDurationEnergy?.cumulativeMechanicalJoules??0),0)
 const mechanicalB=modified.riders.reduce((n,r)=>n+(r.powerDurationEnergy?.cumulativeMechanicalJoules??0),0)
 return {choice:record.choice,branchTick:record.tick,branchKm:r6(record.choice.meters/1000),sameInitialPower:true,noFreeLongitudinalMovement:true,checkpointExact:true,baselineTailGapSeconds:baseline.finish.at(-1).gapSeconds,candidateTailGapSeconds:candidate.finish.at(-1).gapSeconds,deltaTailGapSeconds:r6(candidate.finish.at(-1).gapSeconds-baseline.finish.at(-1).gapSeconds),meanGapDeltaSeconds:r6(gaps.reduce((a,b)=>a+b,0)/gaps.length),medianGapDeltaSeconds:percentile(gaps),changedRankCount:perRider.filter(x=>x.deltaRank!==0).length,deltaBlockedTicks:candidate.movement.wheelLimitedTicks-baseline.movement.wheelLimitedTicks,deltaMechanicalMJ:r6((mechanicalB-mechanicalA)/1e6),selectedRider:perRider.find(x=>x.id===record.choice.riderId),snapshots,perRider}
}
for(const fixture of ['dordrecht-2000-10-15','guangxi-2000-10-19']){
 const base=batch26Input(fixture),input={...base,experimentalPowerDurationEnergy:true,experimentalBottleneckTelemetry:true,...(combined?{experimentalAnticipatoryLaneMoves:true,experimentalPathDraftWork:true}:{})}
 const scan=candidateSnapshots(input)
 assert(scan.firstBlocked!==null,'Expected wheel blocking in frozen fixture')
 assert(scan.available.has('first'),'No safe intervention occurred: no invented lane or instant metres permitted')
 const branches=[...scan.available.entries()].map(([type,record])=>({type,...continuePair(input,record,scan.full)}))
 const report={fixture,combined,roster:base.riders.length,mode:'OFFLINE_RESEARCH_ONLY',sportingApproval:'NOT_APPROVED',officialWrites:0,firstBlockedTick:scan.firstBlocked,firstSafeLaneTick:scan.available.get('first').tick,proposedShiftCount:scan.opportunities,rejectedUnsafePlannerTicks:scan.rejectedUnsafePlanners,originalTailGapSeconds:scan.full.finish.at(-1).gapSeconds,branches,limitations:['Physiology identical at intervention, but future power evolves with positioning and draft','Guangxi synthetic route omits 718 m elevation','No official writes, no promotion, no live race access']}
 const path=dest+'/'+fixture+(combined?'-combined':'-energy')+'-one-shot-lane.json'
 writeFileSync(path,JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({fixture,combined,roster:base.riders.length,firstBlockedTick:scan.firstBlocked,firstSafeLaneTick:report.firstSafeLaneTick,rejectedUnsafePlannerTicks:report.rejectedUnsafePlannerTicks,interventions:branches.map(({type,choice,branchTick,branchKm,deltaTailGapSeconds,meanGapDeltaSeconds,medianGapDeltaSeconds,deltaBlockedTicks,deltaMechanicalMJ,changedRankCount})=>({type,riderId:choice.riderId,branchTick,branchKm,deltaTailGapSeconds,meanGapDeltaSeconds,medianGapDeltaSeconds,deltaBlockedTicks,deltaMechanicalMJ,changedRankCount})),sportingApproval:'NOT_APPROVED',officialWrites:0,file:path}))
}
