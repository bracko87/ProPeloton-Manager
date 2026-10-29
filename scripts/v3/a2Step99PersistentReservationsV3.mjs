/** Step99: persistent multi-gate, whole-field space-time claims.
 * A claim is advisory and never authorizes A64 motion. Claim acquisitions,
 * renewals and releases depend only on achieved physical rider x/y/v,
 * immutable prestart gate intent and previously stored accepted claims.
 */
import {step98GlobalTrajectoryCandidatesV3} from './a2Step98GlobalTrajectoryGraphV3.mjs'
import {step86GapCandidatesV3} from './a2Step86MultiRowGapV3.mjs'
const EPS=1e-7,B=.85,L=.38,HALF=.3,MAX_LIFE=16
const finite=Number.isFinite,q=x=>Math.round(x*1e6)/1e6
const clip=(x,a,b)=>Math.max(a,Math.min(b,x))
function index(states,requests,bookings,claims,now){
 if(!Array.isArray(states)||states.length<2||states.length>168||
  !Array.isArray(requests)||requests.length!==states.length||
  !Array.isArray(bookings)||!Array.isArray(claims)||
  !finite(now)||now<0)throw Error('A99 invalid global reservation field')
 const ids=new Map()
 states.forEach((s,i)=>{
  const r=requests[i]
  if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||!r||
   r.id!==s.id||![s.x,s.y,s.v,r.speed,r.targetY]
   .every(finite)||s.y<0||s.y>4.4||s.v<0||s.v>50||
   r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
    throw Error('A99 invalid physical rider requests')
  ids.set(s.id,i)
 })
 const byId=new Map()
 for(const b of bookings){
  if(!b||!ids.has(b.id)||typeof b.gateId!=='string'||
   ![b.gateX,b.targetY,b.scheduledSeconds].every(finite)||
   b.gateX<0||b.targetY<0||b.targetY>4.4)
   throw Error('A99 invalid booked corridor')
  if(!byId.has(b.id))byId.set(b.id,[])
  byId.get(b.id).push(b)
 }
 for(const c of claims){
  if(!c||!ids.has(c.leaderId)||!ids.has(c.followerId)||
   c.leaderId===c.followerId||typeof c.gateId!=='string'||
   ![c.gateX,c.targetY,c.startAt,c.releaseAt,c.slotStart,c.slotEnd]
   .every(finite)||c.gateX<0||c.targetY<0||c.targetY>4.4||
   c.startAt<0||c.releaseAt<c.startAt||
   c.releaseAt-c.startAt>MAX_LIFE+EPS||
   c.slotStart<c.startAt||c.slotEnd<c.slotStart||
   c.slotEnd>c.releaseAt+EPS)throw Error('A99 invalid persisted claim')
 }
 return {ids,byId}
}
function active(s,byId){
 return (byId.get(s.id)||[]).filter(b=>b.gateX>s.x+EPS)
  .sort((a,b)=>a.gateX-b.gateX)[0]??null
}
const overlap=(a,b)=>Math.min(a.y,a.target)-HALF<
 Math.max(b.y,b.target)+HALF+.07&&
 Math.min(b.y,b.target)-HALF<
 Math.max(a.y,a.target)+HALF+.07
const necessary=(f,r,steer)=>3.0+
 Math.max(0,r.v-f.v)*Math.max(2.5,steer+1.5)+
 Math.max(0,r.v-f.v)**2/(2*B)
function verified(f,r,gate,now,prior){
 const dist=gate.gateX-f.x
 if(dist<-.01||dist>240)return false
 const seconds=Math.abs(gate.targetY-f.y)/L
 const gap=f.x-r.x
 const required=necessary(f,r,seconds)
 if(gap<required-EPS)return false
 // Do not consider a theoretical claim if there is not physically
 // enough distance to move laterally before the recorded gate.
 if(dist<Math.max(1,f.v*seconds-2))return false
 if(prior && now>prior.releaseAt+EPS)return false
 return true
}
export function step99PersistentReservationsV3(states,requests,bookings,{
 atSeconds=0,existingClaims=[],interactionRangeM=31,
 lookAheadM=215
}={}){
 const {ids,byId}=index(states,requests,bookings,existingClaims,atSeconds)
 if(!finite(interactionRangeM)||interactionRangeM<12||
  interactionRangeM>60||!finite(lookAheadM)||
  lookAheadM<90||lookAheadM>260)
 throw Error('A99 invalid globally coupled reservation bounds')
 const books=states.map(s=>active(s,byId))
 const kept=[],released=[],added=[]
 // Replayable claims persist across ticks ONLY if the achieved physical
 // leader/follower order and actual headway remain safe.
 for(const c of existingClaims){
  const f=states[ids.get(c.leaderId)],r=states[ids.get(c.followerId)]
  const b=books[ids.get(c.leaderId)],br=books[ids.get(c.followerId)]
  const valid=b?.gateId===c.gateId&&br?.gateId===c.gateId&&
   Math.abs(b.targetY-c.targetY)<EPS&&
   Math.abs(b.gateX-c.gateX)<EPS&&
   f.x>r.x+EPS&&verified(f,r,b,atSeconds,c)
  if(valid)kept.push(c)
  else released.push({leaderId:c.leaderId,followerId:c.followerId,
   gateId:c.gateId,reason:'EXPIRED_OR_PHYSICAL_CLEARANCE_LOST'})
 }
 const claimKey=c=>c.leaderId+'|'+c.followerId+'|'+c.gateId
 const activeKeys=new Set(kept.map(claimKey))
 const revokedKeys=new Set(released.map(claimKey))
 // All cross-row pairs are assessed globally, not per starting quintet.
 // Equal-x and equal-road-center precedence does NOT depend on rider ID,
 // array order or arbitrary road side.
 let considered=0,ambiguous=0,candidatePairs=0
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  const a=states[i],b=states[j],ba=books[i],bb=books[j]
  if(!ba||!bb||ba.gateId!==bb.gateId||
   Math.abs(a.x-b.x)>interactionRangeM||
   Math.min(ba.gateX-a.x,bb.gateX-b.x)>lookAheadM||
   !overlap({y:a.y,target:ba.targetY},
    {y:b.y,target:bb.targetY}))continue
  considered++
  if(Math.abs(a.x-b.x)<EPS){ambiguous++;continue}
  const leader=a.x>b.x?a:b,follower=leader===a?b:a
  const book=leader===a?ba:bb
  if(Math.abs(book.targetY-leader.y)<.06)continue
  const key=leader.id+'|'+follower.id+'|'+book.gateId
  if(activeKeys.has(key)||revokedKeys.has(key))continue
  candidatePairs++
  if(!verified(leader,follower,book,atSeconds))continue
  const steering=Math.abs(book.targetY-leader.y)/L
  const lifetime=clip(steering+3,3,MAX_LIFE)
  const c={leaderId:leader.id,followerId:follower.id,
   gateId:book.gateId,gateX:book.gateX,targetY:book.targetY,
   startAt:q(atSeconds),releaseAt:q(atSeconds+lifetime),
   slotStart:q(atSeconds),slotEnd:q(atSeconds+Math.min(
    lifetime,steering+1))}
  added.push(c);activeKeys.add(key)
 }
 const claims=[...kept,...added]
 const hold=states.map(()=>false),cap=states.map(()=>Infinity),
  leaderAssist=states.map(()=>-Infinity)
 let protectedPairTicks=0
 // The global ledger may have several followers for one leader and
 // several leaders for one follower. Solve all cap and assist requests
 // together, never sequentially award conflicting x/y motion.
 for(const c of claims){
  const fi=ids.get(c.leaderId),ri=ids.get(c.followerId)
  const f=states[fi],r=states[ri]
  const timeRemain=Math.max(.5,c.slotEnd-atSeconds)
  const gap=f.x-r.x,need=necessary(f,r,timeRemain)
  if(Math.abs(requests[ri].targetY-r.y)>EPS)hold[ri]=true
  if(gap<need+2.2)
   cap[ri]=Math.min(cap[ri],
    Math.max(6.5,Math.min(10.5,f.v-(need+1.1-gap)/timeRemain)))
  if(gap<need+3.0&&f.v<10.8)
   leaderAssist[fi]=Math.max(leaderAssist[fi],
    Math.min(10.8,f.v+.9))
  protectedPairTicks++
 }
 // A new unreserved same-x crossing may not silently occupy a
 // lane alongside a neighbor in a geometrically identical row.
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  const a=states[i],b=states[j],ba=books[i],bb=books[j]
  if(!ba||!bb||ba.gateId!==bb.gateId||
   Math.abs(a.x-b.x)>EPS||Math.abs(a.y-b.y)>1.2||
   !overlap({y:a.y,target:ba.targetY},
    {y:b.y,target:bb.targetY}))continue
  if(Math.abs(requests[i].targetY-a.y)>EPS)hold[i]=true
  if(Math.abs(requests[j].targetY-b.y)>EPS)hold[j]=true
 }
 return {claims,held:hold,caps:cap,assists:leaderAssist,
  kept:kept.length,added:added.length,released:released.length,
  releasedReasons:released,considered,ambiguous,candidatePairs,
  protectedPairTicks,activeClaims:claims.length,
  physicalRevalidationOnly:true,claimsAreNotCollisionPermission:true,
  noAcceptedStatesModified:true,officialWrites:0}
}
export function step99ReservationCandidatesV3(states,requests,bookings,{
 atSeconds=0,existingClaims=[]
}={}){
 const plan=step99PersistentReservationsV3(states,requests,bookings,{
  atSeconds,existingClaims})
 const old=step98GlobalTrajectoryCandidatesV3(states,requests,bookings)
 const gap=step86GapCandidatesV3(states,requests,bookings,{
  atSeconds,lookAheadM:55,movingFloorMps:7.5})
 const candidates=['hold','flow','release'].map((mode,k)=>{
  const source=mode==='hold'?requests:
   mode==='flow'?old.candidates[1].requests:
   gap.candidates[2].requests
  return {policy:'global_reserved_'+mode,officialWrites:0,
   requests:source.map((r,i)=>{
    const out={...r}
    // Never unilaterally force a leader to cross from a held equal-X
    // pair. All commands are re-checked by original A64.
    if(plan.held[i])out.targetY=states[i].y
    if(mode!=='hold'&&finite(plan.caps[i]))
     out.speed=q(Math.max(6.5,Math.min(out.speed,plan.caps[i])))
    if(mode==='release'&&finite(plan.assists[i])&&
     !finite(plan.caps[i]))out.speed=q(Math.min(10.8,
     Math.max(out.speed,plan.assists[i])))
    return out
   })}
 })
 return {plan,candidates,noPhysicalAuthority:true,officialWrites:0}
}
/** Call ONLY after unchanged A64 physically accepted this half-second.
 * Unlike hypothetical search claims, these become persisted state.
 */
export function step99AcceptedReservationsV3(achievedStates,bookings,{
 atSeconds=0,existingClaims=[]
}={}){
 const r=achievedStates.map(s=>({id:s.id,speed:s.v,
  targetY:s.targetY}))
 return step99PersistentReservationsV3(achievedStates,r,bookings,{
  atSeconds,existingClaims}).claims
}
