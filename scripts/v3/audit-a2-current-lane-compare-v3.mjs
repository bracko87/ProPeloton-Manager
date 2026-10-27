/** A2 research: actual starting-LANE perturbations, NOT official race logic. */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSimultaneousMicroV3 as begin,advanceSimultaneousMicroV3 as advance} from './simultaneousConflictResearchV3.mjs'
import {initializeIntentAwareCorridorV3 as startPolicy,advanceIntentAwareCorridorV3 as plan} from './a2IntentAwareCorridorV3.mjs'
import {initializeCurrentLaneFirstV3 as startCurrent,advanceCurrentLaneFirstV3 as planCurrent} from './a2CurrentLaneFirstV3.mjs'
import {initializePersistentPassTrackerV3 as startPassing,advancePersistentPassTrackerV3 as trackPassing} from './a2PersistentPassesV3.mjs'
import {continuousBicycleCollisionV3 as collision} from './continuousLateralResearchV3.mjs'
import {selectEarlyCorridorV3 as choose} from './a2EarlyCorridorV3.mjs'
const size=Number(process.env.V3_A2_LANECOMP_SIZE??3),dir=process.env.V3_A2_LANECOMP_DIR??'/tmp/a2-lane-comparison'
assert([2,3,4,5,6].includes(size));mkdirSync(dir,{recursive:true})
const lanes=['original','rear_0','rear_2','lead_0','lead_2',...(size>=3?['rival_1','rival_3']:[])]
const scenarios=['open',...(size>=3?['early','delayed']:[]),...(size>=4?['second_claim']:[])]
const out=[],failures=[]
function correctEdgeRoundoff(intents,g){
 const maxY=(g.laneCount-1)*g.centerStepM
 let corrections=0
 const moves=intents.map(move=>{
  if(move.targetY>maxY&&move.targetY-maxY<=1e-9){
   const safe=Math.round((maxY-1e-6)*1e6)/1e6
   assert(maxY-safe<=2e-6&&safe<maxY,'Unsafe edge correction')
   corrections++
   return {...move,targetY:safe}
  }
  return move
 })
 return {moves,corrections}
}
function startRiders(g,headway,scenario,variant){
 const c=g.centerStepM,riders=[
  {riderId:'lead',meters:118,y:c,speedMps:4,cpWatts:245,wPrimeJoules:18000},
  {riderId:'rear',meters:118-headway,y:c,speedMps:4,cpWatts:325,wPrimeJoules:23000}]
 for(let i=2;i<size;i++)riders.push({riderId:'extra'+i,meters:i===2&&scenario!=='open'?150:i===3&&scenario==='second_claim'?168:76-(i-2)*24,
  y:i===2&&scenario!=='open'?2*c:i===3&&scenario==='second_claim'?3*c-1e-6:i%2===0?3*c-1e-6:0,
  speedMps:4,cpWatts:230,wPrimeJoules:18000})
 const [who,dest]=variant.split('_')
 if(variant!=='original'){
  const id=who==='rival'?'extra2':who
  const rider=riders.find(r=>r.riderId===id)
  rider.y=Number(dest)*c-(Number(dest)===3?1e-6:0)
 }
 for(let i=0;i<riders.length;i++)for(let j=i+1;j<riders.length;j++)
  assert(Math.abs(riders[i].meters-riders[j].meters)>=1.8||Math.abs(riders[i].y-riders[j].y)>=g.lateralCollisionM,'Overlapping starting bicycles')
 return riders
}
function wishes(state,scenario,rearRequest,g,desiredRearY){
 const c=g.centerStepM
 return state.riders.map(r=>{
  let targetY=r.y,forwardMeters=r.riderId==='rear'?rearRequest:r.riderId==='lead'?45:42
  if(r.riderId==='rear')targetY=desiredRearY
  if(r.riderId==='extra2'&&scenario!=='open'&&state.tick>=(scenario==='delayed'?5:1)&&r.y>0)targetY=Math.max(0,r.y-c)
  if(r.riderId==='extra3'&&scenario==='second_claim'&&state.tick>=2&&r.y>0)targetY=Math.max(0,r.y-c)
  targetY=r.y+Math.max(-c,Math.min(c,targetY-r.y))
  return {riderId:r.riderId,forwardMeters,targetY:Math.round(Math.max(0,Math.min(3*c-1e-6,targetY))*1e6)/1e6}
 })
}
function checkSweep(before,after,g){
 const a=new Map(before.map(x=>[x.riderId,x]))
 for(let i=0;i<after.length;i++)for(let j=i+1;j<after.length;j++){
  const x=after[i],y=after[j],p=a.get(x.riderId),q=a.get(y.riderId)
  assert(!collision({x0:p.meters,x1:x.meters,y0:p.y,y1:x.y},{x0:q.meters,x1:y.meters,y0:q.y,y1:y.y},
   {longitudinal:1.8,lateral:g.lateralCollisionM}),'Sweep collision')
 }
}
for(const geometry of BATCH40_GEOMETRIES)for(const headway of [9,18])for(const rearRequest of [55,75])
 for(const scenario of scenarios)for(const lane of lanes)for(const policyId of ['baseline','current_lane_first','outer_lane_guard']){
 const g=validateRoadScenarioV3(geometry),initial=startRiders(g,headway,scenario,lane)
 const intended=choose(initial,'rear',geometry).selectedY
 const row={size,road:g.id,headway,rearRequest,scenario,lane,policy:policyId,gate:'UNKNOWN'}
 try{
  let physics=begin({riders:initial,geometry,dt:10}),policy=policyId==='baseline'?startPolicy():startCurrent({outerLaneOnly:policyId==='outer_lane_guard'}),passing=startPassing(physics.riders)
  let saved=null,haltOther=0,haltRear=0,roundoffCorrections=0
  for(let t=1;t<=40;t++){
   const previous=physics.riders
   const requested=wishes(physics,scenario,rearRequest,g,intended)
   const action=policyId==='baseline'?plan(policy,previous,requested,geometry):planCurrent(policy,previous,requested,geometry)
   policy=action.state
   const prepared=correctEdgeRoundoff(action.intents,g)
   roundoffCorrections+=prepared.corrections
   physics=advance(physics,prepared.moves)
   checkSweep(previous,physics.riders,g)
   passing=trackPassing(passing,physics.riders,physics.elapsedSeconds)
   assert(physics.officialWrites===0&&physics.sportingApproval==='NOT_APPROVED')
   assert(physics.riders.every(x=>Number.isFinite(x.energy.remainingWPrimeJoules)&&x.energy.remainingWPrimeJoules>=0))
   const rearBefore=previous.find(r=>r.riderId==='rear'),rearAfter=physics.riders.find(r=>r.riderId==='rear')
   if(rearAfter.meters-rearBefore.meters<.5)haltRear++
   for(const r of physics.riders.filter(x=>x.riderId.startsWith('extra'))){
    if(r.meters-previous.find(x=>x.riderId===r.riderId).meters<.5)haltOther++
   }
   if(t===20)saved=JSON.parse(JSON.stringify({physics,policy,passing}))
  }
  let p=saved.physics,q=saved.policy,s=saved.passing
  for(let t=21;t<=40;t++){
   const requested=wishes(p,scenario,rearRequest,g,intended)
   const action=policyId==='baseline'?plan(q,p.riders,requested,geometry):planCurrent(q,p.riders,requested,geometry)
   q=action.state;p=advance(p,correctEdgeRoundoff(action.intents,g).moves)
   s=trackPassing(s,p.riders,p.elapsedSeconds)
  }
  assert.deepEqual(p,physics);assert.deepEqual(q,policy);assert.deepEqual(s,passing)
  const events=passing.events.filter(e=>e.passer==='rear'&&e.passed==='lead')
  const end=new Map(physics.riders.map(r=>[r.riderId,r.y]))
  row.gate='PASS'
  row.sustained60s=events.some(e=>(e.reversedAtSeconds??passing.elapsedSeconds)-e.atSeconds>=60)
  row.haltedOtherTicks=haltOther
  row.haltedRearTicks=haltRear
  row.stayTicks=policyId!=='baseline'?policy.metrics.stayTicks:0
  row.fallbackTicks=policyId!=='baseline'?policy.metrics.fallbackTicks:0
  row.currentIntentConflicts=policyId!=='baseline'?policy.metrics.observedConflictingIntentTicks:0
  row.otherIntentsOverridden=policyId!=='baseline'?policy.metrics.changedOpponentIntents:0
  row.roundoffCorrections=roundoffCorrections
  row.primaryCenter=scenario==='open'?null:Math.abs(end.get('extra2'))<1e-4
  row.secondCenter=scenario==='second_claim'?Math.abs(end.get('extra3'))<1e-4:null
  row.selectedY=intended
  row.finalLeadGapM=Math.round((physics.riders.find(x=>x.riderId==='rear').meters-physics.riders.find(x=>x.riderId==='lead').meters)*1e6)/1e6
  row.finalRearLaneY=Math.round(physics.riders.find(x=>x.riderId==='rear').y*1e6)/1e6
  row.checkpointExact=true
 }catch(e){row.gate='FAIL';row.reason=String(e?.stack??e);failures.push(row);console.error(JSON.stringify({size,road:g.id,scenario,lane,headway,rearRequest,reason:String(e?.message??e)}))}
 out.push(row)
}
const aggregate={}
for(const row of out){
 const k=row.policy+'|'+row.scenario+'|'+row.lane,v=aggregate[k]??{policy:row.policy,scenario:row.scenario,lane:row.lane,count:0,technical:0,sustained:0,primary:0,second:0,halt:0,rearHalt:0,stayTicks:0,fallbackTicks:0}
 v.count++;v.technical+=Number(row.gate==='PASS');v.sustained+=Number(row.sustained60s);v.primary+=Number(row.primaryCenter===true)
 v.second+=Number(row.secondCenter===true);v.halt+=row.haltedOtherTicks??0;v.rearHalt+=row.haltedRearTicks??0;v.stayTicks+=row.stayTicks??0;v.fallbackTicks+=row.fallbackTicks??0;aggregate[k]=v
}
const report={study:'A2_CURRENT_LANE_FIRST_1760_MATCHED_COMPARISON',size,technicalGate:failures.length?'FAIL':'PASS',cases:out.length,results:out,
 aggregate:Object.values(aggregate),roundoffCorrections:out.reduce((sum,x)=>sum+(x.roundoffCorrections??0),0),failures,officialWrites:0,sportingApproval:'NOT_APPROVED'}
writeFileSync(dir+'/lane-comparison-'+size+'.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({size,technicalGate:report.technicalGate,cases:report.cases,aggregate:report.aggregate,failures:failures.length}))
assert.equal(failures.length,0,'Starting lane sensitivity technical gate')
