/** V3 Batch 42: a genuinely stateful TWO-DIMENSIONAL OFFLINE bicycle pack.
 * Rider metres, continuous lateral position, velocities and W-prime are all
 * state variables. This module is NEVER imported by production race selection.
 * Strict finite envelopes / fail-closed collision, no teleportation.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
import {initializeEnergyBalanceResearchV3,advanceEnergyBalanceResearchV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
import {validateRoadScenarioV3,BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
const fail=(c,m)=>{if(!c)throw Error(m)}
const r6=x=>Math.round(x*1e6)/1e6
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x))
const priorities=(a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId)
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
function demand(r,all,road,dt){
 const shelter=aerodynamicShelter(r,all,road),cdA=.36*(1-shelter)
 const workAt=(v)=>roadWattsRequiredV3(v,83,cdA,road)
 const tacticBonus=r.tactic==='attack'?65:r.tactic==='chase'?35:0
 const granted=Math.min(r.cpWatts+tacticBonus,r.cpWatts+r.energy.remainingWPrimeJoules/dt)
 let lo=0,hi=20
 for(let k=0;k<35;k++){const m=(lo+hi)/2;if(workAt(m)>granted)hi=m;else lo=m}
 const wanted=(lo+hi)/2
 const v=clamp(wanted,Math.max(0,r.speedMps-.9),r.speedMps+.9)
 return {speed:r6(v),cdA,road,shelter,watts:r6(workAt(v))}
}
export function initializeCoupled2DResearchV3({riders,route,geometry=BATCH40_GEOMETRIES[1],allowSteering=false,capacity=2,dt=10,quality='synthetic_research'}={}){
 fail(Array.isArray(riders)&&riders.length>=2&&riders.length<=200&&Array.isArray(route)&&route.length&&Number.isInteger(dt)&&dt>=5&&dt<=20&&[1,2,3].includes(capacity)&&typeof allowSteering==='boolean'&&quality==='synthetic_research','Invalid offline 2D research input')
 const g=validateRoadScenarioV3(geometry)
 const ids=new Set(),initial=riders.map((r,i)=>{
  fail(r?.riderId&&!ids.has(r.riderId)&&Number.isFinite(r.meters)&&r.meters>=0&&Number.isInteger(r.lane)&&r.lane>=0&&r.lane<g.laneCount&&Number.isFinite(r.cpWatts)&&r.cpWatts>=100&&r.cpWatts<=500&&['follow','tempo','chase','attack','recover'].includes(r.tactic??'follow'),'Invalid 2D rider')
  ids.add(r.riderId)
  return {riderId:r.riderId,meters:r6(r.meters),y:r6(r.lane*g.centerStepM),speedMps:r.speedMps??0,cpWatts:r.cpWatts,tactic:r.tactic??'follow',energy:initializeEnergyBalanceResearchV3({criticalWatts:r.cpWatts,wPrimeJoules:r.wPrimeJoules??16000}),reservation:null,blockedStreak:0,blockedLeader:null}
 })
 for(let i=0;i<initial.length;i++)for(let j=i+1;j<initial.length;j++)fail(!isHit({x0:initial[i].meters,x1:initial[i].meters,y0:initial[i].y,y1:initial[i].y},{x0:initial[j].meters,x1:initial[j].meters,y0:initial[j].y,y1:initial[j].y},g),'Initial two-dimensional bicycle collision')
 for(const s of route)fail(Number.isFinite(s.lengthKm)&&s.lengthKm>0&&Number.isFinite(s.gradePercent)&&Math.abs(s.gradePercent)<=22,'Invalid route')
 return {version:42,gate:'OFFLINE_RESEARCH_ONLY',officialWrites:0,sportingApproval:'NOT_APPROVED',input:{route:structuredClone(route),geometry:structuredClone(geometry),allowSteering,capacity,dt,quality},riders:initial,tick:0,elapsedSeconds:0,metrics:{commandedMeters:0,achievedMeters:0,blockedRiderTicks:0,preventedMeters:0,pathClips:0,collisionChecks:0,reservationsStarted:0,completedPasses:0,abortedPasses:0,concurrentPeak:0,energyJ:0,lateralMeters:0,first30mGapSecond:null},samples:[]}
}
function currentReservations(rows){return rows.filter(r=>r.reservation)}
function chooseNewReservations(rows,g,settings,metrics){
 if(!settings.allowSteering)return
 const current=currentReservations(rows)
 const options=rows.filter(r=>!r.reservation&&r.blockedStreak>=2&&Math.abs(r.y/g.centerStepM-Math.round(r.y/g.centerStepM))<1e-5)
  .sort((a,b)=>b.blockedStreak-a.blockedStreak||a.riderId.localeCompare(b.riderId))
 for(const r of options){
  if(current.length>=settings.capacity)break
  const lane=Math.round(r.y/g.centerStepM)
  const destinations=[lane-1,lane+1].filter(l=>l>=0&&l<g.laneCount)
  const clear=destinations.filter(l=>{
   const target=l*g.centerStepM
   if(rows.some(x=>x.riderId!==r.riderId&&Math.abs(x.y-target)<g.lateralCollisionM&&Math.abs(x.meters-r.meters)<1.8))return false
   if(current.some(x=>Math.abs(x.meters-r.meters)<15&&Math.abs(x.reservation.targetY-target)<g.centerStepM+.01))return false
   return true
  })
  if(!clear.length)continue
  const to=clear.sort((a,b)=>a-b)[0]
  r.reservation={fromY:r.y,targetY:r6(to*g.centerStepM),reactionLeft:2,steeringLeft:3,progress:0,phase:'reaction',chargedJ:0}
  current.push(r);metrics.reservationsStarted++
 }
}
function moveCandidate(r,intended,paths,g,metrics){
 // No speculative longitudinal credit: all completed travel is <= demanded.
 const hit=(s)=>{const p={x0:r.meters,x1:r6(r.meters+intended.speed*s),y0:r.y,y1:intended.y};metrics.collisionChecks+=paths.length;return paths.some(q=>isHit(p,q,g))}
 if(!hit(1))return {fraction:1,steering:true}
 // First try actual lateral path with clipped speed.
 if(!hit(0)){
  let low=0,high=1
  for(let k=0;k<17;k++){const mid=(low+high)/2;if(hit(mid))high=mid;else low=mid}
  return {fraction:low,steering:true}
 }
 // Steering would collide even if the bicycle slowed down. Cancel steering.
 const noSteer={...intended,y:r.y}
 const stableHit=(s)=>{const p={x0:r.meters,x1:r6(r.meters+noSteer.speed*s),y0:r.y,y1:r.y};metrics.collisionChecks+=paths.length;return paths.some(q=>isHit(p,q,g))}
 if(!stableHit(1))return {fraction:1,steering:false}
 fail(!stableHit(0),'Unable to yield without colliding at current position')
 let low=0,high=1
 for(let k=0;k<17;k++){const m=(low+high)/2;if(stableHit(m))high=m;else low=m}
 return {fraction:low,steering:false}
}
export function advanceCoupled2DResearchV3(state,steps=1){
 fail(state?.version===42&&state.gate==='OFFLINE_RESEARCH_ONLY'&&state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED'&&Number.isInteger(steps)&&steps>=1&&steps<=1000,'Invalid offline 2D checkpoint')
 const out=structuredClone(state),settings=out.input,g=validateRoadScenarioV3(settings.geometry),dt=settings.dt
 for(let tick=0;tick<steps;tick++){
  const initial=out.riders.map(x=>({...x})),demanded=new Map(initial.map(r=>[r.riderId,demand(r,initial,roadAt(settings,r.meters),dt)]))
  const prioritized=out.riders.sort(priorities),paths=[],details=[]
  for(const r of prioritized){
   const predicted=demanded.get(r.riderId)
   let desiredY=r.y,steeringNow=false
   const reserve=r.reservation
   if(reserve?.phase==='steering'){desiredY=r6(reserve.fromY+(reserve.targetY-reserve.fromY)*Math.min(1,reserve.progress+1/3));steeringNow=true}
   const extraWatts=steeringNow?35:0
   const road=predicted.road,workAt=v=>roadWattsRequiredV3(v,83,predicted.cdA,road)
   const maxAllowed=r.cpWatts+r.energy.remainingWPrimeJoules/dt
   let requested=predicted.speed
   if(workAt(requested)+extraWatts>maxAllowed+1e-5){
    let lo=0,hi=requested
    for(let k=0;k<36;k++){const v=(lo+hi)/2;if(workAt(v)+extraWatts>maxAllowed-1e-6)hi=v;else lo=v}
    requested=Math.max(0,lo-1e-6)
   }
   const intended={speed:requested*dt,y:desiredY}
   const motion=moveCandidate(r,intended,paths,g,out.metrics)
   if(steeringNow&&!motion.steering){r.reservation=null;out.metrics.abortedPasses++;steeringNow=false}
   const newY=motion.steering?desiredY:r.y
   const newMeters=r6(r.meters+intended.speed*motion.fraction)
   const newSpeed=r6(Math.max(0,(newMeters-r.meters)/dt))
   const actualWatts=workAt(newSpeed)+(steeringNow?35:0)
   const energy=advanceEnergyBalanceResearchV3(r.energy,actualWatts,dt)
   fail(energy.accepted,'W-prime invalid actual two-dimensional achieved work')
   out.metrics.energyJ+=actualWatts*dt
   out.metrics.commandedMeters+=intended.speed
   out.metrics.achievedMeters+=newMeters-r.meters
   const clipped=Math.max(0,intended.speed-(newMeters-r.meters))
   if(clipped>1e-4){out.metrics.blockedRiderTicks++;out.metrics.preventedMeters+=clipped;out.metrics.pathClips++}
   const sameWheel=initial.filter(x=>x.riderId!==r.riderId&&x.meters>r.meters&&Math.abs(x.y-r.y)<g.lateralCollisionM).sort((a,b)=>a.meters-b.meters||a.riderId.localeCompare(b.riderId))[0]
   r.blockedStreak=clipped>1e-4&&sameWheel?(r.blockedLeader===sameWheel.riderId?r.blockedStreak+1:1):0
   r.blockedLeader=r.blockedStreak?sameWheel.riderId:null
   if(steeringNow&&r.reservation){r.reservation.progress=Math.min(1,r.reservation.progress+1/3);r.reservation.steeringLeft--;r.reservation.chargedJ+=35*dt;out.metrics.lateralMeters+=Math.abs(newY-r.y);if(r.reservation.steeringLeft===0){out.metrics.completedPasses++;r.reservation=null}}
   else if(r.reservation?.phase==='reaction'){r.reservation.reactionLeft--;if(r.reservation.reactionLeft===0)r.reservation.phase='steering'}
   paths.push({riderId:r.riderId,x0:r.meters,x1:newMeters,y0:r.y,y1:newY})
   details.push({riderId:r.riderId,requestedMps:round6Safe(requested),actualMps:newSpeed,clippedMeters:r6(clipped),steeringNow,watts:r6(actualWatts)})
   r.meters=newMeters;r.y=newY;r.speedMps=newSpeed;r.energy=energy.state
  }
  // The update solved every planned bicycle against higher-priority paths;
  // validate ALL pairs continuously after the complete tick.
  for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)fail(!isHit(paths[i],paths[j],g),'Coupled 2D within-tick collision: '+paths[i].riderId+' / '+paths[j].riderId)
  chooseNewReservations(out.riders,g,settings,out.metrics)
  out.metrics.concurrentPeak=Math.max(out.metrics.concurrentPeak,currentReservations(out.riders).length)
  out.tick++;out.elapsedSeconds+=dt
  const order=out.riders.slice().sort(priorities)
  const groups=1+order.slice(1).filter((r,i)=>order[i].meters-r.meters>=30).length
  if(groups>1&&out.metrics.first30mGapSecond===null)out.metrics.first30mGapSecond=out.elapsedSeconds
  if(out.tick<=6||out.tick%12===0)out.samples.push({tick:out.tick,seconds:out.elapsedSeconds,groups,leaderMeters:round6Safe(order[0].meters),tailGapMeters:round6Safe(order[0].meters-order.at(-1).meters),reservations:currentReservations(out.riders).length,completed:out.metrics.completedPasses,blocked:out.metrics.blockedRiderTicks})
 }
 return out
}
function round6Safe(x){return r6(x)}
export function summarizeCoupled2DResearchV3(state){
 fail(state?.version===42&&state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED','Invalid offline summary')
 const sorted=state.riders.slice().sort(priorities),front=sorted[0]
 return {ticks:state.tick,seconds:state.elapsedSeconds,riders:sorted.length,leaders:sorted.slice(0,5).map(x=>x.riderId),frontToTailMeters:r6(front.meters-sorted.at(-1).meters),positions:sorted.map((r,i)=>({rank:i+1,riderId:r.riderId,meters:r.meters,lateralM:r.y,remainingWPrimeJ:r.energy.remainingWPrimeJoules})),metrics:structuredClone(state.metrics),first30mGapSecond:state.metrics.first30mGapSecond,officialWrites:0,sportingApproval:'NOT_APPROVED',stageFinished:false}
}
