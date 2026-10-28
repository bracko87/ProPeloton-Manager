/** A72 — read-only, physical-row space/time reservations for a synthetic
 * two-slot 2.2m pinch. Every decision uses current rider x/y/v, their
 * recorded physical start-grid row (startX), and public spatial width.
 * Nothing changes trajectories directly or examines future accepted states.
 * Reserving a window is NOT equivalent to safely traversing a road:
 * the original 0.5s swept all-pair and body-edge solver remains authoritative.
 */
import {researchRoadEnvelopeV3} from './a2VariableRoadWidthV3.mjs'
const valid=(v,m)=>{if(!v)throw Error(m)}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v))
const MIRROR_CENTER=2.2
/** Group by physical start-row x, not rider ID or array/solver iteration. */
export function reserveTwoSlotEntryV3(states,kind,{
 bodyHalfWidthM=.3,entryX=780,offsetM=2.6,
 earlyPreviewSeconds=65,upstreamPaceRangeM=85
}={}){
 valid(Array.isArray(states)&&states.length>=2&&
  ['constant','mild_pinch','strong_pinch'].includes(kind)&&
  Number.isFinite(bodyHalfWidthM)&&bodyHalfWidthM>=0&&bodyHalfWidthM<=.5&&
  Number.isFinite(entryX)&&entryX>=680&&entryX<=920&&
  Number.isFinite(offsetM)&&offsetM>=2.05&&offsetM<=3.1&&
  Number.isFinite(earlyPreviewSeconds)&&earlyPreviewSeconds>=20&&
  earlyPreviewSeconds<=90&&Number.isFinite(upstreamPaceRangeM)&&
  upstreamPaceRangeM>=30&&upstreamPaceRangeM<=250,
  'A72 invalid reservation parameters')
 const seen=new Set(),groups=new Map()
 for(const s of states){
  valid(typeof s.id==='string'&&!seen.has(s.id)&&
   [s.x,s.y,s.v,s.desired,s.startX].every(Number.isFinite)&&
   s.v>=0&&s.v<=50,'A72 invalid or duplicate physical rider')
  seen.add(s.id)
  const rowKey=String(Math.round(s.startX*1000))
  if(!groups.has(rowKey))groups.set(rowKey,[])
  groups.get(rowKey).push(s)
 }
 const planned=new Map()
 const activeRows=[]
 for(const row of groups.values()){
  const sorted=[...row].sort((a,b)=>a.y-b.y)
  const flankLeft=sorted[0],flankRight=sorted[sorted.length-1]
  const center=sorted.length===3?sorted[1]:null
  const frontX=Math.max(...row.map(s=>s.x))
  const distance=Math.max(0,entryX-frontX)
  const speed=Math.max(.5,Math.max(...row.map(s=>s.v)))
  const arrivalSeconds=distance/speed
  const widthAtGate=researchRoadEnvelopeV3(kind,entryX).widthM
  const requiresTwoSlots=kind==='strong_pinch'&&
   widthAtGate-2*bodyHalfWidthM<1.62
  const active=requiresTwoSlots&&arrivalSeconds<=earlyPreviewSeconds&&
   frontX<1020
  const cohort={rowStartX:row[0].startX,frontX,arrivalSeconds,
   active,centerId:center?.id??null,
   sideIds:[flankLeft.id,flankRight.id],groupCount:row.length}
  activeRows.push(cohort)
  for(const rider of sorted){
   planned.set(rider.id,{id:rider.id,rowStartX:rider.startX,
    requiredTwoSlots:active,slot:null,lateralTargetY:rider.y,
    entryEtaSeconds:Math.max(0,(entryX-rider.x)/Math.max(.5,rider.v)),
    entryReleaseSeconds:arrivalSeconds,
    gapToFlankM:null,requestedPaceMps:rider.desired,
    reserveWindowStartSeconds:arrivalSeconds,
    sideMoveAuthorized:false,
    queueWave:false,physicalSafetyNotAssumed:true})
  }
  if(!active||!center)continue
  const sideVelocity=(flankLeft.v+flankRight.v)/2
  const sideX=Math.min(flankLeft.x,flankRight.x)
  const gap=sideX-center.x
  const centre=planned.get(center.id)
  const desiredGap=offsetM
  const error=gap-desiredGap
  // The very first grid still has 0m longitudinal row offset. Request a
  // gradual offset immediately, far before the x=680 road funnel.
  centre.slot='FOLLOWING_ROW'
  centre.gapToFlankM=gap
  const desiredPace=sideVelocity+clamp(error/4,-1.0,1.0)
  centre.requestedPaceMps=Math.max(0,
   Math.min(centre.requestedPaceMps,desiredPace))
  centre.entryReleaseSeconds=arrivalSeconds+desiredGap/Math.max(3,sideVelocity)
  centre.reserveWindowStartSeconds=centre.entryReleaseSeconds
  for(const [rider,slotName] of [[flankLeft,'LEFT'],[flankRight,'RIGHT']]){
   const reservation=planned.get(rider.id)
   reservation.slot=slotName
   // For 2.2m road and .3m half-width, the two lateral centers may
   // be at 1.45 and 2.95, leaving at least .05m on either road edge.
   // Their side-specific positions reverse correctly under road mirroring.
   reservation.lateralTargetY=slotName==='LEFT'?1.45:2.95
   reservation.gapToFlankM=gap
   reservation.sideMoveAuthorized=gap>=desiredGap-1e-6
  }
 }
 // Communicate a centre-column early deceleration plan to riders behind,
 // so one row cannot suddenly brake with a faster centre rider chasing it.
 // This is a bounded speed REQUEST, not an instantaneous speed change.
 const centers=[...planned.values()].filter(p=>p.slot==='FOLLOWING_ROW')
 const stateById=new Map(states.map(s=>[s.id,s]))
 for(const entry of centers){
  const rider=stateById.get(entry.id)
  const forward=centers.filter(other=>{
   const front=stateById.get(other.id)
   return front.x>rider.x+1e-6&&
    front.x-rider.x<=upstreamPaceRangeM
  })
  if(forward.length){
   const lowest=Math.min(...forward.map(p=>p.requestedPaceMps))
   // Maintain genuine dynamic acceleration authority in the integrator.
   // The +.2m/s allowance prevents artificial exact-speed lockstep.
   const proposed=Math.min(entry.requestedPaceMps,lowest+.2)
   if(proposed<entry.requestedPaceMps-1e-7){
    entry.requestedPaceMps=Math.max(0,proposed)
    entry.queueWave=true
   }
  }
 }
 // No hard-coded left-first priority, no reserve-after-the-fact event.
 return {version:1,kind,entryX,offsetM,bodyHalfWidthM,
  minimumSlotSpacingM:1.5,roadWidthsSynthetic:true,
  rows:activeRows,decisions:states.map(s=>planned.get(s.id)),
  activeReservationCount:[...planned.values()].filter(x=>x.requiredTwoSlots).length,
  waitingCenters:centers.length,
  sideAdmissions:[...planned.values()].filter(x=>x.sideMoveAuthorized).length,
  upstreamPaceWarnings:[...planned.values()].filter(x=>x.queueWave).length,
  noOfficialWrites:true}
}
