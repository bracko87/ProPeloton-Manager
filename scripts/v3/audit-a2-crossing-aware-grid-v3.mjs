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
const policies=[{key:'symmetric',start:symmetricStart,step:symmetricStep},{key:'targeted',start:targetedStart,step:targetedStep},{key:'crossing_aware',start:crossingStart,step:crossingStep}]
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
const runResults=[],failure=[]
for(const policy of policies)for(const mode of scenarios)for(const grid of grids){
 const record={policy:policy.key,scenario:mode,grid,technical:'UNKNOWN'}
 try{
  let state=policy.start({riders:startingRiders(mode,grid),geometry,dt}),observer=startPass(state.riders),checkpoint=null
  let worstTick=1,nearHaltSeconds=0
  for(let tick=1;tick<=90;tick++){
   const before=state.riders,intents=request(state,mode,grid)
   const after=policy.step(state,intents)
   sweptCheck(before,after.riders)
   observer=stepPass(observer,after.riders,after.elapsedSeconds)
   const requested=after.metrics.requestedMeters-state.metrics.requestedMeters,achieved=after.metrics.achievedMeters-state.metrics.achievedMeters
   if(requested>0)worstTick=Math.min(worstTick,achieved/requested)
   const prev=new Map(before.map(r=>[r.riderId,r]))
   for(const r of after.riders){
    if(intents.find(m=>m.riderId===r.riderId).forwardMeters>10&&r.meters-prev.get(r.riderId).meters<.5)nearHaltSeconds+=dt
   }
   assert(after.officialWrites===0&&after.sportingApproval==='NOT_APPROVED')
   assert(after.riders.every(r=>r.energy.remainingWPrimeJoules>=0&&Number.isFinite(r.energy.remainingWPrimeJoules)))
   state=after
   if(tick===45)checkpoint=JSON.parse(JSON.stringify({state,observer}))
  }
  assert(checkpoint)
  let recoveredState=checkpoint.state,recoveredObserver=checkpoint.observer
  for(let tick=46;tick<=90;tick++){
   recoveredState=policy.step(recoveredState,request(recoveredState,mode,grid))
   recoveredObserver=stepPass(recoveredObserver,recoveredState.riders,recoveredState.elapsedSeconds)
  }
  assert.deepEqual(recoveredState,state,'Solver checkpoint mismatch')
  assert.deepEqual(recoveredObserver,observer,'Pass event checkpoint mismatch')
  const start=policy.start({riders:startingRiders(mode,grid).reverse(),geometry,dt})
  const first=policy.start({riders:startingRiders(mode,grid),geometry,dt})
  assert.deepEqual(ordered(policy.step(start,request(start,mode,grid)).riders),ordered(policy.step(first,request(first,mode,grid)).riders),'Rider array processing-order dependence')
  const report=passSummary(observer)
  record.technical='PASS'
  record.passMetrics=report
  record.positionAfter90=state.riders.map(r=>({riderId:r.riderId,meters:r.meters}))
  record.mobility={progressPercent:round(100*state.metrics.achievedMeters/state.metrics.requestedMeters),worstTickPercent:round(100*worstTick),nearHaltSeconds}
  record.events=observer.events
  record.resolverSignals={protectedPassEdges:state.metrics.protectedPassEdges??0,actualPreferenceChanges:state.metrics.actualPreferenceChanges??0}
  record.checkpointExact=true
  record.inputPermutationExact=true
  const {events,positionAfter90,...preview}=record
  console.log(JSON.stringify({riders:count,...preview,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
 }catch(error){
  record.technical='FAIL';record.error=String(error?.stack??error)
  failure.push({policy:policy.key,scenario:mode,grid,error:record.error})
  console.error(JSON.stringify({riders:count,policy:policy.key,scenario:mode,grid,error:record.error}))
 }
 runResults.push(record)
}
const comparison=[]
for(const mode of scenarios){
 const control=runResults.find(r=>r.policy==='symmetric'&&r.scenario===mode&&r.grid==='original')
 const proposed=runResults.find(r=>r.policy==='targeted'&&r.scenario===mode&&r.grid==='original')
 const aware=runResults.find(r=>r.policy==='crossing_aware'&&r.scenario===mode&&r.grid==='original')
 const detail={scenario:mode}
 if(control?.technical==='PASS'&&proposed?.technical==='PASS'){
  const windows=['30s','60s']
  detail.overtakes=Object.fromEntries(windows.map(w=>[w,{
   symmetricSustained:control.passMetrics.durationWindows[w].sustainedEvents,
   targetedSustained:proposed.passMetrics.durationWindows[w].sustainedEvents,
   symmetricQuickReversals:control.passMetrics.durationWindows[w].reversedWithinWindow,
   targetedQuickReversals:proposed.passMetrics.durationWindows[w].reversedWithinWindow
  }]))
  detail.rawCrossings={symmetric:control.passMetrics.crossingEvents,targeted:proposed.passMetrics.crossingEvents}
  detail.uniqueCrossingPairs={symmetric:control.passMetrics.uniqueUnorderedCrossingPairs,targeted:proposed.passMetrics.uniqueUnorderedCrossingPairs}
  if(aware?.technical==='PASS'){
   detail.crossingAware={
    crossings:aware.passMetrics.crossingEvents,
    uniqueCrossingPairs:aware.passMetrics.uniqueUnorderedCrossingPairs,
    sustained30s:aware.passMetrics.durationWindows['30s'].sustainedEvents,
    sustained60s:aware.passMetrics.durationWindows['60s'].sustainedEvents,
    quickReversals30s:aware.passMetrics.durationWindows['30s'].reversedWithinWindow,
    progressPercent:aware.mobility.progressPercent,
    worstTickPercent:aware.mobility.worstTickPercent,
    ...aware.resolverSignals
   }
  }
  detail.sportingFlags=[]
  if(detail.overtakes['60s'].targetedSustained<detail.overtakes['60s'].symmetricSustained)detail.sportingFlags.push('FEWER_60S_SUSTAINED_PASS_EVENTS')
  if(detail.overtakes['30s'].targetedSustained<detail.overtakes['30s'].symmetricSustained)detail.sportingFlags.push('FEWER_30S_SUSTAINED_PASS_EVENTS')
  detail.gridSensitivity={}
  for(const policy of policies){
   const ref=runResults.find(r=>r.policy===policy.key&&r.scenario===mode&&r.grid==='original')
   for(const grid of grids.slice(1)){
    const sample=runResults.find(r=>r.policy===policy.key&&r.scenario===mode&&r.grid===grid)
    if(ref?.technical==='PASS'&&sample?.technical==='PASS')detail.gridSensitivity[policy.key+'_'+grid]=relativeOrder(ref.positionAfter90,sample.positionAfter90)
   }
  }
 }
 if(mode==='passing_corridors'&&detail.crossingAware&&detail.gridSensitivity.crossing_aware_first_two_swapped){
   // Screening gates, not claims of calibrated historic sporting thresholds.
   const min60=Math.ceil(detail.overtakes['60s'].symmetricSustained*.85)
   const boundSwap=detail.gridSensitivity.symmetric_first_two_swapped.inversionPercent+5
   const boundFlow=proposed.mobility.progressPercent-3
   detail.crossingAware.screeningGates={
    sixtySecondPassRetention:detail.crossingAware.sustained60s>=min60,
    twoRiderSwapStability:detail.gridSensitivity.crossing_aware_first_two_swapped.inversionPercent<=boundSwap,
    minimumFlowRetention:detail.crossingAware.progressPercent>=boundFlow,
    required60sEvents:min60,
    maxSwapInversionPercent:round(boundSwap),
    minProgressPercent:round(boundFlow)
   }
   detail.crossingAware.screeningDisposition=Object.entries(detail.crossingAware.screeningGates).filter(([k])=>['sixtySecondPassRetention','twoRiderSwapStability','minimumFlowRetention'].includes(k)).every(([,v])=>v===true)?'SCREEN_PASSED_NOT_SPORTING_APPROVAL':'SCREEN_FAIL_NO_GO'
  }
 comparison.push(detail)
}
const report={study:'A2_CROSSING_AWARE_FOUR_GRID_V3',riders:count,fullRace:false,secondsSimulated:900,gridVariants:grids,policies:policies.map(x=>x.key),scenarios,technicalGate:failure.length?'FAIL':'PASS',
 officialWrites:0,sportingApproval:'NOT_APPROVED',comparison,results:runResults,failures:failure,
 limitations:['These are synthetic 90-tick micro traffic cases, not historical stages or finish classifications',
 'Sustained means longitudinal order did not reverse within 30/60s; it is not a validated tactical pass or race attack',
 'Near-tied starting positions are ignored until a strict initial pair order is observed',
 'Pass events in the last 30/60 seconds without enough observed time are right-censored and excluded from sustained counts',
 'A full two-lane rotation can be a trivial symmetry; alternating-row swaps are the nonuniform fourth grid',
 'The 85% sustained-pass, +5pp swap, and -3pp flow screens are predeclared research filters, not empirical acceptance thresholds',
 'Sporting criteria lack source-backed thresholds and 106/168-rider full-stage tests remain blocked']}
writeFileSync(dir+'/crossing-aware-grid-'+count+'.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({size:count,gate:report.technicalGate,comparison,failed:failure.length,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
assert.equal(failure.length,0,'One or more controlled passes/grid replays failed')
