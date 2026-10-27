/** A2 OFFLINE-ONLY affine sub-tick event observer. Its times are valid only
 * under the existing straight swept-path interpolation assumption. It does
 * not modify bicycle motion, energy, overtaking policy or official results.
 */
const check=(v,m)=>{if(!v)throw Error(m)}
const round=n=>Math.round(n*1e9)/1e9
export function affineStrictCrossingFractionV3(a,b,{epsilon=1e-7}={}){
 check([a,b,epsilon].every(Number.isFinite)&&epsilon>0&&epsilon<=.05,'Invalid crossing gap')
 if(a>=-epsilon||b<=epsilon)return null
 const d=b-a,f=-a/d
 return d>2*epsilon&&f>=0&&f<=1?round(f):null
}
export function affineLaneEntryFractionV3(y0,y1,{laneStepM=1,goalY=0}={}){
 check([y0,y1,laneStepM,goalY].every(Number.isFinite)&&laneStepM>.5&&laneStepM<=1.5&&goalY>=0,'Invalid lateral entry')
 const boundary=goalY+laneStepM*.5
 if(y0<=boundary+1e-7)return 0
 if(y1>boundary+1e-7||y1>=y0-1e-7)return null
 const f=(boundary-y0)/(y1-y0)
 return f>=0&&f<=1?round(f):null
}
export function initializeSubtickEventObserverV3({passerId='rear',leadId='lead',claimantIds=['extra2'],laneStepM=1,dt=10}={}){
 check(typeof passerId==='string'&&!!passerId&&typeof leadId==='string'&&!!leadId&&passerId!==leadId&&
  Array.isArray(claimantIds)&&claimantIds.every(id=>typeof id==='string'&&id&&id!==passerId&&id!==leadId)&&
  new Set(claimantIds).size===claimantIds.length&&Number.isFinite(laneStepM)&&laneStepM>=.75&&laneStepM<=1.5&&
  Number.isFinite(dt)&&dt>0&&dt<=20,'Invalid event observer')
 return {version:1,gate:'A2_SUBTICK_OFFLINE_ONLY',passerId,leadId,claimantIds:claimantIds.slice().sort(),laneStepM,dt,tick:0,elapsedSeconds:0,
  passEvents:[],laneCompletions:{},lateralMetres:{},lastLateralDirection:{},directionReversals:{},officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
export function advanceSubtickEventObserverV3(old,before,after,elapsedSeconds){
 check(old?.version===1&&old.gate==='A2_SUBTICK_OFFLINE_ONLY'&&old.officialWrites===0&&old.sportingApproval==='NOT_APPROVED'&&
  Number.isFinite(elapsedSeconds)&&Math.abs(elapsedSeconds-old.elapsedSeconds-old.dt)<1e-6,'Invalid event observer checkpoint')
 const prev=new Map(before.map(r=>[r.riderId,r])),now=new Map(after.map(r=>[r.riderId,r]))
 const ids=[old.passerId,old.leadId,...old.claimantIds]
 check(prev.size===before.length&&now.size===after.length&&ids.every(id=>prev.has(id)&&now.has(id))&&
  ids.every(id=>[prev.get(id).meters,prev.get(id).y,now.get(id).meters,now.get(id).y].every(Number.isFinite)), 'Incomplete event roster')
 const out=structuredClone(old),p=old.passerId,l=old.leadId
 const fraction=affineStrictCrossingFractionV3(prev.get(p).meters-prev.get(l).meters,now.get(p).meters-now.get(l).meters)
 if(fraction!==null)out.passEvents.push({tick:old.tick+1,fraction,seconds:round(old.elapsedSeconds+old.dt*fraction)})
 for(const id of out.claimantIds){
  const y0=prev.get(id).y,y1=now.get(id).y,dy=y1-y0
  out.lateralMetres[id]=(out.lateralMetres[id]??0)+Math.abs(dy)
  if(Math.abs(dy)>1e-7){
   const dir=Math.sign(dy)
   if(out.lastLateralDirection[id]&&dir!==out.lastLateralDirection[id])out.directionReversals[id]=(out.directionReversals[id]??0)+1
   out.lastLateralDirection[id]=dir
  }
  if(!out.laneCompletions[id]){
   const f=affineLaneEntryFractionV3(y0,y1,{laneStepM:old.laneStepM})
   if(f!==null)out.laneCompletions[id]={tick:old.tick+1,fraction:f,seconds:round(old.elapsedSeconds+old.dt*f)}
  }
 }
 out.tick++;out.elapsedSeconds=elapsedSeconds
 return out
}
export function classifySubtickOrderV3(observer,claimantId,{temporalEpsilonSeconds=1e-6}={}){
 check(observer?.version===1&&observer.claimantIds.includes(claimantId)&&Number.isFinite(temporalEpsilonSeconds)&&temporalEpsilonSeconds>0&&temporalEpsilonSeconds<=.01,'Invalid sub-tick order request')
 const p=observer.passEvents[0]??null,c=observer.laneCompletions[claimantId]??null
 if(!p||!c)return {order:'UNOBSERVED',passSeconds:p?.seconds??null,completionSeconds:c?.seconds??null,deltaSeconds:null}
 const delta=round(p.seconds-c.seconds)
 return {order:Math.abs(delta)<=temporalEpsilonSeconds?'SIMULTANEOUS_OR_NUMERICALLY_UNRESOLVED':delta<0?'PASS_BEFORE_LANE_COMPLETION':'PASS_AFTER_LANE_COMPLETION',
  passSeconds:p.seconds,completionSeconds:c.seconds,deltaSeconds:delta}
}
