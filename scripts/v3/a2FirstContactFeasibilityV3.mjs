/** A60 OFFLINE research: current-state nonclairvoyant lane-intent warning and
 * retrospective first-contact feasibility audit. Never authorizes a live move.
 */
const need=(ok,msg)=>{if(!ok)throw Error(msg)}
const r6=x=>Math.round(x*1e6)/1e6
const BRAKE=.85, REAR_LENGTH=1.8, LATERAL_RATE=.38

/** Look only at CURRENT state and this step's requested/limited movements.
 * No A44 accepted future paths, collision log or hindsight response options.
 * A warning requests ordinary bounded braking; it is NOT a collision resolver.
 */
export function currentLaneIntentWarningsV3(states,actions,g,dt){
 need(Array.isArray(states)&&Array.isArray(actions)&&states.length===actions.length&&
  states.length>=2&&Number.isFinite(dt)&&dt>0&&dt<=5&&
  Number.isFinite(g?.lateralCollisionM)&&g.lateralCollisionM>0,
  'A60 malformed lane intent input')
 const initial=JSON.stringify([states,actions])
 const byId=new Map(actions.map(x=>[x.id,x]))
 need(byId.size===states.length,'A60 duplicate action identity')
 const roadMax=(g.laneCount-1)*g.centerStepM
 const warned=new Set(), reasons=[]
 for(const s of states){
  const a=byId.get(s.id)
  need(a&&Number.isFinite(s.x)&&Number.isFinite(s.y)&&Number.isFinite(s.v)&&
   s.v>=0&&Number.isFinite(a.y1)&&Number.isFinite(a.accel)&&
   a.y1>=-1e-6&&a.y1<=roadMax+1e-6&&
   Math.abs(a.y1-s.y)<=LATERAL_RATE*dt+1e-5&&
   a.accel>=-BRAKE-1e-8&&a.accel<=.45+1e-8,
   'A60 invalid bounded current rider command')
 }
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  const s=states[i],t=states[j]
  if(Math.abs(s.x-t.x)<1e-9)continue // equal longitudinal position: ambiguous priority
  const rear=s.x<t.x?s:t,lead=s.x<t.x?t:s
  const ar=byId.get(rear.id),al=byId.get(lead.id)
  const lateral0=rear.y-lead.y,lateral1=ar.y1-al.y1
  const crossing=lateral0*lateral1<=0
  const near=(crossing?0:Math.min(Math.abs(lateral0),Math.abs(lateral1)))
  if(near>g.lateralCollisionM+1e-7)continue
  const closing=Math.max(0,rear.v-lead.v,
   Math.max(0,rear.v+ar.accel*dt)-Math.max(0,lead.v+al.accel*dt))
  if(closing<=1e-8)continue
  const observedGap=lead.x-rear.x
  const minSeparation=REAR_LENGTH+closing*dt+closing*closing/(2*BRAKE)
  if(observedGap>minSeparation)continue
  warned.add(rear.id)
  reasons.push({rear:rear.id,lead:lead.id,
   geometry:Math.abs(lateral0)<=g.lateralCollisionM+1e-7?'CURRENT_CORRIDOR':'PROJECTED_LANE_CROSSING',
   distanceM:r6(observedGap),closingSpeedMps:r6(closing),
   optimisticRequiredGapM:r6(minSeparation),
   warningAtCurrentState:true})
 }
 need(JSON.stringify([states,actions])===initial,'A60 modified input')
 return {brakeRiders:[...warned].sort(),reasons,
  decision:'BOUND_BRAKE_ON_CURRENT_STATE_AND_INTENDED_LATERAL_PATH',
  usesFutureAcceptedRiderPaths:false,usesHindsight:false}
}

/** Audit a failed A59 physical field probe against the exact same recorded
 * starting source and its committed preceding steps. Feasibility is only an
 * optimistic rear-vs-fixed-leader bound, not proof a maneuver would work.
 */
export function auditFirstFullFieldContactV3(source,g,warningEnd,dt,probe){
 need(Array.isArray(source)&&source.length===6&&
  Array.isArray(probe?.records)&&Number.isFinite(warningEnd)&&dt>0,
  'A60 malformed first contact audit')
 if(!probe.firstBlocker)return {status:probe.complete?'CLEAR_10_SECONDS':'NO_COLLISION_RECORDED',
  pair:null,officialWrites:0}
 const fail=probe.records.find(x=>x.collision)
 need(fail&&probe.firstBlocker.pair?.length===2,'A60 missing blocked frame')
 const frames=source.flatMap(t=>t.previews.map(p=>({
  t0:r6(p.tickStartSeconds+(p.substep-1)*dt),
  t1:r6(p.tickStartSeconds+p.substep*dt),p
 }))).sort((a,b)=>a.t0-b.t0)
 const startIndex=frames.findIndex(x=>Math.abs(x.t1-warningEnd)<1e-6)
 const failedIndex=frames.findIndex(x=>Math.abs(x.t0-fail.t0)<1e-6)
 need(startIndex>=0&&failedIndex>=startIndex,'A60 contact out of checkpoint interval')
 const recordIndex=probe.records.indexOf(fail)
 const preceding=recordIndex>0?probe.records[recordIndex-1].stateDigest:null
 const original=new Map(frames[startIndex].p.proposals.map(x=>[x.riderId,x]))
 const current=new Map((preceding??[...original.values()].map(x=>({
  id:x.riderId,x:x.x0,y:x.y0,v:x.oldSpeedMps
 }))).map(x=>[x.id,x]))
 const idPair=probe.firstBlocker.pair
 const a=current.get(idPair[0]),b=current.get(idPair[1])
 need(a&&b,'A60 missing colliding rider pre-state')
 const right=a.x>=b.x?a:b,back=a.x>=b.x?b:a
 const closing=Math.max(0,back.v-right.v)
 const separation=Math.abs(a.x-b.x)
 const lateralSeparation=Math.abs(a.y-b.y)
 const lengthClearance=separation-REAR_LENGTH
 const lateralClearance=lateralSeparation-g.lateralCollisionM
 const optimisticRequiredGap=closing*closing/(2*BRAKE)
 const eventLead=r6(probe.firstBlocker.whenSeconds-(warningEnd-dt))
 const p=frames[failedIndex].p.proposals
 const byId=new Map(p.map(x=>[x.riderId,x]))
 const x=byId.get(a.id),y=byId.get(b.id)
 const yEnd=x&&y?Math.abs(x.requestedY-y.requestedY):null
 const initiallyOverlapping=lengthClearance<=1e-7&&lateralClearance<=1e-7
 const corridor=lateralClearance<=1e-7?'SAME_OR_OVERLAPPING_CORRIDOR':
  yEnd!==null&&yEnd<=g.lateralCollisionM+1e-7?'LANE_INTENT_CONVERGENCE':'CROSSING_OR_OTHER_LATERAL_CONTACT'
 let feasibility='NOT_DECIDABLE_WITH_REAR_BRAKING_ONLY'
 if(initiallyOverlapping)feasibility='ALREADY_OVERLAPPING_AT_START_OF_FAILED_STEP'
 else if(corridor==='SAME_OR_OVERLAPPING_CORRIDOR'&&closing>0){
  feasibility=lengthClearance+1e-7<optimisticRequiredGap?
   'INSUFFICIENT_GAP_FOR_REAR_ONLY_BRAKING_AT_FAILED_STEP':
   'REAR_BRAKING_NOT_RULED_OUT_BUT_UNPROVEN'
 }
 return {status:'COLLISION',pair:idPair,
  firstDetectedIntervalStartSeconds:probe.firstBlocker.whenSeconds,
  leadFromOriginalWarningSeconds:eventLead,
  failedStepStartSeconds:fail.t0,failedStepSeconds:dt,
  firstPairKind:corridor,feasibility,
  startGapM:r6(separation),lateralSeparationM:r6(lateralSeparation),
  rearClosingSpeedMps:r6(closing),
  optimisticRearOnlyBrakingDistanceM:r6(optimisticRequiredGap),
  currentStepFirstContactNotGuaranteedExact:true,
  usesFailedRunOnlyForRetrospectiveAudit:true,officialWrites:0}
}
