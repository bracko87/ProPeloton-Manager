/** Step91 research-only: replayable, physically revalidated merge leases.
 * No lease authorizes a bicycle movement: unchanged A64 full-body swept,
 * road-edge and W-prime physics alone accepts each actual half-second.
 * Lease IDs are references only, NEVER tie-breakers or right-of-way.
 */
import {step90RowTrajectoryCandidatesV3} from './a2Step90RowTrajectoryV3.mjs';
const EPS=1e-7,HALF=.3,BRAKE=.85,STEER=.38,MAX_LEASE_SECONDS=9;
const finite=Number.isFinite,q=x=>Math.round(x*1e6)/1e6;
function bookById(bookings,states){
 const ids=new Set(states.map(s=>s.id)),byId=new Map();
 for(const b of bookings){
  if(!b||!ids.has(b.id)||!finite(b.gateX)||!finite(b.targetY)||
    b.gateX<0||b.targetY<0||b.targetY>4.4)
    throw Error('A91 invalid corridor booking');
  if(!byId.has(b.id))byId.set(b.id,[]);
  byId.get(b.id).push(b);
 }
 return byId;
}
function activeBook(s,byId){
 return (byId.get(s.id)||[]).filter(b=>b.gateX>s.x+EPS)
  .sort((a,b)=>a.gateX-b.gateX)[0]??null;
}
function validate(states,requests,bookings,leases,at){
 if(!Array.isArray(states)||states.length<2||states.length>168||
   !Array.isArray(requests)||requests.length!==states.length||
   !Array.isArray(bookings)||!Array.isArray(leases)||
   !finite(at)||at<0)throw Error('A91 invalid field');
 const ids=new Set();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||
   !r||r.id!==s.id||![s.x,s.y,s.v,s.startX,r.speed,r.targetY]
   .every(finite)||s.y<0||s.y>4.4||s.v<0||s.v>50||
   r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
    throw Error('A91 invalid bike/command');
  ids.add(s.id);
 }
 for(const l of leases){
  if(!l||!ids.has(l.ownerId)||!ids.has(l.waitingId)||
    l.ownerId===l.waitingId||typeof l.gateId!=='string'||
    ![l.targetY,l.sinceAt,l.untilAt].every(finite)||
    l.targetY<0||l.targetY>4.4||l.sinceAt<0||
    l.untilAt<l.sinceAt||l.untilAt-l.sinceAt>MAX_LEASE_SECONDS+EPS)
   throw Error('A91 invalid saved lease');
 }
 return bookById(bookings,states);
}
function sweptOverlap(y,targetY,z,otherTargetY){
 return Math.min(y,targetY)-HALF<Math.max(z,otherTargetY)+HALF+.07&&
  Math.min(z,otherTargetY)-HALF<Math.max(y,targetY)+HALF+.07;
}
function necessaryGap(front,rear,lateral){
 const closing=Math.max(0,rear.v-front.v);
 return 3.1+closing*3.5+closing*closing/(2*BRAKE)+
  Math.min(1.35,Math.abs(lateral)/STEER*.20);
}
/** Build leases solely from currently ACHIEVED bike positions/velocities.
 * Current bookings are routing intent, not proof of physical passage.
 * Each entry is a temporary bounded claim against ONE trailing bicycle;
 * other conflicts remain subject to all-pair planner and original A64 sweep.
 */
export function step91LeasePlanV3(states,requests,bookings,{
 atSeconds=0,existingLeases=[],interactionRangeM=35,
 maxLookAheadM=230
}={}){
 const byId=validate(states,requests,bookings,existingLeases,atSeconds);
 if(!finite(interactionRangeM)||interactionRangeM<12||
    interactionRangeM>65||!finite(maxLookAheadM)||
    maxLookAheadM<75||maxLookAheadM>350)
 throw Error('A91 invalid lease bounds');
 const byIndex=new Map(states.map((s,i)=>[s.id,i]));
 const active=states.map(s=>activeBook(s,byId));
 const kept=[],expired=[],acquired=[];
 // A stored claim is not sticky right-of-way. Revalidate its geometry
 // against ACTUAL current x/y/v every time it is loaded or renewed.
 for(const lease of existingLeases){
  const front=states[byIndex.get(lease.ownerId)];
  const rear=states[byIndex.get(lease.waitingId)];
  const a=active[byIndex.get(lease.ownerId)];
  const b=active[byIndex.get(lease.waitingId)];
  const valid=atSeconds<=lease.untilAt+EPS&&
   a?.gateId===lease.gateId&&b?.gateId===lease.gateId&&
   Math.abs(a.targetY-lease.targetY)<EPS&&
   front.x-rear.x>=necessaryGap(front,rear,a.targetY-front.y)-EPS&&
   a.gateX-front.x<maxLookAheadM;
  if(valid)kept.push({...lease});
  else expired.push({ownerId:lease.ownerId,waitingId:lease.waitingId,
    gateId:lease.gateId,reason:'EXPIRED_OR_ACHIEVED_GAP_REVOKED'});
 }
 const existing=new Set(kept.map(l=>l.ownerId+'|'+l.waitingId+'|'+l.gateId));
 const revokedThisTick=new Set(expired.map(l=>
  l.ownerId+'|'+l.waitingId+'|'+l.gateId));
 const reservations=[...kept];
 // Acquire only for real, currently geometrically authorized crossings.
 // Equal achieved-x does NOT award rights by array order/name/road side.
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  const a=states[i],b=states[j],ba=active[i],bb=active[j];
  if(!ba||!bb||ba.gateId!==bb.gateId||
   Math.abs(a.x-b.x)>interactionRangeM||
   !sweptOverlap(a.y,ba.targetY,b.y,bb.targetY)||
   Math.abs(a.x-b.x)<EPS)continue;
  const first=a.x>b.x?i:j,second=first===i?j:i;
  const leader=states[first],follower=states[second];
  const book=active[first];
  if(Math.abs(book.targetY-leader.y)<.08||
     Math.abs(book.gateX-leader.x)>maxLookAheadM)continue;
  const gap=leader.x-follower.x;
  if(gap<necessaryGap(leader,follower,book.targetY-leader.y))continue;
  const key=leader.id+'|'+follower.id+'|'+book.gateId;
  if(existing.has(key)||revokedThisTick.has(key))continue;
  // Claims cannot manufacture a gap. A verified owner only controls
  // its own future command; every third-party conflict is rechecked.
  const untilAt=q(atSeconds+Math.min(MAX_LEASE_SECONDS,
   Math.max(2,Math.abs(book.targetY-leader.y)/STEER+1.5)));
  const lease={ownerId:leader.id,waitingId:follower.id,
   gateId:book.gateId,targetY:book.targetY,
   sinceAt:q(atSeconds),untilAt};
  acquired.push(lease);reservations.push(lease);
  existing.add(key);
 }
 const holds=states.map(()=>false);
 const caps=states.map(()=>Infinity);
 let leaseConflicts=0;
 for(const lease of reservations){
  const leader=states[byIndex.get(lease.ownerId)];
  const follower=states[byIndex.get(lease.waitingId)];
  const rear=byIndex.get(lease.waitingId);
  if(Math.abs(requests[rear].targetY-follower.y)>EPS){
   holds[rear]=true;leaseConflicts++;
  }
  // Keep the gap for the FULL steering window; avoid a follower
  // consuming it while the leading bicycle crosses the track.
  if(follower.v>7.4&&leader.x-follower.x<necessaryGap(
   leader,follower,lease.targetY-leader.y)+2)
   caps[rear]=Math.min(caps[rear],Math.max(7.4,leader.v-.15));
 }
 return {leases:reservations,kept:kept.length,acquired:acquired.length,
  expired:expired.length,expiredReasons:expired,
  holds,caps,leaseConflicts,
  inputAcceptedPhysicsOnly:true,noPhysicalAuthorization:true,
  officialWrites:0};
}
export function step91LeaseCandidatesV3(states,requests,bookings,{
 atSeconds=0,existingLeases=[]
}={}){
 const plan=step91LeasePlanV3(states,requests,bookings,{
  atSeconds,existingLeases});
 const base=step90RowTrajectoryCandidatesV3(states,requests,bookings,{
  atSeconds});
 const candidates=['hold','yield','flow'].map((mode,k)=>({
  policy:'persistent_lease_'+mode,officialWrites:0,
  requests:base.candidates[k].requests.map((r,i)=>{
   const out={...r};
   if(plan.holds[i])out.targetY=states[i].y;
   if(mode!=='hold'&&finite(plan.caps[i]))
    out.speed=q(Math.min(out.speed,plan.caps[i]));
   return out;
  })
 }));
 return {plan,candidates,
  leaseCannotBypassSweptPhysics:true,officialWrites:0};
}
/** Commit only AFTER an original A64 tick was physically accepted.
 * No call to this function mutates rider states, bookings, or W-prime.
 */
export function step91AcceptedLeaseUpdateV3(acceptedStates,bookings,{
 atSeconds=0,existingLeases=[]
}={}){
 const commands=acceptedStates.map(s=>({id:s.id,speed:s.v,targetY:s.targetY}));
 return step91LeasePlanV3(acceptedStates,commands,bookings,{
  atSeconds,existingLeases}).leases;
}
