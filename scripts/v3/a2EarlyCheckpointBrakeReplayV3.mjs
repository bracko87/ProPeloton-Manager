/** A57: real early-checkpoint bounded-braking shadow intervention, OFFLINE ONLY.
 * A pre-existing A44 frozen physical substep is the checkpoint. One warned
 * cyclist follows continuous max-ordinary-braking; all OTHER cyclists keep
 * their recorded A44 accepted trajectories, without reaction. This is a
 * conservative obstacle-replay control, NOT a self-consistent peloton engine.
 * Every physical interval is independently swept against ALL cyclists.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
import {commitAchievedSpeedEnergyV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
const check=(v,m)=>{if(!v)throw Error(m)}
const r6=x=>Math.round(x*1e6)/1e6
const B=.85
function allPreviews(observed,dt){
 const out=[]
 for(const tick of observed){
  for(const p of tick.previews){
   check(Math.abs(p.dtSeconds-dt)<1e-8,'A57 mismatched recorded physical grid')
   out.push({t0:r6(p.tickStartSeconds+(p.substep-1)*dt),
    t1:r6(p.tickStartSeconds+p.substep*dt),preview:p})
  }
 }
 return out.sort((a,b)=>a.t0-b.t0)
}
/** Restart from an actual earlier A44 pre-substep state, and replay all
 * the original A44 *other* riders as frozen dynamic obstacles. Only
 * one warning rider is altered, from that same physical state onward.
 */
export function replayEarlyBrakingShadowV3(observed,geometry,grade,riderId,alertEndSeconds,criticalEventSeconds,
 {dt,horizonSeconds=10,brakingMps2=B,intervals=32}={}){
 check(Array.isArray(observed)&&observed.length===6&&typeof riderId==='string'&&
  Number.isFinite(dt)&&dt>0&&dt<=5&&Number.isFinite(alertEndSeconds)&&
  Number.isFinite(criticalEventSeconds)&&Number.isFinite(grade)&&
  Number.isInteger(intervals)&&intervals>=8&&intervals<=128&&
  brakingMps2===.85&&horizonSeconds>=dt&&horizonSeconds<=10&&
  Number.isFinite(geometry?.lateralCollisionM),'A57 invalid controlled replay inputs')
 const inputs=JSON.stringify([observed,riderId,alertEndSeconds,criticalEventSeconds])
 const timeline=allPreviews(observed,dt)
 const firstIndex=timeline.findIndex(x=>Math.abs(x.t1-alertEndSeconds)<=1e-6)
 check(firstIndex>=0,'A57 alert not in actual source timeline')
 const first=timeline[firstIndex],p0=first.preview.proposals.find(p=>p.riderId===riderId)
 check(p0&&p0.energyBefore&&Number.isFinite(p0.oldSpeedMps),'A57 missing initial checkpoint')
 const start=first.t0
 const last=Math.min(60,start+horizonSeconds)
 const steps=timeline.slice(firstIndex).filter(x=>x.t1<=last+1e-8)
 check(steps.length>0,'A57 empty controlled horizon')
 let x=p0.x0,y=p0.y0,v=p0.oldSpeedMps,energy=structuredClone(p0.energyBefore)
 const records=[],blockers=[]
 let firstBlocked=null,firstCollisionFraction=null,brakeJ=0
 let initialEnergy=structuredClone(energy)
 let allOtherAcceptedExactly=true
 let reachesEvent=steps.at(-1).t1>=criticalEventSeconds-1e-6
 const warnedStartHasRealState=first.t0===r6(alertEndSeconds-dt)
 check(warnedStartHasRealState,'A57 not from an actual pre-substep checkpoint')
 for(const sample of steps){
  const preview=sample.preview
  const anchor=preview.proposals.find(p=>p.riderId===riderId)
  check(anchor,'A57 missing warned cyclist')
  if(records.length)check(Math.abs(records.at(-1).t1-sample.t0)<=1e-7,
   'A57 noncontiguous original recorded source')
  const from={x,y,v}
  const tStop=v/brakingMps2
  const k=dt
  const duration=Math.min(k,tStop)
  const dx=v*duration-.5*brakingMps2*duration*duration
  const x1=x+dx,v1=Math.max(0,v-brakingMps2*k)
  const h=k/intervals
  const move=(t)=>{const t2=Math.min(t,tStop)
   return x+v*t2-.5*brakingMps2*t2*t2}
  const others=preview.achieved.map(a=>{
   const prop=preview.proposals.find(p=>p.riderId===a.riderId)
   check(prop,'A57 incomplete actual prior source')
   return {riderId:a.riderId,x0:prop.x0,y0:prop.y0,x1:a.x1,y1:a.y1}
  }).filter(a=>a.riderId!==riderId)
  // The full set of source-derived obstacle paths is never overwritten.
  allOtherAcceptedExactly&&=others.length===preview.proposals.length-1
  const hitPairs=[]
  for(const q of others){
   let blocked=null
   for(let j=0;j<intervals;j++){
    const t0=j*h,t1=(j+1)*h
    const alpha=t0/k,beta=t1/k
    const our={riderId,x0:move(t0),x1:move(t1),y0:y,y1:y}
    const other={riderId:q.riderId,
     x0:q.x0+(q.x1-q.x0)*alpha,x1:q.x0+(q.x1-q.x0)*beta,
     y0:q.y0+(q.y1-q.y0)*alpha,y1:q.y0+(q.y1-q.y0)*beta}
    // Conservative chord bound for the braked cyclist.
    // |x(t) - chord| <= braking*h^2/8 holds for each interval;
    // it also upper bounds the piecewise-stop transition.
    const guard=brakingMps2*h*h/8+1e-5
    if(continuousBicycleCollisionV3(our,other,
      {longitudinal:1.8+guard,lateral:geometry.lateralCollisionM})){
     blocked={pair:[riderId,q.riderId].sort(),timeSeconds:r6(sample.t0+j*h),
      stepIndex:records.length,microinterval:j,guardM:r6(guard)}
     break
    }
   }
   if(blocked)hitPairs.push(blocked)
  }
  // Physical research energy is debited on achieved average movement,
  // using the same provisional power law and true earlier W-prime state.
  let newEnergy=null,energyFailure=null
  try{newEnergy=commitAchievedSpeedEnergyV3(energy,k,dx/k,
    speed=>roadWattsRequiredV3(speed,83,.36,{gradePercent:grade}))}
  catch(err){energyFailure=String(err.message)}
  const entry={t0:sample.t0,t1:sample.t1,
   startX:r6(x),endX:r6(x1),startSpeedMps:r6(v),endSpeedMps:r6(v1),
   ordinaryBrakingMps2:v>0?brakingMps2:0,
   distanceM:r6(dx),lateralY:r6(y),
   collisions:hitPairs,energyFailure,
   remainingWPrimeJ:newEnergy?.remainingWPrimeJoules??null}
  records.push(entry)
  if(hitPairs.length){
   blockers.push(...hitPairs)
   if(!firstBlocked){firstBlocked=hitPairs[0].timeSeconds
    firstCollisionFraction=r6((firstBlocked-sample.t0)/dt)}
  }
  if(energyFailure||hitPairs.length)break
  check(newEnergy&&newEnergy.remainingWPrimeJoules>=0&&
   Math.abs(newEnergy.seconds-(initialEnergy.seconds+(sample.t1-start)))<=1e-5,
   'A57 invalid bounded-brake W-prime clock')
  brakeJ=newEnergy.cumulativeMechanicalJoules-initialEnergy.cumulativeMechanicalJoules
  x=x1;v=v1;energy=newEnergy
 }
 const lastRecorded=records.at(-1)
 const reachedCriticalEvent=lastRecorded?.t1>=criticalEventSeconds-1e-7 &&
  blockers.length===0&&!lastRecorded.energyFailure
 const completedFullHorizon=lastRecorded?.t1>=last-1e-7 &&
  blockers.length===0&&!lastRecorded.energyFailure
 check(JSON.stringify([observed,riderId,alertEndSeconds,criticalEventSeconds])===inputs,
  'A57 mutated original checkpoint or rider intent')
 return {riderId,sourceStartSeconds:start,alertEndSeconds,
  criticalEventSeconds,horizonEndSeconds:last,stepCount:records.length,
  recordedPathStart:{x:r6(p0.x0),y:r6(p0.y0),v:r6(p0.oldSpeedMps),
   energySeconds:initialEnergy.seconds},
  firstBlockedSeconds:firstBlocked,firstCollisionFraction,
  blockers:blockers.slice(0,20),collisionFreeSoFar:blockers.length===0,
  energyValid:!lastRecorded.energyFailure,
  energyFailure:lastRecorded.energyFailure??null,
  achievedMechanicalJ:r6(brakeJ),
  remainingWPrimeJ:energy.remainingWPrimeJoules,
  allOtherAcceptedExactly,continuousOrdinaryBraking:true,
  reachesEvent,reachedCriticalEvent,completedFullHorizon,
  approval:'REJECTED_UNLESS_FULL_FIELD_DYNAMIC_REACTION_VALIDATED',
  sourceUnchanged:true,originalRiderIntentsUnchanged:true,
  officialWrites:0,sportingApproval:'NOT_APPROVED',
  records}
}
