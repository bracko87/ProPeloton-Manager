/** Milestone A2, OFFLINE-ONLY: 4 road envelopes x headways x closing speeds,
 * 2–6 riders, including late-arriving lane obstacles.
 * Canonical collision, energy and game data are NOT modified.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSimultaneousMicroV3 as start,advanceSimultaneousMicroV3 as advance} from './simultaneousConflictResearchV3.mjs'
import {continuousBicycleCollisionV3 as collides} from './continuousLateralResearchV3.mjs'
import {selectEarlyCorridorV3 as chooseCorridor} from './a2EarlyCorridorV3.mjs'
import {initializePersistentPassTrackerV3 as startPass,advancePersistentPassTrackerV3 as advancePass,summarizePersistentPassTrackerV3 as summarizePass} from './a2PersistentPassesV3.mjs'
const count=Number(process.env.V3_A2_CORRIDOR_SIZE??2),dir=process.env.V3_A2_CORRIDOR_DIR??'/tmp/a2-width-corridors'
assert([2,3,4,5,6].includes(count))
mkdirSync(dir,{recursive:true})
const dt=10,round=n=>Math.round(n*1e6)/1e6,roads=BATCH40_GEOMETRIES
const result=[],failures=[]
function buildInitial(g,headway,scenario){
 const c=g.centerStepM,initial=[
  {riderId:'lead',meters:118,y:c,speedMps:4,cpWatts:245,wPrimeJoules:18000},
  {riderId:'rear',meters:118-headway,y:c,speedMps:4,cpWatts:325,wPrimeJoules:23000}
 ]
 for(let i=2;i<count;i++){
  const blocker=i===2&&(scenario==='moving_left'||scenario==='occupied_right')
  initial.push({riderId:'extra'+i,meters:blocker?110:76-(i-2)*24,y:blocker?2*c:(i%2===0?Math.min(3*c-1e-6,3*c):0),speedMps:4,cpWatts:230,wPrimeJoules:18000})
 }
 return initial
}
function desired(state,spec,g,frozenChoice){
 const c=g.centerStepM,rear=state.riders.find(r=>r.riderId==='rear'),lead=state.riders.find(r=>r.riderId==='lead'),gap=lead.meters-rear.meters
 const dynamicChoice=spec.policy==='adaptive'&&Math.abs(rear.y-c)<c*.5
  ?chooseCorridor(state.riders,'rear',spec.geometry).selectedY:frozenChoice
 return state.riders.map(r=>{
  let targetY=r.y,forwardMeters=45
  if(r.riderId==='rear'){
   forwardMeters=spec.rearRequest
   if(spec.policy==='early')targetY=frozenChoice
   else if(spec.policy==='late'&&gap<=5)targetY=frozenChoice
   else if(spec.policy==='coordinated')targetY=c
   else if(spec.policy==='adaptive')targetY=dynamicChoice
   else if(spec.policy==='forced_right')targetY=2*c
  }else if(r.riderId==='lead'){
   if(spec.policy==='coordinated')targetY=0
  }else {
   forwardMeters=42
   if(spec.scenario==='moving_left'&&r.riderId==='extra2'){
    // A bicycle enters the once-clear left-side corridor in two adjacent
    // moves, without knowledge of future rider intent.
    if(state.tick===1)targetY=c
    if(state.tick===2)targetY=0
   }
  }
  // This is a scripted rider desire, not permission for an unsafe trajectory.
  // Each rider may request at most one track-spacing shift per tick.
  targetY=r.y+Math.max(-c,Math.min(c,targetY-r.y))
  targetY=Math.max(0,Math.min(3*c-1e-6,targetY))
  return {riderId:r.riderId,forwardMeters,targetY:round(targetY)}
 })
}
function verifySweep(before,after,g){
 const old=new Map(before.map(r=>[r.riderId,r]))
 const paths=after.map(r=>({riderId:r.riderId,x0:old.get(r.riderId).meters,x1:r.meters,y0:old.get(r.riderId).y,y1:r.y}))
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)
  assert(!collides(paths[i],paths[j],{longitudinal:1.8,lateral:g.lateralCollisionM}), 'Continuous bicycle overlap '+paths[i].riderId+' '+paths[j].riderId)
}
const specs=[]
for(const geometry of roads)for(const headway of [9,18])for(const rearRequest of [55,75]){
 for(const policy of ['early','late','coordinated'])
  specs.push({geometry,headway,rearRequest,scenario:'open',policy})
 if(count>=3){
  for(const policy of ['early','late','adaptive'])
   specs.push({geometry,headway,rearRequest,scenario:'moving_left',policy})
  for(const policy of ['forced_right','adaptive'])
   specs.push({geometry,headway,rearRequest,scenario:'occupied_right',policy})
 }
}
for(const spec of specs){
 const g=validateRoadScenarioV3(spec.geometry),initial=buildInitial(g,spec.headway,spec.scenario)
 const chosen=chooseCorridor(initial,'rear',spec.geometry)
 const record={riders:count,road:g.id,roadWidthM:g.roadWidthM,lateralCollisionM:g.lateralCollisionM,
  headwayM:spec.headway,rearRequestM:spec.rearRequest,scenario:spec.scenario,policy:spec.policy,
  choiceY:chosen.selectedY,technical:'UNTESTED',officialWrites:0}
 try{
  let state=start({riders:initial,geometry:spec.geometry,dt}),passing=startPass(state.riders)
  let checkpoint=null,haltedOtherTicks=0,minTickProgress=1,nearStopRearTicks=0
  for(let tick=1;tick<=40;tick++){
   const before=state.riders,actions=desired(state,spec,g,chosen.selectedY)
   const after=advance(state,actions)
   verifySweep(before,after.riders,g)
   passing=advancePass(passing,after.riders,after.elapsedSeconds)
   const prev=new Map(before.map(r=>[r.riderId,r]))
   for(const r of after.riders){
    const moved=r.meters-prev.get(r.riderId).meters
    if(r.riderId.startsWith('extra')&&moved<.5)haltedOtherTicks++
    if(r.riderId==='rear'&&moved<.5)nearStopRearTicks++
   }
   assert(after.riders.every(r=>r.energy.remainingWPrimeJoules>=0&&Number.isFinite(r.energy.remainingWPrimeJoules)),'Invalid finite W-prime')
   assert(after.metrics.achievedMeters<=after.metrics.requestedMeters+1e-5,'Forward distance invented')
   assert(after.officialWrites===0&&after.sportingApproval==='NOT_APPROVED')
   const asked=after.metrics.requestedMeters-state.metrics.requestedMeters,achieved=after.metrics.achievedMeters-state.metrics.achievedMeters
   if(asked>1e-5)minTickProgress=Math.min(minTickProgress,achieved/asked)
   state=after
   if(tick===20)checkpoint=JSON.parse(JSON.stringify({state,passing}))
  }
  let resumed=checkpoint.state,passReplayed=checkpoint.passing
  for(let t=21;t<=40;t++){
   resumed=advance(resumed,desired(resumed,spec,g,chosen.selectedY))
   passReplayed=advancePass(passReplayed,resumed.riders,resumed.elapsedSeconds)
  }
  assert.deepEqual(resumed,state,'Exact energy/path checkpoint replay mismatch')
  assert.deepEqual(passReplayed,passing,'Overtaking history checkpoint replay mismatch')
  const shuffled=start({riders:initial.slice().reverse(),geometry:spec.geometry,dt})
  const canonical=start({riders:initial,geometry:spec.geometry,dt})
  const normalize=s=>s.riders.slice().sort((a,b)=>a.riderId.localeCompare(b.riderId))
  assert.deepEqual(normalize(advance(shuffled,desired(shuffled,spec,g,chosen.selectedY))),normalize(advance(canonical,desired(canonical,spec,g,chosen.selectedY))),'Array-order movement bias')
  const events=passing.events.filter(e=>e.passer==='rear'&&e.passed==='lead')
  record.technical='PASS'
  record.firstPassSecond=events[0]?.atSeconds??null
  record.sustained60s=events.some(e=>(e.reversedAtSeconds??passing.elapsedSeconds)-e.atSeconds>=60)
  record.passEvents=events.length
  record.latePassCensored=events.length>0&&!record.sustained60s
  record.unrelatedHaltedRiderTicks=haltedOtherTicks
  record.rearNearStopTicks=nearStopRearTicks
  record.progressPercent=round(100*state.metrics.achievedMeters/state.metrics.requestedMeters)
  record.worstTickProgressPercent=round(100*minTickProgress)
  record.finalGapRearMinusLeadM=round(state.riders.find(r=>r.riderId==='rear').meters-state.riders.find(r=>r.riderId==='lead').meters)
  record.checkpointExact=true;record.permutationExact=true
 }catch(e){
  record.technical='FAIL';record.reason=String(e?.stack??e);failures.push(record)
 }
 result.push(record)
 console.log(JSON.stringify(record))
}
const groups={}
for(const row of result){
 const k=[row.road,row.scenario,row.policy,row.rearRequestM].join('|')
 const o=groups[k]??{road:row.road,scenario:row.scenario,policy:row.policy,rearRequestM:row.rearRequestM,total:0,passed:0,sustained:0,haltOther:0,nearStopRear:0,earliestPass:null}
 o.total++;o.passed+=Number(row.technical==='PASS');o.sustained+=Number(row.sustained60s===true)
 o.haltOther+=row.unrelatedHaltedRiderTicks??0;o.nearStopRear+=row.rearNearStopTicks??0
 if(row.firstPassSecond!==null&&row.firstPassSecond!==undefined)o.earliestPass=o.earliestPass===null?row.firstPassSecond:Math.min(o.earliestPass,row.firstPassSecond)
 groups[k]=o
}
const summary={study:'A2_EARLY_CORRIDOR_WIDTH_CLOSING_DYNAMIC',riders:count,scenarios:result.length,
 allTechnicalPass:failures.length===0,technicalGate:failures.length?'FAIL':'PASS',
 officialWrites:0,sportingApproval:'NOT_APPROVED',aggregates:Object.values(groups),results:result,failures,
 limitations:['All four road widths and bicycle safety envelopes are synthetic, not official stage measurements',
 '40 tick trial with fixed synthetic powers and scripted intent cannot establish realistic peloton dynamics',
 'Current-occupancy lane choice is not a prediction or guarantee of future corridor availability',
 'A 60-second strict longitudinal pass is a micro benchmark, not a tactical race win',
 'No 106/168 full stages, source elevations, weather, or production races involved']}
writeFileSync(dir+'/width-corridor-'+count+'.json',JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify({size:count,gate:summary.technicalGate,total:result.length,acceptedPasses:result.filter(x=>x.sustained60s).length,
 roadSummary:roads.map(g=>({id:g.id,technical:result.filter(x=>x.road===g.id&&x.technical==='PASS').length,passes:result.filter(x=>x.road===g.id&&x.sustained60s).length})),
 dynamic:summary.aggregates.filter(x=>x.scenario!=='open'),failed:failures.length,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
assert.equal(failures.length,0,'Micro road envelope testing did not meet engineering safety')
