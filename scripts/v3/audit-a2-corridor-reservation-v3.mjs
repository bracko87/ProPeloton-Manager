/** A2, OFFLINE ONLY: compare consenting and nonconsenting short-lived lane
 * reservations against the unchanged symmetric solver + prior micro fixture.
 * The protocol only edits submitted moves when riders explicitly acknowledge.
 * Physics safety is independently verified on every accepted swept path.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSimultaneousMicroV3 as begin,advanceSimultaneousMicroV3 as advance} from './simultaneousConflictResearchV3.mjs'
import {initializeCorridorReservationV3 as reserve,stepCorridorReservationV3 as negotiate} from './a2CorridorReservationResearchV3.mjs'
import {selectEarlyCorridorV3 as choose} from './a2EarlyCorridorV3.mjs'
import {initializePersistentPassTrackerV3 as passStart,advancePersistentPassTrackerV3 as passNext} from './a2PersistentPassesV3.mjs'
import {continuousBicycleCollisionV3 as collide} from './continuousLateralResearchV3.mjs'
const size=Number(process.env.V3_A2_LEASE_SIZE??2),dir=process.env.V3_A2_LEASE_DIR??'/tmp/a2-reservation'
assert([2,3,4,5,6].includes(size))
mkdirSync(dir,{recursive:true})
const dt=10,round=n=>Math.round(n*1e6)/1e6
function roster(g,headway,scenario){
 const c=g.centerStepM,initial=[
 {riderId:'lead',meters:118,y:c,speedMps:4,cpWatts:245,wPrimeJoules:18000},
 {riderId:'rear',meters:118-headway,y:c,speedMps:4,cpWatts:325,wPrimeJoules:23000}]
 for(let i=2;i<size;i++){
  const blocker=i===2&&scenario==='moving_left'
  initial.push({riderId:'extra'+i,meters:blocker?150:76-(i-2)*24,
   y:blocker?2*c:i%2===0?3*c-1e-6:0,speedMps:4,cpWatts:230,wPrimeJoules:18000})
 }
 return initial
}
function requests(state,scenario,rearRequest,g,choice){
 const c=g.centerStepM
 return state.riders.map(r=>{
  let targetY=r.y,forwardMeters=45
  if(r.riderId==='rear'){targetY=choice;forwardMeters=rearRequest}
  else if(r.riderId.startsWith('extra')){
   forwardMeters=42
   if(scenario==='moving_left'&&r.riderId==='extra2'){
    if(state.tick===1)targetY=c
    if(state.tick===2)targetY=0
   }
  }
  targetY=r.y+Math.max(-c,Math.min(c,targetY-r.y))
  targetY=Math.max(0,Math.min(3*c-1e-6,targetY))
  return {riderId:r.riderId,forwardMeters,targetY:round(targetY)}
 })
}
function swept(before,after,g){
 const prev=new Map(before.map(r=>[r.riderId,r]))
 const paths=after.map(r=>({riderId:r.riderId,x0:prev.get(r.riderId).meters,x1:r.meters,y0:prev.get(r.riderId).y,y1:r.y}))
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)
  assert(!collide(paths[i],paths[j],{longitudinal:1.8,lateral:g.lateralCollisionM}), 'Unsafe swept bicycles')
}
const scenarios=size>=3?['open','moving_left']:['open'],policies=['baseline','lease_ack','lease_refused']
const results=[],failures=[]
for(const geometry of BATCH40_GEOMETRIES)for(const headway of [9,18])for(const rearRequest of [55,75])for(const scenario of scenarios)for(const policy of policies){
 const g=validateRoadScenarioV3(geometry),initial=roster(g,headway,scenario)
 const selected=choose(initial,'rear',geometry).selectedY
 const record={riders:size,road:g.id,headway,rearRequest,scenario,policy,technical:'UNKNOWN',officialWrites:0}
 try{
  let physics=begin({riders:initial,geometry,dt}),passing=passStart(physics.riders),lease=reserve({leaseTicks:8,maxDeferralsPerRival:2})
  let checkpoint=null,otherHalted=0,rearHalted=0,blockerEntered=false,blockerMovement=0
  for(let tick=1;tick<=40;tick++){
   const before=physics.riders,requested=requests(physics,scenario,rearRequest,g,selected)
   let moves=requested
   if(policy!=='baseline'){
    const current=negotiate(lease,physics.riders,requested,geometry,{acknowledgedRiderIds:policy==='lease_ack'?['extra2']:[]})
    lease=current.reservation;moves=current.intents
    assert(lease.officialWrites===0&&lease.sportingApproval==='NOT_APPROVED')
   }
   const after=advance(physics,moves)
   swept(before,after.riders,g)
   passing=passNext(passing,after.riders,after.elapsedSeconds)
   const previous=new Map(before.map(r=>[r.riderId,r]))
   for(const r of after.riders){
    assert(Number.isFinite(r.energy.remainingWPrimeJoules)&&r.energy.remainingWPrimeJoules>=0,'Bad W-prime')
    const moved=r.meters-previous.get(r.riderId).meters
    if(r.riderId.startsWith('extra')&&moved<.5)otherHalted++
    if(r.riderId==='rear'&&moved<.5)rearHalted++
    if(scenario==='moving_left'&&r.riderId==='extra2'){
     blockerMovement+=Math.abs(r.y-previous.get(r.riderId).y)
     blockerEntered=blockerEntered||r.y<=g.centerStepM*.5
    }
   }
   assert(after.metrics.achievedMeters<=after.metrics.requestedMeters+1e-5)
   assert(after.officialWrites===0&&after.sportingApproval==='NOT_APPROVED')
   physics=after
   if(tick===20)checkpoint=JSON.parse(JSON.stringify({physics,passing,lease}))
  }
  let replayPhysics=checkpoint.physics,replayPassing=checkpoint.passing,replayLease=checkpoint.lease
  for(let tick=21;tick<=40;tick++){
   const requested=requests(replayPhysics,scenario,rearRequest,g,selected)
   let moves=requested
   if(policy!=='baseline'){
    const current=negotiate(replayLease,replayPhysics.riders,requested,geometry,{acknowledgedRiderIds:policy==='lease_ack'?['extra2']:[]})
    replayLease=current.reservation;moves=current.intents
   }
   replayPhysics=advance(replayPhysics,moves)
   replayPassing=passNext(replayPassing,replayPhysics.riders,replayPhysics.elapsedSeconds)
  }
  assert.deepEqual(replayPhysics,physics,'Physics/energy checkpoint mismatch')
  assert.deepEqual(replayPassing,passing,'Pass checkpoint mismatch')
  assert.deepEqual(replayLease,lease,'Lease checkpoint mismatch')
  const reversed=begin({riders:initial.slice().reverse(),geometry,dt})
  const reference=begin({riders:initial,geometry,dt})
  const firstMoves=requests(reference,scenario,rearRequest,g,selected)
  const secondMoves=requests(reversed,scenario,rearRequest,g,selected)
  const sorted=x=>x.riders.slice().sort((a,b)=>a.riderId.localeCompare(b.riderId))
  assert.deepEqual(sorted(advance(reference,firstMoves)),sorted(advance(reversed,secondMoves)),'Array order changed micro physics')
  const passes=passing.events.filter(e=>e.passer==='rear'&&e.passed==='lead')
  record.technical='PASS'
  record.sustained60s=passes.some(e=>(e.reversedAtSeconds??passing.elapsedSeconds)-e.atSeconds>=60)
  record.firstPassSecond=passes[0]?.atSeconds??null
  record.otherHaltedRiderTicks=otherHalted;record.rearHaltedRiderTicks=rearHalted
  record.blockerEnteredCorridor=blockerEntered;record.blockerLateralMeters=round(blockerMovement)
  record.progressPercent=round(100*physics.metrics.achievedMeters/physics.metrics.requestedMeters)
  record.leaseMetrics=policy==='baseline'?null:lease.metrics
  record.leaseEvents=policy==='baseline'?[]:lease.events
  record.checkpointExact=true
 }catch(e){record.technical='FAIL';record.error=String(e?.stack??e);failures.push(record)}
 results.push(record)
 console.log(JSON.stringify(record))
}
const by={}
for(const row of results){
 const k=[row.scenario,row.policy].join(':')
 const v=by[k]??{scenario:row.scenario,policy:row.policy,total:0,technicalPassed:0,sustainedPasses:0,otherHalted:0,rearHalted:0,deferrals:0,cancellations:0,blockersEntered:0}
 v.total++;v.technicalPassed+=Number(row.technical==='PASS');v.sustainedPasses+=Number(row.sustained60s===true)
 v.otherHalted+=row.otherHaltedRiderTicks??0;v.rearHalted+=row.rearHaltedRiderTicks??0;v.deferrals+=row.leaseMetrics?.acknowledgedDeferrals??0
 v.cancellations+=row.leaseMetrics?.revocations??0;v.blockersEntered+=Number(row.blockerEnteredCorridor===true)
 by[k]=v
}
const report={study:'A2_EXPLICIT_ACKNOWLEDGED_CORRIDOR_LEASE',roster:size,technicalGate:failures.length?'FAIL':'PASS',
 officialWrites:0,sportingApproval:'NOT_APPROVED',scenarios:results.length,comparison:Object.values(by),results,failures,
 limitations:['Consenting riders may voluntarily defer at most two own lane changes; unacknowledged rivals retain full proposed intent',
 'Reservation does not override final swept-collision solver or predict future actual decisions',
 '40 synthetic 10s steps, no real road width/elevation, tactics, drafting or 106/168 full stage',
 'Finite W-prime, exact JSON replay and strict 60s pass observer validated only for small fields']}
writeFileSync(dir+'/reservation-'+size+'.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({roster:size,technicalGate:report.technicalGate,comparison:report.comparison,failures:failures.length,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
assert.equal(failures.length,0,'One or more acknowledgment corridor cases technically unsafe')
