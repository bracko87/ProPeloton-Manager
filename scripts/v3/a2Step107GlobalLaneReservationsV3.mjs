/**
 * Step107 research-only global two-lane space-time allocations.
 * Static initial geometry determines a reproducible per-lane zipper order.
 * Every movement and energy update MUST be achieved via unchanged A64.
 * A reservation is a target, never proof of a collision-free physical path.
 */
import {advanceNormalStartV3} from './a2NormalStartPelotonV3.mjs';
import {step95AchievedMovingGateV3} from './a2Step95MovingPhysicalGateV3.mjs';
import {step101ObserveA64GroupsV3} from './a2Step101EightSecondGroupsV3.mjs';
import {researchRoadEnvelopeV3} from './a2VariableRoadWidthV3.mjs';
import {createHash} from 'node:crypto';
const DT=.5, A=.45, B=.85, EPS=1e-7;
const finite=Number.isFinite, q=x=>Math.round(x*1e6)/1e6;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const MODES={
 slots_compact:{spacing:2.2,leadSpeed:9.4,response:1.7,earlySteer:false},
 slots_balanced:{spacing:2.45,leadSpeed:9.4,response:2.2,earlySteer:true},
 slots_throughput:{spacing:2.35,leadSpeed:10.2,response:1.8,earlySteer:true},
 slots_staggered:{spacing:2.75,leadSpeed:10.0,response:2.5,earlySteer:true},
 slots_conservative:{spacing:2.4,leadSpeed:8.9,response:2.5,earlySteer:false},
 slots_variable:{spacing:2.55,leadSpeed:9.6,response:2.0,earlySteer:true}
};
function check(field,original,bookings){
 if(!field||!original||field.reason!==null||field.dt!==DT||
   !finite(field.at)||!Array.isArray(field.states)||
   field.states.length<2||field.states.length>168||
   !Array.isArray(original.states)||original.states.length!==field.states.length||
   !Array.isArray(bookings)||bookings.length!==field.states.length*2)
  throw Error('A107 invalid original A64 physical fixture');
 const ids=new Set(original.states.map(s=>s.id));
 if(ids.size!==field.states.length||field.states.some(s=>!ids.has(s.id)))
  throw Error('A107 roster mismatch');
}
function role(s){
 const d=Math.abs(s.y-2.2);
 return d<.43?'CENTER':d>1.55?'OUTER':'INNER';
}
function side(s){return s.y<2.2-EPS?'L':s.y>2.2+EPS?'R':'C';}
function geometryToken(s){return [q(s.startX),q(s.y),role(s)].join(':');}
/** Fixed two-channel zipper order from geographic start positions only.
 * Center riders are assigned to the channel with fewer reservations;
 * balance ties by which inner rider in their own starting row is faster,
 * a property invariant to mirrored physical geometry and rider renaming.
 * An exact equal-speed tie with equal lane loads remains UNRESOLVED,
 * rather than assigning geographic/ID priority.
 */
export function step107InitialLaneReservationsV3(original,{
 spacingMeters=2.45,centerTie='left'
}={}){
 if(!original||!Array.isArray(original.states)||
   original.states.length<2||original.states.length>168||
   !finite(spacingMeters)||spacingMeters<2.1||spacingMeters>3.2||
   !['left','right','neutral'].includes(centerTie))
  throw Error('A107 invalid initial lane allocation');
 const all=original.states,ids=new Set(all.map(s=>s.id));
 if(ids.size!==all.length||all.some(s=>!finite(s.startX)||!finite(s.y)||
   !finite(s.v)))throw Error('A107 invalid grid identities');
 const rows=new Map();
 for(const s of all){
  const x=q(s.startX);
  if(!rows.has(x))rows.set(x,[]);
  rows.get(x).push(s);
 }
 const laneMap=new Map(),unresolved=[],assignedCenters=[];
 const rowList=[...rows].sort((a,b)=>b[0]-a[0]);
 let countL=0,countR=0;
 for(const [x,rs] of rowList){
  const flanks={L:rs.filter(s=>side(s)==='L'),
    R:rs.filter(s=>side(s)==='R')};
  for(const s of [...flanks.L,...flanks.R]){
   laneMap.set(s.id,side(s));
   if(side(s)==='L')countL++;else countR++;
  }
  for(const c of rs.filter(s=>side(s)==='C')){
   let lane;
   if(countL<countR)lane='L';else if(countR<countL)lane='R';
   else{
    const leftInner=flanks.L.find(s=>role(s)==='INNER');
    const rightInner=flanks.R.find(s=>role(s)==='INNER');
    const difference=(leftInner?.v??0)-(rightInner?.v??0);
    lane=Math.abs(difference)<=EPS?
      centerTie==='neutral'?null:centerTie==='left'?'L':'R':
      difference>0?'L':'R';
   }
   if(lane){laneMap.set(c.id,lane);
     assignedCenters.push({rowX:x,riderId:c.id,lane});
     if(lane==='L')countL++;else countR++;
   }else unresolved.push({rowX:x,riderId:c.id,
     reason:'SYMMETRIC_CENTER_LANE_TIE'});
  }
 }
 const channels=[];
 const allocations=new Map();
 for(const lane of ['L','R']){
  const members=all.filter(s=>laneMap.get(s.id)===lane);
  members.sort((a,b)=>b.startX-a.startX||
     (role(a)==='INNER'?0:role(a)==='CENTER'?1:2)-
     (role(b)==='INNER'?0:role(b)==='CENTER'?1:2)||
     Math.abs(a.y-2.2)-Math.abs(b.y-2.2));
  for(let i=1;i<members.length;i++){
   if(geometryToken(members[i])===geometryToken(members[i-1]))
    throw Error('A107 geometry cannot order same-lane identical riders');
  }
  const targetY=lane==='L'?1.62:2.78;
  const firstRow=Math.max(...members.map(s=>s.startX));
  for(let rank=0;rank<members.length;rank++){
   const s=members[rank];
   allocations.set(s.id,{lane,rank,total:members.length,
     targetY,idealInitialX:q(firstRow+1.2-rank*spacingMeters),
     startX:s.startX,role:role(s)});
  }
  channels.push({lane,count:members.length,
    orderedRiderIds:members.map(s=>s.id),
    slotSeparationM:spacingMeters,targetY});
 }
 return {channels,
   unassignedCenterRiders:unresolved,
   assignedCenters,
   allocations:[...allocations].map(([riderId,data])=>({riderId,...data})),
   coveredCount:allocations.size,
   originalRiders:all.length,
   centerSymmetryBranch:centerTie,
   mirrorSymmetricAlternatives:centerTie==='left'?'right':
     centerTie==='right'?'left':'neutral',
   globalTwoLaneOrder:true,
   exactEightSecondRaceGroupingIndependent:true,
   positionsNotMoved:true,officialWrites:0};
}
/** Signed neighboring occupancy checks cover all booked riders, not only
 * riders that already share a lateral strip. A forecast of max clearance
 * is an outer *upper bound*, not certification that A64 will achieve it.
 */
export function step107ClearanceAuditV3(field,allocation,{
 spacingMeters=2.45,previewSeconds=5
}={}){
 if(!field||!Array.isArray(field.states)||
   !allocation||!Array.isArray(allocation.channels)||
   !finite(spacingMeters)||spacingMeters<2.1||spacingMeters>3.2||
   !finite(previewSeconds)||previewSeconds<.5||previewSeconds>10)
  throw Error('A107 invalid simultaneous clearance audit');
 const byId=new Map(field.states.map(s=>[s.id,s]));
 const conflicts=[],edges=[];
 for(const chan of allocation.channels){
  const ids=chan.orderedRiderIds;
  for(let i=1;i<ids.length;i++){
   const first=byId.get(ids[i-1]),second=byId.get(ids[i]);
   if(!first||!second)throw Error('A107 missing booked physical rider');
   const gap=first.x-second.x;
   const projected=gap+(first.v-second.v)*previewSeconds;
   const upper=projected+.5*(A+B)*previewSeconds*previewSeconds;
   const deficit=Math.max(0,spacingMeters-projected);
   const edge={lane:chan.lane,frontId:first.id,rearId:second.id,
     signedPhysicalGap:q(gap),projectedGap:q(projected),
     upperReachableGap:q(upper),shortfall:q(deficit),
     necessaryConditionUnreachable:upper<spacingMeters-EPS};
   edges.push(edge);
   if(deficit>EPS)conflicts.push(edge);
  }
 }
 return {edges,shortfallEdges:conflicts,
   signedGapInversions:edges.filter(e=>e.signedPhysicalGap<-EPS).length,
   conditionalUnreachableCount:edges.filter(e=>e.necessaryConditionUnreachable).length,
   fullLateralAndLongitudinalMotionNotYetProven:true,
   notAPhysicalPathCertificate:true,officialWrites:0};
}
/** Actual achievable command is bounded by original A64. Slot reference
 * tracks desired multi-row x ordering in one global moving frame; pairwise
 * caps are propagated from front to back so NO one rider is granted
 * unrelated speed independent of upstream occupancy.
 */
export function step107GlobalSlotCommandsV3(field,original,bookings,{
 mode='slots_balanced',centerTie='left'}={}){
 check(field,original,bookings);
 const cfg=MODES[mode];if(!cfg)throw Error('A107 unknown reservation policy');
 const allocation=step107InitialLaneReservationsV3(original,{
   spacingMeters:cfg.spacing,centerTie});
 const index=new Map(field.states.map((s,i)=>[s.id,i]));
 const wanted=new Map(),blocked=[],steered=[],limited=[];
 for(const lane of allocation.channels){
  let prior=null;
  for(const id of lane.orderedRiderIds){
   const rider=field.states[index.get(id)];
   const booking=allocation.allocations.find(a=>a.riderId===id);
   const startingFront=Math.max(...original.states.map(s=>s.startX));
   const reference=startingFront+1.2+cfg.leadSpeed*field.at-
     booking.rank*cfg.spacing;
   // Target is a moving spatial reservation; it cannot set actual x.
   let demand=clamp(cfg.leadSpeed+
     (reference-rider.x)/cfg.response,7.35,12.5);
   if(prior){
    const front=prior.rider,gap=front.x-rider.x;
    const closing=Math.max(0,rider.v-front.v);
    const reserve=cfg.spacing+closing*1.8+
       closing*closing/(2*B);
    const cap=clamp(front.v+(gap-reserve)/cfg.response,7.3,12.5);
    if(cap<demand-EPS){demand=cap;limited.push({
      rearId:id,frontId:front.id,actualGap:q(gap),
      requestedHeadway:q(reserve)});}
   }
   const futureTargetY=booking.targetY;
   // A64's forced taper preview is immutable. Explicit early steering
   // is permitted only with an ACTUAL x gap to every bike in the
   // entire booked target channel, including center and following rows.
   let y=rider.y;
   if(cfg.earlySteer&&rider.x>580&&rider.x<900&&
      Math.abs(futureTargetY-rider.y)>.02){
    const nearby=field.states.some(other=>{
      if(other.id===id)return false;
      const otherBooking=allocation.allocations.find(a=>a.riderId===other.id);
      const otherLane=otherBooking?.lane;
      const corridorOverlaps=otherLane===lane.lane||
        Math.abs(other.y-futureTargetY)<.95;
      const closeX=Math.abs(other.x-rider.x)<3.15;
      const crosses=(other.y-rider.y)*(other.y-futureTargetY)<.4;
      return corridorOverlaps&&closeX&&
         (Math.abs(other.y-futureTargetY)<1.2||crosses);
    });
    if(!nearby){
      y=futureTargetY;steered.push(id);
    }else blocked.push(id);
   }
   wanted.set(id,{id,speed:q(demand),targetY:q(y),
     lane:lane.lane,rank:booking.rank});
   prior={rider};
  }
 }
 // Riders with an unresolved center tie retain individual original
 // control: no arbitrary side/ID priority. Original A64 is authoritative.
 for(const s of field.states)if(!wanted.has(s.id))
   wanted.set(s.id,{id:s.id,speed:q(clamp(cfg.leadSpeed,7.35,12.5)),
     targetY:q(s.y),lane:'UNRESOLVED_CENTER',rank:null});
 return {mode,requests:field.states.map(s=>wanted.get(s.id)),
   allocation,steered,blockedEarlySteer:blocked,
   limitedPairs:limited,checkedBookedRiders:allocation.coveredCount,
   noPositionRepair:true,originalA64Mandatory:true,
   noSharedPelotonSpeed:true,officialWrites:0};
}
function sweep(field,reqs){
 const a=structuredClone(field);
 if(reqs.length!==a.states.length)throw Error('A107 incomplete requests');
 for(let i=0;i<a.states.length;i++){
  const r=reqs[i],s=a.states[i];
  if(s.id!==r.id||![r.speed,r.targetY].every(finite)||
     r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
    throw Error('A107 invalid individual command');
  s.desired=r.speed;s.targetY=r.targetY;
 }
 const r=advanceNormalStartV3(a);
 if(r.reason)return {accepted:false,physical:r,reason:r.reason};
 const gate=step95AchievedMovingGateV3(r);
 if(!gate.admitted)return {accepted:false,physical:r,
    reason:'A107_ACHIEVED_SPEED_REJECTION'};
 if(r.acceptedSteps!==field.acceptedSteps+1||
    Math.abs(r.at-field.at-DT)>EPS)throw Error('A107 physical clock mismatch');
 return {accepted:true,physical:r};
}
export function step107RunOriginalA64ReservationsV3(initial,bookings,{
 mode='slots_balanced',centerTie='left',seconds=30,checkpoint=null,
 trace=false}={}){
 check(initial,initial,bookings);
 if(!MODES[mode]||!finite(seconds)||seconds<.5||seconds>180||
    Math.round(seconds*2)!==seconds*2)
  throw Error('A107 invalid physical research request');
 if(!['left','right'].includes(centerTie))
   throw Error('A107 physical experiment requires resolved mirror-image center branch');
 let current=structuredClone(checkpoint??initial);
 check(current,initial,bookings);
 const before=JSON.stringify([initial,bookings]),start=current.at,samples=[];
 const firstAllocation=step107InitialLaneReservationsV3(initial,{
   spacingMeters:MODES[mode].spacing,centerTie});
 if(firstAllocation.coveredCount!==initial.states.length)
   throw Error('A107 unresolved full-roster lane reservation');
 let firstRejected=null,earlySteers=0,blockedSteers=0,limitedPairs=0;
 let group=step101ObserveA64GroupsV3(current);
 for(let k=0;k<seconds*2;k++){
  const plan=step107GlobalSlotCommandsV3(current,initial,bookings,{
   mode,centerTie});
  earlySteers+=plan.steered.length;blockedSteers+=plan.blockedEarlySteer.length;
  limitedPairs+=plan.limitedPairs.length;
  const attempt=sweep(current,plan.requests);
  if(!attempt.accepted){
    const contact=attempt.physical?.firstCollision??null;
    firstRejected={atSeconds:current.at,reason:attempt.reason,
      contactPair:contact?.pair??null,
      contactTime:contact?.time??null,
      contactDetail:contact?.preCollisionField??null,
      firstRoadViolation:attempt.physical?.firstRoadViolation??null};
    break;
  }
  group=step101ObserveA64GroupsV3(attempt.physical,current);
  current=attempt.physical;
  samples.push({at:current.at,
    minSpeed:q(Math.min(...current.states.map(s=>s.v))),
    groups:group.groups.length,
    physicalHash:hash(current.states.map(s=>[
      s.id,s.x,s.y,s.v,s.energy?.remainingWPrimeJoules]))});
 }
 if(JSON.stringify([initial,bookings])!==before)
  throw Error('A107 initial fixture or bookings modified');
 const e={
  n:current.states.length,mode,centerTie,requestedSeconds:seconds,
  acceptedSeconds:q(current.at-start),
  acceptedSamples:samples.length,
  firstRejected,
  everyAcceptedTickSweptByOriginalA64:true,
  actualFirstGatePassed:current.states.every(s=>s.x>1020),
  actualSecondGatePassed:current.states.every(s=>s.x>1470),
  fullRequestedHorizonAccepted:samples.length===seconds*2,
  minActualSpeed:samples.length?
    Math.min(...samples.map(s=>s.minSpeed)):null,
  originalPhysicalSolverUnmodified:true,
  sameEightSecondRaceGroupRule:group.groupingThresholdSeconds===8,
  groupCount:group.groups.length,
  pelotonRiders:group.groups.find(g=>g.code==='P')?.riderIds.length??0,
  geometryAllocation:firstAllocation.channels.map(ch=>({
    lane:ch.lane,count:ch.count,spacing:ch.slotSeparationM})),
  unassignedCenters:firstAllocation.unassignedCenterRiders.length,
  physicallyAssignedAllRiders:firstAllocation.coveredCount===initial.states.length,
  mirrorBranchOpposite:centerTie==='left'?'right':'left',
  earlySteeringRiderTicks:earlySteers,blockedEarlySteeringTicks:blockedSteers,
  speedLimitedRiderTicks:limitedPairs,
  checkpointTraceHash:hash(samples),
  snapshots:trace?samples:undefined,officialWrites:0,
  full180SportingGO:false,noProductionIntegration:true};
 return {evidence:e,physical:current};
}
