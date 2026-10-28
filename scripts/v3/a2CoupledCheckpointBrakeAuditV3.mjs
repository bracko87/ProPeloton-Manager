/** A58 OFFLINE coupled local-reaction research; NO live race-state writing.
 * All selected riders use physically integrated bounded longitudinal brake
 * trajectories and optionally smooth, speed-bounded lateral steering.
 * Unselected A44 riders replay unchanged accepted traces as moving obstacles,
 * so this is NOT a fully responsive peloton.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
import {commitAchievedSpeedEnergyV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
const need=(ok,msg)=>{if(!ok)throw Error(msg)}
const r6=x=>Math.round(x*1e6)/1e6
const B=.85,TURN_RATE=.38,STEER_SECONDS=5
const smooth=t=>t*t*(3-2*t)
function timeline(observed,dt){
 need(Array.isArray(observed)&&observed.length===6,'A58 invalid frozen source history')
 const data=observed.flatMap(t=>t.previews.map(p=>({
  start:r6(p.tickStartSeconds+(p.substep-1)*dt),
  end:r6(p.tickStartSeconds+p.substep*dt),p
 }))).sort((a,b)=>a.start-b.start)
 need(data.length===Math.round(60/dt),'A58 missing checkpoint traces')
 return data
}
function pathFrom(p){
 return {id:p.riderId,x:p.x0,y:p.y0,v:p.oldSpeedMps,
  energy:structuredClone(p.energyBefore)}
}
function moveLong(s,elapsed){
 const use=Math.min(elapsed,s.v/B)
 return s.x+s.v*use-.5*B*use*use
}
function lateral(s,elapsed,target){
 if(target===null)return s.y
 return s.y+(target-s.y)*smooth(Math.min(1,elapsed/STEER_SECONDS))
}
function range(s,target,g){
 return target===null||Math.abs(target-s.y)<1e-8||
 (target>=0&&target<=(g.laneCount-1)*g.centerStepM+1e-8&&
 1.5*Math.abs(target-s.y)/STEER_SECONDS<=TURN_RATE+1e-8)
}
function proposalsAt(preview){return new Map(preview.proposals.map(x=>[x.riderId,x]))}
function nextLane(y,g,side){
 const cur=Math.round(y/g.centerStepM)
 const lane=cur+side
 if(lane<0||lane>=g.laneCount)return null
 const target=r6(lane*g.centerStepM)
 return Math.abs(target-y)<1e-5?null:target
}
/** All participants selected *only from the alert-time frozen checkpoint*.
 * A behind rider shares a corridor and lies within 15m. The source conflict
 * graph can extend the grouping if the behind rider is itself touching the
 * alerted rider. We do not inspect future blockers to choose the group.
 */
export function selectLocalBrakeFollowersV3(preview,primary,g,{maxFollowers=3}={}){
 need(preview?.proposals?.length>=2&&typeof primary==='string'&&
 Number.isFinite(g?.lateralCollisionM)&&maxFollowers>=0&&maxFollowers<=5,
 'A58 invalid source grouping')
 const p=preview.proposals.find(x=>x.riderId===primary)
 need(p&&p.energyBefore,'A58 missing original alert rider')
 const pairSet=new Set(preview.previewConflictPairs.filter(x=>x.includes(primary)).flat())
 const followers=preview.proposals.filter(x=>x.riderId!==primary&&
 x.x0<p.x0-1e-7&&Math.abs(x.y0-p.y0)<=g.lateralCollisionM+1e-7&&
 (p.x0-x.x0<=15||pairSet.has(x.riderId)))
 .sort((a,b)=>(p.x0-a.x0)-(p.x0-b.x0)||
 a.riderId.localeCompare(b.riderId)).slice(0,maxFollowers).map(x=>x.riderId)
 return {primary,followers,selected:[primary,...followers],
  selection:'alert-time same-corridor trailing cyclists <=15m or original contact, at most three; no future blocker lookups'}
}
export function buildCoupledBrakeOptionsV3(preview,primary,g){
 const group=selectLocalBrakeFollowersV3(preview,primary,g)
 const source=proposalsAt(preview).get(primary)
 const near=group.followers[0]??null
 const options=[
  {key:'SINGLE_BRAKE',reactors:[primary],steering:{}},
  {key:'WAKE_BRAKE',reactors:group.selected,steering:{}}
 ]
 for(const side of [-1,1]){
  const target=nextLane(source.y0,g,side)
  if(target!==null&&range({y:source.y0},target,g)){
   options.push({key:side<0?'SINGLE_BRAKE_STEER_LEFT':'SINGLE_BRAKE_STEER_RIGHT',
    reactors:[primary],steering:{[primary]:target}})
   options.push({key:side<0?'WAKE_BRAKE_STEER_LEFT':'WAKE_BRAKE_STEER_RIGHT',
    reactors:group.selected,steering:{[primary]:target}})
  }
  if(near){
   const nearP=proposalsAt(preview).get(near)
   const other=nextLane(nearP.y0,g,side)
   if(other!==null&&range({y:nearP.y0},other,g))
    options.push({key:side<0?'WAKE_TRAILER_STEER_LEFT':'WAKE_TRAILER_STEER_RIGHT',
     reactors:group.selected,steering:{[near]:other}})
  }
 }
 return {group,options}
}
export function replayCoupledEarlyBrakeV3(observed,g,grade,primary,warningEnd,criticalEvent,
 option,{dt,horizonSeconds=10,intervals=32}={}){
 need(Number.isFinite(dt)&&dt>0&&dt<=5&&Number.isFinite(grade)&&
 Number.isInteger(intervals)&&intervals>=16&&intervals<=128&&
 horizonSeconds>=dt&&horizonSeconds<=10&&typeof primary==='string'&&
 Array.isArray(option?.reactors)&&option.reactors.includes(primary)&&
 new Set(option.reactors).size===option.reactors.length&&
 Number.isFinite(g?.lateralCollisionM),'A58 invalid joint-replay input')
 const sourceInput=JSON.stringify([observed,option])
 const data=timeline(observed,dt)
 const at=data.findIndex(x=>Math.abs(x.end-warningEnd)<1e-6)
 need(at>=0,'A58 prior warning missing actual physical checkpoint')
 const start=data[at].start,last=Math.min(60,start+horizonSeconds)
 const segment=data.slice(at).filter(x=>x.end<=last+1e-8)
 need(segment.length,'A58 empty integration horizon')
 const original=proposalsAt(data[at].p)
 const initial=new Map(),steerTargets=new Map()
 for(const id of option.reactors){
  const p=original.get(id)
  need(p&&p.energyBefore&&p.oldSpeedMps>=0,'A58 missing frozen reactor state')
  const state=pathFrom(p),target=Object.hasOwn(option.steering,id)?option.steering[id]:null
  need(range(state,target,g),'A58 steering target exceeds lane/rate envelope')
  initial.set(id,state);steerTargets.set(id,target)
 }
 const states=new Map([...initial].map(([id,s])=>[id,structuredClone(s)]))
 const records=[],blockers=[]
 let energyFailure=null,maxLatRate=0,work=0
 let sourceOtherUnchanged=true,updatedReactors=0
 const actionIds=new Set(option.reactors)
 for(const step of segment){
  if(records.length)need(Math.abs(records.at(-1).t1-step.start)<1e-6,'A58 source discontinuity')
  const frozen=proposalsAt(step.p)
  const targets=new Map()
  for(const [id,s] of states){
   const begin=initial.get(id)
   const elapsed=step.start-start,elapsedEnd=step.end-start
   const endX=moveLong(begin,elapsedEnd),endY=lateral(begin,elapsedEnd,steerTargets.get(id))
   const x0=moveLong(begin,elapsed),y0=lateral(begin,elapsed,steerTargets.get(id))
   need(Math.abs(x0-s.x)<1e-5&&Math.abs(y0-s.y)<1e-5,
    'A58 reactor state/velocity continuity broken')
   const localV=Math.max(0,begin.v-B*elapsed)
   need(Math.abs(localV-s.v)<1e-5,'A58 reactor speed mismatch')
   targets.set(id,{id,x0,y0,x1:endX,y1:endY,
    v0:s.v,v1:Math.max(0,begin.v-B*elapsedEnd),
    yFunction:t=>lateral(begin,elapsed+t,steerTargets.get(id)),
    xFunction:t=>moveLong(begin,elapsed+t),
    steerTarget:steerTargets.get(id)})
   const dy=Math.abs(endY-y0),rate=1.5*Math.abs(
    (steerTargets.get(id)??begin.y)-begin.y)/STEER_SECONDS
   maxLatRate=Math.max(maxLatRate,rate)
   need(dy<=TURN_RATE*dt+1e-6,'A58 exceeded lateral steering rate')
  }
  const obstacles=step.p.achieved.filter(x=>!actionIds.has(x.riderId)).map(a=>{
   const p=frozen.get(a.riderId)
   need(p,'A58 unknown original obstacle')
   return {id:a.riderId,x0:p.x0,y0:p.y0,x1:a.x1,y1:a.y1}
  })
  sourceOtherUnchanged&&=obstacles.length===step.p.proposals.length-actionIds.size
  const moved=[...targets.values()]
  const hits=[]
  for(let i=0;i<moved.length+obstacles.length;i++)
   for(let j=i+1;j<moved.length+obstacles.length;j++){
    const a=i<moved.length?moved[i]:obstacles[i-moved.length]
    const b=j<moved.length?moved[j]:obstacles[j-moved.length]
    // The original A44 obstacle/obstacle pairs were already swept-safe.
    if(!actionIds.has(a.id)&&!actionIds.has(b.id))continue
    const h=dt/intervals
    for(let micro=0;micro<intervals;micro++){
     const t0=micro*h,t1=(micro+1)*h
     const seg=obj=>obj.xFunction?{
      x0:obj.xFunction(t0),x1:obj.xFunction(t1),
      y0:obj.yFunction(t0),y1:obj.yFunction(t1)
     }:{
      x0:obj.x0+(obj.x1-obj.x0)*(t0/dt),
      x1:obj.x0+(obj.x1-obj.x0)*(t1/dt),
      y0:obj.y0+(obj.y1-obj.y0)*(t0/dt),
      y1:obj.y0+(obj.y1-obj.y0)*(t1/dt)}
     const a1=seg(a),b1=seg(b)
     // Conservative second-derivative chord-error bound for both
     // constant-brake x and smoothstep lateral y (including full-stop).
     const bound=obj=>obj.xFunction?{
      x:B*h*h/8,
      y:6*Math.abs((obj.steerTarget??initial.get(obj.id).y)-
       initial.get(obj.id).y)/STEER_SECONDS**2*h*h/8}: {x:0,y:0}
     const e1=bound(a),e2=bound(b)
     if(continuousBicycleCollisionV3(a1,b1,{
      longitudinal:1.8+e1.x+e2.x+1e-5,
      lateral:g.lateralCollisionM+e1.y+e2.y+1e-5})){
      hits.push({ids:[a.id,b.id].sort(),at:r6(step.start+t0),
       type:actionIds.has(a.id)&&actionIds.has(b.id)?
        'REACTOR_REACTOR':'REACTOR_FROZEN_OUTSIDE',
       microinterval:micro})
      break
     }
    }
   }
  const changes=[]
  let failure=null
  for(const [id,t] of targets){
   const prev=states.get(id)
   const dx=t.x1-t.x0,dy=t.y1-t.y0
   const turning=Math.abs(dy)>1e-8
   const power=v=>roadWattsRequiredV3(v,83,.36,{gradePercent:grade})+
    (turning?(frozen.get(id).steeringWatts??35):0)
   let E
   try{E=commitAchievedSpeedEnergyV3(prev.energy,dt,Math.max(0,dx/dt),power)}
   catch(err){failure=String(err.message);break}
   need(E.remainingWPrimeJoules>=0&&
     Math.abs(E.seconds-(initial.get(id).energy.seconds+step.end-start))<1e-5,
    'A58 W-prime ledger clock mismatch')
   changes.push({id,x:r6(t.x1),y:r6(t.y1),v:r6(t.v1),
    energy:E,braking:B,turning,dy:r6(dy)})
  }
  records.push({t0:step.start,t1:step.end,
   reactorCount:targets.size,frozenOutsideCount:obstacles.length,
   collisions:hits,
   reactorMotion:changes.map(x=>({id:x.id,x:x.x,y:x.y,v:x.v,
    energySeconds:x.energy.seconds,wPrime:x.energy.remainingWPrimeJoules})),
   energyFailure:failure})
  if(hits.length||failure){
   blockers.push(...hits);energyFailure=failure
   break
  }
  for(const x of changes){
   states.set(x.id,{id:x.id,x:x.x,y:x.y,v:x.v,energy:x.energy})
   work+=x.energy.cumulativeMechanicalJoules-
    (initial.get(x.id).energy.cumulativeMechanicalJoules)
  }
  updatedReactors+=changes.length
 }
 const lastStep=records.at(-1),blocked=blockers.length>0
 const completed=Boolean(lastStep&&lastStep.t1>=last-1e-7&&!blocked&&!energyFailure)
 const reached=Boolean(lastStep&&lastStep.t1>=criticalEvent-1e-7&&!blocked&&!energyFailure)
 need(JSON.stringify([observed,option])===sourceInput,'A58 input mutation')
 return {strategy:option.key,primary,
  reactedIds:[...actionIds].sort(),reactionCount:actionIds.size,
  sourceStart:start,criticalEvent,horizonEnd:last,
  steps:records.length,completedFullHorizon:completed,reachedCriticalEvent:reached,
  collisionFree:!blocked,firstBlockers:blockers.slice(0,16),
  energyValid:!energyFailure,energyFailure,
  allFrozenOutsidePathsUnchanged:sourceOtherUnchanged,
  fullFieldResponsive:false,brakeLimitMps2:B,maxLateralRateMps:r6(maxLatRate),
  exactStateIntegration:true,reactorEnergyUpdates:updatedReactors,
  finalStates:[...states.values()].map(x=>({id:x.id,x:x.x,y:x.y,v:x.v,
   seconds:x.energy.seconds,wPrime:x.energy.remainingWPrimeJoules})),
  records,officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
/** Enumerate predetermined, alert-time options; classify first full
 * horizon completion only for research. Do not turn best retrospective
 * outcome into a gameplay policy.
 */
export function auditCoupledBrakeChoicesV3(observed,g,grade,primary,warningEnd,event,
 {dt,horizonSeconds=10,intervals=32}={}){
 const source=timeline(observed,dt).find(x=>Math.abs(x.end-warningEnd)<1e-6)
 need(source,'A58 no actual original warning source')
 const setup=buildCoupledBrakeOptionsV3(source.p,primary,g)
 const checked=setup.options.map(o=>replayCoupledEarlyBrakeV3(
  observed,g,grade,primary,warningEnd,event,o,{dt,horizonSeconds,intervals}))
 const first=checked.find(x=>x.completedFullHorizon)??null
 return {primary,group:setup.group,attempts:checked,
  anyFullHorizon:!!first,firstFullHorizonStrategy:first?.strategy??null,
  distinctResponseCounts:[...new Set(checked.map(x=>x.reactionCount))],
  purelyFrozenExternalRiders:true,
  officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
