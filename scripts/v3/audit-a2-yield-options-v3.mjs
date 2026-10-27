/** Offline research: duration-qualified overtakes across three starting grids,
 * three isolated physics candidates, 12/24/32 riders. No stage result writes.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeSimultaneousMicroV3 as symmetricStart,advanceSimultaneousMicroV3 as symmetricStep} from './simultaneousConflictResearchV3.mjs'
import {initializeSimultaneousMicroV3 as targetedStart,advanceSimultaneousMicroV3 as targetedStep} from './simultaneousTargetedMicroV3.mjs'
import {initializeSimultaneousMicroV3 as crossingStart,advanceSimultaneousMicroV3 as crossingStep} from './simultaneousCrossingAwareMicroV3.mjs'
import {initializePersistentPassTrackerV3 as startPass,advancePersistentPassTrackerV3 as stepPass,summarizePersistentPassTrackerV3 as passSummary} from './a2PersistentPassesV3.mjs'
import {continuousBicycleCollisionV3 as collides} from './continuousLateralResearchV3.mjs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
const count=Number(process.env.V3_A2_PASS_RIDERS??12),dir=process.env.V3_A2_PASS_DIR??'/tmp/a2-persistent-passes'
assert([12,24,32].includes(count))
mkdirSync(dir,{recursive:true})
const geometry=BATCH40_GEOMETRIES[1],g=validateRoadScenarioV3(geometry),dt=10
const policies=[{key:'crossing_aware',start:crossingStart,step:crossingStep}]
const scenarios=['passing_corridors','dense_follow','merge_pressure']
const grids=['original','first_two_swapped','two_lane_rotation','alternating_row_swaps']
const round=n=>Math.round(n*1e6)/1e6
const number=id=>Number(id.slice(1))
const ordered=rows=>rows.slice().sort((a,b)=>a.riderId.localeCompare(b.riderId))
function startingRiders(mode,grid){
 const result=Array.from({length:count},(_,i)=>{
  const passing=mode==='passing_corridors',lane=passing?2*(i%2):i%4
  const row=Math.floor(i/(passing?2:4))
  return {riderId:'r'+String(i).padStart(3,'0'),meters:round(900-2.4*row),y:lane,speedMps:4,cpWatts:205+(i*17)%90,wPrimeJoules:18000}
 })
 if(grid==='first_two_swapped'){
  const y=result[0].y;result[0].y=result[1].y;result[1].y=y
 }else if(grid==='two_lane_rotation')for(const r of result)r.y=(r.y+2)%4
 else if(grid==='alternating_row_swaps'){
  // Genuine nonuniform perturbation, preserving row occupancy and rider power.
  // Pair-swap each second starting row but leave the others untouched.
  const rowSize=mode==='passing_corridors'?2:4
  for(let row=1;row*rowSize+1<result.length;row+=2){
   const a=row*rowSize,b=a+1,y=result[a].y
   result[a].y=result[b].y;result[b].y=y
  }
 }
 return result
}
function request(state,mode,grid){
 const shift=grid==='two_lane_rotation'?2:0
 return state.riders.map(r=>{
  const i=number(r.riderId),phase=state.tick%20
  let forwardMeters=43+(i*7)%24,targetY=r.y
  if(mode==='passing_corridors'){
   forwardMeters=38+(i*13)%38
   if(i%6===2||i%6===3){
    const originalTarget=i%2===0?1:3
    targetY=(originalTarget+shift)%4
   }
  }else if(mode==='merge_pressure'){
   forwardMeters=45+(i*11)%24
   if(i%4===0)targetY=Math.min(3,Math.max(0,r.y+(phase<10?.4:-.4)))
   if(i%4===2)targetY=Math.min(3,Math.max(0,r.y+(phase<10?-.4:.4)))
  }
  if(grid==='alternating_row_swaps')targetY=r.y+Math.max(-g.centerStepM,Math.min(g.centerStepM,targetY-r.y))
  return {riderId:r.riderId,forwardMeters,targetY:round(targetY)}
 })
}
function sweptCheck(before,after){
 const old=new Map(before.map(r=>[r.riderId,r])),paths=after.map(r=>({x0:old.get(r.riderId).meters,x1:r.meters,y0:old.get(r.riderId).y,y1:r.y}))
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)assert(!collides(paths[i],paths[j],{longitudinal:1.8,lateral:g.lateralCollisionM}),'Swept bicycle collision')
}
function relativeOrder(a,b){
 const bm=new Map(b.map(r=>[r.riderId,r.meters]));let total=0,inverted=0,ties=0
 for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
  const p=a[i],q=a[j],first=p.meters-q.meters,last=bm.get(p.riderId)-bm.get(q.riderId)
  if(Math.abs(first)<=.05||Math.abs(last)<=.05){ties++;continue}
  total++;if(first*last<0)inverted++
 }
 return {invertedPairs:inverted,strictlyComparablePairs:total,excludedNearTies:ties,inversionPercent:total?round(inverted/total*100):null}
}

const reports=[],failures=[]
for(const mode of scenarios)for(const grid of grids){
 const record={mode,grid,roster:count,technical:'UNKNOWN',officialWrites:0}
 try{
  let state=crossingStart({riders:startingRiders(mode,grid),geometry,dt})
  let checkpoint=null
  let minimumTickRatio=1
  for(let tick=1;tick<=90;tick++){
   const prev=state.riders,after=crossingStep(state,request(state,mode,grid))
   sweptCheck(prev,after.riders)
   assert(after.riders.every(r=>r.energy.remainingWPrimeJoules>=0&&Number.isFinite(r.energy.remainingWPrimeJoules)))
   assert(after.metrics.achievedMeters<=after.metrics.requestedMeters+1e-5)
   const asked=after.metrics.requestedMeters-state.metrics.requestedMeters
   const got=after.metrics.achievedMeters-state.metrics.achievedMeters
   if(asked>0)minimumTickRatio=Math.min(minimumTickRatio,got/asked)
   assert(after.officialWrites===0&&after.sportingApproval==='NOT_APPROVED')
   state=after
   if(tick===45)checkpoint=JSON.parse(JSON.stringify(state))
  }
  let restored=checkpoint
  for(let tick=46;tick<=90;tick++)restored=crossingStep(restored,request(restored,mode,grid))
  assert.deepEqual(restored,state,'Diagnostic option tally replay failed')
  const s=state.metrics.yieldOptions
  assert(s&&s.conflictingPairs===s.zeroFeasible+s.oneFeasible+s.twoFeasible)
  assert.equal(s.prioritizedPairs,s.priorityZeroFeasible+s.prioritySingleFeasible+s.priorityTwoFeasible)
  assert.equal(s.prioritySingleFeasible,s.prioritySingleMustYieldProtected+s.prioritySingleAlreadyPreservesProtected)
  assert.equal(s.priorityTwoFeasible,s.priorityAlreadyPreserved+s.priorityBothButCostGapOver10m+s.priorityBothCostGapWithin10m)
  assert.equal(s.priorityActualSwitched,state.metrics.actualPreferenceChanges)
  assert.equal(s.twoFeasible,s.twoChoiceCostGap0to2m+s.twoChoiceCostGap2to10m+s.twoChoiceCostGap10to25m+s.twoChoiceCostGapOver25m)
  record.technical='PASS'
  record.options=s
  record.mobility={progressPercent:Math.round(100e6*state.metrics.achievedMeters/state.metrics.requestedMeters)/1e6,
   worstTickPercent:Math.round(100e6*minimumTickRatio)/1e6}
  record.existingPolicy={protectedPassEdges:state.metrics.protectedPassEdges,actualPreferenceChanges:state.metrics.actualPreferenceChanges,
   symmetricFallbackEdges:state.metrics.symmetricFallbackEdges}
  record.exactCheckpoint=true
  console.log(JSON.stringify(record))
 }catch(e){
  record.technical='FAIL';record.error=String(e?.stack??e)
  failures.push(record)
  console.error(JSON.stringify(record))
 }
 reports.push(record)
}
const totals={}
for(const r of reports.filter(x=>x.technical==='PASS'))
 for(const [key,num] of Object.entries(r.options))totals[key]=(totals[key]??0)+num
const result={study:'A2_YIELD_CHOICE_FEASIBILITY',riders:count,physics:'UNCHANGED',syntheticSeconds:900,
  technicalGate:failures.length?'FAIL':'PASS',sportingApproval:'NOT_APPROVED',officialWrites:0,
  reports,totals,failures,
  limitations:['Safe unary reductions are tested against the other rider current planned swept path, not a full joint-optimal trajectory',
  'Only options found in a 32-step discretized attenuation search count as feasible; a continuous optimal option may differ',
  'Counters count conflict edges at solver iterations, not unique rider pairs, overtakes, or race classifications',
  'No source road-width, authentic elevation, or realistic strategy yet']}
writeFileSync(dir+'/yield-choice-'+count+'.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({riders:count,gate:result.technicalGate,totals,scenarios:reports.map(x=>({mode:x.mode,grid:x.grid,technical:x.technical,priority:x.options?.prioritizedPairs,zero:x.options?.priorityZeroFeasible,single:x.options?.prioritySingleFeasible,both:x.options?.priorityTwoFeasible,switched:x.options?.priorityActualSwitched})),failed:failures.length}))
assert.equal(failures.length,0,'Yield feasibility diagnostic failed')
