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
import {initializeFairCorridorV3 as fairStart,advanceFairCorridorV3 as fairStep} from './a2FairCorridorSchedulingV3.mjs'
import {initializeTimedCorridorV3 as timedStart,advanceTimedCorridorV3 as timedStep} from './a2TimedCorridorV3.mjs'
import {initializeConditionalCorridorV3 as conditionalStart,advanceConditionalCorridorV3 as conditionalStep} from './a2ConditionalCorridorV3.mjs'
import {selectEarlyCorridorV3 as choose} from './a2EarlyCorridorV3.mjs'
import {initializePersistentPassTrackerV3 as passStart,advancePersistentPassTrackerV3 as passNext} from './a2PersistentPassesV3.mjs'
import {continuousBicycleCollisionV3 as collide} from './continuousLateralResearchV3.mjs'
const size=Number(process.env.V3_A2_ADVERSARY_SIZE??2),dir=process.env.V3_A2_ADVERSARY_DIR??'/tmp/a2-adversarial-slots'
assert([2,3,4,5,6].includes(size))
mkdirSync(dir,{recursive:true})
const dt=10,round=n=>Math.round(n*1e6)/1e6
function roster(g,headway,scenario){
 const c=g.centerStepM,initial=[
 {riderId:'lead',meters:118,y:c,speedMps:4,cpWatts:245,wPrimeJoules:18000},
 {riderId:'rear',meters:118-headway,y:c,speedMps:4,cpWatts:325,wPrimeJoules:23000}]
 for(let i=2;i<size;i++){
  const blocker=i===2&&scenario!=='open'
  const secondClaimant=i===3&&scenario==='second_claim'
  initial.push({riderId:'extra'+i,meters:blocker?150:secondClaimant?168:76-(i-2)*24,
   y:blocker?2*c:secondClaimant?3*c-1e-6:i%2===0?3*c-1e-6:0,speedMps:4,cpWatts:230,wPrimeJoules:18000})
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
   if(scenario!=='open'&&r.riderId==='extra2'){
    const beginTick=scenario==='late_entry'?5:1
    if(scenario==='reversal'){
     if(state.tick>=1&&state.tick<6&&r.y>1e-6)targetY=Math.max(0,r.y-c)
     else if(state.tick>=6&&r.y<2*c-1e-6)targetY=Math.min(2*c,r.y+c)
    }else if(state.tick>=beginTick&&r.y>1e-6)targetY=Math.max(0,r.y-c)
   }
   if(scenario==='second_claim'&&r.riderId==='extra3'&&state.tick>=2&&r.y>1e-6)
    targetY=Math.max(0,r.y-c)
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
const scenarios=size>=3?['open','moving_left','late_entry','reversal',...(size>=4?['second_claim']:[])]:['open'],policies=['baseline','slot_after','slot_eager_start','slot_conditional']
const results=[],failures=[]
for(const geometry of BATCH40_GEOMETRIES)for(const headway of [9,18])for(const rearRequest of [55,75])for(const scenario of scenarios)for(const policy of policies){
 const g=validateRoadScenarioV3(geometry),initial=roster(g,headway,scenario)
 const selected=choose(initial,'rear',geometry).selectedY
 const record={riders:size,road:g.id,headway,rearRequest,scenario,policy,technical:'UNKNOWN',officialWrites:0}
 try{
  let physics=begin({riders:initial,geometry,dt}),passing=passStart(physics.riders),lease=reserve({leaseTicks:8,maxDeferralsPerRival:2}),fair=fairStart({maxHoldTicks:1,releaseGapM:4,leaseTicks:8}),timed=timedStart({mode:'rival_first',observeTicks:policy==='slot_eager_start'?0:1,maxHoldTicks:1,maxWaitTicks:8}),conditional=conditionalStart()
  let checkpoint=null,otherHalted=0,rearHalted=0,blockerEntered=false,blockerMovement=0,blockerCompletionSecond=null,reverseMetres=0,secondClaimMoveMetres=0
  for(let tick=1;tick<=40;tick++){
   const before=physics.riders,requested=requests(physics,scenario,rearRequest,g,selected)
   let moves=requested
   if(policy==='slot_conditional'){
    const candidate=conditionalStep(conditional,physics.riders,requested,geometry)
    conditional=candidate.state;moves=candidate.intents
    assert(conditional.officialWrites===0&&conditional.sportingApproval==='NOT_APPROVED')
   }else if(policy.startsWith('slot_')){
    const candidate=timedStep(timed,physics.riders,requested,geometry)
    timed=candidate.state;moves=candidate.intents
    assert(timed.officialWrites===0&&timed.sportingApproval==='NOT_APPROVED'&&timed.holdsUsed<=1)
   }else if(policy==='fair_release'){
    const candidate=fairStep(fair,physics.riders,requested,geometry,{acknowledgedRiderIds:['extra2']})
    fair=candidate.state;moves=candidate.intents
    assert(fair.officialWrites===0&&fair.sportingApproval==='NOT_APPROVED'&&Object.values(fair.pending).every(v=>v.holds<=1))
   }else if(policy!=='baseline'){
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
     if(blockerCompletionSecond===null&&r.y<=g.centerStepM*.5)blockerCompletionSecond=after.elapsedSeconds
     if(scenario==='reversal'&&state.tick>=6&&r.y>previous.get(r.riderId).y)reverseMetres+=r.y-previous.get(r.riderId).y
    }
    if(scenario==='second_claim'&&r.riderId==='extra3')
     secondClaimMoveMetres+=Math.abs(r.y-previous.get(r.riderId).y)
   }
   assert(after.metrics.achievedMeters<=after.metrics.requestedMeters+1e-5)
   assert(after.officialWrites===0&&after.sportingApproval==='NOT_APPROVED')
   physics=after
   if(tick===20)checkpoint=JSON.parse(JSON.stringify({physics,passing,lease,fair,timed,conditional}))
  }
  let replayPhysics=checkpoint.physics,replayPassing=checkpoint.passing,replayLease=checkpoint.lease,replayFair=checkpoint.fair,replayTimed=checkpoint.timed,replayConditional=checkpoint.conditional
  for(let tick=21;tick<=40;tick++){
   const requested=requests(replayPhysics,scenario,rearRequest,g,selected)
   let moves=requested
   if(policy==='slot_conditional'){
    const candidate=conditionalStep(replayConditional,replayPhysics.riders,requested,geometry)
    replayConditional=candidate.state;moves=candidate.intents
   }else if(policy.startsWith('slot_')){
    const candidate=timedStep(replayTimed,replayPhysics.riders,requested,geometry)
    replayTimed=candidate.state;moves=candidate.intents
   }else if(policy==='fair_release'){
    const candidate=fairStep(replayFair,replayPhysics.riders,requested,geometry,{acknowledgedRiderIds:['extra2']})
    replayFair=candidate.state;moves=candidate.intents
   }else if(policy!=='baseline'){
    const current=negotiate(replayLease,replayPhysics.riders,requested,geometry,{acknowledgedRiderIds:policy==='lease_ack'?['extra2']:[]})
    replayLease=current.reservation;moves=current.intents
   }
   replayPhysics=advance(replayPhysics,moves)
   replayPassing=passNext(replayPassing,replayPhysics.riders,replayPhysics.elapsedSeconds)
  }
  assert.deepEqual(replayPhysics,physics,'Physics/energy checkpoint mismatch')
  assert.deepEqual(replayPassing,passing,'Pass checkpoint mismatch')
  assert.deepEqual(replayLease,lease,'Lease checkpoint mismatch')
  assert.deepEqual(replayFair,fair,'Two-sided release schedule replay mismatch')
  assert.deepEqual(replayTimed,timed,'Time slot checkpoint state mismatch')
  assert.deepEqual(replayConditional,conditional,'Conditional slot checkpoint mismatch')
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
  record.blockerCompletionSecond=blockerCompletionSecond
  record.reversedLateralMetres=round(reverseMetres)
  record.secondClaimantLateralMetres=round(secondClaimMoveMetres)
  record.passAfterBlockerVerified=scenario!=='moving_left'||record.firstPassSecond===null||blockerCompletionSecond!==null&&record.firstPassSecond>blockerCompletionSecond
  if(policy==='slot_after'&&scenario==='moving_left'){
   assert(blockerCompletionSecond!==null,'Blocker did not complete during pass-after trial')
   assert(record.firstPassSecond===null||record.firstPassSecond>blockerCompletionSecond,'Overtake occurred before rival lane completion')
  }
  record.otherHaltedRiderTicks=otherHalted;record.rearHaltedRiderTicks=rearHalted
  record.blockerEnteredCorridor=blockerEntered;record.blockerLateralMeters=round(blockerMovement)
  record.blockerCompletedMove=scenario!=='open'?physics.riders.find(r=>r.riderId==='extra2').y<=g.centerStepM*.5:null
  record.progressPercent=round(100*physics.metrics.achievedMeters/physics.metrics.requestedMeters)
  record.leaseMetrics=policy==='lease_ack'?lease.metrics:null
  record.fairMetrics=policy==='fair_release'?fair.metrics:null
  record.fairPending=policy==='fair_release'?fair.pending:null
  record.fairEndPhase=policy==='fair_release'?fair.phase:null
  record.timedMetrics=policy!=='slot_conditional'&&policy.startsWith('slot_')?timed.metrics:policy==='slot_conditional'?conditional.planner?.metrics:null
  record.conditionalPolicy=policy==='slot_conditional'?conditional.policy:null
  record.conditionalRisk=policy==='slot_conditional'?conditional.riskExplanation:null
  record.conditionalMetrics=policy==='slot_conditional'?conditional.metrics:null
  record.timedPhase=policy==='slot_conditional'?conditional.planner?.phase:policy.startsWith('slot_')?timed.phase:null
  record.timedEvents=policy==='slot_conditional'?conditional.planner?.events??[]:policy.startsWith('slot_')?timed.events:[]
  record.leaseEvents=[]
  record.fairEvents=policy==='fair_release'?fair.events:[]
  record.checkpointExact=true
 }catch(e){record.technical='FAIL';record.error=String(e?.stack??e);failures.push(record)}
 results.push(record)
 console.log(JSON.stringify(record))
}
const by={}
for(const row of results){
 const k=[row.scenario,row.policy].join(':')
 const v=by[k]??{scenario:row.scenario,policy:row.policy,total:0,technicalPassed:0,sustainedPasses:0,otherHalted:0,rearHalted:0,deferrals:0,cancellations:0,blockersEntered:0,blockersCompleted:0,fairHolds:0,fairReleases:0,fairCompleted:0,fairGapCapTicks:0,slotRivalCompleted:0,slotSecondLane:0,slotTimeOuts:0,slotHoldTicks:0,slotConflicts:0,fastStarts:0,watchStarts:0,reverseMeters:0,secondClaimMeters:0}
 v.total++;v.technicalPassed+=Number(row.technical==='PASS');v.sustainedPasses+=Number(row.sustained60s===true)
 v.otherHalted+=row.otherHaltedRiderTicks??0;v.rearHalted+=row.rearHaltedRiderTicks??0;v.deferrals+=row.leaseMetrics?.acknowledgedDeferrals??0
 v.cancellations+=row.leaseMetrics?.revocations??0;v.fairHolds+=row.fairMetrics?.holds??0;v.fairReleases+=row.fairMetrics?.releases??0;v.fairCompleted+=row.fairMetrics?.completed??0;v.fairGapCapTicks+=row.fairMetrics?.gapCappedTicks??0;v.blockersEntered+=Number(row.blockerEnteredCorridor===true);v.blockersCompleted+=Number(row.blockerCompletedMove===true)
 v.slotRivalCompleted+=row.timedMetrics?.rivalCompleted??0
 v.slotSecondLane+=row.timedMetrics?.secondLaneSelections??0
 v.slotTimeOuts+=row.timedMetrics?.timedOut??0
 v.slotHoldTicks+=row.timedMetrics?.consentHolds??0
 v.slotConflicts+=row.timedMetrics?.detectedConflicts??0
 v.fastStarts+=row.conditionalMetrics?.fastStarts??0
 v.watchStarts+=row.conditionalMetrics?.watchStarts??0
 v.reverseMeters+=row.reversedLateralMetres??0
 v.secondClaimMeters+=row.secondClaimantLateralMetres??0
 by[k]=v
}
const report={study:'A2_ADVERSARIAL_CONDITIONAL_CORRIDOR',roster:size,technicalGate:failures.length?'FAIL':'PASS',
 officialWrites:0,sportingApproval:'NOT_APPROVED',scenarios:results.length,comparison:Object.values(by),results,failures,
 limitations:['Delayed and reversing blocker scripts are hidden from the planner; only current actual positions and current submitted intentions are visible',
 'Reservation does not override final swept-collision solver or predict future actual decisions',
 '40 synthetic 10s steps, no real road width/elevation, tactics, drafting or 106/168 full stage',
 'Finite W-prime, exact JSON replay and strict 60s pass observer validated only for small fields']}
writeFileSync(dir+'/adversarial-conditional-'+size+'.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({roster:size,technicalGate:report.technicalGate,comparison:report.comparison,failures:failures.length,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
assert.equal(failures.length,0,'One or more acknowledgment corridor cases technically unsafe')
