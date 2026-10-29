/** Step97 — necessary global timetable feasibility certificate.
 * This is a diagnostic screen, NOT a sufficient 2D path or collision proof.
 * Uses initial achieved x,y,v, A64 +.45/-.85m/s^2, .38m/s steer,
 * physical road body clearance and piecewise movement-speed lower bounds.
 */
import {researchRoadEnvelopeV3} from './a2VariableRoadWidthV3.mjs'
const A=.45,B=.85,L=.38,EPS=1e-8,MAX=50
const finite=Number.isFinite
const q=x=>Math.round(x*1e6)/1e6
function validate(s,ad){
 if(!Array.isArray(s)||!s.length||s.length>168||
  !ad||!Array.isArray(ad.bookings)||!Array.isArray(ad.gates))
  throw Error('A97 invalid physical or scheduled initial field')
 const seen=new Set()
 for(const rider of s){
  if(!rider||typeof rider.id!=='string'||!rider.id||
   seen.has(rider.id)||![rider.x,rider.y,rider.v]
    .every(finite)||rider.v<0||rider.v>50)
   throw Error('A97 invalid initial rider')
  seen.add(rider.id)
 }
 for(const b of ad.bookings)
  if(!b||!seen.has(b.id)||![b.gateX,b.targetY,
   b.scheduledSeconds].every(finite)||b.gateX<0||
   b.scheduledSeconds<0)throw Error('A97 invalid gate booking')
}
function earliest(x,v,gate){
 const d=Math.max(0,gate-x)
 if(!d)return 0
 const tA=(MAX-v)/A,accelDistance=v*tA+.5*A*tA*tA
 return d<=accelDistance?(-v+Math.sqrt(v*v+2*A*d))/A:
  tA+(d-accelDistance)/MAX
}
/** Maximizes arrival time while keeping speed >= each segment floor.
 * Full-hard braking until the floor, then steady minimum speed. This is
 * the optimal slowest 1D trajectory given speed/acceleration bounds.
 * Crossing the floor boundary does not erase current momentum.
 */
export function step97LatestFloorArrivalV3(x,v,gate,{
 transitionX=680,upstreamFloorMps=6.5,downstreamFloorMps=4.5
}={}){
 if(![x,v,gate,transitionX,upstreamFloorMps,
  downstreamFloorMps].every(finite)||x>gate||gate<0||
  v<0||v>50||upstreamFloorMps<5||
  upstreamFloorMps>11||downstreamFloorMps<2||
  downstreamFloorMps>upstreamFloorMps||transitionX<0)
  throw Error('A97 invalid floor-arrival problem')
 let elapsed=0,at=x,speed=v
 for(const [end,floor] of [
  [Math.min(gate,transitionX),upstreamFloorMps],
  [gate,downstreamFloorMps]]){
  if(end<=at+EPS)continue
  if(speed<floor-EPS)throw Error('A97 initial speed below segment floor')
  const distance=end-at,slowdown=(speed-floor)/B,
   brakingDist=speed*slowdown-.5*B*slowdown*slowdown
  if(distance<=brakingDist+EPS){
   const sec=(speed-Math.sqrt(Math.max(0,speed*speed-2*B*distance)))/B
   elapsed+=sec;speed=Math.max(floor,speed-B*sec)
  }else{
   elapsed+=slowdown+(distance-brakingDist)/floor
   speed=floor
  }
  at=end
 }
 return q(elapsed)
}
export function step97NecessaryTimetableAuditV3(states,admission,{
  transitionX=680,upstreamFloorMps=6.5,
  downstreamFloorMps=4.5,bodyHalfWidthM=.3
}={}){
 validate(states,admission)
 if(!finite(bodyHalfWidthM)||bodyHalfWidthM<0||
 bodyHalfWidthM>.5)throw Error('A97 invalid body width')
 const lookup=new Map(states.map(s=>[s.id,s]))
 let deadlineMisses=0,earlyArrivalMisses=0,
  lateralMisses=0,roadTargetViolations=0,
  allFirstBooked=0,maxLateExcess=0,maxEarlyDeficit=0,
  totalLateralRequiredSeconds=0
 const offenders=[],gateMetrics=[]
 for(const gate of admission.gates){
  const bookings=admission.bookings.filter(b=>b.gateId===gate.id)
  let misses=0,earlyMiss=0,steerMiss=0,targetMiss=0,
   largestLate=0,latestBooked=0,earliestBooked=Infinity
  for(const b of bookings){
   const s=lookup.get(b.id)
   if(s.x>b.gateX+EPS)continue
   const last=step97LatestFloorArrivalV3(
    s.x,s.v,b.gateX,{transitionX,
     upstreamFloorMps,downstreamFloorMps})
   const earliestPhys=earliest(s.x,s.v,b.gateX)
   const steerSeconds=Math.abs(b.targetY-s.y)/L
   const minTime=Math.max(steerSeconds,earliestPhys)
   const road=researchRoadEnvelopeV3(admission.kind,b.gateX)
   const roadOK=b.targetY-bodyHalfWidthM>=road.minY-EPS&&
    b.targetY+bodyHalfWidthM<=road.maxY+EPS
   const late=b.scheduledSeconds-last
   const early=minTime-b.scheduledSeconds
   if(gate===admission.gates[0])allFirstBooked++
   totalLateralRequiredSeconds+=steerSeconds
   latestBooked=Math.max(latestBooked,b.scheduledSeconds)
   earliestBooked=Math.min(earliestBooked,b.scheduledSeconds)
   if(late>1e-6){
    deadlineMisses++;misses++;largestLate=Math.max(largestLate,late)
    maxLateExcess=Math.max(maxLateExcess,late)
   }
   if(early>1e-6){
    earlyArrivalMisses++;earlyMiss++
    maxEarlyDeficit=Math.max(maxEarlyDeficit,early)
   }
   if(steerSeconds>b.scheduledSeconds+1e-6){
    lateralMisses++;steerMiss++
   }
   if(!roadOK){roadTargetViolations++;targetMiss++}
   if((late>1e-6||early>1e-6||!roadOK)&&offenders.length<25)
    offenders.push({id:b.id,gateId:b.gateId,
     startX:q(s.x),bookedSeconds:q(b.scheduledSeconds),
     earliestPossibleSeconds:q(minTime),
     latestFloorSeconds:last,latenessDeficitSeconds:q(Math.max(0,late)),
     earlyDeficitSeconds:q(Math.max(0,early)),roadOK})
  }
  gateMetrics.push({gateId:gate.id,gateX:gate.gateX,
   capacity:gate.capacity,booked:bookings.length,
   earliestBookedSeconds:isFinite(earliestBooked)?q(earliestBooked):null,
   latestBookedSeconds:q(latestBooked),
   beyondLatestFloor:misses,beforeEarliest:earlyMiss,
   cannotSteerByBooking:steerMiss,illegalBodyTarget:targetMiss,
   maxLateExcessSeconds:q(largestLate)})
 }
 return {
  status:deadlineMisses||earlyArrivalMisses||roadTargetViolations?
   'FIXED_TIMETABLE_CONTRADICTION':'NECESSARY_TIMING_ONLY',
  riderCount:states.length,roadGeometry:admission.kind,
  deadlineMisses,earlyArrivalMisses,lateralMisses,
  roadTargetViolations,maxLateExcessSeconds:q(maxLateExcess),
  maxEarlyDeficitSeconds:q(maxEarlyDeficit),
  allFirstBooked,totalLateralRequiredSeconds:q(totalLateralRequiredSeconds),
  gateMetrics,offenders,
  // No impossibility claim for underlying road / alternative timetable.
  noWholeRaceImpossibilityProof:true,
  noCollisionOrTrajectoryGuarantee:true,
  originalA64Unchanged:true,officialWrites:0
 }
}
