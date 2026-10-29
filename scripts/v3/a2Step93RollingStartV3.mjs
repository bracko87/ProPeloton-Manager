/** Step93: forensic-guided rolling 5-wide launch before road narrowing.
 * Contact dossiers: repeated collisions at full 4.4m road, x~590-660,
 * riders crawling at 2-6m/s. Preserve achievable moving speed, defer
 * side-by-side steering until REAL longitudinal clearance exists.
 * Requests only: original A64 swept bicycle + energy always authoritative.
 */
const EPS=1e-7,CENTER=2.2,BRAKE=.85,STEER=.38;
const finite=Number.isFinite,q=x=>Math.round(x*1e6)/1e6;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function valid(states,requests,bookings,at){
 if(!Array.isArray(states)||states.length<2||states.length>168||
 !Array.isArray(requests)||requests.length!==states.length||
 !Array.isArray(bookings)||!finite(at)||at<0)
 throw Error('A93 invalid rolling field');
 const ids=new Set();
 for(let i=0;i<states.length;i++){
  const s=states[i],r=requests[i];
  if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||!r||
   s.id!==r.id||![s.x,s.y,s.v,s.startX,r.speed,r.targetY].every(finite)||
   s.y<0||s.y>4.4||s.v<0||s.v>50||r.speed<0||r.speed>50||
   r.targetY<0||r.targetY>4.4)
   throw Error('A93 invalid physical rider/request');
  ids.add(s.id);
 }
 const byId=new Map();
 for(const b of bookings){
  if(!b||!ids.has(b.id)||![b.gateX,b.targetY].every(finite)||
   b.gateX<0||b.targetY<0||b.targetY>4.4)
   throw Error('A93 invalid booking');
  if(!byId.has(b.id))byId.set(b.id,[]);
  byId.get(b.id).push(b);
 }
 return byId;
}
function section(s,byId){
 return (byId.get(s.id)||[]).filter(b=>b.gateX>s.x+EPS)
  .sort((a,b)=>a.gateX-b.gateX)[0]??null;
}
function overlaps(a,b,safety=.04){
 return Math.min(a.y,a.target)-.3<
  Math.max(b.y,b.target)+.3+safety&&
  Math.min(b.y,b.target)-.3<
  Math.max(a.y,a.target)+.3+safety;
}
function tier(s){
 // This lateral geometry remains exactly symmetric under reflection.
 const d=Math.abs(s.y-CENTER);
 return d<.48?'CENTER':d<1.48?'INNER':'OUTER';
}
function profile(s,remaining,mode){
 const t=tier(s);
 // Formation differential exists only upstream. Far away, keep an
 // athletic rolling start rather than the 2-4m/s gate-window crawl
 // observed in real original swept collision dossiers.
 const weighted=t==='CENTER'?9.85:t==='INNER'?8.95:8.05;
 const blend=clamp((remaining-80)/75,0,1);
 const desired=s.v+clamp(weighted-s.v,-1.4,1.4);
 return q(blend*desired+(1-blend)*Math.max(8.0,Math.min(9.4,s.v+.2)));
}
export function step93RollingStartPlanV3(states,requests,bookings,{
 atSeconds=0,lookAheadM=395,lateralPrepareM=138,
 minMovingMps=7.6,physicalGapM=2.9
}={}){
 const byId=valid(states,requests,bookings,atSeconds);
 if(![lookAheadM,lateralPrepareM,minMovingMps,physicalGapM].every(finite)||
 lookAheadM<150||lookAheadM>450||lateralPrepareM<85||
 lateralPrepareM>180||minMovingMps<6||minMovingMps>10||
 physicalGapM<2.2||physicalGapM>5)
 throw Error('A93 invalid rolling bounds');
 const active=states.map(s=>section(s,byId));
 const n=states.length;
 const held=Array(n).fill(false),cruise=Array(n).fill(null),
  followerCaps=Array(n).fill(Infinity),
  leaderOffers=Array(n).fill(-Infinity);
 let earlyRolling=0,unsafeMerges=0,
  sameCorridorHeadways=0,crossingWarnings=0;
 for(let i=0;i<n;i++){
  const s=states[i],b=active[i];
  if(!b||b.gateX-s.x>lookAheadM)continue;
  const distance=b.gateX-s.x;
  if(distance>lateralPrepareM){
   if(Math.abs(requests[i].targetY-s.y)>EPS){
    held[i]=true;earlyRolling++;
   }
  }
  // Applies only when an upstream FULL-WIDTH road still has physical
  // space. This is a request for achievable acceleration, never forced v.
  if(distance>80)
   cruise[i]=profile(s,distance,'rolling');
 }
 for(let i=0;i<n;i++){
  const a=states[i],ba=active[i];
  if(!ba||ba.gateX-a.x>lookAheadM)continue;
  for(let j=i+1;j<n;j++){
   const b=states[j],bb=active[j];
   if(!bb||ba.gateId!==bb.gateId||
      Math.abs(a.x-b.x)>20)continue;
   const d=a.x-b.x;
   const sameTrack=Math.abs(a.y-b.y)<.8;
   const ax={y:a.y,target:ba.targetY},bx={y:b.y,target:bb.targetY};
   if(!sameTrack&&!overlaps(ax,bx))continue;
   // Actual achieved x decides forward position, never ID or side.
   if(Math.abs(d)<EPS){
    // In the five-wide grid, symmetric row ties cannot receive an
    // arbitrary priority. Preserve straight 4.4m rolling formation.
    if(Math.abs(requests[i].targetY-a.y)>EPS)held[i]=true;
    if(Math.abs(requests[j].targetY-b.y)>EPS)held[j]=true;
    continue;
   }
   const ahead=d>0?i:j,behind=d>0?j:i;
   const front=states[ahead],rear=states[behind];
   const achievedGap=Math.abs(d),closing=Math.max(0,rear.v-front.v);
   const lateral=Math.abs(active[behind].targetY-rear.y);
   const needed=physicalGapM+closing*Math.max(1.3,
    Math.min(3.5,lateral/STEER))+closing*closing/(2*BRAKE);
   if(sameTrack) {
    sameCorridorHeadways++;
    // Early, kinematically reachable speed matching prevents a rear
    // cyclist from catching a leader already slowed by another row.
    // Do not issue hard stop requests or assert safe clearance.
    if(achievedGap<needed+3){
     followerCaps[behind]=Math.min(followerCaps[behind],
      Math.max(minMovingMps,front.v+
       clamp((achievedGap-needed)/2.5,-.9,.6)));
    }
   }
   if(overlaps(ax,bx)&&(achievedGap<needed+.65)){
    crossingWarnings++;
    // A rear bicycle's requested steering cannot consume the
    // longitudinal envelope of another body.
    if(Math.abs(requests[behind].targetY-rear.y)>EPS){
     held[behind]=true;unsafeMerges++;
    }
    // Even if a rider is momentarily ahead, a SAME-ROW side-by-side
    // crossing cannot happen until actual clearance is achieved.
    if(Math.abs(front.startX-rear.startX)<EPS&&
       Math.abs(requests[ahead].targetY-front.y)>EPS&&
       achievedGap<physicalGapM)
     held[ahead]=true;
    // Preserve a non-stopping speed differential before a merge.
    if(achievedGap<needed&&front.v<10.3)
     leaderOffers[ahead]=Math.max(leaderOffers[ahead],
      front.v+.25);
   }
  }
 }
 // An assisted leader must not accelerate into an occupied heading track.
 for(let i=0;i<n;i++){
  if(!finite(leaderOffers[i])||!active[i]||
   finite(followerCaps[i])){leaderOffers[i]=-Infinity;continue;}
  const a=states[i],ta={y:a.y,target:active[i].targetY};
  if(states.some((s,j)=>j!==i&&s.x>a.x+EPS&&
   s.x-a.x<11&&active[j]?.gateId===active[i].gateId&&
   overlaps(ta,{y:s.y,target:active[j].targetY})))
   leaderOffers[i]=-Infinity;
 }
 return {held,cruise,followerCaps,leaderOffers,
  earlyRolling,unsafeMerges,sameCorridorHeadways,
  crossingWarnings,roleCounts:{center:states.filter(s=>
   tier(s)==='CENTER').length,inner:states.filter(s=>
   tier(s)==='INNER').length,outer:states.filter(s=>
   tier(s)==='OUTER').length},
  originalA64StillAuthoritative:true,
  physicalClearanceUnproven:true,officialWrites:0};
}
export function step93RollingStartCandidatesV3(states,requests,bookings,opts={}){
 const plan=step93RollingStartPlanV3(states,requests,bookings,opts);
 const variants=['straight_roll','gap_match','rolling_assist'];
 const candidates=variants.map(mode=>({
  policy:'physical_launch_'+mode,officialWrites:0,
  requests:requests.map((r,i)=>{
   const s=states[i],out={...r};
   if(plan.held[i])out.targetY=s.y;
   if(plan.cruise[i]!==null)
    out.speed=q(Math.max(out.speed,plan.cruise[i]));
   if(mode!=='straight_roll'&&finite(plan.followerCaps[i]))
    out.speed=q(Math.min(out.speed,plan.followerCaps[i]));
   if(mode==='rolling_assist'&&finite(plan.leaderOffers[i])&&
    !finite(plan.followerCaps[i]))
    out.speed=q(Math.max(out.speed,plan.leaderOffers[i]));
   return out;
  })
 }));
 return {plan,candidates,noUnacceptedPhysicalMovement:true,officialWrites:0};
}
