/** A78 research-only joint longitudinal/lateral request screening.
 * Existing full-body swept collision and road-envelope solver is final
 * authority. A screening pass is NOT an accepted physical movement.
 * Only present physical states and static geographic road data are inputs.
 */
const EPS=1e-7,DT=.5,A=.45,B=.85,L=.38
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v))
const finite=x=>typeof x==='number'&&Number.isFinite(x)
function predict(s,r,t){
 const a=clamp((r.speed-s.v)/DT,-B,A)
 const stop=a<0&&s.v+a*t<0?s.v/-a:t
 const x=s.x+s.v*stop+.5*a*stop*stop
 const y=s.y+clamp(r.targetY-s.y,-L*t,L*t)
 return {x,y,v:Math.max(0,s.v+a*t)}
}
function conflict(a,b,ra,rb,{horizonSeconds=3}={}){
 // Prospective current commands are not previously accepted rider paths.
 const sampleTimes=[.5,1,1.5,2,2.5,3,4,5,6]
  .filter(t=>t<=horizonSeconds+EPS)
 for(const t of sampleTimes){
  const pa=predict(a,ra,t),pb=predict(b,rb,t)
  if(Math.abs(pa.x-pb.x)<2.35&&Math.abs(pa.y-pb.y)<.85)
   return {t,dx:pa.x-pb.x,dy:pa.y-pb.y,
    kind:'PROJECTED_BODY_CONFLICT'}
 }
 return null
}
export function jointViabilityCommandsV3(states,requests,{
 headwayM=4.5,horizonSeconds=3,maxIterations=4,
 roadEnvelope=null,widthHalfM=.3,scanSeconds=5
}={}){
 if(!Array.isArray(states)||states.length<2||states.length>168||
    !Array.isArray(requests)||requests.length!==states.length||
    ![headwayM,horizonSeconds,maxIterations,widthHalfM,scanSeconds]
     .every(finite)||headwayM<2.35||headwayM>7||
    horizonSeconds<1||horizonSeconds>6||
    !Number.isInteger(maxIterations)||maxIterations<1||
    maxIterations>12||widthHalfM<0||widthHalfM>.5||
    scanSeconds<.5||scanSeconds>8||
    (roadEnvelope!==null&&typeof roadEnvelope!=='function'))
   throw Error('A78 invalid joint viability inputs')
 const seen=new Set(),order=[]
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i]
  if(!s||!r||typeof s.id!=='string'||!s.id||
     seen.has(s.id)||s.id!==r.id||
     ![s.x,s.y,s.v,r.speed,r.targetY].every(finite)||
     s.v<0||s.v>50||r.speed<0||r.speed>50||
     s.y<0||s.y>4.4)
   throw Error('A78 malformed or duplicated physical rider')
  seen.add(s.id);order.push({s,r:{...r}})
 }
 let blockedLaneChanges=0,leadProtection=0,
  earlyBrakeCommands=0,predictedConflicts=0,roadWarnings=0
 for(let k=0;k<maxIterations;k++){
  let changed=0
  for(let i=0;i<order.length;i++)for(let j=i+1;j<order.length;j++){
   const a=order[i],b=order[j]
   if(Math.abs(a.s.x-b.s.x)>40)continue
   const c=conflict(a.s,b.s,a.r,b.r,{horizonSeconds})
   if(!c)continue
   predictedConflicts++
   // Adjacent bicycles must gain real longitudinal space BEFORE
   // steering inward toward a shared physical corridor.
   if(Math.abs(a.s.x-b.s.x)<2.8){
    for(const q of [a,b]){
     if(Math.abs(q.r.targetY-q.s.y)>EPS){
      q.r.targetY=q.s.y;blockedLaneChanges++;changed++
     }
    }
   }
   // Shared longitudinal approach; current-time physical ordering,
   // never array order, rider ID or a favored geographic side.
   const lead=a.s.x>b.s.x+EPS?a:b.s.x>a.s.x+EPS?b:null
   if(!lead)continue
   const rear=lead===a?b:a
   const gap=lead.s.x-rear.s.x
   const closing=Math.max(0,rear.s.v-lead.s.v)
   const reserve=Math.max(headwayM,
    2.35+3*closing+closing*closing/(2*B))
   if(gap>reserve+15)continue
   // Preserve physically reachable leader velocity where the
   // intended slowdown would create an unrecoverable rear closure.
   const safeLead=Math.min(lead.s.v+A*DT,Math.max(
    lead.r.speed,Math.min(lead.s.v+A*DT,
    rear.s.v-(gap-2.35)/3)))
   if(safeLead>lead.r.speed+EPS){
    lead.r.speed=safeLead;leadProtection++;changed++
   }
   const rearCap=Math.max(0,Math.min(rear.r.speed,
    lead.s.v+clamp((gap-reserve)/3,-3,1)))
   if(rearCap<rear.r.speed-EPS){
    rear.r.speed=rearCap;earlyBrakeCommands++;changed++
   }
  }
  if(roadEnvelope)for(const q of order){
   for(const t of [.5,1,2,3,4,5,6]
    .filter(t=>t<=scanSeconds)){
    const p=predict(q.s,q.r,t),road=roadEnvelope(p.x)
    if(!road||![road.minY,road.maxY].every(finite))
     throw Error('A78 invalid static road envelope')
    if(p.y-widthHalfM<road.minY-EPS||
       p.y+widthHalfM>road.maxY+EPS){
     roadWarnings++
     // Only request bounded braking; never clip or widen the road.
     const capped=Math.max(0,Math.min(q.r.speed,q.s.v-1))
     if(capped<q.r.speed-EPS){q.r.speed=capped;changed++}
     break
    }
   }
  }
  if(!changed)break
 }
 const commands=order.map(q=>q.r)
 let unresolved=0
 for(let i=0;i<order.length;i++)for(let j=i+1;j<order.length;j++){
  if(Math.abs(order[i].s.x-order[j].s.x)>40)continue
  if(conflict(order[i].s,order[j].s,order[i].r,order[j].r,
    {horizonSeconds:Math.min(1,horizonSeconds)}))unresolved++
 }
 return {requests:commands,blockedLaneChanges,leadProtection,
  earlyBrakeCommands,predictedConflicts,
  unresolvedOneSecondPairs:unresolved,roadWarnings,
  noMotionAuthority:true,physicsApproval:'NOT_APPROVED',
  officialWrites:0}
}
