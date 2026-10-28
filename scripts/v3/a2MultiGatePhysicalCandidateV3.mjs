/** A77 phase 2: opt-in SYNTHETIC physical multi-gate research candidate.
 * Steering and pace are commands, not x/y/v relocation. The unchanged A64
 * swept all-pair, full bicycle road-edge and energy solver is authoritative.
 * A necessary gate booking is NEVER treated as proof of successful passage.
 */
import {createNormalStartV3,advanceNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
import {auditMultiGateAdmissionV3} from './a2MultiGateAdmissionV3.mjs'
const DT=.5,MAX_BRAKE=.85,EPS=1e-7
const clip=(v,a,b)=>Math.max(a,Math.min(b,v))
function assert(x,m){if(!x)throw Error(m)}
function validate(snapshot){
 assert(snapshot?.version===1&&snapshot?.researchOnly===true&&
  snapshot?.physical?.dt===DT&&snapshot.admission?.researchOnly===true&&
  Array.isArray(snapshot.admission.gates)&&
  Array.isArray(snapshot.admission.bookings)&&
  snapshot.originalDesired&&typeof snapshot.originalDesired==='object',
  'A77 invalid saved physical candidate')
}
export function createMultiGatePhysicalCandidateV3(n,{
 mode='five_dense',roadGeometry='double_pinch',mirror=false,renamed=false,
 controllerPolicy='coordinated_demand',headwayStandOffM=3.2,
 pacePolicy='timed_safe_corridor',rollingStartSpeedMps=null
}={}){
 assert([8,32,106,168].includes(n)&&
  ['five_dense','corridor'].includes(mode)&&
  ['double_pinch','staged_pinch','strong_pinch'].includes(roadGeometry)&&
  ['coordinated_demand','coordinated_headway'].includes(controllerPolicy)&&
  [3.2,3.8,4.5].includes(headwayStandOffM)&&
  ['timed_safe_corridor','timed_slot_only','timed_speed_only'].includes(pacePolicy)&&
  (rollingStartSpeedMps===null||
   Number.isFinite(rollingStartSpeedMps)&&rollingStartSpeedMps>=5&&
   rollingStartSpeedMps<=12),
  'A77 unsupported physical candidate fixture')
 assert(typeof mirror==='boolean'&&typeof renamed==='boolean',
  'A77 invalid reflection or identity options')
 const physical=createNormalStartV3(n,{mode,roadGeometry,mirror,renamed,
  controllerPolicy,headwayStandOffM,bodyHalfWidthM:.3,
  roadMergePolicy:'preview_only'})
 // Optional neutral rolling-start fixture: ALL riders are initialized
 // at the same physically valid speed before the first accepted tick.
 // This is not a post-start speed change, position repair or free braking.
 if(rollingStartSpeedMps!==null)
  for(const s of physical.states)s.v=rollingStartSpeedMps
 const admission=auditMultiGateAdmissionV3(physical.states,roadGeometry)
 return {version:1,researchOnly:true,pacePolicy,rollingStartSpeedMps,
  physical,admission,
  originalDesired:Object.fromEntries(physical.states.map(s=>[s.id,s.desired])),
  commandedRiderTicks:0,lateralRequestTicks:0,headwayWarningTicks:0,
  status:admission.status==='NECESSARY_WINDOWS_EXIST'?'READY':
   'GATE_ENTRY_NO_WINDOW',reason:null,officialWrites:0}
}
function nextGate(snapshot,s){
 return snapshot.admission.gates.find(g=>s.x<g.exitX-EPS)||null
}
function commandForRider(snapshot,s,bookingsById){
 const gate=nextGate(snapshot,s),original=snapshot.originalDesired[s.id]
 if(!gate)return {speed:original,targetY:s.targetY,guided:false,headway:false}
 const booking=bookingsById.get(s.id)?.find(b=>b.gateId===gate.id)
 if(!booking)return {error:'NO_GATE_BOOKING'}
 const now=snapshot.physical.at,remaining=booking.scheduledSeconds-now
 let speed=original
 if(s.x<booking.gateX-EPS&&remaining>DT)
  speed=Math.min(speed,Math.max(5,(booking.gateX-s.x)/remaining))
 // The longitudinal cross-row queue is computed from current actual
 // positions and STATIC reserved same-corridor intent, never future states.
 const leaders=snapshot.physical.states.filter(t=>t.id!==s.id&&
  t.x>s.x+EPS&&t.x-s.x<=35&&
  (bookingsById.get(t.id)||[]).some(b=>b.gateId===gate.id&&
   Math.abs(b.targetY-booking.targetY)<.8001))
 .sort((a,b)=>a.x-b.x)
 let headway=false
 if(leaders.length){
  const ahead=leaders[0],gap=ahead.x-s.x
  const closing=Math.max(0,s.v-ahead.v)
  const reserve=2.35+2.5*closing+closing*closing/(2*MAX_BRAKE)
  if(gap<reserve+5){
   speed=Math.min(speed,ahead.v+clip((gap-reserve)/2,-3,.5))
   headway=true
  }
 }
 // A body-valid five-abreast row requires the outer bicycle to move
 // laterally through the prior inner track. Do not steer into a currently
 // occupied corridor until actual longitudinal separation exists.
 // The two-slot planner's first wave receives initial priority through
 // physically scheduled speed requests, NOT by instantaneous reposition.
 let targetY=booking.targetY
 if(snapshot.pacePolicy==='timed_speed_only')targetY=s.targetY
 else if(snapshot.pacePolicy==='timed_safe_corridor'&&
  Math.abs(targetY-s.y)>EPS){
  const delta=targetY-s.y
  const blocked=snapshot.physical.states.some(t=>{
   if(t.id===s.id)return false
   if(Math.abs(t.x-s.x)>=2.65)return false
   const between=delta>0?
    t.y>s.y+EPS&&t.y<=targetY+.8001:
    t.y<s.y-EPS&&t.y>=targetY-.8001
   return between
  })
  if(blocked)targetY=s.y
 }
 if(s.x>gate.exitX-EPS)targetY=s.targetY
 return {speed:Math.max(0,speed),targetY,headway,
  guided:true,gateId:gate.id,bookingTime:booking.scheduledSeconds}
}
export function advanceMultiGatePhysicalCandidateV3(snapshot){
 validate(snapshot)
 assert(snapshot.reason===null,'A77 cannot resume rejected physical field')
 const out=structuredClone(snapshot)
 if(out.admission.status!=='NECESSARY_WINDOWS_EXIST'){
  out.reason='GATE_ENTRY_NO_WINDOW';out.status='REJECTED'
  return out
 }
 const count=out.physical.states.length
 const {gates,bookings}=out.admission
 if(bookings.length!==count*gates.length){
  out.reason='GATE_ENTRY_NO_WINDOW';out.status='REJECTED'
  return out
 }
 const byId=new Map()
 for(const b of bookings){
  if(!byId.has(b.id))byId.set(b.id,[])
  byId.get(b.id).push(b)
 }
 const candidate=structuredClone(out.physical)
 let requests=0,laterals=0,heads=0
 for(const s of candidate.states){
  const request=commandForRider(out,s,byId)
  if(request.error){out.reason='GATE_ENTRY_NO_WINDOW';out.status='REJECTED'
   return out}
  s.desired=request.speed
  s.targetY=request.targetY
  if(request.guided)requests++
  if(Math.abs(s.y-request.targetY)>EPS)laterals++
  if(request.headway)heads++
 }
 const next=advanceNormalStartV3(candidate)
 // Never expose temporary speed intentions as permanent achieved motion.
 // Real x/y/v/energy and steering target are accepted only by the unchanged
 // physics solver. An unsuccessful tick retains EXACT previous rider state.
 if(next.reason){
  out.reason=next.reason;out.status='REJECTED'
  out.firstCollision=next.firstCollision??null
  out.firstRoadViolation=next.firstRoadViolation??null
  out.energyFailure=next.energyFailure??null
  return out
 }
 for(const s of next.states)s.desired=out.originalDesired[s.id]
 out.physical=next
 out.commandedRiderTicks+=requests
 out.lateralRequestTicks+=laterals
 out.headwayWarningTicks+=heads
 out.status='IN_PROGRESS'
 return out
}
export function runMultiGatePhysicalCandidateV3(initial,{seconds=180}={}){
 validate(initial)
 assert(Number.isFinite(seconds)&&seconds>=0&&seconds<=3600&&
  seconds/DT===Math.round(seconds/DT),'A77 invalid race horizon')
 let next=structuredClone(initial),end=next.physical.at+seconds
 while(next.physical.at<end-EPS&&!next.reason)
  next=advanceMultiGatePhysicalCandidateV3(next)
 return next
}
export function multiGatePhysicalMetricsV3(initial,final){
 validate(initial);validate(final)
 const metrics=finishNormalStartMetricsV3(initial.physical,final.physical)
 return {study:'A77_MULTI_GATE_COUPLED_CANDIDATE',
  n:initial.physical.states.length,geometry:initial.physical.roadGeometry,
  reason:final.reason,acceptedSeconds:final.physical.at,
  status:final.reason||metrics.status,
  nearStops:metrics.nearStopRiderTicks,
  laneChanges:metrics.completedLaneChanges,
  allPastSecondReopening:final.physical.states.every(s=>s.x>1470),
  rearX:Math.min(...final.physical.states.map(s=>s.x)),
  firstCollision:final.firstCollision??null,
  firstRoadViolation:final.firstRoadViolation??null,
  physicallyAcceptedMotion:final.physical.acceptedSteps>0,
  bookedCount:final.admission.bookedCount,
  noProductionApproval:true,officialWrites:0}
}
