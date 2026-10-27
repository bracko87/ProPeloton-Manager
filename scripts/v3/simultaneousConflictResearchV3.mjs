/** Milestone A2 OFFLINE micro-prototype: synchronous motion proposals.
 * Every rider's proposed path is derived from the SAME frozen tick state.
 * Conflicts are resolved in symmetric iterations: all endpoints in all
 * conflicting pairs yield at once. No front/rear rider wins by iteration order.
 *
 * This is deliberately conservative, not a production racing model. Half-step
 * attenuation can suppress motion and requires sporting calibration.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {validateRoadScenarioV3,BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
import {initializeEnergyBalanceResearchV3,advanceEnergyBalanceResearchV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'

const ensure=(condition,reason)=>{if(!condition)throw Error(reason)}
const r6=x=>Math.round(x*1e6)/1e6
const isHit=(a,b,g)=>continuousBicycleCollisionV3(a,b,{longitudinal:1.8,lateral:g.lateralCollisionM})
const pathOf=(r,m,scale)=>({riderId:r.riderId,x0:r.meters,x1:r6(r.meters+m.forwardMeters*scale),y0:r.y,y1:r6(r.y+(m.targetY-r.y)*scale)})
const points=(a,b,g)=>isHit({x0:a.meters,x1:a.meters,y0:a.y,y1:a.y},{x0:b.meters,x1:b.meters,y0:b.y,y1:b.y},g)

export function resolveSimultaneousPathsV3(riders,moves,rawGeometry,{dt=10,maxIterations=56}={}){
 ensure(Array.isArray(riders)&&riders.length>=2&&riders.length<=200&&Array.isArray(moves)&&moves.length===riders.length&&
  Number.isInteger(dt)&&dt>=5&&dt<=20&&Number.isInteger(maxIterations)&&maxIterations>=8&&maxIterations<=80,'Invalid simultaneous path solver')
 const g=validateRoadScenarioV3(rawGeometry)
 const byId=new Map(moves.map(m=>[m?.riderId,m]))
 ensure(byId.size===riders.length,'Duplicate simultaneous intent')
 const seen=new Set()
 for(const r of riders){
  ensure(typeof r?.riderId==='string'&&r.riderId.length>0&&!seen.has(r.riderId)&&Number.isFinite(r.meters)&&r.meters>=0&&Number.isFinite(r.y)&&r.y>=0&&r.y<=(g.laneCount-1)*g.centerStepM,'Invalid simultaneous rider')
  seen.add(r.riderId)
  const m=byId.get(r.riderId)
  ensure(m&&Number.isFinite(m.forwardMeters)&&m.forwardMeters>=0&&m.forwardMeters<=20*dt&&Number.isFinite(m.targetY)&&m.targetY>=0&&m.targetY<=(g.laneCount-1)*g.centerStepM&&Math.abs(m.targetY-r.y)<=g.centerStepM+1e-8,'Invalid simultaneous motion intent')
 }
 for(let i=0;i<riders.length;i++)for(let j=i+1;j<riders.length;j++)ensure(!points(riders[i],riders[j],g),'Initially colliding simultaneous rider positions')
 // The input order has no significance. Sort once for repeatable diagnostics.
 const ordered=[...riders].sort((a,b)=>a.riderId.localeCompare(b.riderId))
 const scales=new Map(ordered.map(r=>[r.riderId,1]))
 let firstConflicts=0,iterations=0,collisions=0
 for(;iterations<=maxIterations;iterations++){
  const paths=ordered.map(r=>pathOf(r,byId.get(r.riderId),scales.get(r.riderId)))
  const involved=new Set()
  for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
   if(isHit(paths[i],paths[j],g)){involved.add(paths[i].riderId);involved.add(paths[j].riderId);collisions++}
  }
  if(iterations===0)firstConflicts=collisions
  if(involved.size===0){
   const byOriginalId=new Map(paths.map((p,i)=>[p.riderId,{...p,requestedMeters:byId.get(p.riderId).forwardMeters,achievedMeters:r6(p.x1-p.x0),scale:scales.get(p.riderId)}]))
   const result=riders.map(r=>byOriginalId.get(r.riderId))
   ensure(result.every(p=>p.achievedMeters>=-1e-7&&p.achievedMeters<=p.requestedMeters+1e-5),'Simultaneous resolver invented forward travel')
   return {paths:result,iterations,firstConflicts,pairConflictsChecked:collisions,blockedRiders:[...scales].filter(([,v])=>v<1).length,allPairsSweptClear:true}
  }
  ensure(iterations<maxIterations,'Simultaneous micro solver did not converge safely')
  for(const id of involved)scales.set(id,scales.get(id)/2)
 }
 throw Error('Unreachable collision resolver condition')
}

export function initializeSimultaneousMicroV3({riders,geometry=BATCH40_GEOMETRIES[1],dt=10,road={gradePercent:0}}={}){
 ensure(Array.isArray(riders)&&riders.length>=2&&riders.length<=32&&Number.isInteger(dt)&&dt>=5&&dt<=20&&road&&Number.isFinite(road.gradePercent)&&road.gradePercent>=-15&&road.gradePercent<=15,'Invalid simultaneous micro initialization')
 const g=validateRoadScenarioV3(geometry),ids=new Set()
 const initial=riders.map(r=>{
  ensure(typeof r.riderId==='string'&&r.riderId.length>0&&!ids.has(r.riderId)&&Number.isFinite(r.meters)&&r.meters>=0&&Number.isFinite(r.y)&&r.y>=0&&r.y<=(g.laneCount-1)*g.centerStepM&&Number.isFinite(r.speedMps)&&r.speedMps>=0&&r.speedMps<=20&&Number.isFinite(r.cpWatts)&&r.cpWatts>=100&&r.cpWatts<=500,'Invalid simultaneous micro rider')
  ids.add(r.riderId)
  return {riderId:r.riderId,meters:r6(r.meters),y:r6(r.y),speedMps:r.speedMps,cpWatts:r.cpWatts,energy:initializeEnergyBalanceResearchV3({criticalWatts:r.cpWatts,wPrimeJoules:r.wPrimeJoules??16000})}
 })
 for(let i=0;i<initial.length;i++)for(let j=i+1;j<initial.length;j++)ensure(!points(initial[i],initial[j],g),'Initial micro bicycle collision')
 return {version:1,gate:'A2_SIMULTANEOUS_OFFLINE_ONLY',officialWrites:0,sportingApproval:'NOT_APPROVED',
  dt,geometry:structuredClone(geometry),road:structuredClone(road),tick:0,elapsedSeconds:0,riders:initial,
  metrics:{requestedMeters:0,achievedMeters:0,blockedRiderTicks:0,collisionPairsDetected:0,conflictIterations:0,mechanicalJ:0}}
}
export function advanceSimultaneousMicroV3(state,intents){
 ensure(state?.version===1&&state.gate==='A2_SIMULTANEOUS_OFFLINE_ONLY'&&state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED'&&Number.isInteger(state.tick)&&state.tick>=0,'Invalid simultaneous micro checkpoint')
 const out=structuredClone(state),dt=out.dt,g=validateRoadScenarioV3(out.geometry)
 ensure(Array.isArray(intents)&&intents.length===out.riders.length,'Missing simultaneous intents')
 const actions=new Map(intents.map(x=>[x.riderId,x]))
 ensure(actions.size===out.riders.length,'Duplicate simultaneous intents')
 // Freeze current positions and velocities. No rider modifies another's plan.
 const plans=out.riders.map(r=>{
  const m=actions.get(r.riderId)
  ensure(m&&Number.isFinite(m.forwardMeters)&&m.forwardMeters>=0&&m.forwardMeters<=20*dt&&Number.isFinite(m.targetY),'Invalid micro intent')
  const steering=Math.abs(m.targetY-r.y)>1e-7
  const power=v=>roadWattsRequiredV3(v,83,.36,out.road)+(steering?35:0)
  const maxWatts=r.cpWatts+r.energy.remainingWPrimeJoules/dt-.5
  const upper=Math.min(m.forwardMeters/dt,r.speedMps+.09*dt,20)
  let speed=Math.max(0,upper)
  if(power(speed)>maxWatts){
   let lo=0,hi=speed
   ensure(power(0)<=maxWatts+1e-6,'Unavailable power budget even while stationary')
   for(let i=0;i<44;i++){const mid=(lo+hi)/2;if(power(mid)>maxWatts)hi=mid;else lo=mid}
   speed=Math.max(0,lo-1e-7)
  }
  return {riderId:r.riderId,forwardMeters:r6(speed*dt),targetY:m.targetY}
 })
 const resolved=resolveSimultaneousPathsV3(out.riders,plans,out.geometry,{dt})
 for(const path of resolved.paths){
  const r=out.riders.find(x=>x.riderId===path.riderId),speed=r6(path.achievedMeters/dt)
  const steering=Math.abs(path.y1-path.y0)>1e-7,watts=roadWattsRequiredV3(speed,83,.36,out.road)+(steering?35:0)
  const energy=advanceEnergyBalanceResearchV3(r.energy,watts,dt)
  ensure(energy.accepted,'Simultaneous micro W-prime safety gate failed')
  r.meters=path.x1;r.y=path.y1;r.speedMps=speed;r.energy=energy.state
  out.metrics.requestedMeters+=path.requestedMeters;out.metrics.achievedMeters+=path.achievedMeters
  out.metrics.blockedRiderTicks+=Number(path.achievedMeters+1e-4<path.requestedMeters)
  out.metrics.mechanicalJ+=watts*dt
 }
 out.metrics.collisionPairsDetected+=resolved.firstConflicts;out.metrics.conflictIterations+=resolved.iterations
 out.tick++;out.elapsedSeconds+=dt
 return out
}
