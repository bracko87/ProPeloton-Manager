/** Step 90 — research-only coupled early merge trajectory constraints.
 * Requests are NOT accepted trajectories. The untouched A64 0.5s full
 * bicycle swept/road/W-prime solver remains sole physical authority.
 * Pair priority derives only from achieved x and physically necessary
 * steering distance. Fully symmetric ties have no imposed winner.
 */
const EPS=1e-7, HALF=.3, STEER=.38, BRAKE=.85;
const finite=Number.isFinite,round=x=>Math.round(x*1e6)/1e6;
function check(states,requests,bookings,now){
 if(!Array.isArray(states)||states.length<2||states.length>168||
 !Array.isArray(requests)||requests.length!==states.length||
 !Array.isArray(bookings)||!finite(now)||now<0)throw Error('A90 invalid field');
 const ids=new Set();
 states.forEach((s,i)=>{
  const r=requests[i];
  if(!s||!r||typeof s.id!=='string'||!s.id||ids.has(s.id)||
   r.id!==s.id||![s.x,s.y,s.v,s.startX,r.speed,r.targetY].every(finite)||
   s.y<0||s.y>4.4||s.v<0||s.v>50||r.speed<0||r.speed>50||
   r.targetY<0||r.targetY>4.4)
   throw Error('A90 invalid bicycle');
  ids.add(s.id);
 });
 for(const b of bookings)
  if(!b||!ids.has(b.id)||![b.gateX,b.targetY].every(finite)||
   b.gateX<0||b.targetY<0||b.targetY>4.4)
   throw Error('A90 invalid booking');
}
const crossing=(a,b)=>{
 const lo=Math.min(a.s.y,a.y)-HALF,hi=Math.max(a.s.y,a.y)+HALF;
 const bl=Math.min(b.s.y,b.y)-HALF,bh=Math.max(b.s.y,b.y)+HALF;
 return lo<bh+.06&&bl<hi+.06;
};
function priority(a,b){
 if(a.s.x>b.s.x+EPS)return -1;
 if(b.s.x>a.s.x+EPS)return 1;
 const da=Math.abs(a.y-a.s.y),db=Math.abs(b.y-b.s.y);
 if(da<db-EPS)return -1;
 if(db<da-EPS)return 1;
 const ca=Math.abs(a.s.y-2.2),cb=Math.abs(b.s.y-2.2);
 if(ca<cb-EPS)return -1;
 if(cb<ca-EPS)return 1;
 return 0;
}
export function step90RowTrajectoryPlanV3(states,requests,bookings,{
 atSeconds=0,lookAheadM=230,interactionRangeM=32,
 minMovingMps=7.4,safetyBodyGapM=3.15
}={}){
 check(states,requests,bookings,atSeconds);
 if(![lookAheadM,interactionRangeM,minMovingMps,safetyBodyGapM].every(finite)||
 lookAheadM<100||lookAheadM>350||interactionRangeM<10||
 interactionRangeM>75||minMovingMps<5.5||minMovingMps>10||
 safetyBodyGapM<2.65||safetyBodyGapM>5)
 throw Error('A90 invalid trajectory bounds');
 const byId=new Map();
 for(const b of bookings){
  if(!byId.has(b.id))byId.set(b.id,[]);
  byId.get(b.id).push(b);
 }
 const active=states.map((s,i)=>{
  const book=(byId.get(s.id)||[]).filter(b=>b.gateX>s.x+EPS)
   .sort((a,b)=>a.gateX-b.gateX)[0];
  if(!book||book.gateX-s.x>lookAheadM)return null;
  return {i,s,y:book.targetY,gateId:book.gateId,
   gateX:book.gateX,request:requests[i]};
 });
 const held=states.map(()=>false),paceCeil=states.map(()=>Infinity),
 paceAssist=states.map(()=>-Infinity),edges=[];
 let ambiguousPairs=0,blockedCrossings=0;
 // Build one coupled directed, current-state graph rather than
 // overwriting controls in order of the rider input array.
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  const a=active[i],b=active[j];
  if(!a||!b||a.gateId!==b.gateId||
    Math.abs(a.s.x-b.s.x)>interactionRangeM||!crossing(a,b))
   continue;
  const k=priority(a,b);
  if(k===0){
   ambiguousPairs++;
   if(Math.abs(a.request.targetY-a.s.y)>EPS)held[i]=true;
   if(Math.abs(b.request.targetY-b.s.y)>EPS)held[j]=true;
   continue;
  }
  const lead=k<0?a:b,rear=k<0?b:a;
  const gap=lead.s.x-rear.s.x;
  const closing=Math.max(0,rear.s.v-lead.s.v);
  const required=safetyBodyGapM+closing*3.5+
   closing*closing/(2*BRAKE)+
   Math.min(1.5,Math.abs(rear.y-rear.s.y)/STEER*.24);
  const overlapTarget=Math.abs(lead.y-rear.y)<.82;
  const closePair=gap<required+1.5;
  if(!closePair&&!overlapTarget)continue;
  edges.push({ahead:lead.i,behind:rear.i,
   achievedGapM:round(gap),necessaryGapM:round(required),
   sameStartRow:Math.abs(lead.s.startX-rear.s.startX)<EPS});
  if(closePair){
   // There is no adequate *achieved* 2D clearance to change lanes.
   if(Math.abs(rear.request.targetY-rear.s.y)>EPS){
    held[rear.i]=true;blockedCrossings++;
   }
   if(Math.abs(lead.request.targetY-lead.s.y)>EPS&&
    gap<1.2){
    // Same-row side-by-side crossing: the geometrically prioritized
    // bicycle moves first only if the rear one is held.
   }
   // Only request legal, moving-speed-preserving longitudinal gap.
   // Never directly change achieved speed, x/y, or energy.
   if(rear.s.v>minMovingMps+.15)
    paceCeil[rear.i]=Math.min(paceCeil[rear.i],
     Math.max(minMovingMps,rear.s.v-.35));
   if(lead.s.v<10.0&&
      !held[lead.i])paceAssist[lead.i]=Math.max(paceAssist[lead.i],
       Math.min(10.0,lead.s.v+.45));
  }else if(overlapTarget&&closing>.12){
   paceCeil[rear.i]=Math.min(paceCeil[rear.i],
    Math.max(minMovingMps,lead.s.v+.12));
  }
 }
 // Prevent boosted leaders from accelerating into a real occupied
 // corridor ahead (otherwise an upstream speed pulse causes collision).
 for(let i=0;i<states.length;i++){
  if(!finite(paceAssist[i]))continue;
  const s=states[i],self=active[i];
  if(!self)continue;
  for(let j=0;j<states.length;j++){
   if(i===j||!active[j]||states[j].x<=s.x+EPS||
     states[j].x-s.x>12||!crossing(self,active[j]))continue;
   paceAssist[i]=-Infinity;break;
  }
 }
 return {held,paceCeil,paceAssist,edges,
  activeCount:active.filter(Boolean).length,ambiguousPairs,
  blockedCrossings,holdCount:held.filter(Boolean).length,
  originalA64MustResweep:true,realStateUnchanged:true,officialWrites:0};
}
export function step90RowTrajectoryCandidatesV3(states,requests,bookings,opts={}){
 const plan=step90RowTrajectoryPlanV3(states,requests,bookings,opts);
 const candidates=['crossing_hold','coupled_yield','coupled_flow'].map(mode=>{
  const requested=requests.map((r,i)=>{
   const s=states[i],next={...r};
   if(plan.held[i])next.targetY=s.y;
   if(mode!=='crossing_hold'&&finite(plan.paceCeil[i]))
    next.speed=round(Math.min(next.speed,plan.paceCeil[i]));
   if(mode==='coupled_flow'&&finite(plan.paceAssist[i])&&
    !finite(plan.paceCeil[i]))
    next.speed=round(Math.max(next.speed,plan.paceAssist[i]));
   return next;
  });
  return {policy:'row_trajectory_'+mode,requests:requested,officialWrites:0};
 });
 return {plan,candidates,physicalClearanceNotCertified:true,officialWrites:0};
}
