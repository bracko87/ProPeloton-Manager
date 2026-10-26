/** Batch 34 OFFLINE: actual internal power, W-prime, draft and wheel attribution.
 * Only a starting-grid lane swap is perturbed; no power or geometry physics edits.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
import {summarizePairedConstraintsV3} from './pairedConstraintAttributionV3.mjs'
import {measurePelotonSeparationsV3,compareFinishOrderV3} from './finishOrderSensitivityV3.mjs'
const fixture=process.env.V3_BATCH34_FIXTURE??'dordrecht-2000-10-15',mode=process.env.V3_BATCH34_MODE??'energy'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
assert(['energy','finite_pass'].includes(mode))
const source=batch26Input(fixture),dir=process.env.V3_BATCH34_OUT_DIR??'/tmp/v3-batch34'
mkdirSync(dir,{recursive:true})
const r6=x=>Math.round(x*1e6)/1e6
function swapRow(state){
 const original=structuredClone(state)
 const sorted=[...state.riders].sort((a,b)=>a.meters-b.meters||a.lane-b.lane||a.riderId.localeCompare(b.riderId))
 const level=sorted[Math.floor(sorted.length/2)].meters
 const row=sorted.filter(x=>Math.abs(x.meters-level)<1e-8).sort((a,b)=>a.lane-b.lane||a.riderId.localeCompare(b.riderId))
 assert(row.length>=2)
 const [left,right]=row
 const a=left.lane;left.lane=right.lane;right.lane=a
 const undo=structuredClone(state);const x=undo.riders.find(r=>r.riderId===left.riderId),y=undo.riders.find(r=>r.riderId===right.riderId)
 const l=x.lane;x.lane=y.lane;y.lane=l
 assert.deepEqual(undo,original,'Starting-grid test changed non-lane physics')
 assert(!state.riders.some((x,i)=>state.riders.slice(i+1).some(y=>x.lane===y.lane&&Math.abs(x.meters-y.meters)<1.8-1e-6)),'Unsafe lane swap')
 return {ids:[left.riderId,right.riderId],meters:level}
}
function scenario(grid){
 const input={...source,seed:grid.seed,experimentalPowerDurationEnergy:true,...(mode==='finite_pass'?{experimentalFinitePassReservation:true}:{})}
 let a=initializeCoupledV3(input),b=structuredClone(a)
 const swap=swapRow(b),first={},snapshots=[],totals={},diffRiders=new Set()
 let restored=null,elapsed=0,inspectedTicks=0,groupDivergences=0
 const event=(kind,details,tick)=>{if(!first[kind])first[kind]={tick,second:tick*(input.tickSeconds??10),...details}}
 const baselineFirstMotion={dordrecht:50,guangxi:grid.label==='original'?70:60}
 const expectedSecond=fixture.startsWith('dordrecht')?50:baselineFirstMotion.guangxi
 while(!(a.complete&&b.complete)){
  const detailed=inspectedTicks<660
  let ca=null,cb=null
  const stride=detailed?1:36
  if(!a.complete)advanceCoupledV3(input,a,stride,detailed?t=>{ca=t}:undefined)
  if(!b.complete)advanceCoupledV3(input,b,stride,detailed?t=>{cb=t}:undefined)
  if(detailed){
   assert(ca&&cb,'Paired trace callback not emitted')
   assert.equal(ca.tick,cb.tick)
   const comparison=summarizePairedConstraintsV3(ca.rows,cb.rows),m=comparison.metrics
   inspectedTicks++
   for(const [key,v] of Object.entries(m))if(key!=='compared'&&key!=='maxAdvanceDifferenceMeters')totals[key]=(totals[key]??0)+v
   const sample=(kind,field)=>{if(m[field]>0)event(kind,{count:m[field],maxAdvanceDifferenceMeters:m.maxAdvanceDifferenceMeters,firstThree:comparison.differences.filter(d=>d[kind==='firstMotion'?'achieved':kind==='firstRequested'?'requested':kind==='firstDraft'?'shelter':kind==='firstWatts'?'watts':kind==='firstWheel'?'wheel':kind==='firstEnergyCap'?'energy':kind==='firstPower'?'available':'wprime']).slice(0,3)},ca.tick)}
   sample('firstMotion','changedAchieved');sample('firstRequested','changedRequested');sample('firstDraft','changedShelter');sample('firstPower','changedAvailablePower');sample('firstWheel','changedWheel');sample('firstWatts','changedActualWatts');sample('firstWPrime','changedWPrime');sample('firstEnergyCap','changedEnergyLimit')
   const groupsA=measurePelotonSeparationsV3(a,30),groupsB=measurePelotonSeparationsV3(b,30)
   if(groupsA.separateGroups!==groupsB.separateGroups){groupDivergences++;event('firstGroupCount',{groupsControl:groupsA.separateGroups,groupsPerturbed:groupsB.separateGroups},ca.tick)}
   for(const row of comparison.differences)diffRiders.add(row.riderId)
   if(ca.tick===1||ca.tick===3||ca.tick===5||ca.tick===6||ca.tick===7||ca.tick===12||ca.tick%60===0||m.changedAchieved>0&&!first.firstMotion){
    if(snapshots.length<42)snapshots.push({tick:ca.tick,second:ca.elapsedSeconds,groupsA:groupsA.separateGroups,groupsB:groupsB.separateGroups,counts:m,firstThree:comparison.differences.slice(0,3)})
   }
   if(ca.tick===121&&grid.label==='original')restored=JSON.parse(JSON.stringify(b))
   if(ca.tick%71===0){a=JSON.parse(JSON.stringify(a));b=JSON.parse(JSON.stringify(b))}
  }
  assert(++elapsed<8000,'Unbounded Batch 34 full race')
 }
 const baseline=finalizeCoupledV3(input,a),candidate=finalizeCoupledV3(input,b)
 if(grid.label==='original'){
  assert.deepEqual(baseline,runCoupledV3(input),'Observer mutated original full-race physics')
  assert(restored)
  advanceCoupledV3(input,restored,100000)
  assert.deepEqual(finalizeCoupledV3(input,restored),candidate,'Perturbed checkpoint observer changed physics')
 }
 assert.equal(baseline.officialWrites,0);assert.equal(candidate.officialWrites,0)
 assert.equal(candidate.sportingApproval,'NOT_APPROVED');assert.equal(candidate.finish.length,source.riders.length)
 assert.equal(first.firstMotion?.second,expectedSecond,'Batch 33 first-motion baseline unexpectedly drifted')
 const finish=compareFinishOrderV3(baseline.finish,candidate.finish)
 const output={grid:grid.label,swap,first,inspectedTicks,groupDivergencesInWindow:groupDivergences,totals,distinctRidersWithAnySourceDifference:diffRiders.size,snapshots,rankChanges:finish.changedRankCount,discordantPairs:finish.discordantPairs,deltaBlockedTicks:candidate.movement.wheelLimitedTicks-baseline.movement.wheelLimitedTicks,workDeltaJ:r6(candidate.movement.totalWorkJoules-baseline.movement.totalWorkJoules),wPrimeDeltaJ:r6((candidate.powerDuration?.remainingWPrimeJoules??0)-(baseline.powerDuration?.remainingWPrimeJoules??0)),baselineFinish:baseline.finish,perturbedFinish:candidate.finish}
 console.log(JSON.stringify({fixture,mode,grid:grid.label,firstEvents:Object.fromEntries(Object.entries(first).map(([k,v])=>[k,{second:v.second,count:v.count??null}])),totals,inspectedTicks,rankChanges:finish.changedRankCount,discordantPairs:finish.discordantPairs,deltaBlockedTicks:output.deltaBlockedTicks,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
 return output
}
const cases=[{label:'original',seed:source.seed},{label:'grid_B',seed:'batch28-research-grid-B'}].map(scenario)
const path=dir+'/'+fixture+'-'+mode+'-source-attribution.json'
writeFileSync(path,JSON.stringify({experiment:'BATCH34_SOLVER_SOURCE_ATTRIBUTION',fixture,mode,roster:source.riders.length,sourceQuality:'synthetic_research',traceWindowSeconds:6600,officialWrites:0,sportingApproval:'NOT_APPROVED',cases,limitations:['Changed source attributes are observational and can co-occur; not a causal decomposition','Same-lane leader ID is the nearest initial wheel, not a proven wheel limiting the trajectory','First group is adjacent spatial gap >=30m, not the official breakaway group','Only two synthetic grid seeds; Guangxi profile omits 718m gain; Dordrecht sprint tactics approximated','No result physics changed, no production race routing']},null,2)+'\n')
