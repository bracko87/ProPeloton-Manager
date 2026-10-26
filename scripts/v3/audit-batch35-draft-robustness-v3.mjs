/** Batch 35: same-motion draft-work shadow plus opt-in full-race 0/50/100% drafting.
 * Pure synthetic/offline research, never dispatches official races or DB writes.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {draftCounterfactualWattsV3} from '../../src/race-engine-v3/draftCounterfactualV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
import {compareFinishOrderV3} from './finishOrderSensitivityV3.mjs'
const fixture=process.env.V3_BATCH35_FIXTURE??'dordrecht-2000-10-15',mode=process.env.V3_BATCH35_MODE??'energy'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
assert(['energy','finite_pass'].includes(mode))
const data=batch26Input(fixture),dir=process.env.V3_BATCH35_OUT_DIR??'/tmp/v3-batch35';mkdirSync(dir,{recursive:true})
const factors=[0,.5,1],round=x=>Math.round(x*1e6)/1e6
const grids=[{name:'original',seed:data.seed},{name:'grid_B',seed:'batch28-research-grid-B'}]
function inputOf(seed,factor){
 return {...data,seed,experimentalPowerDurationEnergy:true,...(mode==='finite_pass'?{experimentalFinitePassReservation:true}:{}),...(factor===null?{}:{experimentalShelterStrength:factor})}
}
function doShadow(input){
 const state=initializeCoupledV3(input),totals={riderTicks:0,benefitingTicks:0,joulesFull:0,joulesHalf:0,joulesBare:0,fullVsBare:0,fullVsHalf:0},early=[]
 const dt=input.tickSeconds??10
 for(let j=0;j<180&&!state.complete;j++){
  advanceCoupledV3(input,state,1,trace=>{
   let step={full:0,half:0,bare:0,benefited:0},sample=[]
   for(const r of trace.rows){
    const road={gradePercent:r.gradePercent,headwindMps:r.headwindMps,crosswindMps:r.crosswindMps}
    const clean=r.actualMechanicalWatts-r.passCostWatts
    const full=draftCounterfactualWattsV3(r.achievedMps,r.integratedShelterFraction,road,1,clean)
    const half=draftCounterfactualWattsV3(r.achievedMps,r.integratedShelterFraction,road,.5)
    const bare=draftCounterfactualWattsV3(r.achievedMps,r.integratedShelterFraction,road,0)
    assert(Math.abs(full-clean)<1e-7&&[full,half,bare].every(Number.isFinite))
    totals.benefitingTicks+=Number(bare>full+1e-6)
    totals.riderTicks++;totals.joulesFull+=full*dt;totals.joulesHalf+=half*dt;totals.joulesBare+=bare*dt
    step.full+=full*dt;step.half+=half*dt;step.bare+=bare*dt;step.benefited+=Number(bare>full+1e-6)
    if(j===0&&r.integratedShelterFraction>0&&sample.length<4)sample.push({riderId:r.riderId,achievedMps:r.achievedMps,shelter:r.integratedShelterFraction,actualW:round(full),noDraftW:round(bare),deltaW:round(bare-full)})
   }
   if(j===0||j===5||j===11||j===59||j===119||j===179)early.push({tick:trace.tick,second:trace.elapsedSeconds,benefitingRiderTicks:step.benefited,baselinePathJ:round(step.full),noShelterJ:round(step.bare),sample})
  })
 }
 totals.fullVsBare=round(totals.joulesBare-totals.joulesFull)
 totals.fullVsHalf=round(totals.joulesHalf-totals.joulesFull)
 for(const k of ['joulesFull','joulesHalf','joulesBare'])totals[k]=round(totals[k])
 return {seconds:state.elapsedSeconds,totals,early}
}
function checkpointExactly(input,expect){
 let state=initializeCoupledV3(input),steps=0,pending=0
 while(!state.complete){
  advanceCoupledV3(input,state,[1,7,3,19][steps%4])
  pending+=Number(!!state.passingResearch?.pending)
  state=JSON.parse(JSON.stringify(state))
  assert(++steps<2500,'Excessive Batch35 checkpoint batches')
 }
 const result=finalizeCoupledV3(input,state)
 assert.deepEqual(result,expect,'Uninterrupted/serialized draft experiment disagreement')
 return {batches:steps,pendingPassingCheckpoints:pending}
}
const reports=[]
for(const grid of grids){
 const input=inputOf(grid.seed,null),control=runCoupledV3(input)
 assert.equal(control.mode,'OFFLINE_RESEARCH_ONLY');assert.equal(control.officialWrites,0);assert.equal(control.sportingApproval,'NOT_APPROVED')
 const shadow=doShadow(input)
 const candidates=[]
 for(const factor of factors){
  const candidateInput=inputOf(grid.seed,factor)
  const computed=runCoupledV3(candidateInput)
  assert.equal(computed.mode,'OFFLINE_RESEARCH_ONLY');assert.equal(computed.sportingApproval,'NOT_APPROVED');assert.equal(computed.officialWrites,0)
  assert.equal(computed.finish.length,data.riders.length)
  assert(computed.finish.every(x=>Number.isFinite(x.finishSeconds)&&Number.isFinite(x.gapSeconds)&&x.energy>=0&&x.energy<=1))
  if(factor===1)assert.deepEqual(computed,control,'Explicit 100% shelter drifted from existing V3')
  const diff=compareFinishOrderV3(control.finish,computed.finish)
  const resumable=(grid.name==='original'&&factor!==1)?checkpointExactly(candidateInput,computed):null
  candidates.push({factor,summary:{blockedRiderTicks:computed.movement.wheelLimitedTicks,deltaBlockedFromExisting:computed.movement.wheelLimitedTicks-control.movement.wheelLimitedTicks,tailGapSeconds:computed.finish.at(-1).gapSeconds,deltaTailGapSeconds:round(computed.finish.at(-1).gapSeconds-control.finish.at(-1).gapSeconds),changedRankCount:diff.changedRankCount,inversions:diff.discordantPairs,meanAbsoluteRankShift:diff.meanAbsoluteRankShift,medianAbsoluteFinishDifferenceSeconds:diff.medianAbsoluteFinishChangeSeconds,remainingWPrimeJ:computed.powerDuration?.remainingWPrimeJoules,workJoules:computed.movement.totalWorkJoules,checkpoint:resumable},finish:computed.finish})
 }
 reports.push({grid,shadow,candidates})
 console.log(JSON.stringify({fixture,mode,grid:grid.name,shadowEnergyAtFixedMovement:shadow.totals,scenarios:candidates.map(x=>({factor:x.factor,...x.summary})),sportingApproval:'NOT_APPROVED',officialWrites:0}))
}
const at=factor=>reports.map(r=>r.candidates.find(x=>x.factor===factor))
const crossSeed=factors.map(factor=>{const [a,b]=at(factor),diff=compareFinishOrderV3(a.finish,b.finish);return {factor,gridInvertedPairs:diff.discordantPairs,gridInversionShare:diff.discordantShare,gridChangedRanks:diff.changedRankCount,gridMedianAbsoluteFinishChangeSeconds:diff.medianAbsoluteFinishChangeSeconds}})
const out={experiment:'BATCH35_DRAFT_WORK_CAUSAL_PROBES',fixture,mode,roster:data.riders.length,officialWrites:0,sportingApproval:'NOT_APPROVED',shadowProtocol:'Fixed achieved 10-second motion, full physical shelter as recorded; counterfactual watts only, first 180 ticks',dynamicProtocol:'Six full races per matrix cell across original/gridB, 0/.5/1 shelter, both demand and actual W-prime debit',crossSeed,reports,limitations:['Fixed-motion alternative work is not dynamically reinvested in speed','Changing drag strength also changes rider speed and hence wheel interactions: finishing gaps are not pure drag coefficients','Guangxi synthetic climb omits 718m reported gain','Dordrecht point sprint orders approximated as tempo','Synthetic grids and uncalibrated rider power, CdA and W-prime']}
const filename=dir+'/'+fixture+'-'+mode+'-batch35-draft.json'
writeFileSync(filename,JSON.stringify(out,null,2)+'\n')
console.log(JSON.stringify({fixture,mode,summary:'BATCH35_FINAL',crossSeed,filename,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
