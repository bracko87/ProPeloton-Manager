/** A59 observational mirror/relabel and all-field provisional response probe.
 * Isolated V3 research. Never used for official race calculations.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {currentLaneIntentWarningsV3} from './a2FirstContactFeasibilityV3.mjs'
import {upstreamWarningsV3} from './a2UpstreamPredictionV3.mjs'
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
import {commitAchievedSpeedEnergyV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
const check=(x,msg)=>{if(!x)throw Error(msg)}
const r6=x=>Math.round(x*1e6)/1e6
const B=.85,A=.45,L=.38,STEER_SECONDS=5
const reflectField=(x,height)=>{
 const p={...x}
 for(const k of ['y','y0','y1','proposedY','requestedY','targetY'])
  if(Number.isFinite(p[k]))p[k]=r6(height-p[k])
 return p
}
function mapSource(source,fn){
 return source.map(t=>({...t,previews:t.previews.map(p=>({
  ...p,proposals:p.proposals.map(fn),
  achieved:p.achieved.map(fn),
  previewConflictPairs:p.previewConflictPairs.map(x=>x.slice())
 }))}))
}
/** Mirror all recorded physical source positions and lateral intentions.
 * Contact-pair membership is unchanged under reflection.
 */
export function mirrorRecordedA44V3(source,g){
 const height=r6((g.laneCount-1)*g.centerStepM)
 return mapSource(source,x=>reflectField(x,height))
}
/** Deliberately reverses the lexical identity order with a bijection. */
export function relabelRecordedA44V3(source){
 const keys=source[0].previews[0].proposals.map(x=>x.riderId).sort()
 const map=new Map(keys.map((id,i)=>[id,'z'+String(keys.length-i).padStart(4,'0')]))
 const renamed=source.map(t=>({...t,previews:t.previews.map(p=>({
  ...p,proposals:p.proposals.map(x=>({...x,riderId:map.get(x.riderId)})),
  achieved:p.achieved.map(x=>({...x,riderId:map.get(x.riderId)})),
  previewConflictPairs:p.previewConflictPairs.map(pair=>pair.map(id=>map.get(id)))
 }))}))
 check(new Set([...map.values()]).size===map.size,'A59 non-bijective relabel')
 return {source:renamed,map}
}
export function mirrorStrategyV3(key){
 return key.replace(/_LEFT$/, '_X_').replace(/_RIGHT$/, '_LEFT').replace(/_X_$/, '_RIGHT')
}
const now=t=>r6(t)
const targetSmooth=t=>{let s=Math.max(0,Math.min(1,t/STEER_SECONDS))
 return s*s*(3-2*s)}
function atTime(s,elapsed){
 const used=Math.max(0,Math.min(elapsed,s.v0/Math.max(1e-12,-s.accel)))
 return s.accel<0&&elapsed>=s.v0/(-s.accel)?
 s.x0+s.v0*used+.5*s.accel*used*used:
 s.x0+s.v0*elapsed+.5*s.accel*elapsed*elapsed
}
function speedAt(s,dt){return Math.max(0,s.v0+s.accel*dt)}
function stepTrack(s,dt,sel,act,steerTarget,elapsed){
 const y0=s.y
 if(sel){
  const smooth=targetSmooth(elapsed+dt),older=targetSmooth(elapsed)
  const orig=act.originalY
  const y1=orig+(steerTarget===null?0:(steerTarget-orig)*smooth)
  const ys=orig+(steerTarget===null?0:(steerTarget-orig)*older)
  check(Math.abs(ys-y0)<2e-5,'A59 selected y state discontinuity')
  return {id:s.id,x0:s.x,y0:s.y,
   x1:atTime({...s,x0:s.x,v0:s.v,accel:act.accel},dt),
   y1,accel:act.accel,
   xAt:t=>atTime({...s,x0:s.x,v0:s.v,accel:act.accel},t),
   yAt:t=>orig+(steerTarget===null?0:(steerTarget-orig)*targetSmooth(elapsed+t)),
   lateralCurvature:steerTarget===null?0:6*Math.abs(steerTarget-orig)/STEER_SECONDS**2}
 }
 return {id:s.id,x0:s.x,y0:s.y,
  x1:atTime({...s,x0:s.x,v0:s.v,accel:act.accel},dt),
  y1:act.y1,accel:act.accel,
  xAt:t=>atTime({...s,x0:s.x,v0:s.v,accel:act.accel},t),
  yAt:t=>s.y+(act.y1-s.y)*t/dt,
  lateralCurvature:0}
}
/** Chronologically first swept-contact interval across ALL rider pairs.
 * A59's former pair-major scan could return a later event from an earlier pair.
 * This correction changes reporting order only, never path acceptance.
 */
function firstCollision(paths,g,dt,intervals){
 const h=dt/intervals
 for(let k=0;k<intervals;k++){
  const t0=k*h,t1=(k+1)*h
  for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
   const a=paths[i],b=paths[j]
   const first={x0:a.xAt(t0),x1:a.xAt(t1),y0:a.yAt(t0),y1:a.yAt(t1)}
   const second={x0:b.xAt(t0),x1:b.xAt(t1),y0:b.yAt(t0),y1:b.yAt(t1)}
   const errX=(Math.abs(a.accel)+Math.abs(b.accel))*h*h/8+1e-5
   const errY=(a.lateralCurvature+b.lateralCurvature)*h*h/8+1e-5
   if(continuousBicycleCollisionV3(first,second,{
    longitudinal:1.8+errX,lateral:g.lateralCollisionM+errY}))
    return {pair:[a.id,b.id].sort(),microinterval:k,timeFraction:r6(k/intervals)}
  }
 }
 return null
}
/** Unlike A58, ALL riders advance from one shared actual pre-step state.
 * Unselected riders obey bounded acceleration toward their actual source
 * tick's command and follow a current-state (not future) headway alarm.
 * Responding riders follow predetermined A58 strategy.
 * If any pair collides, fail closed with no artificial accepted path reset.
 * This is a stress-control model, not an approved physical peloton solver.
 */
export function replayAllRiderAnticipationProbeV3(source,g,grade,primary,
 warningEnd,event,option,{dt,horizonSeconds=10,intervals=16,preStepPolicy='legacy',
  controlMode='selected',leadFrames=0,internalQuantumSeconds=null}={}){
 check(Array.isArray(source)&&source.length===6&&dt>0&&dt<=5&&
  Number.isInteger(intervals)&&intervals>=16&&intervals<=64&&
  option?.reactors?.includes(primary)&&
  ['legacy','lane_intent','upstream_3s','upstream_5s'].includes(preStepPolicy)&&
  ['selected','autonomous'].includes(controlMode)&&Number.isInteger(leadFrames)&&
  leadFrames>=0&&leadFrames<=10&&
  (internalQuantumSeconds===null||(Number.isFinite(internalQuantumSeconds)&&
   internalQuantumSeconds>=.25&&internalQuantumSeconds<=dt&&
   Number.isInteger(Math.round(dt/internalQuantumSeconds))&&
   Math.abs(Math.round(dt/internalQuantumSeconds)*internalQuantumSeconds-dt)<1e-8))&&
  Number.isFinite(g?.lateralCollisionM),'A59 invalid full-field shadow')
 const preserved=JSON.stringify(source)
 const frames=source.flatMap(t=>t.previews.map(p=>({
  t0:now(p.tickStartSeconds+(p.substep-1)*dt),
  t1:now(p.tickStartSeconds+p.substep*dt),p
 }))).sort((a,b)=>a.t0-b.t0)
 const actualIndex=frames.findIndex(x=>Math.abs(x.t1-warningEnd)<1e-6)
 check(actualIndex>=0,'A59 actual warning state missing')
 const index=Math.max(0,actualIndex-leadFrames)
 const first=frames[index],start=first.t0,last=Math.min(60,start+horizonSeconds)
 const framesToRun=frames.slice(index).filter(f=>f.t1<=last+1e-8)
 const orig=new Map(first.p.proposals.map(p=>[p.riderId,p]))
 const states=new Map(first.p.proposals.map(p=>[p.riderId,{
  id:p.riderId,x:p.x0,y:p.y0,v:p.oldSpeedMps,energy:structuredClone(p.energyBefore)
 }]))
 const chosen=new Set(controlMode==='autonomous'?[]:option.reactors)
 const chosenStart=new Map([...chosen].map(id=>{
  const p=orig.get(id);check(p,'A59 unknown chosen rider')
  return [id,{originalY:p.y0}]
 }))
 const log=[],blockers=[]
 let reason=null,maxLateral=0,headwayReactions=0,intentWarningPairs=0,upstreamEventPairs=0
 // A62 opt-in: hold original tactical commands constant over one source
 // frame but run physically coupled steering/braking/energy on a finer grid.
 // Recompute all-rider decisions from each *new actual physical state*;
 // never read a future source frame, accepted A44 track or contact result.
 for(const sourceFrame of framesToRun){
  const slices=internalQuantumSeconds===null?1:Math.round(dt/internalQuantumSeconds)
  for(let part=0;part<slices;part++){
  const f=slices===1?sourceFrame:{
   ...sourceFrame,t0:now(sourceFrame.t0+part*(dt/slices)),
   t1:now(sourceFrame.t0+(part+1)*(dt/slices))}
  const dt=f.t1-f.t0
  const proposed=new Map(f.p.proposals.map(p=>[p.riderId,p]))
  const acts=new Map()
  for(const [id,s] of states){
   const p=proposed.get(id);check(p,'A59 incomplete command snapshot')
   let accel,y1,steerTarget=null
   if(chosen.has(id)){
    accel=s.v>0?-B:0
    steerTarget=Object.hasOwn(option.steering,id)?option.steering[id]:null
    const y0=chosenStart.get(id).originalY
    y1=y0+(steerTarget===null?0:(steerTarget-y0)*
      targetSmooth(f.t1-start))
   }else{
    const desired=Number.isFinite(p.requestedSpeedMps)?p.requestedSpeedMps:s.v
    accel=Math.max(-B,Math.min(A,(desired-s.v)/dt))
    const lateralGoal=Number.isFinite(p.requestedY)?p.requestedY:s.y
    y1=s.y+Math.max(-L*dt,Math.min(L*dt,lateralGoal-s.y))
    // A current-state following-distance alarm; no knowledge of later
    // observed A44 positions or collisions is consulted.
    const ahead=[...states.values()].filter(o=>o.id!==id&&
     o.x>s.x&&Math.abs(o.y-s.y)<=g.lateralCollisionM+1e-7)
     .sort((a,b)=>a.x-b.x)[0]
    if(preStepPolicy==='legacy'&&ahead&&s.v>ahead.v+1e-7){
     const closing=s.v-ahead.v
     if(ahead.x-s.x<=1.8+closing*dt+closing*closing/(2*B)){
      accel=-B;headwayReactions++
     }
    }
   }
   const lateralSpeed=Math.abs(y1-s.y)/dt
   check(lateralSpeed<=L+1e-6,'A59 unbounded lateral motion')
   maxLateral=Math.max(maxLateral,lateralSpeed)
   acts.set(id,{accel,y1,steerTarget,originalY:chosenStart.get(id)?.originalY})
  }
  // A60: strictly current-state lane-intent lookahead. The source's future
  // accepted paths and retrospective A58 success choice are never consulted.
  // Extra reactions stay within the same ordinary braking bound.
  if(preStepPolicy==='lane_intent'){
   const warnings=currentLaneIntentWarningsV3([...states.values()],
    [...acts].map(([id,a])=>({id,accel:a.accel,y1:a.y1})),g,dt)
   intentWarningPairs+=warnings.reasons.length
   for(const id of warnings.brakeRiders){
    if(!chosen.has(id)&&acts.get(id).accel>-B+1e-8){
     acts.get(id).accel=-B
     headwayReactions++
    }
   }
  }
  // A61: forecast uses CURRENT (not future accepted) states and commanded
  // lateral rates. Both warning horizons re-evaluate at every physical step.
  if(preStepPolicy==='upstream_3s'||preStepPolicy==='upstream_5s'){
   const lookaheadSeconds=preStepPolicy==='upstream_3s'?3:5
   const advice=upstreamWarningsV3([...states.values()],
    [...acts].map(([id,a])=>({id,accel:a.accel,y1:a.y1})),g,dt,
    {lookaheadSeconds})
   upstreamEventPairs+=advice.events.length
   for(const id of advice.brakeRiders){
    if(!chosen.has(id)&&acts.get(id).accel>-B+1e-8){
     acts.get(id).accel=-B
     headwayReactions++
    }
   }
  }
  const elapsed=f.t0-start
  const paths=[...states.values()].map(s=>stepTrack(s,dt,chosen.has(s.id),
   acts.get(s.id),acts.get(s.id).steerTarget,elapsed))
  // A physically bounded full-field interpolation replaces ALL frozen
  // A44 accepted paths; every rider-rider pair must be checked.
  const collision=firstCollision(paths,g,dt,intervals)
  const updated=[]
  let energyFailure=null
  for(const x of paths){
   const s=states.get(x.id),p=proposed.get(x.id)
   const turning=Math.abs(x.y1-x.y0)>1e-8
   let e
   try{
    e=commitAchievedSpeedEnergyV3(s.energy,dt,
     Math.max(0,(x.x1-x.x0)/dt),
     v=>roadWattsRequiredV3(v,83,.36,{gradePercent:grade})+
       (turning?(p.steeringWatts??35):0))
   }catch(err){energyFailure=String(err.message);break}
   if(e.remainingWPrimeJoules<0||Math.abs(e.seconds-(s.energy.seconds+dt))>1e-5){
    energyFailure='A59 invalid W-prime/time bound';break
   }
   updated.push({id:x.id,x:x.x1,y:x.y1,
    v:speedAt({...s,v0:s.v,accel:acts.get(x.id).accel},dt),
    energy:e})
  }
  log.push({t0:f.t0,t1:f.t1,collision,
   energyFailure,updatedCount:updated.length,
   startingStateDigest:[...states.values()].map(x=>({
    id:x.id,x:r6(x.x),y:r6(x.y),v:r6(x.v)})),
   stateDigest:updated.map(x=>({id:x.id,x:r6(x.x),y:r6(x.y),
    v:r6(x.v),w:r6(x.energy.remainingWPrimeJoules)}))})
  if(collision||energyFailure){
   reason=collision?'COLLISION':'ENERGY_FAILED'
   if(collision)blockers.push({...collision,whenSeconds:r6(f.t0+collision.timeFraction*dt)})
   break
  }
  for(const x of updated)states.set(x.id,x)
  }
  if(reason)break
 }
 const lastRecord=log.at(-1)
 const completed=Boolean(lastRecord&&lastRecord.t1>=last-1e-7&&!reason)
 const reached=Boolean(lastRecord&&lastRecord.t1>=event-1e-7&&!reason)
 check(JSON.stringify(source)===preserved,'A59 mutated source A44 records')
 return {status:completed?'FULL_FIELD_BOUNDED_CLEAR':'REJECTED_'+(reason??'INCOMPLETE'),
  complete:completed,criticalEventReached:reached,
  firstBlocker:blockers[0]??null,energyFailure:log.at(-1)?.energyFailure??null,
  fullFieldIntegrated:true,usedOriginalA44FrozenObstacles:false,
  additionalHeadwayBrakingDecisions:headwayReactions,
  intentWarningPairs,upstreamEventPairs,preStepPolicy,controlMode,
  leadFramesUsed:actualIndex-index,startSeconds:start,
  internalQuantumSeconds:internalQuantumSeconds??dt,sourceFrameSeconds:dt,
  maxLateralSpeedMps:r6(maxLateral),steps:log.length,
  groupCount:chosen.size,fieldSize:states.size,
  records:log,originalCommandsReadOnly:true,
  officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
