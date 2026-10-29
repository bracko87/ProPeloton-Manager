/** A94 experimental achieved-space plus REQUESTED closing-rate controller.
 * Every bicycle x/y/v/W-prime commitment remains in original A64.
 * No ID/array index/road-side right of way; fail-closed physical tests.
 */
const EPS=1e-7,HALF=.3,MID=2.2,BRAKE=.85,ACC=.45,STEER=.38;
const finite=Number.isFinite,q=x=>Math.round(x*1e6)/1e6;
const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
const interval=(y,target)=>({
 lo:Math.min(y,target)-HALF,hi:Math.max(y,target)+HALF});
const intersects=(a,b)=>a.lo<b.hi+.08&&b.lo<a.hi+.08;
function verify(states,commands,bookings,now){
 if(!Array.isArray(states)||states.length<2||states.length>168||
 !Array.isArray(commands)||commands.length!==states.length||
 !Array.isArray(bookings)||!finite(now)||now<0)
 throw Error('A94 invalid physical field');
 const ids=new Set(),map=new Map();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=commands[i];
  if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||
    !r||r.id!==s.id||![s.x,s.y,s.v,s.startX,
    r.speed,r.targetY].every(finite)||s.y<0||s.y>4.4||
    s.v<0||s.v>50||r.speed<0||r.speed>50||
    r.targetY<0||r.targetY>4.4)
   throw Error('A94 invalid bike or command');
  ids.add(s.id);
 }
 for(const b of bookings){
  if(!b||!ids.has(b.id)||![b.gateX,b.targetY].every(finite)||
   b.gateX<0||b.targetY<0||b.targetY>4.4)
   throw Error('A94 invalid gate booking');
  if(!map.has(b.id))map.set(b.id,[]);
  map.get(b.id).push(b);
 }
 return map;
}
function booked(s,all){
 return (all.get(s.id)||[]).filter(b=>b.gateX>s.x+EPS)
  .sort((a,b)=>a.gateX-b.gateX)[0]??null;
}
function geometricOrder(a,b){
 if(a.s.x>b.s.x+EPS)return -1;
 if(b.s.x>a.s.x+EPS)return 1;
 // At identical achieved x, centerward lateral position is the only
 // permitted physical start-order preference. Mirror invariant.
 const da=Math.abs(a.s.y-MID),db=Math.abs(b.s.y-MID);
 if(da<db-EPS)return -1;
 if(db<da-EPS)return 1;
 const ma=Math.abs(a.r.targetY-a.s.y),
  mb=Math.abs(b.r.targetY-b.s.y);
 if(ma<mb-EPS)return -1;
 if(mb<ma-EPS)return 1;
 return 0;
}
function accel(s,target){
 return clip((target-s.v)/.5,-BRAKE,ACC);
}
function forwardPosition(s,target,t){
 // Hypothetical attainable acceleration with one future desired speed:
 // an analytic WARNING, not an accepted actual physical movement.
 const a=accel(s,target);
 const reach=Math.abs(a)<EPS?0:Math.max(0,(target-s.v)/a);
 const first=Math.min(t,reach);
 return s.x+s.v*first+.5*a*first*first+
  Math.max(0,t-first)*Math.max(0,s.v+a*first);
}
function terminalSpeed(s,target,t){
 const a=accel(s,target);
 const reach=Math.abs(a)<EPS?0:Math.max(0,(target-s.v)/a);
 return Math.max(0,s.v+a*Math.min(t,reach));
}
export function step94ClosurePlanV3(states,requests,bookings,{
 atSeconds=0,lookAheadM=405,prepareM=145,
 rangeM=35,horizonSeconds=4.5,headwayM=2.8,
 movingFloorMps=7.2
}={}){
 const all=verify(states,requests,bookings,atSeconds);
 if(![lookAheadM,prepareM,rangeM,horizonSeconds,
  headwayM,movingFloorMps].every(finite)||
  lookAheadM<200||lookAheadM>460||prepareM<80||
  prepareM>200||rangeM<15||rangeM>65||
  horizonSeconds<2||horizonSeconds>8||
  headwayM<2.3||headwayM>5||
  movingFloorMps<6.5||movingFloorMps>10)
 throw Error('A94 invalid forecast bounds');
 const n=states.length,bks=states.map(s=>booked(s,all)),
  holds=Array(n).fill(false),caps=Array(n).fill(Infinity),
  boosts=Array(n).fill(-Infinity),rolling=Array(n).fill(null);
 let threatenedPairs=0,predictedClosingPairs=0,
  crossRowPairs=0,impossibleFloorPairs=0,ties=0,earlyHolds=0;
 const evidence=[];
 for(let i=0;i<n;i++){
  const s=states[i],b=bks[i];
  if(!b||b.gateX-s.x>lookAheadM)continue;
  const distance=b.gateX-s.x;
  if(distance>prepareM&&Math.abs(requests[i].targetY-s.y)>EPS){
   holds[i]=true;earlyHolds++;
  }
  // A94 retains rolling speed but eliminates the Step93 center-fast,
  // inner-slow differential that caused front-row/rear-row contacts.
  if(distance>85)rolling[i]=9;
 }
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
  const a=states[i],b=states[j],ba=bks[i],bb=bks[j];
  if(!ba||!bb||ba.gateId!==bb.gateId||
    Math.abs(a.x-b.x)>rangeM)continue;
  const bookedConflict=intersects(interval(a.y,ba.targetY),
    interval(b.y,bb.targetY));
  const requestedConflict=intersects(interval(a.y,requests[i].targetY),
    interval(b.y,requests[j].targetY));
  if(!bookedConflict&&!requestedConflict)continue;
  const cmp=geometricOrder({s:a,r:requests[i]},
   {s:b,r:requests[j]});
  if(cmp===0){
   ties++;
   if(Math.abs(requests[i].targetY-a.y)>EPS)holds[i]=true;
   if(Math.abs(requests[j].targetY-b.y)>EPS)holds[j]=true;
   continue;
  }
  const leaderIndex=cmp<0?i:j,rearIndex=cmp<0?j:i;
  const lead=states[leaderIndex],rear=states[rearIndex],
   aReq=requests[leaderIndex],bReq=requests[rearIndex];
  const gap=lead.x-rear.x;
  const sameRow=Math.abs(lead.startX-rear.startX)<EPS;
  // A same-x geometric tie-break is only a provisional speed ordering,
  // NEVER a license for two adjacent bicycle bodies to merge.
  if(gap<EPS){
   if(Math.abs(aReq.targetY-lead.y)>EPS)holds[leaderIndex]=true;
   if(Math.abs(bReq.targetY-rear.y)>EPS)holds[rearIndex]=true;
  }
  const remaining=Math.max(Math.abs(aReq.targetY-lead.y),
   Math.abs(bReq.targetY-rear.y));
  const T=clip(remaining/STEER+.75,1.5,horizonSeconds);
  const fWanted=rolling[leaderIndex]===null?aReq.speed:
    Math.max(aReq.speed,rolling[leaderIndex]);
  const rWanted=rolling[rearIndex]===null?bReq.speed:
    Math.max(bReq.speed,rolling[rearIndex]);
  const endGap=forwardPosition(lead,fWanted,T)-
   forwardPosition(rear,rWanted,T);
  const closing=Math.max(0,terminalSpeed(rear,rWanted,T)-
   terminalSpeed(lead,fWanted,T));
  const required=headwayM+closing*closing/(2*BRAKE);
  // Steer only when achievable future x-gap remains positive *across
  // the entire physical steering interval*, accounting for requested
  // rear acceleration before it is actually achieved.
  if(endGap>=required+1&&gap>=required+.35)continue;
  threatenedPairs++;
  if(closing>.05)predictedClosingPairs++;
  if(!sameRow)crossRowPairs++;
  if(Math.abs(bReq.targetY-rear.y)>EPS)holds[rearIndex]=true;
  if(gap<required+.5&&Math.abs(aReq.targetY-lead.y)>EPS)
   holds[leaderIndex]=true;
  const maxClosing=(gap-required-.35)/T;
  const allowable=lead.v+clip(maxClosing,-2.4,.75);
  if(allowable<movingFloorMps)impossibleFloorPairs++;
  // Bounded physical requested speed only, original solver decides
  // if even a hard brake / ahead assist is achievable.
  caps[rearIndex]=Math.min(caps[rearIndex],
   Math.max(movingFloorMps,allowable));
  if(gap<required+2&&lead.v<10.5)
   boosts[leaderIndex]=Math.max(boosts[leaderIndex],lead.v+.4);
  evidence.push({ahead:leaderIndex,behind:rearIndex,
   physicalGapM:q(gap),requestedGapAtT:q(endGap),
   requiredGapM:q(required),tSeconds:q(T),
   allowedRearSpeedMps:q(allowable),crossRow:!sameRow});
 }
 // No forward assist into an occupied physically overlapping envelope.
 for(let i=0;i<n;i++){
  if(!finite(boosts[i])||finite(caps[i])||!bks[i]){
   boosts[i]=-Infinity;continue;
  }
  if(states.some((s,j)=>i!==j&&s.x>states[i].x+EPS&&
   s.x-states[i].x<12&&bks[j]?.gateId===bks[i].gateId&&
   intersects(interval(states[i].y,requests[i].targetY),
    interval(s.y,requests[j].targetY))))
   boosts[i]=-Infinity;
 }
 return {holds,caps,boosts,rolling,
  threatenedPairs,predictedClosingPairs,crossRowPairs,
  impossibleFloorPairs,ties,earlyHolds,evidence,
  physicalA64Authority:true,futureWarningNotClearance:true,
  officialWrites:0};
}
export function step94ClosureCandidatesV3(states,requests,bookings,options={}){
 const plan=step94ClosurePlanV3(states,requests,bookings,options);
 const candidates=['hold','speed_match','joint_wave'].map(mode=>({
  policy:'closure_'+mode,officialWrites:0,
  requests:requests.map((r,i)=>{
   const out={...r};
   if(plan.holds[i])out.targetY=states[i].y;
   if(plan.rolling[i]!==null)out.speed=q(Math.max(out.speed,plan.rolling[i]));
   if(mode!=='hold'&&finite(plan.caps[i]))
    out.speed=q(Math.min(out.speed,plan.caps[i]));
   if(mode==='joint_wave'&&finite(plan.boosts[i])&&!finite(plan.caps[i]))
    out.speed=q(Math.max(out.speed,plan.boosts[i]));
   return out;
  })
 }));
 return {plan,candidates,originalA64MustAccept:true,officialWrites:0};
}
