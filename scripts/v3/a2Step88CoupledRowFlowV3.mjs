/** Step88: opt-in coupled five-to-two row-flow and corridor occupancy.
 *
 * A necessary physical reservation is NOT a collision-free certificate.
 * Current accepted bicycle states are read-only. Requested lateral/pacing
 * controls must pass the unchanged A64 full-field, swept all-pair, road
 * width, acceleration, W-prime and body-energy physics before use.
 *
 * Mirror- and rider-ID-neutral: only achieved x, road-centre distance,
 * present velocities and immutable pre-existing gate/slot intent matter.
 */
import {step87CorridorOrderV3} from './a2Step87CorridorOrderV3.mjs'
const EPS=1e-7,CENTER=2.2,BODY=.3,STEER=.38,A=.45,B=.85;
const finite=Number.isFinite,q=x=>Math.round(x*1e6)/1e6;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function assertInputs(states,requests,bookings,now){
 if(!Array.isArray(states)||states.length<2||states.length>168||
  !Array.isArray(requests)||requests.length!==states.length||
  !Array.isArray(bookings)||!finite(now)||now<0)
  throw Error('A88 invalid physical row field');
 const seen=new Set();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||!r||typeof s.id!=='string'||!s.id||
   seen.has(s.id)||r.id!==s.id||
   ![s.x,s.y,s.v,s.startX,r.speed,r.targetY].every(finite)||
   s.y<0||s.y>4.4||s.v<0||s.v>50||r.speed<0||
   r.speed>50||r.targetY<0||r.targetY>4.4)
   throw Error('A88 invalid physical rider or command');
  seen.add(s.id);
 }
 for(const b of bookings)if(!b||!seen.has(b.id)||
  ![b.gateX,b.targetY,b.scheduledSeconds].every(finite)||
  b.gateX<0||b.targetY<0||b.targetY>4.4)
  throw Error('A88 invalid bookable corridor');
}
function rowSet(states){
 const byStart=new Map();
 states.forEach((s,i)=>{
  const key=s.startX.toFixed(4);
  if(!byStart.has(key))byStart.set(key,[]);
  byStart.get(key).push(i);
 });
 return [...byStart.values()].sort((a,b)=>{
  const xa=Math.max(...a.map(i=>states[i].x));
  const xb=Math.max(...b.map(i=>states[i].x));
  return xb-xa;
 });
}
function overlap(a,b){
 const aLo=Math.min(a.y,a.targetY)-BODY,
  aHi=Math.max(a.y,a.targetY)+BODY,
  bLo=Math.min(b.y,b.targetY)-BODY,
  bHi=Math.max(b.y,b.targetY)+BODY;
 return aLo<bHi+.05&&bLo<aHi+.05;
}
function clearance(front,rear,horizon){
 const close=Math.max(0,rear.v-front.v);
 return 2.65+close*Math.min(horizon,3)+
  close*close/(2*B);
}
/** A single row occupancy budget for the currently booked gate.
 * Booked times derive from CURRENT positions and Step87 necessary
 * windows; the returned schedule has no power to move actual bikes.
 */
export function step88CoupledRowFlowV3(states,requests,bookings,{
 atSeconds=0,localHorizonSeconds=3,lowestMovingSpeedMps=7.2,
 maxMovingSpeedMps=10.4,entrySeparationM=2.85
}={}){
 assertInputs(states,requests,bookings,atSeconds);
 if(![localHorizonSeconds,lowestMovingSpeedMps,
  maxMovingSpeedMps,entrySeparationM].every(finite)||
  localHorizonSeconds<1||localHorizonSeconds>6||
  lowestMovingSpeedMps<5||lowestMovingSpeedMps>10||
  maxMovingSpeedMps<lowestMovingSpeedMps||
  maxMovingSpeedMps>16||entrySeparationM<2.4||
  entrySeparationM>4)throw Error('A88 invalid row parameters');
 const order=step87CorridorOrderV3(states,requests,bookings,{
  atSeconds,minMovingSpeedMps:lowestMovingSpeedMps});
 const entryByIndex=new Map(order.entries.map(e=>[e.i,e]));
 const rows=rowSet(states);
 const sameRowIndex=new Array(states.length).fill(-1);
 rows.forEach((row,i)=>row.forEach(j=>sameRowIndex[j]=i));
 const reservations=[],edges=[],held=new Array(states.length).fill(false);
 const caps=new Array(states.length).fill(Infinity);
 const offers=new Array(states.length).fill(-Infinity);
 const rowVelocityCeilings=new Array(rows.length).fill(Infinity);
 let ambiguousRows=0,unreachableRows=0,occupiedPairs=0;
 // First, derive one joint entry interval for every actual five-wide
 // starting row; two mirrored side tracks each have only one occupancy
 // per bike length/time slot. The center is not given arbitrary side.
 for(let z=0;z<rows.length;z++){
  const row=rows[z],members=row.map(i=>({
   i,s:states[i],e:entryByIndex.get(i)
  })).filter(x=>x.e);
  if(!members.length)continue;
  const nearGate=Math.min(...members.map(m=>m.e.gateX-m.s.x));
  const rowStart=Math.max(...members.map(m=>m.e.earliest??Infinity));
  const rowLate=Math.min(...members.map(m=>m.e.latest??Infinity));
  const feasible=finite(rowStart)&&rowStart<=rowLate+EPS;
  if(!feasible)unreachableRows++;
  const sides=[-1,1].map(side=>members.filter(x=>
   Math.sign(x.e.targetY-CENTER)===side));
  let tie=false;
  const occupancy=[];
  for(const part of sides){
   // Geometry-based first occupancy: nearer road centre, then achieved x.
   part.sort((a,b)=>Math.abs(a.s.y-CENTER)-
    Math.abs(b.s.y-CENTER)||b.s.x-a.s.x);
   let previous=null;
   for(const m of part){
    const t=(m.e.assigned??rowStart);
    const requested=previous?
     Math.max(t,previous.time+entrySeparationM/
      Math.max(lowestMovingSpeedMps,m.s.v)):t;
    if(previous&&Math.abs(previous.s.x-m.s.x)<EPS&&
     Math.abs(Math.abs(previous.s.y-CENTER)-
      Math.abs(m.s.y-CENTER))<EPS)tie=true;
    const time=q(requested);
    occupancy.push({i:m.i,side:Math.sign(m.e.targetY-CENTER),
     time,booked:m.e.gateX});
    previous={...m,time};
   }
  }
  // A center rider's target is assigned by the immutable gate booking,
  // never by a side-preference tie break in this optimizer.
  for(const m of members)if(Math.abs(m.e.targetY-CENTER)<EPS)
   occupancy.push({i:m.i,side:0,
    time:q(m.e.assigned??rowStart),booked:m.e.gateX});
  if(tie)ambiguousRows++;
  reservations.push({row:z,members:members.map(m=>m.i),
   fiveAbreast:row.length===5,earliest:q(rowStart),
   latest:finite(rowLate)?q(rowLate):null,
   provisionalWindowExists:feasible&&!tie,
   ambiguous:tie,occupancy});
  if(tie)for(const m of members)
   if(Math.abs(requests[m.i].targetY-m.s.y)>EPS)
    held[m.i]=true;
 }
 // Graph of preceding rows sharing a requested gate slot. This is a
 // whole-row topological constraint, not pair iteration overwriting speed.
 for(let a=0;a<reservations.length;a++)
 for(let b=a+1;b<reservations.length;b++){
  const front=reservations[a],rear=reservations[b];
  const frontX=Math.max(...front.members.map(i=>states[i].x));
  const backX=Math.max(...rear.members.map(i=>states[i].x));
  if(frontX<backX-EPS)continue; // geometry tie is conservatively held
  if(frontX-backX>38)continue;
  const common=front.occupancy.some(f=>rear.occupancy.some(r=>
   Math.abs(f.booked-r.booked)<EPS&&f.side===r.side));
  if(!common)continue;
  const leadV=Math.min(...front.members.map(i=>states[i].v));
  const rearV=Math.max(...rear.members.map(i=>states[i].v));
  const needed=2.85+Math.max(0,rearV-leadV)*
   localHorizonSeconds;
  const gap=frontX-backX;
  edges.push({ahead:front.row,behind:rear.row,
   presentGapM:q(gap),necessaryGapM:q(needed)});
  if(gap<needed+1){
   // Select one synchronized row pace request only; do not loop over
   // pairwise neighbors and repeatedly cut every bicycle's target.
   rowVelocityCeilings[rear.row]=Math.min(
    rowVelocityCeilings[rear.row],
    Math.max(lowestMovingSpeedMps,leadV+.15));
  }
 }
 // Shared occupied 2D corridors: if a close neighbor is in (or
 // sweeping through) a cyclist's proposed path, reserve the lateral
 // movement until the TRUE x separation is adequate, allowing no
 // arbitrary rider-ID priority.
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  const a=states[i],b=states[j];
  if(Math.abs(a.x-b.x)>17)continue;
  const entryA=entryByIndex.get(i),entryB=entryByIndex.get(j);
  if(!entryA||!entryB||entryA.gateId!==entryB.gateId)continue;
  if(!overlap({y:a.y,targetY:requests[i].targetY},
   {y:b.y,targetY:requests[j].targetY}))continue;
  const ahead=Math.abs(a.x-b.x)<EPS?null:(a.x>b.x?i:j);
  occupiedPairs++;
  if(ahead===null){
   // One physical row: both conflicting mover requests wait.
   if(Math.abs(requests[i].targetY-a.y)>EPS)held[i]=true;
   if(Math.abs(requests[j].targetY-b.y)>EPS)held[j]=true;
   continue;
  }
  const rear=ahead===i?j:i;
  const front=states[ahead],follower=states[rear];
  const expected=clearance(front,follower,localHorizonSeconds);
  if(front.x-follower.x<expected+1.1){
   if(Math.abs(requests[rear].targetY-follower.y)>EPS)
    held[rear]=true;
   // Avoid braking for mere projected overlap if the lanes are
   // physically separated and not actively converging.
   if(Math.abs(front.y-follower.y)<1.2&&
    follower.v>front.v+.12)
    caps[rear]=Math.min(caps[rear],
     Math.max(lowestMovingSpeedMps,front.v+.18));
  }
 }
 const rowPlans=[];
 for(let z=0;z<rows.length;z++){
  const ids=rows[z],members=ids.map(i=>states[i]);
  if(!members.length)continue;
  const minV=Math.min(...members.map(x=>x.v));
  const haveHold=ids.some(i=>held[i]);
  let pace=Math.min(rowVelocityCeilings[z],maxMovingSpeedMps);
  // Request limits are advisory and local: not an artificial mass stop.
  if(finite(pace)&&pace<minV-.5)
   pace=Math.max(lowestMovingSpeedMps,minV-.5);
  for(const i of ids)if(finite(pace)&&pace<requests[i].speed-EPS)
   caps[i]=Math.min(caps[i],pace);
  // A front row only gets bounded assistance if no *present* neighbor
  // occupies its lane ahead; all movement still A64-capped at +.45 m/s².
  if(!haveHold&&z===0&&minV<9.8)
   for(const i of ids)if(states[i].v<9.8&&
    !finite(caps[i]))offers[i]=Math.max(offers[i],states[i].v+.225);
  rowPlans.push({row:z,riders:ids.length,held:ids.filter(i=>held[i]).length,
   paceCeiling:finite(rowVelocityCeilings[z])?
    q(rowVelocityCeilings[z]):null});
 }
 return {order,rows:rows.length,reservations,edges,rowPlans,
  held,caps,offers,
  occupiedPairs,unreachableRows,ambiguousRows,
  heldRiders:held.filter(Boolean).length,
  cappedRiders:caps.filter(finite).length,
  futureSlotIsNotSafePhysicalPassage:true,
  groupVelocityIsRequestedNotAchieved:true,
  physicallyUnsafeMovementMustBeRejected:true,
  officialWrites:0};
}
export function step88RowFlowCandidatesV3(states,requests,bookings,{
 atSeconds=0,lowestMovingSpeedMps=7.2
}={}){
 const plan=step88CoupledRowFlowV3(states,requests,bookings,{
  atSeconds,lowestMovingSpeedMps});
 const choices=['hold','row_yield','row_assist','balanced'].map(mode=>{
  const next=requests.map(r=>({...r}));
  let held=0,capped=0,assisted=0;
  for(let i=0;i<states.length;i++){
   const s=states[i],r=next[i];
   if(plan.held[i]&&Math.abs(r.targetY-s.y)>EPS){
    r.targetY=s.y;held++;
   }
   if(['row_yield','balanced'].includes(mode)&&
    finite(plan.caps[i])&&plan.caps[i]<r.speed-EPS){
    r.speed=q(Math.max(lowestMovingSpeedMps,plan.caps[i]));
    capped++;
   }
   if(['row_assist','balanced'].includes(mode)&&
    finite(plan.offers[i])&&plan.offers[i]>r.speed+EPS){
    r.speed=q(Math.min(10,plan.offers[i]));assisted++;
   }
  }
  return {policy:'whole_row_'+mode,requests:next,
   held,capped,assisted,officialWrites:0};
 });
 return {plan,candidates:choices,
  a64MustResweepSelectedActualTick:true,
  officialWrites:0};
}
