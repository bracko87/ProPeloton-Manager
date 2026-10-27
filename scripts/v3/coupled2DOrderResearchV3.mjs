/** A2 SEPARATE SNAPSHOT for sequential solve order investigation only.
 * Do not import this module in gameplay or use it to run production races.
 * Its default behavior must match the canonical offline solver byte-for-byte.
 * The opt-in rear_first/alternate_ticks settings deliberately stress the
 * priority dependency and do not imply these are physically valid policies.
 */
/** V3 Batch 42: a genuinely stateful TWO-DIMENSIONAL OFFLINE bicycle pack.
 * Rider metres, continuous lateral position, velocities and W-prime are all
 * state variables. This module is NEVER imported by production race selection.
 * Strict finite envelopes / fail-closed collision, no teleportation.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {chooseNeighborSpaceLaneV3} from './neighborPassV3.mjs'
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
import {initializeEnergyBalanceResearchV3,advanceEnergyBalanceResearchV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
import {validateRoadScenarioV3,BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
const fail=(c,m)=>{if(!c)throw Error(m)}
const r6=x=>Math.round(x*1e6)/1e6
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x))
const priorities=(a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId)
/** Opt-in A2 research controls expressed in physical seconds, not ticks.
 * The reference 10-second model uses a 20s blocked/reaction threshold,
 * 30s lane movement and 0.09m/s^2 acceleration envelope. Unsupported
 * divisors fail closed, while the legacy mode remains byte-identical.
 */
export function coupled2DTimingV3(dt,policy='legacy'){
 fail(Number.isInteger(dt)&&dt>=5&&dt<=20&&['legacy','seconds_normalized'].includes(policy),'Invalid timing policy')
 if(policy==='legacy')return {reactionTicks:2,steeringTicks:3,blockedTicks:2,maxSpeedChangeMps:.9}
 fail([5,10].includes(dt),'Normalized timing supports 5s and 10s only')
 return {reactionTicks:20/dt,steeringTicks:30/dt,blockedTicks:20/dt,maxSpeedChangeMps:r6(.09*dt)}
}

/** A2 research control: move priority among bicycles exactly abreast can
 * rotate between lanes, instead of permanently favouring lexical rider IDs.
 * This comparator does not change rider position, power, lane, or road physics.
 */
export function priorityCompareCoupled2DV3(a,b,{tick=0,policy='rider_id',centerStepM=1,laneCount=4}={}){
 if(!['rider_id','rotating_lane'].includes(policy)||!Number.isInteger(tick)||tick<0||!Number.isFinite(centerStepM)||centerStepM<=0||!Number.isInteger(laneCount)||laneCount<2)throw Error('Invalid 2D priority study')
 const forward=b.meters-a.meters
 if(forward!==0)return forward
 if(policy==='rotating_lane'){
  const laneOf=r=>Math.max(0,Math.min(laneCount-1,Math.round(r.y/centerStepM)))
  const aa=(laneOf(a)-tick%laneCount+laneCount)%laneCount
  const bb=(laneOf(b)-tick%laneCount+laneCount)%laneCount
  if(aa!==bb)return aa-bb
 }
 return a.riderId.localeCompare(b.riderId)
}
const isHit=(a,b,g)=>continuousBicycleCollisionV3(a,b,{longitudinal:1.8,lateral:g.lateralCollisionM})
function roadAt(input,meters){
 let km=0
 for(const segment of input.route){
  km+=segment.lengthKm
  if(meters/1000<=km)return {gradePercent:segment.gradePercent,headwindMps:segment.headwindMps??0,crosswindMps:segment.crosswindMps??0}
 }
 const end=input.route.at(-1)
 return {gradePercent:end.gradePercent,headwindMps:end.headwindMps??0,crosswindMps:end.crosswindMps??0}
}
function firstLeader(r,riders){
 return riders.filter(x=>x.riderId!==r.riderId&&x.meters>r.meters&&x.meters-r.meters<18&&Math.abs(x.y-r.y)<=1.3).sort((a,b)=>a.meters-b.meters||a.riderId.localeCompare(b.riderId))[0]??null
}
function aerodynamicShelter(r,all,road){
 const lead=firstLeader(r,all)
 if(!lead)return 0
 const dx=lead.meters-r.meters,dy=Math.abs(lead.y-r.y)
 return r6(.3*clamp((18-dx)/15,0,1)*clamp(1-dy/1.5,0,1)*clamp(1-Math.abs(road.crosswindMps)/16,.18,1)*clamp(1-Math.max(0,road.gradePercent)/9,.1,1))
}
function demand(r,all,road,dt,maxSpeedChangeMps=.9){
 const shelter=aerodynamicShelter(r,all,road),cdA=.36*(1-shelter)
 const workAt=(v)=>roadWattsRequiredV3(v,83,cdA,road)
 const tacticBonus=r.tactic==='attack'?65:r.tactic==='chase'?35:0
 const granted=Math.min(r.cpWatts+tacticBonus,r.cpWatts+r.energy.remainingWPrimeJoules/dt)
 let lo=0,hi=20
 for(let k=0;k<35;k++){const m=(lo+hi)/2;if(workAt(m)>granted)hi=m;else lo=m}
 const wanted=(lo+hi)/2
 const v=clamp(wanted,Math.max(0,r.speedMps-maxSpeedChangeMps),r.speedMps+maxSpeedChangeMps)
 return {speed:r6(v),cdA,road,shelter,watts:r6(workAt(v))}
}
export function initializeCoupled2DResearchV3({riders,route,geometry=BATCH40_GEOMETRIES[1],allowSteering=false,capacity=2,dt=10,quality='synthetic_research',experimentalPriorityPolicy='rider_id',experimentalPassingTrigger='blocked_2',experimentalPassingAdmissionPolicy='global',diagnosePassing=false,experimentalPassLanePolicy='left_first',experimentalTimingPolicy='legacy',experimentalMovementOrder='front_first'}={}){
 fail(Array.isArray(riders)&&riders.length>=2&&riders.length<=200&&Array.isArray(route)&&route.length&&Number.isInteger(dt)&&dt>=5&&dt<=20&&[1,2,3].includes(capacity)&&typeof allowSteering==='boolean'&&quality==='synthetic_research'&&['rider_id','rotating_lane'].includes(experimentalPriorityPolicy)&&['blocked_2','closing_wheel'].includes(experimentalPassingTrigger)&&['global','local_30m'].includes(experimentalPassingAdmissionPolicy)&&typeof diagnosePassing==='boolean'&&['left_first','neighbor_space'].includes(experimentalPassLanePolicy)&&['legacy','seconds_normalized'].includes(experimentalTimingPolicy)&&(experimentalTimingPolicy==='legacy'||[5,10].includes(dt))&&['front_first','rear_first','alternate_ticks'].includes(experimentalMovementOrder),'Invalid offline 2D research input')
 const g=validateRoadScenarioV3(geometry)
 const finishDistanceMeters=r6(route.reduce((sum,segment)=>sum+segment.lengthKm*1000,0))
 fail(Number.isFinite(finishDistanceMeters)&&finishDistanceMeters>0&&finishDistanceMeters<1000000,'Invalid stage finish line')
 const ids=new Set(),initial=riders.map((r,i)=>{
  fail(r?.riderId&&!ids.has(r.riderId)&&Number.isFinite(r.meters)&&r.meters>=0&&Number.isInteger(r.lane)&&r.lane>=0&&r.lane<g.laneCount&&Number.isFinite(r.cpWatts)&&r.cpWatts>=100&&r.cpWatts<=500&&['follow','tempo','chase','attack','recover'].includes(r.tactic??'follow'),'Invalid 2D rider')
  fail(r.meters<finishDistanceMeters,'Rider must start before stage finish')
  ids.add(r.riderId)
  return {riderId:r.riderId,finishSeconds:null,meters:r6(r.meters),y:r6(r.lane*g.centerStepM),speedMps:r.speedMps??0,cpWatts:r.cpWatts,tactic:r.tactic??'follow',energy:initializeEnergyBalanceResearchV3({criticalWatts:r.cpWatts,wPrimeJoules:r.wPrimeJoules??16000}),reservation:null,blockedStreak:0,blockedLeader:null}
 })
 for(let i=0;i<initial.length;i++)for(let j=i+1;j<initial.length;j++)fail(!isHit({x0:initial[i].meters,x1:initial[i].meters,y0:initial[i].y,y1:initial[i].y},{x0:initial[j].meters,x1:initial[j].meters,y0:initial[j].y,y1:initial[j].y},g),'Initial two-dimensional bicycle collision')
 for(const s of route)fail(Number.isFinite(s.lengthKm)&&s.lengthKm>0&&Number.isFinite(s.gradePercent)&&Math.abs(s.gradePercent)<=22,'Invalid route')
 return {version:42,gate:'OFFLINE_RESEARCH_ONLY',officialWrites:0,sportingApproval:'NOT_APPROVED',input:{route:structuredClone(route),geometry:structuredClone(geometry),allowSteering,capacity,dt,quality,experimentalPriorityPolicy,experimentalPassingTrigger,...(experimentalPassingAdmissionPolicy==='global'?{}:{experimentalPassingAdmissionPolicy}),...(diagnosePassing?{diagnosePassing:true}:{}),...(experimentalPassLanePolicy==='left_first'?{}:{experimentalPassLanePolicy}),...(experimentalTimingPolicy==='legacy'?{}:{experimentalTimingPolicy}),...(experimentalMovementOrder==='front_first'?{}:{experimentalMovementOrder}),finishDistanceMeters},riders:initial,finish:[],complete:false,tick:0,elapsedSeconds:0,metrics:{commandedMeters:0,achievedMeters:0,blockedRiderTicks:0,preventedMeters:0,pathClips:0,collisionChecks:0,reservationsStarted:0,completedPasses:0,abortedPasses:0,concurrentPeak:0,energyJ:0,lateralMeters:0,first30mGapSecond:null,...(diagnosePassing?{passingAudit:{eligible:0,admitted:0,capacityDenied:0,physicalLaneDenied:0,reservedLaneDenied:0,collisionAborted:0,finishAborted:0,forwardPairPasses:0,passingByRider:{},queueByRider:{},maxWaitingTicks:0}}:{})},samples:[]}
}
function currentReservations(rows){return rows.filter(r=>r.reservation)}
/** Conservative early closing-wheel predicate, evaluated on current actual
 * rider states. Never uses future frames, free distance or rider identifiers.
 * A faster rider within the next two 10-second reaction intervals can prepare
 * a lane before experiencing two full blocked ticks.
 */
export function shouldPreparePass2DV3(r,rows,g,trigger='blocked_2',blockedTicks=2){
 if(!['blocked_2','closing_wheel'].includes(trigger)||!Number.isInteger(blockedTicks)||blockedTicks<1||blockedTicks>8)throw Error('Invalid passing trigger')
 if(r.finishSeconds!==null||r.reservation)return false
 if(r.blockedStreak>=blockedTicks)return true
 if(trigger==='blocked_2')return false
 const ahead=rows.filter(x=>x.riderId!==r.riderId&&x.finishSeconds===null&&x.meters>r.meters&&Math.abs(x.y-r.y)<g.lateralCollisionM).sort((a,b)=>a.meters-b.meters||a.riderId.localeCompare(b.riderId))[0]
 if(!ahead)return false
 const headway=ahead.meters-r.meters
 const closing=r.speedMps-ahead.speedMps
 // Within two 10-second reaction intervals, but no longer than 12 metres.
 return closing>.2&&headway>1.8&&headway<=12&&headway-2*10*closing<4.5
}
/** A2 research-only overtaking admission study. The historical default is a
 * global cap; local_30m caps only reservations whose forward positions lie
 * within 30 metres of the candidate, without weakening continuous collisions.
 * Spatial admission is an opt-in hypothesis, NOT a production racing rule.
 */
export function canAdmitPassingReservationV3(r,current,capacity,policy='global'){
 fail(Number.isInteger(capacity)&&capacity>=1&&capacity<=3&&['global','local_30m'].includes(policy)&&Number.isFinite(r?.meters)&&Array.isArray(current)&&current.every(x=>Number.isFinite(x?.meters)),'Invalid passing admission study')
 if(policy==='global')return current.length<capacity
 return current.filter(x=>Math.abs(x.meters-r.meters)<=30).length<capacity
}
function chooseNewReservations(rows,g,settings,metrics){
 if(!settings.allowSteering)return
 const active=currentReservations(rows),audit=metrics.passingAudit
 const options=rows.filter(r=>r.finishSeconds===null&&!r.reservation&&shouldPreparePass2DV3(r,rows,g,settings.experimentalPassingTrigger,coupled2DTimingV3(settings.dt,settings.experimentalTimingPolicy??'legacy').blockedTicks)&&Math.abs(r.y/g.centerStepM-Math.round(r.y/g.centerStepM))<1e-5)
  .sort((a,b)=>b.blockedStreak-a.blockedStreak||a.riderId.localeCompare(b.riderId))
 if(audit){
  const ids=new Set(options.map(r=>r.riderId))
  for(const id of Object.keys(audit.queueByRider))if(!ids.has(id))audit.queueByRider[id]=0
 }
 for(const r of options){
  const denied=(kind)=>{
   if(!audit)return
   audit.eligible++;audit[kind]++
   const count=(audit.queueByRider[r.riderId]??0)+1
   audit.queueByRider[r.riderId]=count
   audit.maxWaitingTicks=Math.max(audit.maxWaitingTicks,count)
  }
  if(!canAdmitPassingReservationV3(r,active,settings.capacity,settings.experimentalPassingAdmissionPolicy??'global')){
   denied('capacityDenied')
   // Observational mode counts all waiting candidates even when the global
   // cap is reached; no further reservation can be added in global mode.
   if(!audit&&(settings.experimentalPassingAdmissionPolicy??'global')==='global')break
   continue
  }
  const lane=Math.round(r.y/g.centerStepM)
  const destinations=[lane-1,lane+1].filter(l=>l>=0&&l<g.laneCount)
  const physical=destinations.filter(l=>{
   const target=l*g.centerStepM
   return !rows.some(x=>x.riderId!==r.riderId&&Math.abs(x.y-target)<g.lateralCollisionM&&Math.abs(x.meters-r.meters)<1.8)
  })
  if(!physical.length){denied('physicalLaneDenied');continue}
  const clear=physical.filter(l=>{
   const target=l*g.centerStepM
   return !active.some(x=>Math.abs(x.meters-r.meters)<15&&Math.abs(x.reservation.targetY-target)<g.centerStepM+.01)
  })
  if(!clear.length){denied('reservedLaneDenied');continue}
  const target=(settings.experimentalPassLanePolicy??'left_first')==='neighbor_space'
   ?chooseNeighborSpaceLaneV3(r,rows,active,clear,g)
   :clear.sort((a,b)=>a-b)[0]
  const timing=coupled2DTimingV3(settings.dt,settings.experimentalTimingPolicy??'legacy')
  r.reservation={fromY:r.y,targetY:r6(target*g.centerStepM),reactionLeft:timing.reactionTicks,steeringLeft:timing.steeringTicks,...(timing.steeringTicks!==3?{steeringTicks:timing.steeringTicks}:{}),progress:0,phase:'reaction',chargedJ:0}
  active.push(r);metrics.reservationsStarted++
  if(audit){audit.eligible++;audit.admitted++;audit.queueByRider[r.riderId]=0}
 }
}
/** Actual longitudinal crossings at tick endpoints between riders still active.
 * Equal-row starts and finished riders are excluded. The original collision
 * checker separately guarantees the continuous 2D swept paths do not intersect.
 */
export function observeForwardPairPassesV3(before,after,epsilon=.05){
 fail(Array.isArray(before)&&Array.isArray(after)&&Number.isFinite(epsilon)&&epsilon>0,'Invalid pair observation')
 const finished=new Map(after.filter(r=>r.finishSeconds===null).map(r=>[r.riderId,r])),passes=[]
 for(let i=0;i<before.length;i++)for(let j=i+1;j<before.length;j++){
  const a=before[i],b=before[j],an=finished.get(a.riderId),bn=finished.get(b.riderId)
  if(!an||!bn)continue
  const prev=a.meters-b.meters,next=an.meters-bn.meters
  if(prev>epsilon&&next< -epsilon)passes.push({passer:b.riderId,passed:a.riderId})
  else if(prev< -epsilon&&next>epsilon)passes.push({passer:a.riderId,passed:b.riderId})
 }
 return passes
}
function moveCandidate(r,intended,paths,g,metrics,unplanned){
 const reserved=[...paths,...unplanned.map(x=>({x0:x.meters,x1:x.meters,y0:x.y,y1:x.y}))]
 // No speculative longitudinal credit: all completed travel is <= demanded.
 const hit=(s)=>{const p={x0:r.meters,x1:r6(r.meters+intended.speed*s),y0:r.y,y1:intended.y};metrics.collisionChecks+=reserved.length;return reserved.some(q=>isHit(p,q,g))}
 if(!hit(1))return {fraction:1,steering:true}
 // First try actual lateral path with clipped speed.
 if(!hit(0)){
  let low=0,high=1
  for(let k=0;k<17;k++){const mid=(low+high)/2;if(hit(mid))high=mid;else low=mid}
  return {fraction:low,steering:true}
 }
 // Steering would collide even if the bicycle slowed down. Cancel steering.
 const noSteer={...intended,y:r.y}
 const stableHit=(s)=>{const p={x0:r.meters,x1:r6(r.meters+noSteer.speed*s),y0:r.y,y1:r.y};metrics.collisionChecks+=reserved.length;return reserved.some(q=>isHit(p,q,g))}
 if(!stableHit(1))return {fraction:1,steering:false}
 fail(!stableHit(0),'Unable to yield without colliding at current position')
 let low=0,high=1
 for(let k=0;k<17;k++){const m=(low+high)/2;if(stableHit(m))high=m;else low=m}
 return {fraction:low,steering:false}
}
export function advanceCoupled2DResearchV3(state,steps=1){
 fail(state?.version===42&&state.gate==='OFFLINE_RESEARCH_ONLY'&&state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED'&&Array.isArray(state.finish)&&Number.isFinite(state.input?.finishDistanceMeters)&&Number.isInteger(steps)&&steps>=1&&steps<=1000,'Invalid offline 2D checkpoint')
 const out=structuredClone(state),settings=out.input,g=validateRoadScenarioV3(settings.geometry),dt=settings.dt,timing=coupled2DTimingV3(dt,settings.experimentalTimingPolicy??'legacy')
 for(let tick=0;tick<steps&&!out.complete;tick++){
  const initial=out.riders.filter(r=>r.finishSeconds===null).map(x=>({...x})),demanded=new Map(initial.map(r=>[r.riderId,demand(r,initial,roadAt(settings,r.meters),dt,timing.maxSpeedChangeMps)]))
  const prioritized=out.riders.filter(r=>r.finishSeconds===null).sort((a,b)=>priorityCompareCoupled2DV3(a,b,{tick:out.tick,policy:settings.experimentalPriorityPolicy,centerStepM:g.centerStepM,laneCount:g.laneCount})),paths=[],details=[]
  // A2 stress test only: reverse the precedence of planned trajectories
  // versus not-yet-moved stationary obstacles. Demand, collisions, time step,
  // energy, passing admission and starting roster remain identical.
  if(settings.experimentalMovementOrder==='rear_first'||(settings.experimentalMovementOrder==='alternate_ticks'&&out.tick%2===1))prioritized.reverse()
  for(const r of prioritized){
   const predicted=demanded.get(r.riderId)
   let desiredY=r.y,steeringNow=false
   const reserve=r.reservation
   if(reserve?.phase==='steering'){desiredY=r6(reserve.fromY+(reserve.targetY-reserve.fromY)*Math.min(1,reserve.progress+1/(reserve.steeringTicks??3)));steeringNow=true}
   const extraWatts=steeringNow?35:0
   const road=predicted.road,workAt=v=>roadWattsRequiredV3(v,83,predicted.cdA,road)
   const maxAllowed=Math.max(0,r.cpWatts+r.energy.remainingWPrimeJoules/dt-.5)
   let requested=predicted.speed
   if(workAt(requested)+extraWatts>maxAllowed+1e-5){
    let lo=0,hi=requested
    for(let k=0;k<36;k++){const v=(lo+hi)/2;if(workAt(v)+extraWatts>maxAllowed-1e-6)hi=v;else lo=v}
    requested=Math.max(0,lo-1e-6)
   }
   const intended={speed:requested*dt,y:desiredY}
   const remaining=prioritized.filter(x=>x.riderId!==r.riderId&&!paths.some(p=>p.riderId===x.riderId))
   const motion=moveCandidate(r,intended,paths,g,out.metrics,remaining)
   if(steeringNow&&!motion.steering){r.reservation=null;out.metrics.abortedPasses++;if(out.metrics.passingAudit)out.metrics.passingAudit.collisionAborted++;steeringNow=false}
   const newY=motion.steering?desiredY:r.y
   const newMeters=r6(r.meters+intended.speed*motion.fraction)
   const newSpeed=r6(Math.max(0,(newMeters-r.meters)/dt))
   const actualWatts=workAt(newSpeed)+(steeringNow?35:0)
   const energy=advanceEnergyBalanceResearchV3(r.energy,actualWatts,dt)
   fail(energy.accepted,'W-prime invalid actual two-dimensional achieved work '+JSON.stringify({riderId:r.riderId,tick:out.tick,actualWatts,critical:r.cpWatts,remainingWPrime:r.energy.remainingWPrimeJoules,requested,newSpeed,steeringNow,extraWatts}))
   out.metrics.energyJ+=actualWatts*dt
   out.metrics.commandedMeters+=intended.speed
   out.metrics.achievedMeters+=newMeters-r.meters
   const clipped=Math.max(0,intended.speed-(newMeters-r.meters))
   if(clipped>1e-4){out.metrics.blockedRiderTicks++;out.metrics.preventedMeters+=clipped;out.metrics.pathClips++}
   const sameWheel=initial.filter(x=>x.riderId!==r.riderId&&x.meters>r.meters&&Math.abs(x.y-r.y)<g.lateralCollisionM).sort((a,b)=>a.meters-b.meters||a.riderId.localeCompare(b.riderId))[0]
   r.blockedStreak=clipped>1e-4&&sameWheel?(r.blockedLeader===sameWheel.riderId?r.blockedStreak+1:1):0
   r.blockedLeader=r.blockedStreak?sameWheel.riderId:null
   if(steeringNow&&r.reservation){r.reservation.progress=Math.min(1,r.reservation.progress+1/(r.reservation.steeringTicks??3));r.reservation.steeringLeft--;r.reservation.chargedJ+=35*dt;out.metrics.lateralMeters+=Math.abs(newY-r.y);if(r.reservation.steeringLeft===0){out.metrics.completedPasses++;r.reservation=null}}
   else if(r.reservation?.phase==='reaction'){r.reservation.reactionLeft--;if(r.reservation.reactionLeft===0)r.reservation.phase='steering'}
   paths.push({riderId:r.riderId,x0:r.meters,x1:newMeters,y0:r.y,y1:newY})
   details.push({riderId:r.riderId,requestedMps:round6Safe(requested),actualMps:newSpeed,clippedMeters:r6(clipped),steeringNow,watts:r6(actualWatts)})
   // Keep the full-tick swept trajectory for collision checking. Record the
   // finish instant inside that interval, then remove this rider NEXT tick.
   // The final position can exceed the line by up to one tick's motion.
   if(newMeters>=settings.finishDistanceMeters){
    fail(newMeters>r.meters,'Stationary rider cannot cross a finish line')
    const crossingFraction=clamp((settings.finishDistanceMeters-r.meters)/(newMeters-r.meters),0,1)
    r.finishSeconds=r6(out.elapsedSeconds+crossingFraction*dt)
    out.finish.push({riderId:r.riderId,finishSeconds:r.finishSeconds,energyRemainingJ:energy.state.remainingWPrimeJoules})
    if(r.reservation){r.reservation=null;out.metrics.abortedPasses++;if(out.metrics.passingAudit)out.metrics.passingAudit.finishAborted++}
   }
   r.meters=newMeters;r.y=newY;r.speedMps=newSpeed;r.energy=energy.state
  }
  // The update solved every planned bicycle against higher-priority paths;
  // validate ALL pairs continuously after the complete tick.
  for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)fail(!isHit(paths[i],paths[j],g),'Coupled 2D within-tick collision: '+paths[i].riderId+' / '+paths[j].riderId)
  if(out.metrics.passingAudit){
   const d=out.metrics.passingAudit,passes=observeForwardPairPassesV3(initial,out.riders)
   d.forwardPairPasses+=passes.length
   for(const p of passes)d.passingByRider[p.passer]=(d.passingByRider[p.passer]??0)+1
  }
  chooseNewReservations(out.riders,g,settings,out.metrics)
  out.metrics.concurrentPeak=Math.max(out.metrics.concurrentPeak,currentReservations(out.riders).length)
  out.tick++;out.elapsedSeconds+=dt
  const order=out.riders.filter(r=>r.finishSeconds===null).sort(priorities)
  const groups=order.length?1+order.slice(1).filter((r,i)=>order[i].meters-r.meters>=30).length:0
  if(groups>1&&out.metrics.first30mGapSecond===null)out.metrics.first30mGapSecond=out.elapsedSeconds
  if(out.tick<=6||out.tick%12===0||out.finish.length===out.riders.length)out.samples.push({tick:out.tick,seconds:out.elapsedSeconds,groups,leaderMeters:order.length?round6Safe(order[0].meters):null,tailGapMeters:order.length?round6Safe(order[0].meters-order.at(-1).meters):null,finishers:out.finish.length,reservations:currentReservations(out.riders).length,completed:out.metrics.completedPasses,blocked:out.metrics.blockedRiderTicks})
  out.complete=out.finish.length===out.riders.length
 }
 return out
}
function round6Safe(x){return r6(x)}
export function summarizeCoupled2DResearchV3(state){
 fail(state?.version===42&&state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED','Invalid offline summary')
 const sorted=state.riders.slice().sort(priorities),front=sorted[0]
 const finish=[...state.finish].sort((a,b)=>a.finishSeconds-b.finishSeconds||a.riderId.localeCompare(b.riderId)).map((x,i)=>({...x,rank:i+1,gapSeconds:r6(x.finishSeconds-Math.min(...state.finish.map(y=>y.finishSeconds)))}))
 return {ticks:state.tick,seconds:state.elapsedSeconds,riders:sorted.length,leaders:sorted.slice(0,5).map(x=>x.riderId),frontToTailMeters:r6(front.meters-sorted.at(-1).meters),positions:sorted.map((r,i)=>({rank:i+1,riderId:r.riderId,meters:r.meters,lateralM:r.y,remainingWPrimeJ:r.energy.remainingWPrimeJoules})),metrics:structuredClone(state.metrics),first30mGapSecond:state.metrics.first30mGapSecond,finish,finishDistanceMeters:state.input.finishDistanceMeters,officialWrites:0,sportingApproval:'NOT_APPROVED',stageFinished:state.complete}
}
